import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { SectionKey } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAgent } from "@/agents";
import {
  extractSharedFacts,
  formatSharedFactsForPrompt,
} from "@/lib/shared-facts";
import { evaluateSection } from "@/lib/report-quality";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { buildPriorSectionSummary } from "@/lib/section-context";
import { resolveModelChainForTier, isPaidPlanKey, isAIConfigured, AIServiceUnavailableError, type AIAttemptRecord } from "@/lib/claude";
import { getUserPlanKey } from "@/lib/subscription";
import { resolveTaskTierForSection } from "@/agents/base-agent";
import { recordAIAttempts } from "@/lib/usage-log";
import { saveGeneratedSection, GeneratedSectionConflict, STALE_GENERATION_MS } from "@/lib/report-generation";
import { claimSectionGeneration, releaseSectionGeneration, GenerationLeaseLost } from "@/lib/report-generation-lease";
import {
  getUserTeamContext,
  reportWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

// AI 호출 라우트 — 기본 함수 실행시간(플랫폼 기본값, Hobby 플랜은 10초)로는
// 부족해 다른 AI 호출 라우트와 동일하게 60초로 맞춰둔다.
export const maxDuration = 60;

const bodySchema = z.object({
  sectionKey: z.nativeEnum(SectionKey),
  /** 사용자가 직접 넣는 재생성 포커스 */
  focusNote: z.string().max(800).optional(),
  /** 품질 패널에서 넘긴 이슈/경고 */
  qualityIssues: z.array(z.string().max(200)).max(12).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  let lease: { token: string; updatedAt: Date } | null = null;
  const attempts: AIAttemptRecord[] = [];
  let attemptContext: Omit<Parameters<typeof recordAIAttempts>[0], "attempts"> | null = null;
  try {
    const body = bodySchema.parse(await request.json().catch(() => null));

    const { teamId, role } = await getUserTeamContext(session.user.id);
    const report = await prisma.report.findFirst({
      where: { id: params.id, ...reportWriteWhere(session.user.id, teamId, role) },
      include: {
        deal: {
          include: {
            documents: {
              select: { name: true, parsedText: true },
            },
          },
        },
        sections: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!report) {
      return NextResponse.json(
        { error: permissionDeniedMessage("edit") },
        { status: 403 }
      );
    }
    if (report.status === "GENERATING") return NextResponse.json({ error: "보고서 전체 생성 중에는 섹션을 재생성할 수 없습니다" }, { status: 409 });
    const original = report.sections.find((section) => section.sectionKey === body.sectionKey);
    if (!original) return NextResponse.json({ error: "해당 섹션을 찾을 수 없습니다" }, { status: 404 });

    // quota(월 한도)는 "이번 달 새로 만든 보고서 수"만 세서 이미 완성된
    // 보고서의 섹션 재생성 호출을 막지 못한다(status가 PENDING이 아니면
    // 이 조건 자체가 항상 거짓이었다 — 사실상 quota 체크가 무력화돼 있었음).
    // rate limit을 실질적인 방어선으로 둔다.
    const rate = await checkRateLimit(
      `section-regen:${session.user.id}`,
      RATE_LIMITS.sectionRegenerate.limit,
      RATE_LIMITS.sectionRegenerate.windowMs
    );
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "섹션 재생성 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
      );
    }

    if (process.env.NODE_ENV === "production" && !isAIConfigured()) throw new AIServiceUnavailableError();
    const planKey = await getUserPlanKey(session.user.id);
    const taskTier = resolveTaskTierForSection(body.sectionKey);
    const modelChain = resolveModelChainForTier(planKey, taskTier);
    lease = await prisma.$transaction(tx => claimSectionGeneration(tx, report.id, STALE_GENERATION_MS, report.updatedAt));
    if (!lease) return NextResponse.json({ error: "이 딜의 다른 생성 작업이 진행 중이거나 보고서가 변경되었습니다. 잠시 후 최신 내용을 확인해 주세요." }, { status: 409 });
    attemptContext = { userId: session.user.id, dealId: report.deal.id, reportId: report.id,
      agentType: report.agentType, sectionKey: body.sectionKey,
      userTier: isPaidPlanKey(planKey) ? "paid" : "free", taskTier };
    const deal = report.deal;
    const sharedFacts = extractSharedFacts({
      companyName: deal.companyName,
      sector: deal.sector,
      investRound: deal.investRound ?? undefined,
      investAmount: deal.investAmount ?? undefined,
      valuation: deal.valuation ?? undefined,
      documents: deal.documents,
    });
    const factsBlock = formatSharedFactsForPrompt(sharedFacts);

    const prior = buildPriorSectionSummary(report.sections, body.sectionKey);

    const qualityGuide =
      body.qualityIssues && body.qualityIssues.length > 0
        ? `## 품질 개선 포커스 (반드시 반영)\n${body.qualityIssues
            .map((i) => `- ${i}`)
            .join("\n")}`
        : "";
    const focusGuide = body.focusNote?.trim()
      ? `## 사용자 지시\n${body.focusNote.trim()}`
      : "";

    const agent = getAgent(report.agentType, deal.sector);
    const result = await agent.generateSection(
      {
        dealId: deal.id,
        reportId: report.id,
        companyName: deal.companyName,
        sector: deal.sector,
        agentType: report.agentType,
        investRound: deal.investRound ?? undefined,
        investAmount: deal.investAmount ?? undefined,
        valuation: deal.valuation ?? undefined,
        documents: deal.documents,
        additionalContext: [
          factsBlock,
          prior ? `## 다른 섹션 요약\n${prior}` : "",
          qualityGuide,
          focusGuide,
          "이 요청은 단일 섹션 재생성입니다. 다른 섹션과 수치가 일치해야 합니다.",
          "이전 초안의 약점(짧음/출처 없음/표 없음/팩트 누락)을 고치세요.",
        ]
          .filter(Boolean)
          .join("\n\n"),
        modelChain,
        onAttempt: (a) => attempts.push(a),
      },
      body.sectionKey
    );

    const quality = evaluateSection(result.sectionKey, result.content);

    const section = await saveGeneratedSection(report.id, original, result.content, lease.updatedAt, undefined, lease.token);

    return NextResponse.json({
      data: {
        section,
        quality,
        modelUsed: result.modelUsed,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof AIServiceUnavailableError) return NextResponse.json({ error: error.message }, { status: 503 });
    if (error instanceof GeneratedSectionConflict || error instanceof GenerationLeaseLost ||
        (typeof error === "object" && error !== null && "code" in error && error.code === "P2034")) {
      return NextResponse.json({ error: "재생성 중 보고서가 변경되었습니다. 최신 내용을 확인하고 다시 시도해 주세요." }, { status: 409 });
    }
    console.error("Section regenerate failed");
    return NextResponse.json(
      { error: "섹션 재생성 중 오류가 발생했습니다" },
      { status: 500 }
    );
  } finally {
    // Record attempts once, including provider failure or a losing content CAS.
    try { if (attemptContext) recordAIAttempts({ ...attemptContext, attempts }); }
    catch { /* Best-effort usage logging must not replace the request outcome. */ }
    finally { if (lease) await releaseSectionGeneration(params.id, lease.token).catch(() => {}); }
  }
}
