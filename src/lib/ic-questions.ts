/**
 * IC(투자심의위원회) 질문 — Score(deal-scoring-evidence.ts)에서 결정적으로
 * 질문 후보를 뽑는다. "AI에게 질문 10개 만들어줘"가 아니라, Report → Evidence
 * → Confidence → Investment Score → Risk Flag로 이어지는 기존 파이프라인의
 * 결과만 가지고 "왜 이 질문을 해야 하는가"가 항상 설명되는 질문을 만든다.
 *
 * 이 파일은 AI를 호출하지 않는다(순수 함수) — 문장을 자연스럽게 다듬는 건
 * ic-questions-ai.ts가 별도로, 한 번의 배치 호출로만 한다(evidence.ts /
 * evidence-ai.ts 분리와 같은 구조).
 *
 * 우선순위 철학(요청 그대로):
 *   1. UNSUPPORTED 핵심 claim
 *   2. HIGH_SCORE_LOW_EVIDENCE
 *   3. 주요 Risk Flag(밸류에이션 등)
 *   4. rationale ↔ evidence 불일치(HIGH confidence 차원에 한해 보조적으로)
 * "일반적인 VC 질문"을 채워 넣지 않는다 — 신호가 없으면 질문도 없다.
 */
import { SCORE_DIMENSIONS, type ScoreDimensionKey } from "./deal-scoring-shared";
import type { ScoreEvidenceAssessment, DimensionEvidenceAssessment, RiskFlag, ScoreConfidence } from "./deal-scoring-evidence";

export type QuestionCategory =
  | "Market"
  | "Team"
  | "Product/Technology"
  | "Business Model"
  | "Financials"
  | "Moat/Competition"
  | "Valuation"
  | "Other";

export type QuestionPriority = "HIGH" | "MEDIUM" | "LOW";

export type ExpectedAnswerType =
  | "NUMBER"
  | "PERCENTAGE"
  | "DOCUMENT"
  | "CONTRACT"
  | "CUSTOMER_LIST"
  | "FINANCIAL_TABLE"
  | "EXPLANATION"
  | "YES_NO";

export type QuestionTrigger =
  | "UNSUPPORTED_CLAIM"
  | "HIGH_SCORE_LOW_EVIDENCE"
  | "RATIONALE_EVIDENCE_MISMATCH"
  | "VALUATION_EVIDENCE_GAP";

export interface IcQuestion {
  id: string;
  category: QuestionCategory;
  question: string;
  whyItMatters: string;
  trigger: QuestionTrigger;
  priority: QuestionPriority;
  relatedDimension?: ScoreDimensionKey;
  relatedClaim?: string;
  relatedEvidence?: ScoreConfidence;
  relatedDocumentName?: string;
  relatedLocation?: string;
  suggestedAnswerType: ExpectedAnswerType;
  /** AI 문장 다듬기를 거쳤는지 — 실패해도 deterministic 문장 그대로 반환 가능해야 한다 */
  source: "deterministic" | "ai_refined";
}

export interface IcQuestionsResult {
  questions: IcQuestion[];
  /** 편의상 상위 5개만 미리 잘라둔 것 — questions와 별도 데이터가 아니다 */
  top5: IcQuestion[];
  modelUsed: string;
}

export const QUESTION_CATEGORY_LABEL: Record<QuestionCategory, string> = {
  Market: "시장성",
  Team: "팀 역량",
  "Product/Technology": "제품·기술력",
  "Business Model": "사업모델",
  Financials: "재무 건전성",
  "Moat/Competition": "경쟁 우위",
  Valuation: "밸류에이션",
  Other: "기타",
};

const DIMENSION_CATEGORY: Record<ScoreDimensionKey, QuestionCategory> = {
  marketSize: "Market",
  team: "Team",
  product: "Product/Technology",
  businessModel: "Business Model",
  financials: "Financials",
  moat: "Moat/Competition",
};

function dimensionLabel(dim: ScoreDimensionKey): string {
  return SCORE_DIMENSIONS.find((d) => d.key === dim)?.label ?? dim;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "")
    .slice(0, 40);
}

