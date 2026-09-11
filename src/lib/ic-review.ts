/**
 * IC Review Workspace — Phase 3~5(Evidence/Score/IC Questions)가 이미 계산해
 * 둔 결과를 투자심의위원/심사역이 한 화면에서 빠르게 판단할 수 있도록
 * 요약·연결하기만 한다.
 *
 * 이 파일은 새 AI 호출도, 새 채점/근거 로직도 만들지 않는다 — 전부
 * DealScore.evidenceAssessment(deal-scoring-evidence.ts), 보고서 근거 추적
 * 결과(evidence.ts), IC 질문(ic-questions.ts)만 읽어 결정적으로 재배열한다.
 * 순수 함수라 네트워크·DB 없이 테스트 가능하다(tools/test-ic-review.ts).
 */
import { SCORE_DIMENSIONS, type ScoreDimensionKey } from "./deal-scoring-shared";
import {
  DIMENSION_FLAG,
  type ScoreEvidenceAssessment,
  type ScoreConfidence,
  type RiskFlag,
} from "./deal-scoring-evidence";
import type { NumericClaim, ClaimConfidence } from "./evidence";
import type { IcQuestion } from "./ic-questions";

function dimensionLabel(dim: ScoreDimensionKey): string {
  return SCORE_DIMENSIONS.find((d) => d.key === dim)?.label ?? dim;
}

// ── 1. Investment Signal ─────────────────────────────────────────────────

export type InvestmentSignal = "STRONG" | "PROMISING" | "CAUTION" | "HIGH_RISK";

export const INVESTMENT_SIGNAL_LABEL: Record<InvestmentSignal, { label: string; className: string }> = {
  STRONG: { label: "STRONG", className: "bg-green-50 text-green-700 border-green-200" },
  PROMISING: { label: "PROMISING", className: "bg-blue-50 text-blue-700 border-blue-200" },
  CAUTION: { label: "CAUTION", className: "bg-amber-50 text-amber-700 border-amber-200" },
  HIGH_RISK: { label: "HIGH RISK", className: "bg-red-50 text-red-700 border-red-200" },
};

const CONFIDENT_TIERS: ScoreConfidence[] = ["HIGH", "MEDIUM"];

/**
 * 새 투자 추천 알고리즘이 아니라, 기존 Overall Score(deal-scoring.ts)와
 * Evidence Confidence(deal-scoring-evidence.ts)를 사람이 한눈에 읽도록
 * 요약하는 UI 상태다 — 계산 근거는 이 함수 하나로 항상 설명 가능하다.
 *
 * 기존 scoreLabel()(deal-scoring-shared.ts)과 같은 점수 구간(75/55/35)을
 * 쓰되, confidence가 낮으면(LOW/UNSUPPORTED/NO_EVIDENCE) 점수만으로
 * 긍정 신호를 주지 않는다 — "점수는 높은데 근거가 없다"가 가장 위험한
 * 조합이라는 게 Phase 4의 핵심 발견이었다.
 */
export function computeInvestmentSignal(
  overall: number,
  confidence: ScoreConfidence
): InvestmentSignal {
  const confident = CONFIDENT_TIERS.includes(confidence);
  if (overall >= 75 && confident) return "STRONG";
  if (overall >= 55 && confident) return "PROMISING";
  if (overall < 35) return "HIGH_RISK";
  return "CAUTION";
}

// ── 2. Recommendation (중립적 표현, 자동 투자 추천 아님) ──────────────────

export type IcRecommendation =
  | "READY_FOR_IC_REVIEW"
  | "FURTHER_REVIEW_RECOMMENDED"
  | "MATERIAL_GAPS_IDENTIFIED"
  | "EVIDENCE_REQUIRES_VERIFICATION";

export const IC_RECOMMENDATION_LABEL: Record<IcRecommendation, string> = {
  READY_FOR_IC_REVIEW: "IC 상정 준비됨",
  FURTHER_REVIEW_RECOMMENDED: "추가 검토 권장",
  MATERIAL_GAPS_IDENTIFIED: "중대한 근거 공백 발견",
  EVIDENCE_REQUIRES_VERIFICATION: "근거 재확인 필요",
};

const CORE_EVIDENCE_FLAGS: RiskFlag[] = ["UNSUPPORTED_KEY_CLAIM", "HIGH_SCORE_LOW_EVIDENCE"];

/**
 * "BUY/PASS/INVEST"가 아니라 IC 상정 전 준비 상태를 알리는 중립 라벨이다.
 * AI가 투자 여부를 판단하지 않는다 — 판단은 항상 심사역의 몫이다.
 */
export function computeRecommendation(
  signal: InvestmentSignal,
  riskFlags: RiskFlag[]
): IcRecommendation {
  if (signal === "HIGH_RISK") return "MATERIAL_GAPS_IDENTIFIED";
  if (riskFlags.some((f) => CORE_EVIDENCE_FLAGS.includes(f))) {
    return "EVIDENCE_REQUIRES_VERIFICATION";
  }
  if (signal === "STRONG") return "READY_FOR_IC_REVIEW";
  return "FURTHER_REVIEW_RECOMMENDED";
}

