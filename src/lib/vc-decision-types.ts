/**
 * VC Investment Decision Intelligence — 도메인 타입(PR-J).
 *
 * 여기서 하는 일은 새 채점·근거 로직을 만드는 게 아니라, 이미 결정적으로
 * 계산돼 있는 값(deal-scoring-evidence.ts의 ScoreEvidenceAssessment,
 * evidence.ts의 NumericClaim, ic-questions.ts의 IcQuestion, ic-review.ts의
 * KeyStrength/KeyRisk/InvestmentSignal)을 "심사역이 첫 화면에서 투자판단을
 * 내릴 수 있는 형태"로 재구성하는 것이다(vc-decision.ts). 이 파일은 타입만
 * 담는다 — 계산 로직 없음.
 *
 * 핵심 원칙(요청 그대로): 근거가 없으면 "그럴듯한 값"을 만들지 않는다.
 * 상태는 항상 명시적이다(VERIFIED/PARTIALLY_VERIFIED/UNVERIFIED/MISSING/
 * CONTRADICTED) — 근거가 없다고 "낮은 점수"로 뭉개지 않는다.
 */
import type { ScoreDimensionKey } from "./deal-scoring-shared";
import type { RiskFlag } from "./deal-scoring-evidence";
import type { IcQuestion } from "./ic-questions";
import type { InvestmentSignal, IcRecommendation } from "./ic-review";

/** 근거 확인 상태 — 근거가 없으면 MISSING이지 낮은 점수가 아니다. */
export type VCEvidenceState =
  | "VERIFIED"
  | "PARTIALLY_VERIFIED"
  | "UNVERIFIED"
  | "MISSING"
  | "CONTRADICTED";

export type VCPriority = "P0" | "P1" | "P2";

/** 기존 DecisionImpact(HIGH/MEDIUM/LOW, deal-scoring-evidence.ts)에 CRITICAL을
 * 더한 상위 개념 — 점수 자체는 절대 바꾸지 않고(그 계약은 그대로), 표시
 * 레이어에서만 "고득점+근거전무"를 별도로 강조한다. */
export type VCDecisionImpact = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export const VC_PRIORITY_LABEL: Record<VCPriority, string> = {
  P0: "결정 불가(필수)",
  P1: "판단에 중대한 영향",
  P2: "참고 — 결정을 막지 않음",
};

export const VC_EVIDENCE_STATE_LABEL: Record<VCEvidenceState, string> = {
  VERIFIED: "확인됨",
  PARTIALLY_VERIFIED: "부분 확인",
  UNVERIFIED: "미확인",
  MISSING: "근거 없음",
  CONTRADICTED: "상충",
};

/** SCORE_DIMENSIONS(6개) + valuation(스코어 차원은 아니지만 IC가 반드시
 * 확인해야 하는 영역, deal-scoring-evidence.ts의 VALUATION_EVIDENCE_GAP과
 * 동일 근거) — Exit은 현재 딜 모델에 exit 가정 필드 자체가 없어(§10, §16)
 * 없는 차원을 억지로 만들지 않는다(스코프 밖으로 명시, 보고서에 기재). */
export type VCDecisionDimensionKey = ScoreDimensionKey | "valuation";

export interface VCDecisionDimension {
  dimension: VCDecisionDimensionKey;
  label: string;
  state: VCEvidenceState;
  decisionImpact: VCDecisionImpact;
  /** 근거로 확인된 긍정 신호(라벨) — evidence.ts의 keyEvidence에서 옴 */
  positiveDrivers: string[];
  /** 근거 공백/미확인 신호(라벨) */
  negativeDrivers: string[];
  missingInfoCount: number;
  /** 상충하는 값이 있으면 둘 다 노출한다(하나를 조용히 고르지 않음) */
  contradiction?: { valueA: string; valueB: string; sourceA?: string; sourceB?: string };
}

export interface VCInvestmentDriver {
  id: string;
  dimension: ScoreDimensionKey;
  title: string;
  description: string;
  whyItMatters: string;
  evidenceState: VCEvidenceState;
  /** 실제 근거 발췌(evidence.ts의 raw/문서명/위치) — 없으면 빈 배열, 지어내지 않음 */
  evidence: Array<{ raw: string; documentName?: string; location?: string }>;
  whatCouldInvalidate: string;
  verificationRequirement: string;
  decisionImpact: VCDecisionImpact;
}

export interface VCThesisBreaker {
  id: string;
  trigger: RiskFlag | "LOW_SCORE";
  dimension?: ScoreDimensionKey;
  title: string;
  whyItMatters: string;
  evidenceState: VCEvidenceState;
  evidence: Array<{ raw: string; documentName?: string; location?: string }>;
  /** 확률을 추정할 근거가 없으므로 항상 NOT_ASSESSED — 지어내지 않는다(요청 §6 그대로) */
  probability: "NOT_ASSESSED";
  decisionImpact: VCDecisionImpact;
  mitigation?: string;
  verificationRequirement: string;
  /** 이 리스크와 연결된 IC 질문(있으면) — 새로 만들지 않고 ic-questions.ts 결과를 매칭 */
  icQuestion?: IcQuestion;
}

export interface VCMissingInformation {
  id: string;
  priority: VCPriority;
  item: string;
  whyItMatters: string;
  decisionImpact: VCDecisionImpact;
  requiredEvidence: string;
  relatedDimension?: ScoreDimensionKey;
  icQuestion?: IcQuestion;
}

export type VCValuationLineItem =
  | { status: "computed"; label: string; value: string }
  | { status: "not_computable"; label: string; reason: string; requiredInput: string };

export interface VCValuationCase {
  /** 사실(Deal에 사용자가 직접 입력한 값) — AI가 만들지 않음 */
  facts: { investAmount?: number; valuation?: number };
  /** 결정적으로 계산 가능한 것만 계산한다(오너십 등) — 불가능하면 NOT_COMPUTABLE */
  lineItems: VCValuationLineItem[];
  evidenceState: VCEvidenceState;
}

export interface VCInvestmentDecision {
  /** 기존 investment-signal.ts 계산 재사용 — 새 추천 알고리즘 아님 */
  signal: InvestmentSignal;
  recommendation: IcRecommendation;
  /** 결정적 템플릿으로 합성 — AI 자유 서술이 아니다(§28: 지어내지 않는다) */
  thesis: string;
  /** "확신도"는 새 점수가 아니라 근거 완결성(overallConfidence)에 직접 연동된다 */
  confidence: VCEvidenceState;
  decisionDimensions: VCDecisionDimension[];
  drivers: VCInvestmentDriver[];
  thesisBreakers: VCThesisBreaker[];
  /** 우선순위(P0 먼저) 정렬 완료 */
  missingInformation: VCMissingInformation[];
  valuation: VCValuationCase;
}
