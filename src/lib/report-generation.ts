import { AgentType, DealSector, ReportStatus } from "@prisma/client";
import { getAgent } from "@/agents";
import { SECTION_META, type GenerationResult } from "@/types";
import { prisma } from "@/lib/prisma";
import { setCurrentSection } from "@/lib/generation-progress";
import {
  extractSharedFacts,
  formatSharedFactsForPrompt,
} from "@/lib/shared-facts";
import { evaluateReport } from "@/lib/report-quality";
import { REQUEST_TIMEOUT_MS, envDurationMs, MODEL } from "@/lib/claude";

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
 * 눌렀을 때 남은 섹션만 이어서 만들 수 있다 — 이 checkpoint/resume
 * 구조 자체는 Pro 전환 후에도 그대로 유지한다(한 요청에서 10개 섹션을
 * 전부 끝내도록 강제하지 않음 — 무제한 request가 아니라 매 invocation이
 * 더 많은 섹션을 처리할 수 있게 여유만 늘리는 것).
 *
 * 기본값은 Vercel Pro 기준(vercel.json의 maxDuration=240s와 짝을 맞춤) —
 * 실측 섹션당 평균 17~20초 기준으로 한 번의 실행에서 최소 4개 섹션을
 * 안정적으로 처리할 수 있는 값이다. maxDuration보다 반드시 짧아야 하고,
 * 아래 루프의 worst-case 계산(budget - REQUEST_TIMEOUT_MS + AI_CALL_BUDGET_MS)이
 * maxDuration을 넘지 않는지 값을 바꿀 때마다 다시 확인할 것 —
 * AI_CALL_BUDGET_MS가 fallback 체인 구성에 따라 달라지므로(claude.ts 참고,
 * 기본 180 - 25 + 55 = 210s, maxDuration 240s 대비 30초 여유),
 * npm run test:runtime-budget이 이 계산을 자동으로 검증한다.
 * REPORT_GENERATION_BUDGET_MS 환경변수로 더 늘릴 수 있다(코드 변경 불필요).
 */
const GENERATION_BUDGET_MS = envDurationMs(
  process.env.REPORT_GENERATION_BUDGET_MS,
  180_000
);

/**
 * GENERATING 상태가 이 시간을 넘겨도 안 끝나면 "멈춘 것"으로 본다.
 *
 * 함수가 강제 종료되면 상태를 정리하지 못해 GENERATING으로 남는데, 그걸
 * 영원히 "생성 중"으로 취급하면 해당 딜은 새 보고서를 만들 수 없게 된다.
 *
 * 배수는 GENERATION_BUDGET_MS가 아니라 실제 강제 종료 한도(vercel.json의
 * maxDuration)에 맞춰 잡아야 한다 — 배수(예산의 3배)를 고정해두면
 * 예산을 올릴 때마다 대기시간이 같이 커진다(40초 예산 시절엔 3배=120초로
 * 적당했지만, 180초 예산에 그대로 곱하면 540초=9분이 되어 실제 강제
 * 종료 한도(240초)보다 훨씬 길게 사용자를 기다리게 한다 — Pro 전환 시
 * 실제로 겪은 회귀). 1.5배(최소 90초)면 예산(180초)보다 90초 여유가
 * 있어 "죽었다 확신"에 충분하면서도, maxDuration(240초)을 크게 넘기지
 * 않는다.
 */
export const STALE_GENERATION_MS = Math.max(GENERATION_BUDGET_MS * 1.5, 90_000);

/**
 * 서버 측(cron) 자동 재개 시도 상한. 브라우저 폴링의 MAX_AUTO_RESUMES(20,
 * report-wizard.tsx)와 같은 역할이지만 cron은 매 tick이 새 stateless
 * invocation이라 진행 여부를 메모리로 비교할 수 없다 — 대신 DB에 남긴
 * Report.autoResumeCount로 상한을 건다. 정상적인 보고서는 1~2회 안에
 * 끝나므로(실측 섹션당 17~20초, 예산 180초 기준) 30회는 "진짜 계속
 * 실패하는" 딜만 걸러내기 위한 넉넉한 여유값이다.
 */
export const MAX_AUTO_RESUME_ATTEMPTS = 30;

/**
 * 보고서 하나를 원자적으로 "지금부터 내가 생성한다"고 선점한다.
 *
 * /run 라우트(브라우저 트리거)와 cron 라우트(서버 트리거)가 동시에 같은
 * report를 재개하려 시도할 수 있어(사용자가 탭을 열어둔 채 cron도 같은
 * 순간 돈 경우 등), 조건부 updateMany 하나로 승자만 GENERATING을 잡게
 * 한다 — 진 쪽은 count=0을 받고 그대로 넘어간다(중복 생성/토큰 이중 소비
 * 없음). GENERATING인데 오래 갱신이 없으면(멈춘 것으로 판단) 그것도
 * 재선점 대상에 포함한다.
 */
