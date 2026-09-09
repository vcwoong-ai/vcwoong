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
import { buildPriorSectionSummary } from "@/lib/section-context";
import {
  getUserTeamContext,
  reportWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";
import { withModelOverride } from "@/lib/claude";
import {
  callNimModel,
  isNimConfigured,
  getNimModelOptions,
  getComparisonModels,
} from "@/lib/nim";

/**
 * 보고서 화면의 "다른 모델로 비교" 버튼 — 온디맨드, 읽기 전용.
 *
 * 이 섹션의 실제 프로덕션 프롬프트(섹터별 특화 프롬프트 포함)를 그대로
 * 재사용해 NIM 모델 여러 개를 병렬 호출한다. claude.ts의
 * withModelOverride로 generateText 호출 지점만 가로채므로,
 * agent.generateSection 내부 로직(BIO의 rNPV, 외부 데이터 조회 등)은
 * 전혀 건드리지 않는다. 결과는 report.sections에 저장되지 않는다 —
 * 비교만 하고 끝난다.
 */
export const maxDuration = 60;

/**
 * 이 호출 하나가 기다릴 최대 시간. 4개 모델을 병렬로 불러도 전체 실행
 * 시간은 "가장 느린 모델"로 결정되므로, Hobby 함수 상한(60초)보다
 * 확실히 짧게 잡아 응답 직렬화 여유를 남긴다.
 */
const COMPARE_TIMEOUT_MS = 45_000;

const bodySchema = z.object({
  sectionKey: z.nativeEnum(SectionKey),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  if (!isNimConfigured()) {
    return NextResponse.json(
      { error: "NVIDIA NIM이 설정되지 않았습니다" },
      { status: 501 }
    );
  }

  try {
    const body = bodySchema.parse(await request.json());

    const { teamId, role } = await getUserTeamContext(session.user.id);
    const report = await prisma.report.findFirst({
      where: {
        id: params.id,
        ...reportWriteWhere(session.user.id, teamId, role),
      },
      include: {
        deal: {
          include: {
            documents: { select: { name: true, parsedText: true } },
          },
        },
        sections: {
          orderBy: { order: "asc" },
          select: { sectionKey: true, title: true, content: true },
        },
      },
    });

    if (!report) {
      return NextResponse.json(
        { error: permissionDeniedMessage("edit") },
        { status: 403 }
      );
    }

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

    const agent = getAgent(report.agentType, deal.sector);
    const input = {
      dealId: deal.id,
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
        "다른 섹션과 수치가 일치해야 합니다.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    };

    const models = getComparisonModels();

    // 같은 agent 인스턴스를 재사용해서, BIO처럼 외부 데이터(PubMed 등)를
    // 캐시하는 에이전트가 모델 개수만큼 중복 조회하지 않게 한다.
    const settled = await Promise.allSettled(
      models.map((model) =>
        withModelOverride(
          async (messages, options) => {
            const userPrompt = messages[messages.length - 1]?.content ?? "";
            const r = await callNimModel(
              model,
              options.systemPrompt ?? "",
              userPrompt,
              {
                ...getNimModelOptions(model),
                timeoutMs: COMPARE_TIMEOUT_MS,
              }
            );
            return {
              content: r.content,
              inputTokens: r.inputTokens,
              outputTokens: r.outputTokens,
              usedModel: model,
            };
          },
          () => agent.generateSection(input, body.sectionKey)
        )
      )
    );

    const results = settled.map((s, i) => {
      const model = models[i];
      if (s.status === "fulfilled") {
        return {
          model,
          ok: true as const,
          content: s.value.content,
          tokensUsed: s.value.tokensUsed,
        };
      }
      return {
        model,
        ok: false as const,
        error:
          s.reason instanceof Error ? s.reason.message : String(s.reason),
      };
    });

    return NextResponse.json({
      data: { sectionKey: body.sectionKey, results },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Section compare error:", error);
    return NextResponse.json(
      { error: "모델 비교 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
