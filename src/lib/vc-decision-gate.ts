/**
 * VC Investment Decision — 결과물 품질 게이트(PR-J).
 *
 * section-generation-gate.ts와 같은 성격: "결과가 그럴듯한가"가 아니라
 * "이 결과를 저장/노출해도 되는 최소 구조적 조건을 만족하는가"만 이진
 * 판정한다(§18 요청 그대로). AI 분류기·감정분석·LLM 호출을 쓰지 않는다 —
 * vc-decision.ts는 애초에 AI를 호출하지 않는 순수 함수라 "환각 문장"이
 * 나올 수 없고, 여기서는 그 순수 함수의 출력이 스스로의 계약을 지키는지만
 * 검사한다(방어적 회귀 검증).
 */
import type {
  VCInvestmentDecision,
  VCMissingInformation,
  VCInvestmentDriver,
  VCThesisBreaker,
} from "./vc-decision-types";

export type VCDecisionGateFailureReason =
  | "P0_MISSING_INFO_WITHOUT_REASON"
  | "P0_MISSING_INFO_WITHOUT_EVIDENCE_REQUIREMENT"
  | "VERIFIED_DIMENSION_WITHOUT_EVIDENCE"
  | "DRIVER_WITHOUT_EVIDENCE_OR_MISSING_STATE"
  | "THESIS_BREAKER_WITHOUT_EVIDENCE_OR_MISSING_STATE"
  | "THESIS_BREAKER_WITH_ASSESSED_PROBABILITY"
  | "VALUATION_NOT_COMPUTABLE_WITHOUT_REQUIRED_INPUT"
  | "GENERIC_LANGUAGE_WITHOUT_SPECIFICS";

export interface VCDecisionGateResult {
  ok: boolean;
  reason?: VCDecisionGateFailureReason;
  detail?: string;
}

/** "경쟁이 치열하다"류 저가치 문구 — 회사 고유 지표/근거가 붙어 있으면 통과시킨다(§19). */
const GENERIC_PHRASES = [
  /경쟁(이|은|가)\s*(치열|심하)/,
  /시장(이|은|가)\s*(성장|커지고)/,
  /규제\s*리스크(가|는)?\s*(존재|있)/,
  /(지속적으로|계속)\s*모니터링/,
  /실행\s*리스크(가|는)?\s*(존재|남아)/,
];

function hasSpecifics(text: string): boolean {
  // 숫자(수치 근거) 또는 실제 근거 발췌 인용(따옴표)이 있으면 "일반론"이 아니다.
  return /\d/.test(text) || /["“][^"”]{4,}["”]/.test(text);
}

function isGenericWithoutSpecifics(text: string): boolean {
  return GENERIC_PHRASES.some((re) => re.test(text)) && !hasSpecifics(text);
}

function checkMissingInformation(items: VCMissingInformation[]): VCDecisionGateResult {
  for (const item of items) {
    if (item.priority !== "P0") continue;
    if (!item.whyItMatters || item.whyItMatters.trim().length === 0) {
      return { ok: false, reason: "P0_MISSING_INFO_WITHOUT_REASON", detail: item.id };
    }
    if (!item.requiredEvidence || item.requiredEvidence.trim().length === 0) {
      return { ok: false, reason: "P0_MISSING_INFO_WITHOUT_EVIDENCE_REQUIREMENT", detail: item.id };
    }
  }
  return { ok: true };
}

function checkDrivers(drivers: VCInvestmentDriver[]): VCDecisionGateResult {
  for (const d of drivers) {
    if (d.evidenceState === "MISSING") continue; // MISSING은 근거가 없다고 명시하는 것 자체가 정상 상태
    if (d.evidence.length === 0) {
      return { ok: false, reason: "DRIVER_WITHOUT_EVIDENCE_OR_MISSING_STATE", detail: d.id };
    }
    if (isGenericWithoutSpecifics(d.whyItMatters)) {
      return { ok: false, reason: "GENERIC_LANGUAGE_WITHOUT_SPECIFICS", detail: d.id };
    }
  }
  return { ok: true };
}

function checkThesisBreakers(breakers: VCThesisBreaker[]): VCDecisionGateResult {
  for (const b of breakers) {
    // checkDrivers와 동일한 원칙: MISSING은 "근거가 없다"는 상태 자체가
    // 정상이지만, 그 외 상태(특히 VERIFIED)를 주장하면서 근거 발췌가
    // 하나도 없으면 안 된다.
    if (b.evidenceState !== "MISSING" && b.evidence.length === 0) {
      return { ok: false, reason: "THESIS_BREAKER_WITHOUT_EVIDENCE_OR_MISSING_STATE", detail: b.id };
    }
    // TS 타입이 이미 리터럴 "NOT_ASSESSED"만 허용하지만, JSON 역직렬화 등
    // 타입을 우회하는 경로에 대비해 런타임에서도 방어적으로 재확인한다.
    if ((b.probability as string) !== "NOT_ASSESSED") {
      return { ok: false, reason: "THESIS_BREAKER_WITH_ASSESSED_PROBABILITY", detail: b.id };
    }
    if (isGenericWithoutSpecifics(b.whyItMatters)) {
      return { ok: false, reason: "GENERIC_LANGUAGE_WITHOUT_SPECIFICS", detail: b.id };
    }
  }
  return { ok: true };
}

function checkValuation(decision: VCInvestmentDecision): VCDecisionGateResult {
  for (const item of decision.valuation.lineItems) {
    if (item.status !== "not_computable") continue;
    if (!item.requiredInput || item.requiredInput.trim().length === 0) {
      return { ok: false, reason: "VALUATION_NOT_COMPUTABLE_WITHOUT_REQUIRED_INPUT", detail: item.label };
    }
  }
  return { ok: true };
}

function checkVerifiedDimensions(decision: VCInvestmentDecision): VCDecisionGateResult {
  for (const dim of decision.decisionDimensions) {
    if (dim.state === "VERIFIED" && dim.positiveDrivers.length === 0) {
      return { ok: false, reason: "VERIFIED_DIMENSION_WITHOUT_EVIDENCE", detail: dim.dimension };
    }
  }
  return { ok: true };
}

/**
 * 전체 Investment Decision 객체 하나를 검증한다. 첫 위반에서 바로
 * 실패를 반환한다(section-generation-gate.ts와 동일한 이진 판정 스타일).
 */
export function checkVCDecisionGate(decision: VCInvestmentDecision): VCDecisionGateResult {
  const checks = [
    () => checkVerifiedDimensions(decision),
    () => checkMissingInformation(decision.missingInformation),
    () => checkDrivers(decision.drivers),
    () => checkThesisBreakers(decision.thesisBreakers),
    () => checkValuation(decision),
  ];
  for (const check of checks) {
    const result = check();
    if (!result.ok) return result;
  }
  return { ok: true };
}
