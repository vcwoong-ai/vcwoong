/**
 * 딜 스코어(deal-scoring.ts)와 근거 추적(evidence.ts)을 잇는다.
 *
 * "AI가 82점을 줬다"에서 "AI가 82점을 줬고, 그 근거가 무엇인지 안다"로
 * 바꾸는 게 이 파일의 역할이다. 새 AI 호출은 하지 않는다 — evidence.ts가
 * 이미(결정적으로, AI 없이) 계산해둔 claim 목록을 6개 스코어 차원에
 * 매핑하기만 한다.
 *
 * 매핑 근거(둘 다 존재하는 실제 코드 값만 사용):
 *   - 숫자 claim → sectionKey(보고서 섹션)로 매핑. 섹션 하나가 여러 차원에
 *     걸치지 않도록, 그 섹션의 "주제"와 가장 가까운 차원 하나에만 배정한다.
 *   - 질적 claim → evidence.ts의 카테고리 라벨(예: "기술 경쟁력")로 매핑.
 *     이쪽이 차원 의미에 더 가깝다(숫자보다 판단성 문장이라 그렇다).
 *
 * businessModel처럼 전용 섹션이 없는 차원은 가장 가까운 섹션(투자개요)과
 * 질적 카테고리("고객 확보 가능성")로만 근거를 모은다 — 억지로 다른
 * 섹션까지 끌어오지 않는다. 그 결과 claim이 0개면(=coverage 계산 불가)
 * "근거 자료 부족"으로 명확히 표시하지, 억지로 숫자를 만들지 않는다.
 */
import { SectionKey } from "@prisma/client";
import type { NumericClaim, ClaimConfidence } from "./evidence";
import { SCORE_DIMENSIONS, type ScoreDimensionKey } from "./deal-scoring-shared";

/** 근거가 하나도 없을 때 확신도를 "UNSUPPORTED"라 부르면 "환각"으로 읽혀 혼동된다.
 * 스코어 확신도에는 같은 4단계 어휘를 재사용하되, 근거 자체가 없는 경우를
 * 구분해서 보여줄 수 있게 별도 상태를 둔다. */
export type ScoreConfidence = ClaimConfidence | "NO_EVIDENCE";

export interface DimensionEvidenceAssessment {
  dimension: ScoreDimensionKey;
  score: number;
  confidence: ScoreConfidence;
  /** 이 차원에 매핑된 claim 중 근거가 확인된 비율(0~100). claim이 0개면 null(계산 불가) */
  evidenceCoverage: number | null;
  claimsTotal: number;
  claimsSupported: number;
  /** 확신도 높은 순으로 최대 3개 — rationale이 실제로 어디서 왔는지 보여준다 */
  keyEvidence: Array<{
    raw: string;
    confidence: ClaimConfidence;
    documentName?: string;
    location?: string;
  }>;
  /**
   * 근거를 못 찾은 claim만 최대 3개(keyEvidence는 확신도 높은 순이라 이
   * 항목이 밀려날 수 있다 — IC Questions(Phase 5)가 "근거 없는 핵심
   * 주장"을 놓치지 않으려면 이게 따로 필요하다).
   */
  unsupportedClaims: Array<{ raw: string }>;
}

export type RiskFlag =
  | "HIGH_SCORE_LOW_EVIDENCE"
  | "UNSUPPORTED_KEY_CLAIM"
  | "MARKET_EVIDENCE_GAP"
  | "TEAM_EVIDENCE_GAP"
  | "PRODUCT_EVIDENCE_GAP"
  | "BUSINESS_MODEL_EVIDENCE_GAP"
  | "FINANCIALS_EVIDENCE_GAP"
  | "MOAT_EVIDENCE_GAP"
  | "VALUATION_EVIDENCE_GAP";

export interface IcSummary {
  strengths: string[];
  risks: string[];
  unresolved: string[];
}

export interface ScoreEvidenceAssessment {
  overallConfidence: ScoreConfidence;
  overallCoverage: number | null;
  dimensions: Record<ScoreDimensionKey, DimensionEvidenceAssessment>;
  riskFlags: RiskFlag[];
  icSummary: IcSummary;
  /** 이 평가가 산출된 근거 — 보고서 없이(문서 원문만으로) 점수를 냈으면 evidence 계산 자체가 불가능하다 */
  basis: "report_evidence" | "no_report";
}