/** 점수 구간으로 우선순위를 정한다 — "고득점인데 근거 부족"이 가장 시급하다(item 6) */
function priorityFromScore(score: number): QuestionPriority {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

function inferAnswerTypeFromText(text: string): ExpectedAnswerType {
  if (/%|퍼센트/.test(text)) return "PERCENTAGE";
  if (/계약/.test(text)) return "CONTRACT";
  if (/고객(사|\s*리스트|\s*명단)?/.test(text)) return "CUSTOMER_LIST";
  if (/매출|영업이익|비용|현금흐름|마진|ebitda/i.test(text)) return "FINANCIAL_TABLE";
  if (/\d/.test(text)) return "NUMBER";
  return "EXPLANATION";
}

function unsupportedClaimQuestion(
  dim: DimensionEvidenceAssessment,
  claim: { raw: string },
  index: number,
  category: QuestionCategory,
  dimLabel: string
): IcQuestion {
  return {
    id: `unsupported:${dim.dimension}:${index}:${slug(claim.raw)}`,
    category,
    question: `"${claim.raw}"의 근거가 업로드 자료에서 확인되지 않습니다. 해당 내용의 산출 근거(가정·데이터 출처·산식)를 제시해 주실 수 있습니까?`,
    whyItMatters: `${dimLabel} 평가(${dim.score}점)에 반영된 내용이나, 업로드 자료에서 근거를 찾지 못했습니다.`,
    trigger: "UNSUPPORTED_CLAIM",
    priority: priorityFromScore(dim.score),
    relatedDimension: dim.dimension,
    relatedClaim: claim.raw,
    relatedEvidence: "UNSUPPORTED",
    suggestedAnswerType: inferAnswerTypeFromText(claim.raw),
    source: "deterministic",
  };
}

/** claim 자체가 하나도 안 잡히는데(=NO_EVIDENCE) 점수만 높은 경우 — 가장 위험한 조합(item 6) */
function highScoreNoEvidenceQuestion(
  dim: DimensionEvidenceAssessment,
  category: QuestionCategory,
  dimLabel: string
): IcQuestion {
  return {
    id: `no-evidence:${dim.dimension}`,
    category,
    question: `${dimLabel} 점수는 ${dim.score}점으로 높게 평가됐으나, 이를 뒷받침하는 근거를 업로드 자료에서 확인하지 못했습니다. 이 평가를 뒷받침하는 자료(계약서·실적 데이터·특허·고객 리스트 등)를 제시해 주실 수 있습니까?`,
    whyItMatters: `고득점 항목일수록 근거가 없으면 투자판단 리스크가 커집니다. 점수와 근거의 괴리를 IC 전에 반드시 확인해야 합니다.`,
    trigger: "HIGH_SCORE_LOW_EVIDENCE",
    priority: "HIGH",
    relatedDimension: dim.dimension,
    relatedEvidence: "NO_EVIDENCE",
    suggestedAnswerType: "DOCUMENT",
    source: "deterministic",
  };
}

/** 숫자·비율이 들어간 짧은 문구만 대상으로 한다 — 문장 전체를 파싱하지 않는다(결정적, 저비용) */
const RATIONALE_NUMBER_RE = /\d[\d,.]*\s*(?:억원|억|만원|만|조원|조|%|명|건)/g;

/**
 * HIGH confidence 차원(=claim으로는 이미 근거가 확인된 차원)에 한해서만 돈다.
 * rationale이 인용한 숫자가 우리가 추적한 claim(keyEvidence/unsupportedClaims)
 * 어디에도 없으면 — AI 채점 근거가 claim 추출 단계를 완전히 벗어난 별도
 * 주장을 인용했다는 뜻이라 재확인이 필요하다. claim이 아예 없는(NO_EVIDENCE)
 * 차원에서는 비교 대상 자체가 없어 오탐이 나므로 실행하지 않는다.
 */
function findRationaleMismatch(
  dim: DimensionEvidenceAssessment,
  rationale: string | undefined,
  category: QuestionCategory,
  dimLabel: string
): IcQuestion | null {
  if (!rationale || dim.claimsTotal === 0) return null;
  const mentions = rationale.match(RATIONALE_NUMBER_RE) ?? [];
  if (mentions.length === 0) return null;

  const knownText = [...dim.keyEvidence, ...dim.unsupportedClaims]
    .map((c) => c.raw)
    .join(" ");
  const unmatched = mentions.find((m) => !knownText.includes(m));
  if (!unmatched) return null;

  return {
    id: `rationale-mismatch:${dim.dimension}:${slug(unmatched)}`,
    category,
    question: `"${rationale}" 평가에 언급된 "${unmatched}"가 추적된 근거 목록에서 확인되지 않습니다. 관련 근거(계약 조건·실측 데이터·산출 가정 등)를 제시해 주실 수 있습니까?`,
    whyItMatters: `${dimLabel} 평가 근거(rationale)에 인용된 수치가 실제 근거 추적 결과와 어긋납니다 — 재검증이 필요합니다.`,
    trigger: "RATIONALE_EVIDENCE_MISMATCH",
    priority: "MEDIUM",
    relatedDimension: dim.dimension,
    relatedClaim: rationale,
    relatedEvidence: dim.confidence,
    suggestedAnswerType: inferAnswerTypeFromText(rationale),
    source: "deterministic",
  };
}

function valuationGapQuestion(
  riskFlags: RiskFlag[],
  dealFacts: { investAmount?: number | null; valuation?: number | null }
): IcQuestion | null {
  if (!riskFlags.includes("VALUATION_EVIDENCE_GAP")) return null;

  const facts = [
    dealFacts.valuation != null ? `Post-money ${dealFacts.valuation}억원` : null,
    dealFacts.investAmount != null ? `투자금액 ${dealFacts.investAmount}억원` : null,
  ].filter((v): v is string => Boolean(v));
  const factsText = facts.length ? `(${facts.join(", ")}) ` : "";

  return {
    id: "valuation-evidence-gap",
    category: "Valuation",
    question: `현재 기업가치 ${factsText}산정의 주요 가정과 적용한 비교기업(comparable company)을 확인해 주십시오. 밸류에이션 관련 주장의 근거가 업로드 자료에서 확인되지 않습니다.`,
    whyItMatters: "밸류에이션은 투자조건의 핵심이지만, 관련 주장의 근거가 자료로 확인되지 않았습니다.",
    trigger: "VALUATION_EVIDENCE_GAP",
    priority: "HIGH",
    relatedEvidence: "UNSUPPORTED",
    suggestedAnswerType: "EXPLANATION",
    source: "deterministic",
  };
}

const PRIORITY_RANK: Record<QuestionPriority, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

function dedupeAndRank(candidates: IcQuestion[]): IcQuestion[] {
  const seen = new Set<string>();
  const deduped = candidates.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
  deduped.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
  return deduped.slice(0, 10);
}

/**
 * Score(6개 차원) + Evidence(claim/confidence/coverage) + Risk Flag만으로
 * IC 질문 후보를 결정적으로 만든다. AI 호출 없음.
 *
 * 차원별로 신호가 있을 때만 질문을 만든다 — HIGH confidence(근거 충분)인
 * 차원에는 억지로 질문을 만들지 않는다(item 5).
 */
export function buildDeterministicIcQuestions(
  rationale: Partial<Record<ScoreDimensionKey, string>>,
  assessment: ScoreEvidenceAssessment,
  dealFacts: { investAmount?: number | null; valuation?: number | null }
): IcQuestion[] {
  const candidates: IcQuestion[] = [];

  for (const { key } of SCORE_DIMENSIONS) {
    const dim = assessment.dimensions[key];
    if (!dim) continue;
    const category = DIMENSION_CATEGORY[key];
    const dimLabel = dimensionLabel(key);

    if (dim.unsupportedClaims.length > 0) {
      dim.unsupportedClaims.forEach((claim, i) => {
        candidates.push(unsupportedClaimQuestion(dim, claim, i, category, dimLabel));
      });
    } else if (dim.confidence === "NO_EVIDENCE" && dim.score >= 70) {
      candidates.push(highScoreNoEvidenceQuestion(dim, category, dimLabel));
    } else if (dim.confidence === "HIGH") {
      const mismatch = findRationaleMismatch(dim, rationale[key], category, dimLabel);
      if (mismatch) candidates.push(mismatch);
    }
    // confidence가 HIGH인데 rationale mismatch도 없으면(=근거 충분·일관) 질문 없음.
    // NO_EVIDENCE인데 점수도 낮으면 굳이 채워 넣지 않음(item 5, item 10).
  }

  const valuationQ = valuationGapQuestion(assessment.riskFlags, dealFacts);
  if (valuationQ) candidates.push(valuationQ);

  return dedupeAndRank(candidates);
}

export function toIcQuestionsResult(
  questions: IcQuestion[],
  modelUsed: string
): IcQuestionsResult {
  return { questions, top5: questions.slice(0, 5), modelUsed };
}
