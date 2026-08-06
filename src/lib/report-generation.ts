import { AgentType, DealSector, ReportStatus } from "@prisma/client";
import { getAgent } from "@/agents";
import { SECTION_META } from "@/types";
import { prisma } from "@/lib/prisma";
import {
  initProgress,
  updateProgress,
  completeProgress,
  errorProgress,
} from "@/lib/generation-progress";
import {
  extractSharedFacts,
  formatSharedFactsForPrompt,
} from "@/lib/shared-facts";
import { evaluateReport } from "@/lib/report-quality";

export interface DealForGeneration {
  id: string;
  companyName: string;
  sector: DealSector;
  investRound: string | null;
  investAmount: number | null;
  valuation: number | null;
  documents: Array<{ name: string; parsedText: string | null }>;
}

export async function generateSectionsAsync(
  reportId: string,
  deal: DealForGeneration,
  agentType: AgentType,
  additionalContext?: string,
  userId?: string
) {
  const total = SECTION_META.length;
  initProgress(reportId, total);

  try {
    const agent = getAgent(agentType, deal.sector);
    const results = [];
    const sectionKeys = SECTION_META.map((s) => s.key);

    // 이전(멈춘) 시도에서 남은 부분 섹션이 있으면 지우고 새로 시작한다.
    await prisma.reportSection.deleteMany({ where: { reportId } });

    const sharedFacts = extractSharedFacts({
      companyName: deal.companyName,
      sector: deal.sector,
      investRound: deal.investRound ?? undefined,
      investAmount: deal.investAmount ?? undefined,
      valuation: deal.valuation ?? undefined,
      documents: deal.documents,
    });

    const factsBlock = formatSharedFactsForPrompt(sharedFacts);
    const priorSummaries: string[] = [];

    for (let i = 0; i < sectionKeys.length; i++) {
      const sectionKey = sectionKeys[i];
      const meta = SECTION_META.find((m) => m.key === sectionKey)!;
      updateProgress(reportId, i, meta.title);

      const isClosing =
        sectionKey === "OPINION_SUMMARY" ||
        sectionKey === "INVESTMENT_TERMS";
      const continuity =
        priorSummaries.length > 0
          ? `\n## 이전 섹션 요약 (일관성 유지)\n${(
              isClosing ? priorSummaries : priorSummaries.slice(-3)
            ).join("\n")}\n`
          : "";
      const closingHint = isClosing
        ? "\n## 마감 섹션 지침\n- 공유 팩트·이전 섹션 수치를 그대로 인용할 것\n- 투자조건은 텀시트 표+보호조항, 의견종합은 권고 라벨 필수\n"
        : "";

      const result = await agent.generateSection(
        {
          dealId: deal.id,
          companyName: deal.companyName,
          sector: deal.sector,
          agentType,
          investRound: deal.investRound ?? undefined,
          investAmount: deal.investAmount ?? undefined,
          valuation: deal.valuation ?? undefined,
          documents: deal.documents,
          additionalContext: [
            factsBlock,
            continuity,
            closingHint,
            additionalContext,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
        sectionKey
      );
      results.push(result);

      // 섹션이 완성되는 즉시 저장한다 — 진행률 화면이 실시간으로 반영되고,
      // 도중에 타임아웃/실패해도 이미 만든 섹션은 남아 다시 만들 필요가 없다.
      await prisma.reportSection.create({
        data: {
          reportId,
          sectionKey: result.sectionKey,
          title: meta.title,
          content: result.content,
          order: meta.order,
        },
      });

      // 다음 섹션 일관성: 숫자·키워드를 남긴 요약
      const nums = (result.content.match(/[\d,.]+(?:억|조|%|원)?/g) ?? [])
        .slice(0, 6)
        .join(", ");
      const snippet = result.content
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, isClosing ? 160 : 220);
      priorSummaries.push(
        `- ${meta.title}: ${snippet}${nums ? ` [수치: ${nums}]` : ""}`
      );

      if (userId && result.tokensUsed > 0) {
        prisma.usageLog
          .create({
            data: {
              userId,
              dealId: deal.id,
              reportId,
              agentType,
              sectionKey: result.sectionKey,
              model: result.modelUsed ?? "unknown",
              inputTokens: Math.round(result.tokensUsed * 0.7),
              outputTokens: Math.round(result.tokensUsed * 0.3),
              totalTokens: result.tokensUsed,
            },
          })
          .catch(() => {});
      }

      if (i < sectionKeys.length - 1) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    // 품질 평가(+공유팩트 일치) → 의견종합 섹션 끝에 메모 추가
    const quality = evaluateReport(
      results.map((r) => ({
        sectionKey: r.sectionKey,
        content: r.content,
      })),
      {
        investAmount: sharedFacts.investAmount,
        valuation: sharedFacts.valuation,
        metrics: sharedFacts.metrics,
        terms: sharedFacts.terms,
        clinicalPhase: sharedFacts.clinicalPhase,
      }
    );
    console.log(
      `[Quality] report=${reportId} score=${quality.overallScore} issues=${quality.criticalIssues.length}` +
        (quality.factConsistency
          ? ` facts=${quality.factConsistency.matched}/${quality.factConsistency.checked}`
          : "")
    );

    const opinionIdx = results.findIndex(
      (r) => r.sectionKey === "OPINION_SUMMARY"
    );
    if (opinionIdx >= 0 && quality.overallScore > 0) {
      const factNote =
        quality.factConsistency && quality.factConsistency.checked > 0
          ? ` · 팩트일치 ${quality.factConsistency.matched}/${quality.factConsistency.checked}`
          : "";
      const opinionContent =
        results[opinionIdx].content +
        `\n\n---\n*자동 품질 점수: ${quality.overallScore}/100` +
        factNote +
        (quality.suggestions[0] ? ` · ${quality.suggestions[0]}` : "") +
        `*`;

      // 이미 저장된 의견종합 섹션에 품질 메모를 덧붙인다.
      await prisma.reportSection.updateMany({
        where: { reportId, sectionKey: "OPINION_SUMMARY" },
        data: { content: opinionContent },
      });
    }

    await prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.DRAFT, generatedAt: new Date() },
    });

    completeProgress(reportId);
  } catch (error) {
    console.error("Section generation error:", error);
    errorProgress(reportId, String(error));
    await prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.PENDING },
    });
  }
}
