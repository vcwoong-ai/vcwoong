/**
 * 검토 대기열(VC 딜 목록 · PE 딜 목록 · 대시보드)의 표시 규칙 테스트.
 *
 * 규칙이 canonical 결과를 "읽기만" 하는지, 그리고 잘못된 안심(상충이 있는데 상정 준비, 근거가 없는데 상정 준비)을
 * 만들지 않는지를 고정한다. 순수 함수 검증 — DB·네트워크 없음.
 * Usage: npm run test:deal-queue
 */
import { computeReportDecision, type ReportForDecision } from "../src/lib/vc-decision-loader";
import { traceReportEvidence } from "../src/lib/evidence";
import { buildScoreEvidenceAssessment } from "../src/lib/deal-scoring-evidence";
import { pickNextAction, summarizeDealDecision, queueUrgencyScore, NO_REPORT_NEXT_ACTION } from "../src/lib/vc-deal-queue";
import {
  isMaDealTab,
  peQueueUrgencyScore,
  pickPeNextAction,
  readinessToNextActionInput,
  tabForDomain,
  MA_DEAL_TAB_VALUES,
} from "../src/lib/pe/ma-deal-queue";
import { buildPEDecisionReadiness } from "../src/lib/pe/pe-decision-readiness";
import type { MaDealListReadinessSummary } from "../src/lib/pe/ma-deal-list-readiness";
import type { ScoreDimensionKey } from "../src/lib/deal-scoring-shared";

let pass = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  pass++;
  console.log(`✅ ${msg}`);
}

// ── VC ───────────────────────────────────────────────────────────────
const scores = { marketSize: 70, team: 70, product: 70, businessModel: 70, financials: 70, moat: 70 } as Record<ScoreDimensionKey, number>;

function reportFor(content: string, docs: Array<{ name: string; parsedText: string }>): ReportForDecision {
  const sections = [{ sectionKey: "FINANCIAL_STATUS", title: "재무", content }];
  const claims = traceReportEvidence(sections as never, docs as never, { investAmount: 50, valuation: 400 }, undefined).claims;
  const evidenceAssessment = buildScoreEvidenceAssessment(scores, {}, claims, "report_evidence");
  return {
    sections: sections as never,
    deal: { investAmount: 50, valuation: 400, documents: docs as never, score: { overall: 70, rationale: {}, evidenceAssessment } },
    evidenceCheck: null,
    icQuestions: null,
  };
}

const contradictory = computeReportDecision(
  reportFor("2024년 매출 95억원. 2024년 매출 110억원.", [
    { name: "IR.pdf", parsedText: "2024년 매출 95억원" },
    { name: "감사.pdf", parsedText: "2024년 매출액 110억원" },
  ])
);
const nextC = pickNextAction(contradictory);
assert(nextC.kind === "CONFIRM_CONTRADICTION" && nextC.label.includes("수치 상충"), "상충이 있으면 다음 행동은 상충 확인(가장 앞 우선순위)");
const sumC = summarizeDealDecision("d1", "r1", contradictory);
assert(sumC.contradictionCount === contradictory.decision.contradictions.length && sumC.contradictionCount >= 1, "요약의 상충 개수는 canonical 결정의 개수 그대로");
assert(sumC.p0Count === contradictory.decision.missingInformation.filter((m) => m.priority === "P0").length, "P0 개수도 canonical 그대로(서로 다른 항목을 합치지 않음)");
assert(sumC.confidence === contradictory.decision.confidence && sumC.recommendation === contradictory.decision.recommendation, "확신도·권고는 canonical 그대로");

// 결정을 막는 항목이 없어도 권고가 "상정 준비됨"이 아니면 상정을 안내하지 않는다
const synthetic = (over: Record<string, unknown>) =>
  ({
    gate: { ok: true },
    decision: { contradictions: [], missingInformation: [], thesisBreakers: [], recommendation: "MATERIAL_GAPS_IDENTIFIED", ...over },
  }) as never;
const noItemsButNotReady = pickNextAction(synthetic({}));
assert(noItemsButNotReady.kind === "SUPPLEMENT_EVIDENCE", "차단 항목이 없어도 권고가 '중대한 근거 공백'이면 상정 준비를 안내하지 않고 근거 보강을 안내");
const ready = pickNextAction(synthetic({ recommendation: "READY_FOR_IC_REVIEW" }));
assert(ready.kind === "PREPARE_IC", "권고가 상정 준비됨일 때만 IC 상정 준비를 안내");
const gateFail = pickNextAction({ gate: { ok: false }, decision: { contradictions: [{ metricLabel: "매출", values: [1, 2] }] } } as never);
assert(gateFail.kind === "CHECK_DECISION", "결정 게이트 실패는 다른 어떤 행동보다 먼저 직접 확인하도록 안내");
const p0 = pickNextAction(synthetic({ missingInformation: [{ priority: "P1", item: "가" }, { priority: "P0", item: "고객 계약 명세" }] }));
assert(p0.kind === "SECURE_P0_INFORMATION" && p0.label.includes("고객 계약 명세"), "P1보다 P0 정보를 골라 안내");
assert(NO_REPORT_NEXT_ACTION.kind === "GENERATE_REPORT", "보고서가 없으면 보고서 생성 안내(판단을 지어내지 않음)");

