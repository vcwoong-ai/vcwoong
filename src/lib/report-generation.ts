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
import { REQUEST_TIMEOUT_MS, envDurationMs } from "@/lib/claude";

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
 * Vercel 함수는 maxDuration에서 강제 종료되는데, 그렇게 죽으면 상태
 * 정리도 못 하고 GENERATING에 멈춘 채로 남는다. 그보다 일찍 스스로
 * 멈춰서 만든 섹션까지 저장하고 상태를 정리하면, 사용자가 "다시 시도"를
 * 눌렀을 때 남은 섹션만 이어서 만들 수 있다.
 *
 * 기본값은 Hobby 플랜의 함수 실행시간 상한(60초) 기준 — vercel.json의
 * maxDuration도 60으로 맞춰뒀다. Pro로 돌아가면(더 긴 실행시간 가능)
 * REPORT_GENERATION_BUDGET_MS 환경변수로 늘리면 된다(코드 변경 불필요).
 */
const GENERATION_BUDGET_MS = envDurationMs(
  process.env.REPORT_GENERATION_BUDGET_MS,
  40_000
);

/**
 * GENERATING 상태가 이 시간을 넘겨도 안 끝나면 "멈춘 것"으로 본다.
 *
 * 함수가 강제 종료되면 상태를 정리하지 못해 GENERATING으로 남는데, 그걸
 * 영원히 "생성 중"으로 취급하면 해당 딜은 새 보고서를 만들 수 없게 된다.
 *
 * 예전엔 15분 고정이었는데, 함수 실행시간 상한이 60초인 Hobby에서는 이미
 * 죽은 게 확실한 생성 때문에 사용자가 15분을 기다려야 했다. 실제 실행이
 * 시간 예산을 넘길 수 없으므로 예산의 3배(최소 90초)면 정상 진행 중인
 * 생성을 멈춘 것으로 오판하지 않으면서 훨씬 빨리 재시도할 수 있다.
 */
export const STALE_GENERATION_MS = Math.max(GENERATION_BUDGET_MS * 3, 90_000);

/**
 * 의견종합 끝에 붙이는 자동 품질 메모 — 재생성 시 중복 누적을 막으려고
 * 다시 붙이기 전에 이 패턴으로 기존 메모를 떼어낸다.
 * (`*자동 품질 점수: 82/100 · …*` 형태, 문서 맨 끝에만 존재)
 */
const QUALITY_NOTE_RE = /\n*---\n\*자동 품질 점수:[\s\S]*$/;

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
        //
        // "지금 예산이 남았는가"가 아니라 "한 섹션을 끝낼 만큼 남았는가"로
        // 판단한다 — 마감 직전에 섹션을 시작하면 AI 호출이 예산을 한참 넘겨
        // 결국 함수가 강제 종료되고, 상태 정리를 못 해 보고서가 GENERATING에
        // 갇힌다.
        //
        // 최악의 경우를 계산하면: 마지막으로 시작 가능한 시점은
        // (예산 - 1회 타임아웃)이고 거기서 재시도까지 다 쓰면
        // AI_CALL_BUDGET_MS가 더 걸린다. 기본값 기준
        // 40s - 25s + 40s = 55s로 Hobby 상한(60초) 안에 들어온다.
        // 여유를 재시도 최악값(AI_CALL_BUDGET_MS)으로 잡으면 한 번 실행에
        // 섹션 한 개도 못 만들어 사용자가 "다시 시도"만 반복하게 된다.
        if (deadline - Date.now() < REQUEST_TIMEOUT_MS) {
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
      // 이미 붙어 있는 품질 메모는 떼어내고 새로 붙인다. 완성된 보고서에서
      // "다시 시도"를 누르면 모든 섹션이 재사용되면서 이 블록만 다시 도는데,
      // 그대로 이어붙이면 메모가 누를 때마다 하나씩 쌓인다.
      const base = results[opinionIdx].content.replace(QUALITY_NOTE_RE, "");
      const opinionContent =
        base +
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
