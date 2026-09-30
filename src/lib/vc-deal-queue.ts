/**
 * VC 딜 목록(검토 대기열)용 요약 — canonical 결정 결과를 목록 한 줄로 압축한다.
 *
 * 새 판단이나 점수를 만들지 않는다. `computeReportDecision()`(화면·API·DOCX가 공유하는
 * 단일 조립 경로)의 결과에서 이미 계산된 값만 읽고, "다음 행동"은 그 값의 우선순위
 * 규칙(상충 → 필수(P0) 정보 공백 → Thesis Breaker → 검토 준비)로만 고른다.
 * 서로 다른 위험을 숫자가 같다는 이유로 합치지 않는다 — 개수는 항목별로 따로 둔다.
 */
import { IC_RECOMMENDATION_LABEL, type InvestmentSignal, type IcRecommendation } from "./ic-review";
import type { VCEvidenceState } from "./vc-decision-types";
import type { ReportDecisionResult } from "./vc-decision-loader";

export type DealNextActionKind =
  | "CONFIRM_CONTRADICTION"
  | "SECURE_P0_INFORMATION"
  | "REVIEW_THESIS_BREAKER"
  | "SUPPLEMENT_EVIDENCE"
  | "PREPARE_IC"
  | "GENERATE_REPORT"
  | "CHECK_DECISION";

export interface DealNextAction {
  kind: DealNextActionKind;
  /** 사람이 읽는 한 줄(구체적 지표·항목명을 포함) */
  label: string;
}

export interface DealQueueSummary {
  dealId: string;
  reportId: string;
  /** 결정 게이트가 통과했는가 — false면 아래 signal 등은 참고용이 아니라 "판단 불가" */
  gateOk: boolean;
  signal: InvestmentSignal;
  recommendation: IcRecommendation;
  confidence: VCEvidenceState;
  contradictionCount: number;
  p0Count: number;
  breakerCount: number;
  missingCount: number;
  nextAction: DealNextAction;
}

/** 보고서가 없는 딜의 다음 행동 — 결정 계산 결과가 없을 때 쓰는 유일한 고정 문구 */
export const NO_REPORT_NEXT_ACTION: DealNextAction = {
  kind: "GENERATE_REPORT",
  label: "문서를 올리고 보고서를 생성하면 투자 판단이 여기에 요약됩니다",
};

export function pickNextAction(result: ReportDecisionResult): DealNextAction {
  const d = result.decision;
  if (!result.gate.ok) {
    return { kind: "CHECK_DECISION", label: "결정 요약 검증에 실패했습니다 — 보고서에서 직접 확인" };
  }
  const firstContradiction = d.contradictions[0];
  if (firstContradiction) {
    return {
      kind: "CONFIRM_CONTRADICTION",
      label: `${firstContradiction.metricLabel} 수치 상충(${firstContradiction.values.length}개 값) — 원문 대조`,
    };
  }
  const firstP0 = d.missingInformation.find((m) => m.priority === "P0");
  if (firstP0) {
    return { kind: "SECURE_P0_INFORMATION", label: `필수 정보 확보: ${firstP0.item}` };
  }
  const firstBreaker = d.thesisBreakers[0];
  if (firstBreaker) {
    return { kind: "REVIEW_THESIS_BREAKER", label: `논지 훼손 요인 검토: ${firstBreaker.title}` };
  }
  // 차단 항목이 없다는 것과 "상정 준비가 됐다"는 다르다 — canonical 권고가 준비됨일 때만 상정을 안내한다.
  if (d.recommendation === "READY_FOR_IC_REVIEW") {
    return { kind: "PREPARE_IC", label: "결정을 막는 항목이 없습니다 — IC 질문을 검토하고 상정 준비" };
  }
  return {
    kind: "SUPPLEMENT_EVIDENCE",
    label: `${IC_RECOMMENDATION_LABEL[d.recommendation]} — 근거 자료를 보강하고 결정 화면에서 항목 확인`,
  };
}

export function summarizeDealDecision(
  dealId: string,
  reportId: string,
  result: ReportDecisionResult
): DealQueueSummary {
  const d = result.decision;
  return {
    dealId,
    reportId,
    gateOk: result.gate.ok,
    signal: d.signal,
    recommendation: d.recommendation,
    confidence: d.confidence,
    contradictionCount: d.contradictions.length,
    p0Count: d.missingInformation.filter((m) => m.priority === "P0").length,
    breakerCount: d.thesisBreakers.length,
    missingCount: d.missingInformation.length,
    nextAction: pickNextAction(result),
  };
}

/**
 * 검토 우선순위 — 큰 값일수록 먼저 봐야 한다. 상충 > P0 공백 > 논지 훼손 > 그 외.
 * 요약이 아직 없는 딜(보고서 없음/불러오는 중)은 가장 뒤.
 */
export function queueUrgencyScore(summary: DealQueueSummary | undefined): number {
  if (!summary) return -1;
  return (
    (summary.gateOk ? 0 : 5000) +
    Math.min(summary.contradictionCount, 9) * 1000 +
    Math.min(summary.p0Count, 9) * 100 +
    Math.min(summary.breakerCount, 9) * 10
  );
}