assert(queueUrgencyScore(undefined) === -1, "요약이 없는 딜은 가장 뒤");
const scoreOf = (over: Partial<Record<string, number | boolean>>) =>
  queueUrgencyScore({ gateOk: true, contradictionCount: 0, p0Count: 0, breakerCount: 0, ...over } as never);
assert(scoreOf({ contradictionCount: 1 }) > scoreOf({ p0Count: 9 }), "상충 1건이 P0 9건보다 먼저");
assert(scoreOf({ p0Count: 1 }) > scoreOf({ breakerCount: 9 }), "P0 1건이 논지 훼손 9건보다 먼저");
assert(scoreOf({ gateOk: false }) > scoreOf({ contradictionCount: 4 }), "게이트 실패가 가장 먼저");

// ── PE ───────────────────────────────────────────────────────────────
const base: MaDealListReadinessSummary = {
  overall: "READY", financial: "READY", qoe: "READY", lbo: "READY", dd: "READY",
  blockerCount: 0, topBlockerLabel: null, topBlockerDomain: null, latestPeriodLabel: "FY2024", myReviewStatus: null,
};
assert(pickPeNextAction(base).tab === "ic-review", "모든 영역이 준비되면 IC 검토 진행");
const blocked = pickPeNextAction({ ...base, overall: "BLOCKED", financial: "BLOCKED", blockerCount: 3, topBlockerLabel: "REVENUE 값 불일치", topBlockerDomain: "FINANCIAL" });
assert(blocked.tab === "financials" && blocked.label.startsWith("차단 요인 해소"), "재무 차단은 재무 탭에서 해소하도록 안내");
assert(pickPeNextAction({ ...base, overall: "BLOCKED", blockerCount: 1, topBlockerLabel: "QoE 모순", topBlockerDomain: "LBO" }).tab === "lbo", "LBO 차단은 LBO 탭");
assert(pickPeNextAction({ ...base, financial: "NOT_STARTED", overall: "NOT_STARTED" }).tab === "financials", "재무 미입력은 재무 탭");
assert(pickPeNextAction({ ...base, lbo: "PARTIAL", overall: "PARTIAL" }).tab === "lbo", "LBO 가정 미비는 LBO 탭");
assert(pickPeNextAction({ ...base, dd: "NOT_STARTED", overall: "PARTIAL" }).tab === "data-room", "DD 미시작은 데이터룸");
assert(tabForDomain("DART") === "dart" && tabForDomain("EVIDENCE") === "data-room" && tabForDomain("UNKNOWN") === "overview", "도메인→탭 매핑(알 수 없는 도메인은 개요)");
assert(peQueueUrgencyScore({ ...base, overall: "BLOCKED", blockerCount: 2 }) > peQueueUrgencyScore({ ...base, overall: "PARTIAL" }), "차단이 부분 준비보다 먼저");
assert(peQueueUrgencyScore({ ...base, overall: "PARTIAL" }) > peQueueUrgencyScore(base), "부분 준비가 준비 완료보다 먼저");
assert(peQueueUrgencyScore(undefined) === -1, "준비 상태가 아직 없으면 가장 뒤");
assert(isMaDealTab("financials") && !isMaDealTab("hack") && !isMaDealTab(null) && !isMaDealTab("<script>"), "?tab= 값은 알려진 탭만 인정(임의 문자열 거부)");
assert(MA_DEAL_TAB_VALUES.length === 9, "탭 값 목록 9개(상세 화면 탭과 동기 — E2E가 실제 탭 존재를 확인)");

// canonical readiness → 같은 입력 모양 (상세 개요와 목록이 같은 규칙을 쓴다)
const readiness = buildPEDecisionReadiness({ periods: [] });
const input = readinessToNextActionInput(readiness);
assert(input.overall === readiness.overall && input.blockerCount === readiness.blockers.length, "상세 readiness → 입력 변환은 값을 그대로 옮김");
assert(pickPeNextAction(input).tab === "financials", "재무 기간이 없으면 상세 개요도 재무 입력을 안내");

console.log(`\n${pass}개 통과`);