export async function claimPendingGeneration(reportId: string): Promise<boolean> {
  const claimed = await prisma.report.updateMany({
    where: {
      id: reportId,
      OR: [
        { status: { not: ReportStatus.GENERATING } },
        {
          status: ReportStatus.GENERATING,
          updatedAt: { lt: new Date(Date.now() - STALE_GENERATION_MS) },
        },
      ],
    },
    data: { status: ReportStatus.GENERATING },
  });
  return claimed.count > 0;
}

export interface ResumeCandidate {
  id: string;
  completedSections: number;
  autoResumeCount: number;
}

/**
 * cron이 실제로 손댈 후보만 순수하게 걸러낸다(DB/네트워크 없음 — 네트워크
 * 없이 단위 테스트 가능하도록 claimPendingGeneration과 분리했다).
 *
 * - completedSections >= totalSections: 이미 끝난 보고서(정상 경로라면
 *   status가 PENDING/GENERATING일 수 없지만, 방어적으로 제외).
 * - autoResumeCount >= maxAutoResumeAttempts: 반복 실패로 상한 도달 —
 *   더 이상 자동 재시도하지 않고 사용자가 직접 "다시 시도"를 누르게 둔다
 *   (무한 재시도로 비용이 새는 것을 막는다).
 */
export function selectResumableCandidates(
  candidates: ResumeCandidate[],
  opts: { totalSections: number; maxAutoResumeAttempts: number }
): ResumeCandidate[] {
  return candidates.filter(
    (c) =>
      c.completedSections < opts.totalSections &&
      c.autoResumeCount < opts.maxAutoResumeAttempts
  );
}

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
  const invocationStartedAt = Date.now();
  const deadline = invocationStartedAt + GENERATION_BUDGET_MS;
  const elapsedSec = () => ((Date.now() - invocationStartedAt) / 1000).toFixed(1);
  setCurrentSection(reportId, "준비 중...");
  console.log(
    `[GENERATION] report=${reportId} deal=${deal.id} invocation_start budget=${(GENERATION_BUDGET_MS / 1000).toFixed(0)}s total=${total}`
  );

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
      setCurrentSection(reportId, meta.title);

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
        // 180s - 25s + 55s = 210s로 vercel.json의 maxDuration(240s)
        // 안에 30초 여유를 두고 들어온다(DB 저장·품질평가 등 나머지 처리
        // 시간). 여유를 재시도 최악값(AI_CALL_BUDGET_MS)으로 잡으면 한 번
        // 실행에 섹션 하나도 못 만들어 사용자가 "다시 시도"만 반복하게
        // 된다 — 그래서 더 짧은 REQUEST_TIMEOUT_MS를 기준으로 삼는다.
        if (deadline - Date.now() < REQUEST_TIMEOUT_MS) {
          console.warn(
            `[Gen] report=${reportId} 시간 예산 소진 — ${i}/${total} 섹션까지 저장하고 중단(재시도 시 이어서 생성)`
          );
          console.log(
            `[GENERATION] report=${reportId} invocation_end status=checkpoint sections=${i}/${total} elapsed=${elapsedSec()}s checkpoint_saved=true resume_expected=true`
          );
          await prisma.report.update({
            where: { id: reportId },
            data: { status: ReportStatus.PENDING, currentSectionTitle: null },
          });
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

        try {
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
        } catch (err) {
          // 실패해도 재시도/폴백은 이미 agent.generateSection 안(claude.ts의
          // runModelChain)에서 전부 소진된 뒤라, 여기서는 로그만 남기고
          // 그대로 다시 던진다 — 바깥 catch가 기존과 동일하게 report를
          // PENDING으로 되돌린다(재시도 시 이어서 생성).
          console.warn(
            `[GENERATION] report=${reportId} section=${i + 1}/${total} model=? ` +
              `duration=${((Date.now() - startedAt) / 1000).toFixed(1)}s success=false ` +
              `elapsed=${elapsedSec()}s error=${err instanceof Error ? err.constructor.name : "Error"}`
          );
          throw err;
        }

        const fallbackUsed = Boolean(result.modelUsed) && result.modelUsed !== MODEL;
        console.log(
          `[Gen] report=${reportId} ${i + 1}/${total} ${meta.title} 완료 ` +
            `(${Math.round((Date.now() - startedAt) / 1000)}초, ${result.tokensUsed} tokens, ${result.modelUsed ?? "?"})`
        );
        console.log(
          `[GENERATION] report=${reportId} section=${i + 1}/${total} model=${result.modelUsed ?? "?"} ` +
            `fallback=${fallbackUsed} duration=${((Date.now() - startedAt) / 1000).toFixed(1)}s ` +
            `success=true elapsed=${elapsedSec()}s`
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

    console.log(
      `[GENERATION] report=${reportId} invocation_end status=completed sections=${total}/${total} elapsed=${elapsedSec()}s`
    );

    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: ReportStatus.DRAFT,
        generatedAt: new Date(),
        currentSectionTitle: null,
      },
    });
  } catch (error) {
    console.error("Section generation error:", error);
    console.log(
      `[GENERATION] report=${reportId} invocation_end status=failed elapsed=${elapsedSec()}s checkpoint_saved=true resume_expected=true`
    );
    await prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.PENDING, currentSectionTitle: null },
    });
  }
}