/** 차원별 근거 매핑 — sectionKey(숫자 claim)와 질적 카테고리 라벨을 함께 쓴다 */
const DIMENSION_SECTION_MAP: Record<ScoreDimensionKey, SectionKey[]> = {
  marketSize: [SectionKey.MARKET_ANALYSIS],
  team: [SectionKey.COMPANY_OVERVIEW],
  product: [SectionKey.PRODUCT_TECHNOLOGY],
  // 전용 섹션이 없어 투자개요(사업모델 요약이 흔히 담기는 섹션)로 근사한다.
  businessModel: [SectionKey.INVESTMENT_OVERVIEW],
  financials: [SectionKey.FINANCIAL_STATUS],
  // 경쟁우위는 숫자보다 서술형 판단이라 전용 섹션을 매핑하지 않는다(질적 카테고리만).
  moat: [],
};

/** evidence.ts의 QUALITATIVE_PATTERNS 카테고리 라벨과 정확히 일치해야 한다 */
const DIMENSION_QUALITATIVE_MAP: Record<ScoreDimensionKey, string[]> = {
  marketSize: ["시장 성장성"],
  team: [],
  product: ["기술 경쟁력"],
  businessModel: ["고객 확보 가능성"],
  financials: [],
  moat: ["진입장벽", "경쟁우위"],
};

/** 밸류에이션/투자조건은 스코어 차원이 아니지만 risk flag용으로 별도 추적한다 */
const VALUATION_SECTIONS: SectionKey[] = [SectionKey.VALUATION, SectionKey.INVESTMENT_TERMS];

function claimsForDimension(
  dimension: ScoreDimensionKey,
  claims: NumericClaim[]
): NumericClaim[] {
  const sections = DIMENSION_SECTION_MAP[dimension];
  const categories = DIMENSION_QUALITATIVE_MAP[dimension];
  return claims.filter((c) => {
    if (c.claimType === "numeric") return sections.includes(c.sectionKey as SectionKey);
    return categories.includes(c.label);
  });
}

/** confidence 등급 하나를 대표값으로 뽑을 때의 우선순위(높을수록 우선) */
const CONFIDENCE_RANK: Record<ClaimConfidence, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  UNSUPPORTED: 0,
};

function coverageToConfidence(
  coveragePct: number | null,
  hasUnsupported: boolean
): ScoreConfidence {
  if (coveragePct === null) return "NO_EVIDENCE";
  if (coveragePct >= 70 && !hasUnsupported) return "HIGH";
  if (coveragePct >= 40) return "MEDIUM";
  if (coveragePct > 0) return "LOW";
  return "UNSUPPORTED";
}

function assessDimension(
  dimension: ScoreDimensionKey,
  score: number,
  allClaims: NumericClaim[]
): DimensionEvidenceAssessment {
  const claims = claimsForDimension(dimension, allClaims);
  const supported = claims.filter((c) => c.confidence !== "UNSUPPORTED");
  const coverage =
    claims.length === 0 ? null : Math.round((supported.length / claims.length) * 100);

  const keyEvidence = [...claims]
    .sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence])
    .slice(0, 3)
    .map((c) => ({
      raw: c.raw,
      confidence: c.confidence,
      documentName: c.source?.documentName,
      location: c.source?.location,
    }));

  const unsupportedClaims = claims
    .filter((c) => c.confidence === "UNSUPPORTED")
    .slice(0, 3)
    .map((c) => ({ raw: c.raw }));

  return {
    dimension,
    score,
    confidence: coverageToConfidence(
      coverage,
      claims.some((c) => c.confidence === "UNSUPPORTED")
    ),
    evidenceCoverage: coverage,
    claimsTotal: claims.length,
    claimsSupported: supported.length,
    keyEvidence,
    unsupportedClaims,
  };
}

const DIMENSION_FLAG: Record<ScoreDimensionKey, RiskFlag> = {
  marketSize: "MARKET_EVIDENCE_GAP",
  team: "TEAM_EVIDENCE_GAP",
  product: "PRODUCT_EVIDENCE_GAP",
  businessModel: "BUSINESS_MODEL_EVIDENCE_GAP",
  financials: "FINANCIALS_EVIDENCE_GAP",
  moat: "MOAT_EVIDENCE_GAP",
};

/**
 * scoreResult(이미 계산된 6개 차원 점수)와 claims(evidence.ts가 이미 계산한
 * 근거 목록)를 받아 확신도·근거 커버리지·risk flag·IC 요약을 만든다.
 * 새 AI 호출 없음 — 전부 결정적 계산.
 */