// ── 3. Key Strengths ──────────────────────────────────────────────────────

export interface KeyStrength {
  dimension: ScoreDimensionKey;
  label: string;
  score: number;
  confidence: ScoreConfidence;
  rationale: string;
}

const MAX_KEY_STRENGTHS = 3;

/**
 * deal-scoring-evidence.ts의 buildIcSummary()와 정확히 같은 선정 기준
 * (score>=70 && confidence가 NO_EVIDENCE/UNSUPPORTED가 아님, 점수 내림차순
 * 최대 3개)을 쓰되, 문자열이 아니라 UI 카드에 바로 쓸 수 있는 구조로
 * 돌려준다 — 새 기준을 만들지 않고 같은 결정 로직을 재사용한다.
 */
export function selectKeyStrengths(
  assessment: ScoreEvidenceAssessment | null | undefined,
  rationale: Partial<Record<ScoreDimensionKey, string>> = {},
  max = MAX_KEY_STRENGTHS
): KeyStrength[] {
  if (!assessment) return [];
  return Object.values(assessment.dimensions)
    .filter((d) => d.score >= 70 && d.confidence !== "NO_EVIDENCE" && d.confidence !== "UNSUPPORTED")
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((d) => ({
      dimension: d.dimension,
      label: dimensionLabel(d.dimension),
      score: d.score,
      confidence: d.confidence,
      rationale: rationale[d.dimension] ?? "",
    }));
}

// ── 4. Key Risks ──────────────────────────────────────────────────────────

export interface KeyRisk {
  trigger: RiskFlag | "LOW_SCORE";
  label: string;
  dimension?: ScoreDimensionKey;
  score?: number;
  detail: string;
}

const MAX_KEY_RISKS = 5;
const LOW_SCORE_THRESHOLD = 55;

export const RISK_TRIGGER_LABEL: Record<RiskFlag | "LOW_SCORE", string> = {
  UNSUPPORTED_KEY_CLAIM: "핵심 주장 근거 없음",
  HIGH_SCORE_LOW_EVIDENCE: "고득점이나 근거 부족",
  VALUATION_EVIDENCE_GAP: "밸류에이션 근거 공백",
  MARKET_EVIDENCE_GAP: "시장성 근거 공백",
  TEAM_EVIDENCE_GAP: "팀 역량 근거 공백",
  PRODUCT_EVIDENCE_GAP: "제품·기술력 근거 공백",
  BUSINESS_MODEL_EVIDENCE_GAP: "사업모델 근거 공백",
  FINANCIALS_EVIDENCE_GAP: "재무 근거 공백",
  MOAT_EVIDENCE_GAP: "경쟁우위 근거 공백",
  LOW_SCORE: "낮은 점수",
};

/** 요청된 우선순위 그대로: 근거 없는 핵심 주장 > 고득점·근거부족 > 밸류에이션 공백 > 차원별 근거 공백 > 낮은 점수 */
const RISK_PRIORITY: RiskFlag[] = [
  "UNSUPPORTED_KEY_CLAIM",
  "HIGH_SCORE_LOW_EVIDENCE",
  "VALUATION_EVIDENCE_GAP",
  "MARKET_EVIDENCE_GAP",
  "TEAM_EVIDENCE_GAP",
  "PRODUCT_EVIDENCE_GAP",
  "BUSINESS_MODEL_EVIDENCE_GAP",
  "FINANCIALS_EVIDENCE_GAP",
  "MOAT_EVIDENCE_GAP",
];

/**
 * riskFlags(이미 deal-scoring-evidence.ts가 결정적으로 계산해둔 값)를
 * 요청된 우선순위로 정렬해 카드 형태로 만든다. 같은 dimension이 여러
 * 카드에 중복 등장하지 않도록(예: 근거 공백 + 낮은 점수 동시 표시) 이미
 * flag로 다뤄진 dimension은 낮은 점수 폴백에서 제외한다.
 */
