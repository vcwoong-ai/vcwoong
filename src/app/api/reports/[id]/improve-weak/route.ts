import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { SectionKey, SectionStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAgent } from "@/agents";
import {
  extractSharedFacts,
  formatSharedFactsForPrompt,
} from "@/lib/shared-facts";
import { evaluateReport, evaluateSection } from "@/lib/report-quality";
import { checkQuota } from "@/lib/quotas";
import { buildPriorSectionSummary } from "@/lib/section-context";
import {
  getUserTeamContext,
  reportWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

const bodySchema = z.object({
  /** 개선할 최대 섹션 수 (기본 3) */
  maxSections: z.number().int().min(1).max(5).optional(),
  /** 이 점수 미만만 대상 (기본 70) */
  scoreThreshold: z.number().int().min(0).max(100).optional(),
});

/**
 * POST /api/reports/[id]/improve-weak
 * 품질 점수가 낮은 섹션을 골라 이슈를 반영해 일괄 재생성한다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  try {
    const json = await request.json().catch(() => ({}));
    const body = bodySchema.parse(json);
    const maxSections = body.maxSections ?? 3;
    const scoreThreshold = body.scoreThreshold ?? 70;

    const { teamId, role } = await getUserTeamContext(session.user.id);
    const report = await prisma.report.findFirst({
      where: { id: params.id, ...reportWriteWhere(session.user.id, teamId, role) },
      include: {
        deal: {
          include: {
            documents: { select: { name: true, parsedText: true } },
          },
        },
        sections: { orderBy: { order: "asc" } },
      },
    });

    if (!report) {
      return NextResponse.json(
        { error: permissionDeniedMessage("edit") },
        { status: 403 }
      );
    }

    if (!report.sections.length) {
      return NextResponse.json(
        { error: "개선할 섹션이 없습니다" },
        { status: 400 }
      );
    }

    const quota = await checkQuota(session.user.id, "report");
    if (!quota.allowed) {
      return NextResponse.json({ error: quota.message }, { status: 429 });
    }

    const deal = report.deal;
    const facts = extractSharedFacts({
      companyName: deal.companyName,
      sector: deal.sector,
      investRound: deal.investRound ?? undefined,
      investAmount: deal.investAmount ?? undefined,
      valuation: deal.valuation ?? undefined,
      documents: deal.documents,
    });
    const factsBlock = formatSharedFactsForPrompt(facts);

    const before = evaluateReport(
      report.sections.map((s) => ({
        sectionKey: s.sectionKey,
        content: s.content,
      })),
      {
        investAmount: facts.investAmount,
        valuation: facts.valuation,
        metrics: facts.metrics,
        terms: facts.terms,
        clinicalPhase: facts.clinicalPhase,
      }
    );

    const targets = [...before.sections]
      .filter((s) => s.score < scoreThreshold)
      .sort((a, b) => a.score - b.score)
      .slice(0, maxSections);

    if (targets.length === 0) {
      return NextResponse.json({
        data: {
          improved: [],
          beforeScore: before.overallScore,
          afterScore: before.overallScore,
          message: `모든 섹션이 ${scoreThreshold}점 이상입니다.`,
        },
      });
    }

    const agent = getAgent(report.agentType, deal.sector);
    const improved: Array<{
      sectionKey: string;
      beforeScore: number;
      afterScore: number;
    }> = [];

    for (const target of targets) {
      const prior = buildPriorSectionSummary(
        report.sections,
        target.sectionKey
      );

      const qualityIssues = [
        ...target.issues,
        ...target.warnings,
        ...(before.factConsistency?.missing.slice(0, 2).map(
          (m) => `공유 팩트 누락: ${m}`
        ) ?? []),
      ].slice(0, 12);

      const result = await agent.generateSection(
        {
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
            qualityIssues.length
              ? `## 품질 개선 포커스\n${qualityIssues.map((i) => `- ${i}`).join("\n")}`
              : "",
            "약한 섹션 일괄 개선 요청입니다. 출처·수치·구조를 보강하세요.",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
        target.sectionKey as SectionKey
      );

      const afterQ = evaluateSection(result.sectionKey, result.content);
      await prisma.reportSection.updateMany({
        where: {
          reportId: report.id,
          sectionKey: target.sectionKey as SectionKey,
        },
        data: { content: result.content, status: SectionStatus.DRAFT },
      });

      // 로컬 캐시 갱신 (다음 섹션 prior용)
      const idx = report.sections.findIndex(
        (s) => s.sectionKey === target.sectionKey
      );
      if (idx >= 0) report.sections[idx].content = result.content;

      improved.push({
        sectionKey: target.sectionKey,
        beforeScore: target.score,
        afterScore: afterQ.score,
      });

      if (session.user.id && result.tokensUsed > 0) {
        prisma.usageLog
          .create({
            data: {
              userId: session.user.id,
              dealId: deal.id,
              reportId: report.id,
              agentType: report.agentType,
              sectionKey: result.sectionKey,
              model: result.modelUsed ?? "unknown",
              inputTokens: Math.round(result.tokensUsed * 0.7),
              outputTokens: Math.round(result.tokensUsed * 0.3),
              totalTokens: result.tokensUsed,
            },
          })
          .catch(() => {});
      }
    }

    const refreshed = await prisma.reportSection.findMany({
      where: { reportId: report.id },
      orderBy: { order: "asc" },
    });
    const after = evaluateReport(
      refreshed.map((s) => ({
        sectionKey: s.sectionKey,
        content: s.content,
      })),
      {
        investAmount: facts.investAmount,
        valuation: facts.valuation,
        metrics: facts.metrics,
        terms: facts.terms,
        clinicalPhase: facts.clinicalPhase,
      }
    );

    return NextResponse.json({
      data: {
        improved,
        beforeScore: before.overallScore,
        afterScore: after.overallScore,
        quality: after,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Improve weak error:", error);
    return NextResponse.json(
      { error: "약한 섹션 개선 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
