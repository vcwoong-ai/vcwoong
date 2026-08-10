import { AgentType, DealSector, ReportStatus } from "@prisma/client";
import { getAgent } from "@/agents";
import { SECTION_META, type GenerationResult } from "@/types";
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

/**
 * 한 번의 실행에서 섹션 생성에 쓸 수 있는 시간(ms).
 *
 * Vercel 함수는 maxDuration(800초)에서 강제 종료되는데, 그렇게 죽으면
 * 상태 정리도 못 하고 GENERATING에 멈춘 채로 남는다. 그보다 일찍 스스로
 * 멈춰서 만든 섹션까지 저장하고 상태를 정리하면, 사용자가 "다시 시도"를
 * 눌렀을 때 남은 섹션만 이어서 만들 수 있다.
 */
const GENERATION_BUDGET_MS = Number(
  process.env.REPORT_GENERATION_BUDGET_MS ?? 660_000
);

/**
 * GENERATING 상태가 이 시간을 넘겨도 안 끝나면 "멈춘 것"으로 본다.
 *
 * 함수가 강제 종료되면 상태를 정리하지 못해 GENERATING으로 남는데, 그걸
 * 영원히 "생성 중"으로 취급하면 해당 딜은 새 보고서를 만들 수 없게 된다.
 * 시간 예산(660초)보다 넉넉히 길게 잡아 정상 진행 중인 생성을 멈춘 것으로
 * 오판하지 않도록 한다.
 */
export const STALE_GENERATION_MS = 15 * 60 * 1000;

export async function generateSectionsAsync(
  reportId: string,
  deal: DealForGeneration,
  agentType: AgentType,
  additionalContext?: string,
  userId?: string
) {
  const total = SECTION_META.length;
  const deadline = Date.now() + GENERATION_BUDGET_MS;
  initProgress(reportId, total);

  try {
    const agent = getAgent(agentType, deal.sector);
    const results: GenerationResult[] = [];
    const sectionKeys = SECTION_META.map((s) => s.key);

    // 이전(멈춘) 시도에서 남은 섹션이 있으면 재사용하고, 없는 섹션만
    // 이어서 만든다 — 타임아웃으로 몇 번을 재시도하든 이미 만든 섹션은
    // 다시 AI를 호출하지 않고, 순서·문맥 일관성도 그대로 유지된다.
    const existingSections = await prisma.reportSection.findMany({
      where: { reportId },
      select: { sectionKey: true, content: true },
    });
    const existingByKey = new Map(
      existingSections.map((s) => [s.sectionKey, s.content])
    );

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

      const existingContent = existingByKey.get(sectionKey);
      let result: GenerationResult;

      if (existingContent !== undefined) {
        // 이전 시도에서 이미 만들어진 섹션 — 재사용하고 AI 호출은 건너뛴다.
        console.log(`[Gen] report=${reportId} ${i + 1}/${total} ${meta.title} — 기존 섹션 재사용`);
        result = { sectionKey, content: existingContent, tokensUsed: 0 };
      } else {
        // 남은 예산이 없으면 강제 종료를 기다리지 말고 스스로 멈춘다.
        // 여기까지 만든 섹션은 이미 저장돼 있으므로 재시도 시 이어서 진행된다.
        if (Date.now() >= deadline) {
          console.warn(
            `[Gen] report=${reportId} 시간 예산 소진 — ${i}/${total} 섹션까지 저장하고 중단(재시도 시 이어서 생성)`
          );
          await prisma.report.update({
            where: { id: reportId },
            data: { status: ReportStatus.PENDING },
          });
          errorProgress(
            reportId,
            `시간이 초과되어 ${i}/${total} 섹션까지 저장했습니다. "다시 시도"를 누르면 남은 섹션부터 이어서 생성합니다.`
          );
          return;
        }

        console.log(`[Gen] report=${reportId} ${i + 1}/${total} ${meta.title} 생성 시작`);
        const startedAt = Date.now();
        const continuity =
          priorSummaries.length > 0
            ? `\n## 이전 섹션 요약 (일관성 유지)\n${(
                isClosing ? priorSummaries : priorSummaries.slice(-3)
              ).join("\n")}\n`
            : "";
        const closingHint = isClosing
          ? "\n## 마감 섹션 지침\n- 공유 팩트·이전 섹션 수치를 그대로 인용할 것\n- 투자조건은 텀시트 표+보호조항, 의견종합은 권고 라벨 필수\n"
          : "";

        result = await agent.generateSection(
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

        console.log(
          `[Gen] report=${reportId} ${i + 1}/${total} ${meta.title} 완료 ` +
            `(${Math.round((Date.now() - startedAt) / 1000)}초, ${result.tokensUsed} tokens, ${result.modelUsed ?? "?"})`
        );

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
                // 프로바이더가 보고한 실측값을 그대로 쓴다. 예전엔 합계에
                // 70/30을 곱한 추정치를 넣어 사용량 통계가 실제와 달랐다.
                inputTokens: result.inputTokens ?? 0,
                outputTokens: result.outputTokens ?? 0,
                totalTokens: result.tokensUsed,
              },
            })
            .catch(() => {});
        }

        if (i < sectionKeys.length - 1) {
          await new Promise((r) => setTimeout(r, 1200));
        }
      }

      results.push(result);

      // 다음 섹션 일관성: 숫자·키워드를 남긴 요약 (재사용한 섹션도 포함)
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