export function selectKeyRisks(
  assessment: ScoreEvidenceAssessment | null | undefined,
  rationale: Partial<Record<ScoreDimensionKey, string>> = {},
  max = MAX_KEY_RISKS
): KeyRisk[] {
  if (!assessment) return [];
  const dims = Object.values(assessment.dimensions);
  const risks: KeyRisk[] = [];
  const coveredDimensions = new Set<ScoreDimensionKey>();

  for (const flag of RISK_PRIORITY) {
    if (risks.length >= max) break;
    if (!assessment.riskFlags.includes(flag)) continue;

    if (flag === "UNSUPPORTED_KEY_CLAIM") {
      const dim = dims.find((d) => d.unsupportedClaims.length > 0 && !coveredDimensions.has(d.dimension));
      if (!dim) continue;
      risks.push({
        trigger: flag,
        label: RISK_TRIGGER_LABEL[flag],
        dimension: dim.dimension,
        score: dim.score,
        detail: dim.unsupportedClaims[0]?.raw ?? "",
      });
      coveredDimensions.add(dim.dimension);
    } else if (flag === "HIGH_SCORE_LOW_EVIDENCE") {
      const dim = dims.find(
        (d) =>
          d.score >= 70 &&
          (d.confidence === "LOW" || d.confidence === "UNSUPPORTED" || d.confidence === "NO_EVIDENCE") &&
          !coveredDimensions.has(d.dimension)
      );
      if (!dim) continue;
      risks.push({
        trigger: flag,
        label: RISK_TRIGGER_LABEL[flag],
        dimension: dim.dimension,
        score: dim.score,
        detail: `${dimensionLabel(dim.dimension)} ${dim.score}점, 근거 확신도 ${dim.confidence}`,
      });
      coveredDimensions.add(dim.dimension);
    } else if (flag === "VALUATION_EVIDENCE_GAP") {
      risks.push({
        trigger: flag,
        label: RISK_TRIGGER_LABEL[flag],
        detail: "밸류에이션 관련 주장의 근거가 업로드 자료에서 확인되지 않습니다.",
      });
    } else {
      const dim = dims.find(
        (d) => DIMENSION_FLAG[d.dimension] === flag && !coveredDimensions.has(d.dimension)
      );
      if (!dim) continue;
      risks.push({
        trigger: flag,
        label: RISK_TRIGGER_LABEL[flag],
        dimension: dim.dimension,
        score: dim.score,
        detail: rationale[dim.dimension] ?? `${dimensionLabel(dim.dimension)} 근거 부족`,
      });
      coveredDimensions.add(dim.dimension);
    }
  }

  if (risks.length < max) {
    const lowScoreDims = dims
      .filter((d) => d.score < LOW_SCORE_THRESHOLD && !coveredDimensions.has(d.dimension))
      .sort((a, b) => a.score - b.score);
    for (const d of lowScoreDims) {
      if (risks.length >= max) break;
      risks.push({
        trigger: "LOW_SCORE",
        label: RISK_TRIGGER_LABEL.LOW_SCORE,
        dimension: d.dimension,
        score: d.score,
        detail: rationale[d.dimension] || `${dimensionLabel(d.dimension)} 점수 ${d.score}점`,
      });
      coveredDimensions.add(d.dimension);
    }
  }

  return risks.slice(0, max);
}

// ── 5. Must-Answer IC Questions (top N passthrough) ────────────────────────

const MAX_MUST_ANSWER_QUESTIONS = 5;

/**
 * ic-questions.ts의 dedupeAndRank()가 이미 priority 내림차순으로 정렬해둔
 * 결과를 그대로 앞에서부터 자른다 — 여기서 다시 정렬하지 않는다(순서를
 * 보존해야 HIGH가 먼저 나온다는 계약이 깨지지 않는다).
 */
export function selectMustAnswerQuestions(
  questions: IcQuestion[] | null | undefined,
  max = MAX_MUST_ANSWER_QUESTIONS
): IcQuestion[] {
  if (!questions) return [];
  return questions.slice(0, max);
}

// ── 6. Unresolved Evidence ──────────────────────────────────────────────

export interface UnresolvedEvidenceItem {
  claim: string;
  sectionKey: string;
  claimType: NumericClaim["claimType"];
  confidence: ClaimConfidence;
  documentName?: string;
  hasIcQuestion: boolean;
}

const MAX_UNRESOLVED_EVIDENCE = 5;

/**
 * 근거를 못 찾은(status="unverified") claim 중 투자판단에 중요한 항목만
 * 표시한다. IC Question(Phase 5)이 이미 이 claim을 relatedClaim으로 물고
 * 있으면 hasIcQuestion=true로 표시해 "이미 질문이 만들어진 항목"을
 * 구분한다 — 새 매칭 로직이 아니라 문자열 동등 비교만 한다.
 */
export function selectUnresolvedEvidence(
  claims: NumericClaim[] | null | undefined,
  questions: IcQuestion[] | null | undefined,
  max = MAX_UNRESOLVED_EVIDENCE
): UnresolvedEvidenceItem[] {
  if (!claims) return [];
  const relatedClaims = new Set(
    (questions ?? []).map((q) => q.relatedClaim).filter((c): c is string => Boolean(c))
  );
  return claims
    .filter((c) => c.status === "unverified")
    .slice(0, max)
    .map((c) => ({
      claim: c.raw,
      sectionKey: c.sectionKey,
      claimType: c.claimType,
      confidence: c.confidence,
      documentName: c.source?.documentName,
      hasIcQuestion: relatedClaims.has(c.raw),
    }));
}