export function buildScoreEvidenceAssessment(
  scores: Record<ScoreDimensionKey, number>,
  rationale: Partial<Record<ScoreDimensionKey, string>>,
  claims: NumericClaim[],
  /** 보고서 자체가 없으면(문서 원문만으로 채점) evidence 계산이 불가능하다 — 억지로 만들지 않고 명시한다 */
  basis: "report_evidence" | "no_report" = "report_evidence"
): ScoreEvidenceAssessment {
  const dimensions = {} as Record<ScoreDimensionKey, DimensionEvidenceAssessment>;
  const riskFlags: RiskFlag[] = [];

  for (const { key } of SCORE_DIMENSIONS) {
    const assessment = assessDimension(key, scores[key], claims);
    dimensions[key] = assessment;

    if (assessment.score >= 70 && (assessment.confidence === "LOW" || assessment.confidence === "UNSUPPORTED" || assessment.confidence === "NO_EVIDENCE")) {
      riskFlags.push("HIGH_SCORE_LOW_EVIDENCE");
    }
    if (assessment.claimsTotal > 0 && assessment.confidence !== "NO_EVIDENCE" && assessment.claimsSupported < assessment.claimsTotal) {
      // 차원 안에 UNSUPPORTED claim이 하나라도 있으면 개별 gap 플래그
      if (assessment.evidenceCoverage !== null && assessment.evidenceCoverage < 100) {
        riskFlags.push(DIMENSION_FLAG[key]);
      }
    }
  }

  // 핵심 claim(HIGH/MEDIUM confidence로 매핑된 것) 중 UNSUPPORTED가 있으면
  // 별도로 표시 — "일부 근거가 있는데 핵심 하나가 빠졌다"는 gap과는 결이 다르다.
  const hasUnsupportedMappedClaim = Object.values(dimensions).some(
    (d) => d.claimsTotal > 0 && d.claimsSupported < d.claimsTotal
  );
  if (hasUnsupportedMappedClaim) riskFlags.push("UNSUPPORTED_KEY_CLAIM");

  // 밸류에이션/투자조건 근거 — 스코어 차원은 아니지만 IC가 반드시 확인해야 하는 영역
  const valuationClaims = claims.filter(
    (c) => c.claimType === "numeric" && VALUATION_SECTIONS.includes(c.sectionKey as SectionKey)
  );
  if (
    valuationClaims.length > 0 &&
    valuationClaims.some((c) => c.confidence === "UNSUPPORTED")
  ) {
    riskFlags.push("VALUATION_EVIDENCE_GAP");
  }

  const dimensionList = Object.values(dimensions);
  const totalClaims = dimensionList.reduce((s, d) => s + d.claimsTotal, 0);
  const totalSupported = dimensionList.reduce((s, d) => s + d.claimsSupported, 0);
  const overallCoverage = totalClaims === 0 ? null : Math.round((totalSupported / totalClaims) * 100);
  const overallConfidence = coverageToConfidence(
    overallCoverage,
    dimensionList.some((d) => d.claimsTotal > 0 && d.claimsSupported < d.claimsTotal)
  );

  const icSummary = buildIcSummary(dimensions, rationale, claims);

  return {
    overallConfidence,
    overallCoverage,
    dimensions,
    riskFlags: Array.from(new Set(riskFlags)),
    icSummary,
    basis,
  };
}

/**
 * IC 요약(강점/리스크/미해결 질문) — 전부 이미 계산된 점수·rationale·claim에서
 * 뽑는다. 여기서도 AI를 새로 부르지 않는다.
 */
function buildIcSummary(
  dimensions: Record<ScoreDimensionKey, DimensionEvidenceAssessment>,
  rationale: Partial<Record<ScoreDimensionKey, string>>,
  claims: NumericClaim[]
): IcSummary {
  const list = Object.values(dimensions);

  const strengths = [...list]
    .filter((d) => d.score >= 70 && d.confidence !== "NO_EVIDENCE" && d.confidence !== "UNSUPPORTED")
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((d) => {
      const label = SCORE_DIMENSIONS.find((s) => s.key === d.dimension)?.label ?? d.dimension;
      const reason = rationale[d.dimension];
      return reason ? `${label}: ${reason}` : `${label} 점수 ${d.score}점`;
    });

  const risks = [...list]
    .filter((d) => d.score < 55 || d.confidence === "LOW" || d.confidence === "UNSUPPORTED" || d.confidence === "NO_EVIDENCE")
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((d) => {
      const label = SCORE_DIMENSIONS.find((s) => s.key === d.dimension)?.label ?? d.dimension;
      const reason = rationale[d.dimension];
      return reason ? `${label}: ${reason}` : `${label} 근거 부족(${d.score}점)`;
    });

  const unresolved = claims
    .filter((c) => c.confidence === "UNSUPPORTED")
    .slice(0, 3)
    .map((c) => c.raw);

  return { strengths, risks, unresolved };
}
