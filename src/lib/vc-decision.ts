/**
 * VC Investment Decision Intelligence — 결정적 변환 계층(PR-J).
 *
 * 이 파일은 새 AI 호출도, 새 채점/근거 로직도 만들지 않는다. Phase 3~5가
 * 이미 계산해둔 결과(ScoreEvidenceAssessment, NumericClaim[], IcQuestion[])와
 * ic-review.ts의 기존 선정 함수(selectKeyStrengths/selectKeyRisks/
 * selectUnresolvedEvidence)를 그대로 재사용해 "투자 결정 지도" 형태로
 * 재구성한다. 순수 함수라 네트워크·DB 없이 테스트 가능하다
 * (tools/test-vc-decision-layer.ts).
 *
 * 핵심 경계(요청 §11 그대로): 여기서 재무 수치·시장점유율·CAGR·PoS·MOIC·
 * IRR·희석률·수익률 가정을 지어내지 않는다. 계산 불가능하면 명시적으로
 * NOT_COMPUTABLE을 반환한다.
 */
import { SCORE_DIMENSIONS, type ScoreDimensionKey } from "./deal-scoring-shared";
import {
  DIMENSION_FLAG,
  DIMENSION_SECTION_MAP,
  type ScoreEvidenceAssessment,
  type ScoreConfidence,
  type DecisionImpact,
  type RiskFlag,
} from "./deal-scoring-evidence";
import type { NumericClaim } from "./evidence";
import type { IcQuestion } from "./ic-questions";
import {
  computeInvestmentSignal,
  computeRecommendation,
  selectKeyStrengths,
  selectKeyRisks,
  selectUnresolvedEvidence,
  type KeyStrength,
  type KeyRisk,
} from "./ic-review";
import type {
  VCContradiction,
  VCDecisionDimension,
  VCDecisionDimensionKey,
  VCDecisionImpact,
  VCEvidenceState,
  VCInvestmentDecision,
  VCInvestmentDriver,
  VCMissingInformation,
  VCPriority,
  VCThesisBreaker,
  VCValuationCase,
  VCValuationLineItem,
} from "./vc-decision-types";

function dimensionLabel(dim: ScoreDimensionKey): string {
  return SCORE_DIMENSIONS.find((d) => d.key === dim)?.label ?? dim;
}

// ── 1. Evidence state / decision impact 매핑 ────────────────────────────
// 점수(score)·confidence 계산 자체는 절대 바꾸지 않는다 — 여기서는 이미
// 계산된 confidence/decisionImpact를 표시용 상위 개념으로 옮기기만 한다.

export function mapConfidenceToEvidenceState(confidence: ScoreConfidence): VCEvidenceState {
  switch (confidence) {
    case "HIGH":
      return "VERIFIED";
    case "MEDIUM":
      return "PARTIALLY_VERIFIED";
    case "LOW":
      return "UNVERIFIED";
    case "UNSUPPORTED":
      return "UNVERIFIED";
    case "NO_EVIDENCE":
      return "MISSING";
  }
}

export function mapDecisionImpactToVC(
  impact: DecisionImpact,
  confidence: ScoreConfidence
): VCDecisionImpact {
  const noEvidence = confidence === "NO_EVIDENCE" || confidence === "UNSUPPORTED";
  if (impact === "HIGH" && noEvidence) return "CRITICAL";
  return impact;
}

// ── 2. Contradiction 탐지 ────────────────────────────────────────────────
// claimKey는 값 자체를 포함해 유일하므로(evidence.ts) "같은 사실을 가리키는
// 서로 다른 값"을 찾는 데는 쓸 수 없다 — 대신 (정규화한 label, unit)로
// 묶어, 실제로 매칭된(=UNSUPPORTED가 아닌) claim들 사이에 서로 다른 값이
// 2개 이상 있으면 상충으로 본다. 하나를 조용히 고르지 않는다.

export interface ContradictionGroup {
  label: string;
  unit: string;
  claims: NumericClaim[];
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

// ── 2a. Canonical metric/period/scenario normalization(PR-M, additive) ───
// 위 exact-label 그룹핑을 대체하지 않는다 — "같은 지표를 다른 문구로
// 적었을 때"만 추가로 잡아내는 두 번째 그룹핑이다. label 재추출이나
// evidence.ts 변경 없이, 이미 NumericClaim.label에 들어있는 문자열만
// 검사한다.
//
// 지표 용어는 이미 report-generation 프롬프트(section-prompts.ts:
// "매출액, 매출원가, 매출총이익, 영업이익(손실), 당기순이익(손실)",
// system-prompts.ts: "매출, ... EBITDA, 영업이익률, ... ARR, MRR")가
// AI 생성 본문에서 표준으로 쓰는 용어만 그대로 재사용한다 — 새 온톨로지를
// 만들지 않는다.

type CanonicalMetricKey =
  | "GROSS_PROFIT"
  | "COGS"
  | "REVENUE"
  | "OPERATING_MARGIN"
  | "OPERATING_PROFIT"
  | "NET_MARGIN"
  | "NET_PROFIT"
  | "CASH"
  | "ARR"
  | "MRR"
  | "NRR"
  | "CAC"
  | "LTV"
  | "CHURN";

// 구체적인(복합) 용어를 먼저 검사한다 — 그렇지 않으면 "매출총이익"이
// "매출"의 부분 문자열로 오인돼 서로 다른 지표가 같은 지표로 합쳐진다
// (§오탐 방지: 매출 vs 매출총이익, 영업이익 vs 영업이익률, 순이익 vs 순이익률).
const METRIC_PATTERNS: Array<{ re: RegExp; key: CanonicalMetricKey }> = [
  { re: /매출\s*총\s*이익/, key: "GROSS_PROFIT" },
  { re: /매출\s*원가/, key: "COGS" },
  { re: /매출(?:\s*액)?/, key: "REVENUE" },
  { re: /영업\s*이익\s*률/, key: "OPERATING_MARGIN" },
  { re: /영업\s*이익/, key: "OPERATING_PROFIT" },
  { re: /순\s*이익\s*률/, key: "NET_MARGIN" },
  { re: /(?:당기\s*)?순\s*이익/, key: "NET_PROFIT" },
  { re: /현금성\s*자산/, key: "CASH" },
  { re: /현금\s*보유/, key: "CASH" },
  { re: /현금(?!\s*흐름)/, key: "CASH" },
  { re: /\bARR\b/i, key: "ARR" },
  { re: /\bMRR\b/i, key: "MRR" },
  { re: /\bNRR\b/i, key: "NRR" },
  { re: /\bCAC\b/i, key: "CAC" },
  { re: /\bLTV\b/i, key: "LTV" },
  { re: /churn/i, key: "CHURN" },
];

function canonicalMetricKey(label: string): CanonicalMetricKey | null {
  for (const { re, key } of METRIC_PATTERNS) {
    if (re.test(label)) return key;
  }
  return null;
}

/**
 * PR-M.1: "2024A"/"2024E"/"FY24A"/"FY24E"/"FY2024A"/"FY2024E"처럼 연도
 * 숫자 바로 뒤에 실적(Actual)/추정(Estimate) 접미사가 붙는 금융 관용
 * 표기를 인식한다. 임의의 "A"/"E" 문자가 아니라 **2~4자리 연도 숫자에
 * 직접 붙어 있을 때만** 인식하도록 `\d{2,4}`를 앞에 강제해, ARR/CAC/LTV/
 * AI/MA/SA/Series A/CompanyA처럼 숫자 없이 A·E가 들어간 용어가 실적/추정
 * 시나리오로 오인되지 않는다(§false-positive attack).
 */
const YEAR_SUFFIX_RE = /\b(?:FY\s?)?(\d{2,4})([AE])\b/;

function yearSuffixMatch(label: string): { year: string; scenario: "ACTUAL" | "FORECAST" } | null {
  const m = YEAR_SUFFIX_RE.exec(label);
  if (!m) return null;
  return {
    year: m[1].length === 2 ? `20${m[1]}` : m[1],
    scenario: m[2] === "A" ? "ACTUAL" : "FORECAST",
  };
}

/** FY20xx/FY xx, 20xx년, 20xxA/20xxE, Q1~Q4, TTM/LTM — 명시된 게 없으면
 * UNSPECIFIED. 서로 다른 회계연도·분기·TTM/LTM은 절대 같은 키로 묶이지 않는다. */
function canonicalPeriodKey(label: string): string {
  const suffix = yearSuffixMatch(label);
  if (suffix) return `FY${suffix.year}`;

  const tokens: string[] = [];
  const fy = /FY\s?(\d{2,4})/i.exec(label);
  if (fy) tokens.push(`FY${fy[1].length === 2 ? `20${fy[1]}` : fy[1]}`);
  const yearOnly = /(\d{4})\s?년/.exec(label);
  if (yearOnly) tokens.push(`FY${yearOnly[1]}`);
  const quarter = /\bQ([1-4])\b/i.exec(label);
  if (quarter) tokens.push(`Q${quarter[1]}`);
  if (/\bTTM\b/i.test(label)) tokens.push("TTM");
  if (/\bLTM\b/i.test(label)) tokens.push("LTM");
  if (tokens.length === 0) return "UNSPECIFIED";
  // 토큰 등장 순서 차이("FY24 Q1" vs "Q1 FY24")로 다른 키가 되지 않게 정렬한다.
  return Array.from(new Set(tokens)).sort().join("+");
}

/** 실적/확정 vs 예상/전망/목표/추정, 그리고 2024A/2024E류 연도-접미사
 * 표기 — 명시된 게 없으면 UNSPECIFIED. ACTUAL과 FORECAST는 절대 같은
 * 키로 묶이지 않는다. */
function canonicalScenarioKey(label: string): "ACTUAL" | "FORECAST" | "UNSPECIFIED" {
  const suffix = yearSuffixMatch(label);
  if (suffix) return suffix.scenario;
  if (/실적|확정/.test(label)) return "ACTUAL";
  if (/예상|전망|목표|추정/.test(label)) return "FORECAST";
  return "UNSPECIFIED";
}

/**
 * canonical 그룹은 (metricKey, periodKey, scenarioKey, unit)이 전부 동일한
 * claim끼리만 묶는다 — 통화/단위 변환은 하지 않고 기존 unit 문자열을
 * 그대로 재사용한다(§요청: 통화 정규화 금지).
 *
 * exact-label 그룹이 이미 완전히 잡아낸 경우(=그룹 안 모든 claim의 label이
 * 서로 같음)는 중복 보고하지 않는다 — 이 함수는 "다른 문구로 적힌 같은
 * 지표"만 추가로 잡아내는 게 목적이다.
 */
function detectCanonicalContradictions(claims: NumericClaim[]): ContradictionGroup[] {
  const groups = new Map<string, NumericClaim[]>();
  for (const c of claims) {
    if (c.claimType !== "numeric") continue;
    if (c.confidence === "UNSUPPORTED") continue;
    if (!c.label) continue;
    const metricKey = canonicalMetricKey(c.label);
    if (!metricKey) continue;
    const key = `${metricKey}|${canonicalPeriodKey(c.label)}|${canonicalScenarioKey(c.label)}|${c.unit}`;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  const contradictions: ContradictionGroup[] = [];
  Array.from(groups.entries()).forEach(([key, group]) => {
    const distinctValues = new Set(group.map((c) => c.value));
    if (distinctValues.size < 2) return;
    const distinctLabels = new Set(group.map((c) => normalizeLabel(c.label)));
    if (distinctLabels.size < 2) return; // exact-label 그룹이 이미 완전히 커버함
    const [metricKey, , , unit] = key.split("|");
    contradictions.push({ label: metricKey, unit, claims: group });
  });
  return contradictions;
}

export function detectContradictions(claims: NumericClaim[]): ContradictionGroup[] {
  const groups = new Map<string, NumericClaim[]>();
  for (const c of claims) {
    if (c.claimType !== "numeric") continue;
    if (c.confidence === "UNSUPPORTED") continue; // 근거를 못 찾은 건 "상충"이 아니라 "미확인"
    if (!c.label) continue;
    const key = `${normalizeLabel(c.label)}|${c.unit}`;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }
  const contradictions: ContradictionGroup[] = [];
  Array.from(groups.entries()).forEach(([key, group]) => {
    const distinctValues = new Set(group.map((c) => c.value));
    if (distinctValues.size >= 2) {
      const [label, unit] = key.split("|");
      contradictions.push({ label, unit, claims: group });
    }
  });
  // PR-M: 정확히 같은 문구가 아니어도 같은 지표를 가리키는 claim들도
  // 추가로 검사한다(기존 exact-label 결과는 그대로 두고 덧붙이기만 함).
  contradictions.push(...detectCanonicalContradictions(claims));
  return contradictions;
}

const METRIC_DISPLAY_LABEL: Record<CanonicalMetricKey, string> = {
  GROSS_PROFIT: "매출총이익",
  COGS: "매출원가",
  REVENUE: "매출",
  OPERATING_MARGIN: "영업이익률",
  OPERATING_PROFIT: "영업이익",
  NET_MARGIN: "순이익률",
  NET_PROFIT: "당기순이익",
  CASH: "현금성자산",
  ARR: "ARR",
  MRR: "MRR",
  NRR: "NRR",
  CAC: "CAC",
  LTV: "LTV",
  CHURN: "Churn",
};

const VALUATION_SECTION_KEYS = ["VALUATION", "INVESTMENT_TERMS"];

/** claim이 쓰인 섹션 → 판단 차원. 기존 DIMENSION_SECTION_MAP을 그대로 재사용한다(새 매핑 없음). */
function dimensionForClaim(c: NumericClaim): VCDecisionDimensionKey | undefined {
  for (const { key } of SCORE_DIMENSIONS) {
    if ((DIMENSION_SECTION_MAP[key] as string[]).includes(c.sectionKey)) return key;
  }
  if (VALUATION_SECTION_KEYS.includes(c.sectionKey)) return "valuation";
  return undefined;
}

function claimsSignature(claims: NumericClaim[]): string {
  return claims
    .map((c) => c.claimKey)
    .sort()
    .join("||");
}

/** 안정적인 짧은 id — 같은 입력이면 항상 같은 id(결정성). */
function shortHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * 모든 claim에서 수치 상충을 찾아 결정 레이어의 1급 객체로 만든다.
 *
 * 예전에는 각 차원의 keyEvidence(최대 3개)에 든 claim끼리만 비교했다 — 상충
 * claim이 3개 밖으로 밀리거나 밸류에이션·투자조건처럼 스코어 차원이 없는
 * 섹션에 있으면 결정 화면에서 아예 보이지 않았다. 여기서는 전체 claim을
 * 대상으로 하고, 상충 그룹의 값은 하나도 잘라내지 않는다.
 */
export function buildContradictions(
  claims: NumericClaim[] | null | undefined,
  questions?: IcQuestion[] | null
): VCContradiction[] {
  const groups = detectContradictions(claims ?? []);
  const seen = new Set<string>();
  const result: VCContradiction[] = [];
  for (const g of groups) {
    const signature = claimsSignature(g.claims);
    if (seen.has(signature)) continue;
    seen.add(signature);

    const dimension = g.claims.map(dimensionForClaim).find((d) => d !== undefined);
    const canonicalLabel = METRIC_DISPLAY_LABEL[g.label as CanonicalMetricKey];
    const metricLabel = canonicalLabel ?? g.claims[0].label ?? g.label;
    const values = g.claims.map((c) => ({
      raw: c.raw,
      value: c.value,
      unit: c.unit,
      period: canonicalPeriodKey(c.label),
      scenario: canonicalScenarioKey(c.label),
      sectionKey: c.sectionKey,
      documentName: c.source?.documentName,
      location: c.source?.location,
      snippet: c.source?.snippet,
    }));
    const directlyDecisive = dimension === "financials" || dimension === "valuation";
    result.push({
      id: `contradiction:${shortHash(signature)}`,
      metricLabel,
      unit: g.unit,
      dimension,
      values,
      decisionImpact: directlyDecisive ? "CRITICAL" : "HIGH",
      verificationRequirement: `상충하는 ${values.length}개 값(${values.map((v) => v.raw).join(" / ")})을 각 출처 원문과 대조해 정본을 확인하십시오 — 확인 전에는 이 지표를 결정 근거로 쓰지 마십시오.`,
      icQuestion:
        questions?.find((q) => q.relatedClaim && g.claims.some((c) => c.raw === q.relatedClaim)) ??
        (dimension && dimension !== "valuation"
          ? questions?.find((q) => q.relatedDimension === dimension)
          : undefined),
    });
  }
  return result;
}

// ── 3. Decision Dimensions ───────────────────────────────────────────────

export function buildDecisionDimensions(
  assessment: ScoreEvidenceAssessment | null | undefined,
  claims: NumericClaim[] | null | undefined
): VCDecisionDimension[] {
  if (!assessment) return [];
  const allClaims = claims ?? [];
  const allContradictions = detectContradictions(allClaims);

  return SCORE_DIMENSIONS.map(({ key }) => {
    const dim = assessment.dimensions[key];
    if (!dim) {
      return {
        dimension: key,
        label: dimensionLabel(key),
        state: "MISSING" as VCEvidenceState,
        decisionImpact: "MEDIUM" as VCDecisionImpact,
        positiveDrivers: [],
        negativeDrivers: [],
        missingInfoCount: 0,
      };
    }
    // 이 차원에 매핑된 섹션(DIMENSION_SECTION_MAP)의 claim이 낀 상충이 있으면
    // 이 차원은 상충 상태다. keyEvidence(최대 3개)가 아니라 전체 claim 기준이라
    // 상충 claim이 keyEvidence 밖으로 밀려도 숨지 않는다.
    const sectionKeys = DIMENSION_SECTION_MAP[key] as string[];
    const contradiction = allContradictions.find((g) =>
      g.claims.some((c) => c.claimType === "numeric" && sectionKeys.includes(c.sectionKey))
    );
    const state = contradiction ? "CONTRADICTED" : mapConfidenceToEvidenceState(dim.confidence);

    return {
      dimension: key,
      label: dimensionLabel(key),
      state,
      decisionImpact: mapDecisionImpactToVC(dim.decisionImpact, dim.confidence),
      positiveDrivers: dim.keyEvidence
        .filter((e) => e.confidence === "HIGH" || e.confidence === "MEDIUM")
        .map((e) => e.raw),
      negativeDrivers: dim.unsupportedClaims.map((c) => c.raw),
      missingInfoCount: dim.unsupportedClaims.length,
      ...(contradiction
        ? {
            contradiction: {
              valueA: `${contradiction.claims[0].value}${contradiction.claims[0].unit}`,
              valueB: `${contradiction.claims[1].value}${contradiction.claims[1].unit}`,
              sourceA: contradiction.claims[0].source?.documentName,
              sourceB: contradiction.claims[1].source?.documentName,
            },
          }
        : {}),
    };
  });
}

// ── 4. Investment Drivers (from KeyStrength) ────────────────────────────

const MAX_DRIVERS = 5;

export function buildInvestmentDrivers(
  assessment: ScoreEvidenceAssessment | null | undefined,
  rationale: Partial<Record<ScoreDimensionKey, string>> | undefined,
  max = MAX_DRIVERS,
  /** 수치 상충이 있는 차원 — 그 차원의 강점을 "확인됨"으로 보여주면 상충이 결정
   * 레이어에서 숨는다(Decision Map은 '상충'인데 Driver는 '확인됨'이던 문제). */
  contradictedDimensions: ReadonlySet<string> = new Set()
): VCInvestmentDriver[] {
  if (!assessment) return [];
  const strengths: KeyStrength[] = selectKeyStrengths(assessment, rationale, max);
  return strengths.map((s) => {
    const dim = assessment.dimensions[s.dimension];
    const contradicted = contradictedDimensions.has(s.dimension);
    const evidenceState: VCEvidenceState = contradicted
      ? "CONTRADICTED"
      : mapConfidenceToEvidenceState(s.confidence);
    // AI가 이 차원의 rationale을 비워서 줬을 때(실제 프로덕션에서 발생하는
    // 경우 — deal-scoring-shared.ts의 parseScoreResponse는 필드 누락 시
    // 빈 문자열로 채운다), 점수만 언급하는 순수 일반론 대신 이미 계산된
    // 실제 근거 발췌를 그대로 인용한다 — 새 AI 호출 없이도 "무엇에 근거해
    // 강점인가"를 항상 구체적으로 답할 수 있다.
    const evidenceFallback = dim.keyEvidence[0]
      ? `${dim.keyEvidence[0].raw}${dim.keyEvidence[0].documentName ? `(${dim.keyEvidence[0].documentName})` : ""}에 근거해 평가가 높습니다.`
      : `${s.label} 평가가 상대적으로 높습니다.`;
    return {
      id: `driver:${s.dimension}`,
      dimension: s.dimension,
      title: `${s.label} — ${s.score}점`,
      description: s.rationale || evidenceFallback,
      whyItMatters: s.rationale || evidenceFallback,
      evidenceState,
      evidence: dim.keyEvidence.map((e) => ({
        raw: e.raw,
        documentName: e.documentName,
        location: e.location,
      })),
      whatCouldInvalidate: contradicted
        ? "이 차원의 수치가 출처마다 다릅니다 — 정본 값이 확정되면 이 강점의 근거가 달라질 수 있습니다."
        : dim.unsupportedClaims[0]?.raw
          ? `"${dim.unsupportedClaims[0].raw}"가 사실과 다르거나 재현되지 않으면 이 강점의 근거가 약해집니다.`
          : dim.uncertaintyNote || "현재 근거 범위를 벗어나는 반증 자료가 나오면 재평가가 필요합니다.",
      verificationRequirement: contradicted
        ? "수치 상충 해소 전에는 IC 상정 불가 — 상충하는 값의 원문 출처 대조 필요"
        : evidenceState === "VERIFIED"
          ? "추가 검증 없이 IC 상정 가능(근거 확인됨)"
          : "원문 자료(계약서·실측 데이터 등) 재확인 필요",
      decisionImpact: mapDecisionImpactToVC(s.decisionImpact ?? dim.decisionImpact, s.confidence),
    };
  });
}

// ── 5. Thesis Breakers (from KeyRisk) ───────────────────────────────────

const MAX_THESIS_BREAKERS = 5;

function findIcQuestionForRisk(
  risk: KeyRisk,
  questions: IcQuestion[] | null | undefined
): IcQuestion | undefined {
  if (!questions) return undefined;
  if (risk.dimension) {
    const match = questions.find((q) => q.relatedDimension === risk.dimension);
    if (match) return match;
  }
  if (risk.trigger === "VALUATION_EVIDENCE_GAP") {
    return questions.find((q) => q.trigger === "VALUATION_EVIDENCE_GAP");
  }
  return undefined;
}

function contradictionBreaker(c: VCContradiction): VCThesisBreaker {
  const summary = c.values
    .map((v) => `${v.raw}${v.documentName ? `(${v.documentName})` : ""}`)
    .join(" vs ");
  return {
    id: `breaker:CONTRADICTION:${c.id}`,
    trigger: "CONTRADICTION",
    dimension: c.dimension && c.dimension !== "valuation" ? c.dimension : undefined,
    title: `${c.metricLabel} 수치 상충 (${c.values.length}개 값)`,
    whyItMatters: `같은 지표(${c.metricLabel})에 서로 다른 값이 ${c.values.length}개 있습니다: ${summary}. 어느 값이 맞는지 확인되기 전에는 이 지표에 근거한 논지를 신뢰할 수 없습니다.`,
    evidenceState: "CONTRADICTED",
    evidence: c.values.map((v) => ({ raw: v.raw, documentName: v.documentName, location: v.location })),
    probability: "NOT_ASSESSED",
    decisionImpact: c.decisionImpact,
    verificationRequirement: c.verificationRequirement,
    icQuestion: c.icQuestion,
  };
}

export function buildThesisBreakers(
  assessment: ScoreEvidenceAssessment | null | undefined,
  rationale: Partial<Record<ScoreDimensionKey, string>> | undefined,
  questions: IcQuestion[] | null | undefined,
  max = MAX_THESIS_BREAKERS,
  /** 수치 상충은 개수 제한(max) 없이 전부 Thesis Breaker로 올린다 — 잘라내면 상충이 숨는다. */
  contradictions: VCContradiction[] = []
): VCThesisBreaker[] {
  const contradictionBreakers = contradictions.map(contradictionBreaker);
  if (!assessment) return contradictionBreakers;
  const risks: KeyRisk[] = selectKeyRisks(assessment, rationale, max);
  const riskBreakers: VCThesisBreaker[] = risks.map((r) => {
    const dim = r.dimension ? assessment.dimensions[r.dimension] : undefined;
    const evidenceState: VCEvidenceState = dim
      ? mapConfidenceToEvidenceState(dim.confidence)
      // 밸류에이션처럼 차원이 없는 리스크는 애초에 근거 배열을 채울 수 있는
      // 대상(dim.keyEvidence)이 없다 — "확인했지만 근거가 약함(UNVERIFIED)"이
      // 아니라 "근거 자체가 없음(MISSING)"이 정확한 상태이고, MISSING이어야
      // Decision Gate가 evidence-free 상태를 정당하게 예외 처리한다.
      : "MISSING";
    return {
      id: `breaker:${r.trigger}:${r.dimension ?? "none"}`,
      trigger: r.trigger,
      dimension: r.dimension,
      title: r.label,
      whyItMatters: r.detail,
      evidenceState,
      // 근거 없음(UNSUPPORTED_KEY_CLAIM 등)이면 그 unsupported claim을 보여주고,
      // 근거는 충분하지만 그 근거 자체가 나쁜 신호인 경우(LOW_SCORE처럼 확신도
      // 높은데 점수가 낮은 경우)는 unsupportedClaims가 비어 있어도 dim.keyEvidence
      // (실제 확인된 근거)를 대신 보여준다 — VERIFIED 상태인데 근거 발췌가
      // 하나도 없는 Thesis Breaker가 생기지 않도록 한다(§checkVerifiedDimensions와
      // 동일한 원칙을 breaker에도 적용).
      evidence: dim
        ? dim.unsupportedClaims.length > 0
          ? dim.unsupportedClaims.map((c) => ({ raw: c.raw }))
          : dim.keyEvidence.map((e) => ({ raw: e.raw, documentName: e.documentName, location: e.location }))
        : [],
      probability: "NOT_ASSESSED",
      decisionImpact: dim
        ? mapDecisionImpactToVC(r.decisionImpact ?? dim.decisionImpact, dim.confidence)
        : "HIGH",
      verificationRequirement: "원문 자료로 직접 재확인 필요(추정치로 대체 불가)",
      icQuestion: findIcQuestionForRisk(r, questions),
    };
  });
  return [...contradictionBreakers, ...riskBreakers];
}

// ── 6. Missing Information (first-class output) ─────────────────────────

const MAX_MISSING_INFO = 8;

const P0_FLAGS: RiskFlag[] = ["UNSUPPORTED_KEY_CLAIM", "HIGH_SCORE_LOW_EVIDENCE"];
const P1_FLAGS: RiskFlag[] = [
  "VALUATION_EVIDENCE_GAP",
  "MARKET_EVIDENCE_GAP",
  "TEAM_EVIDENCE_GAP",
  "PRODUCT_EVIDENCE_GAP",
  "BUSINESS_MODEL_EVIDENCE_GAP",
  "FINANCIALS_EVIDENCE_GAP",
  "MOAT_EVIDENCE_GAP",
];

function priorityForFlag(flag: RiskFlag): VCPriority {
  if (P0_FLAGS.includes(flag)) return "P0";
  if (P1_FLAGS.includes(flag)) return "P1";
  return "P2";
}

const PRIORITY_RANK: Record<VCPriority, number> = { P0: 3, P1: 2, P2: 1 };

/** 수치 상충은 그 자체가 결정을 막는 정보 공백이다 — 어느 값이 정본인지 모르는 채로는 판단할 수 없다. */
function contradictionMissingInfo(c: VCContradiction): VCMissingInformation {
  return {
    id: `missing:${c.id}`,
    priority: "P0",
    item: `${c.metricLabel} 수치 상충 해소 (${c.values.map((v) => v.raw).join(" vs ")})`,
    whyItMatters: `같은 지표에 서로 다른 값이 ${c.values.length}개 있어, 어느 값이 정본인지 확인되기 전에는 이 지표에 근거한 판단이 성립하지 않습니다.`,
    decisionImpact: c.decisionImpact,
    requiredEvidence: "상충하는 값 각각의 1차 출처 원문 대조(감사보고서·재무제표·계약서 등)",
    relatedDimension: c.dimension && c.dimension !== "valuation" ? c.dimension : undefined,
    icQuestion: c.icQuestion,
  };
}

export function buildMissingInformation(
  assessment: ScoreEvidenceAssessment | null | undefined,
  claims: NumericClaim[] | null | undefined,
  questions: IcQuestion[] | null | undefined,
  max = MAX_MISSING_INFO,
  /** 상충은 개수 제한 없이 전부 포함한다(P0 최상단) — 잘라내면 상충이 숨는다. */
  contradictions: VCContradiction[] = []
): VCMissingInformation[] {
  const contradictionItems = contradictions.map(contradictionMissingInfo);
  if (!assessment) return contradictionItems;

  const items: VCMissingInformation[] = [];

  // (a-0) 보고서 자체가 아직 없어 근거 계산이 원천적으로 불가능한 경우
  // (deal-scoring-evidence.ts의 basis="no_report") — 이 경우 다른 모든
  // 차원이 NO_EVIDENCE라 claimsTotal=0이 되어 아래 riskFlag 기반 로직이
  // 하나도 발동하지 않는다. 그 결과 "정보 공백이 하나도 없다"처럼 보이는
  // 게 가장 위험한 착시이므로, 이 구조적 사실 자체를 P0 항목으로 명시한다.
  if (assessment.basis === "no_report") {
    items.push({
      id: "missing:no_report",
      priority: "P0",
      item: "투자심의보고서 미생성 — 근거 확인 자체가 불가능",
      whyItMatters: "보고서가 아직 생성되지 않아 모든 점수가 문서 원문만으로 산출됐습니다. 근거 대조(evidence tracing)를 수행할 수 없어 현재 점수·강점·리스크는 검증되지 않은 상태입니다.",
      decisionImpact: "CRITICAL",
      requiredEvidence: "투자심의보고서 생성 후 재채점(딜 스코어 재계산)",
    });
  }

  // (a) 근거 공백 risk flag 자체를 미해결 정보로 승격한다.
  for (const flag of assessment.riskFlags) {
    if (flag === "VALUATION_EVIDENCE_GAP") {
      items.push({
        id: `missing:${flag}`,
        priority: priorityForFlag(flag),
        item: "밸류에이션 산정 근거(비교기업·가정)",
        whyItMatters: "밸류에이션은 투자조건의 핵심이지만 관련 주장의 근거가 자료에서 확인되지 않았습니다.",
        decisionImpact: "HIGH",
        requiredEvidence: "비교기업 선정 기준, 적용 배수, 산정 근거 문서",
        icQuestion: questions?.find((q) => q.trigger === "VALUATION_EVIDENCE_GAP"),
      });
      continue;
    }
    // UNSUPPORTED_KEY_CLAIM/HIGH_SCORE_LOW_EVIDENCE는 특정 차원 전용 flag가
    // 아니라 여러 차원에 걸쳐 발생할 수 있는 신호다(ic-review.ts의
    // selectKeyRisks와 동일한 탐색 방식을 그대로 재사용 — DIMENSION_FLAG
    // 역매핑은 차원 전용 *_EVIDENCE_GAP 6종에만 해당한다).
    const dims = Object.values(assessment.dimensions);
    let dim = null as (typeof dims)[number] | null;
    if (flag === "UNSUPPORTED_KEY_CLAIM") {
      dim = dims.find((d) => d.unsupportedClaims.length > 0) ?? null;
    } else if (flag === "HIGH_SCORE_LOW_EVIDENCE") {
      dim =
        dims.find(
          (d) =>
            d.score >= 70 &&
            (d.confidence === "LOW" || d.confidence === "UNSUPPORTED" || d.confidence === "NO_EVIDENCE")
        ) ?? null;
    } else {
      dim = dims.find((d) => DIMENSION_FLAG[d.dimension] === flag) ?? null;
    }
    if (!dim) continue;
    items.push({
      id: `missing:${flag}:${dim.dimension}`,
      priority: priorityForFlag(flag),
      item:
        flag === "UNSUPPORTED_KEY_CLAIM" && dim.unsupportedClaims[0]
          ? `근거 없는 핵심 주장: ${dim.unsupportedClaims[0].raw}(${dimensionLabel(dim.dimension)})`
          : `${dimensionLabel(dim.dimension)} 평가를 뒷받침하는 근거`,
      whyItMatters: dim.uncertaintyNote || `${dimensionLabel(dim.dimension)} 점수(${dim.score}점)의 근거 확인이 필요합니다.`,
      decisionImpact: mapDecisionImpactToVC(dim.decisionImpact, dim.confidence),
      requiredEvidence: "관련 계약서·실측 데이터·고객 자료 등 1차 근거",
      relatedDimension: dim.dimension,
      icQuestion: questions?.find((q) => q.relatedDimension === dim!.dimension),
    });
  }

  // (b) 개별 unresolved claim(문서 어디에도 없는 주장)도 놓치지 않는다.
  const unresolved = selectUnresolvedEvidence(claims, questions, max);
  for (const u of unresolved) {
    items.push({
      id: `missing:unresolved:${u.claim.slice(0, 40)}`,
      priority: "P1",
      item: u.claim,
      whyItMatters: "보고서에 사용된 주장이지만 업로드 자료 어디에서도 확인되지 않았습니다.",
      decisionImpact: "MEDIUM",
      requiredEvidence: "해당 주장의 1차 출처 문서",
      icQuestion: questions?.find((q) => q.relatedClaim === u.claim),
    });
  }

  // 같은 차원·같은 문구가 서로 다른 신호(HIGH_SCORE_LOW_EVIDENCE/차원별 GAP 등)로
  // 두 번 올라오면 가장 높은 우선순위 하나만 남긴다 — 같은 공백이 P0와 P1로 중복 표시되던 문제.
  const byKey = new Map<string, VCMissingInformation>();
  for (const it of items) {
    const key = `${it.relatedDimension ?? ""}|${it.item}`;
    const prev = byKey.get(key);
    if (!prev || PRIORITY_RANK[it.priority] > PRIORITY_RANK[prev.priority]) byKey.set(key, it);
  }
  const deduped = Array.from(byKey.values()).filter((it, i, arr) => arr.findIndex((o) => o.id === it.id) === i);
  deduped.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
  return [...contradictionItems, ...deduped.slice(0, max)];
}

// ── 7. Valuation & Return ────────────────────────────────────────────────

export function buildValuationCase(
  deal: { investAmount?: number | null; valuation?: number | null },
  riskFlags: RiskFlag[]
): VCValuationCase {
  const facts = {
    investAmount: deal.investAmount ?? undefined,
    valuation: deal.valuation ?? undefined,
  };
  const lineItems: VCValuationLineItem[] = [];

  if (facts.investAmount != null && facts.valuation != null && facts.valuation > 0) {
    const ownershipPct = (facts.investAmount / facts.valuation) * 100;
    lineItems.push({
      status: "computed",
      label: "예상 지분율(Post-money 기준, 투자금액/포스트밸류)",
      value: `${ownershipPct.toFixed(2)}%`,
    });
  } else {
    lineItems.push({
      status: "not_computable",
      label: "예상 지분율",
      reason: "투자금액 또는 포스트밸류가 입력되지 않았습니다.",
      requiredInput: "투자금액(억원), Post-money 밸류에이션(억원)",
    });
  }

  // MOIC/IRR: 현재 Deal 모델에는 exit 밸류에이션·회수 시점 가정 필드가 없다
  // (schema.prisma 감사 결과) — 없는 가정을 지어내지 않고 명시적으로
  // NOT_COMPUTABLE로 남긴다(§16 그대로).
  lineItems.push({
    status: "not_computable",
    label: "MOIC",
    reason: "Exit 밸류에이션·회수 시점 가정이 시스템에 없습니다.",
    requiredInput: "Exit 밸류에이션 가정, 회수 시점, 추가 희석 가정",
  });
  lineItems.push({
    status: "not_computable",
    label: "IRR",
    reason: "Exit 밸류에이션·회수 시점 가정이 시스템에 없습니다.",
    requiredInput: "Exit 밸류에이션 가정, 회수 시점, 현금흐름 스케줄",
  });

  const evidenceState: VCEvidenceState = riskFlags.includes("VALUATION_EVIDENCE_GAP")
    ? "UNVERIFIED"
    : facts.investAmount != null && facts.valuation != null
      ? "PARTIALLY_VERIFIED" // 사용자가 직접 입력한 값(deal_input)이라 "완전 검증"까지는 아님
      : "MISSING";

  return { facts, lineItems, evidenceState };
}

// ── 8. Investment Thesis (결정적 템플릿 — AI 자유 서술 아님) ─────────────

export function synthesizeInvestmentThesis(
  drivers: VCInvestmentDriver[],
  breakers: VCThesisBreaker[],
  missingInformation: VCMissingInformation[]
): string {
  const p0Count = missingInformation.filter((m) => m.priority === "P0").length;
  // 수치가 상충하는 차원의 driver는 논지의 근거로 삼지 않는다 — 정본이 불명확한 값 위에 논지를 세우지 않는다.
  const solidDrivers = drivers.filter((d) => d.evidenceState !== "CONTRADICTED");
  const contradictedDrivers = drivers.filter((d) => d.evidenceState === "CONTRADICTED");
  const driverTitles = solidDrivers.slice(0, 3).map((d) => d.title.split(" — ")[0]);
  const contradictionBreakers = breakers.filter((b) => b.trigger === "CONTRADICTION");
  const otherBreakers = breakers.filter((b) => b.trigger !== "CONTRADICTION");
  const breakerTitles = otherBreakers.slice(0, 3).map((b) => b.title);

  const parts: string[] = [];
  if (driverTitles.length > 0) {
    parts.push(`투자 논지는 ${driverTitles.join(", ")}에 근거합니다.`);
  } else {
    parts.push("현재 근거 기반의 명확한 투자 논지 축을 찾지 못했습니다 — 추가 자료가 필요합니다.");
  }
  if (contradictionBreakers.length > 0) {
    const names = contradictedDrivers.map((d) => d.title.split(" — ")[0]);
    parts.push(
      `${contradictionBreakers.length}건의 수치 상충(${contradictionBreakers.map((b) => b.title.split(" 수치 상충")[0]).join(", ")})이 있어${names.length > 0 ? ` ${names.join(", ")}은(는) 논지의 근거로 쓸 수 없고,` : ""} 정본 확인 전에는 해당 지표를 결정에 사용할 수 없습니다.`
    );
  }
  if (breakerTitles.length > 0) {
    parts.push(`이 논지를 흔들 수 있는 요인은 ${breakerTitles.join(", ")}입니다.`);
  }
  if (p0Count > 0) {
    parts.push(`현재 ${p0Count}건의 결정-차단(P0) 정보 공백이 있어, 해소 전에는 최종 판단을 내리기 어렵습니다.`);
  } else {
    parts.push("결정을 차단하는(P0) 정보 공백은 현재 없습니다.");
  }
  return parts.join(" ");
}

// ── 9. Investment Decision (전체 조립) ───────────────────────────────────

export function buildInvestmentDecision(
  overall: number,
  assessment: ScoreEvidenceAssessment | null | undefined,
  rationale: Partial<Record<ScoreDimensionKey, string>> | undefined,
  claims: NumericClaim[] | null | undefined,
  questions: IcQuestion[] | null | undefined,
  deal: { investAmount?: number | null; valuation?: number | null }
): VCInvestmentDecision {
  const overallConfidence: ScoreConfidence = assessment?.overallConfidence ?? "NO_EVIDENCE";
  const signal = computeInvestmentSignal(overall, overallConfidence);
  const recommendation = computeRecommendation(signal, assessment?.riskFlags ?? []);

  const contradictions = buildContradictions(claims, questions);
  const decisionDimensions = buildDecisionDimensions(assessment, claims);
  const contradictedDimensions = new Set<string>(
    decisionDimensions.filter((d) => d.state === "CONTRADICTED").map((d) => d.dimension)
  );
  const drivers = buildInvestmentDrivers(assessment, rationale, undefined, contradictedDimensions);
  const thesisBreakers = buildThesisBreakers(assessment, rationale, questions, undefined, contradictions);
  const missingInformation = buildMissingInformation(assessment, claims, questions, undefined, contradictions);
  const baseValuation = buildValuationCase(deal, assessment?.riskFlags ?? []);
  // 밸류에이션·투자조건 섹션 수치가 상충하면 밸류에이션 근거 상태도 상충이다.
  const valuation = contradictions.some((c) => c.dimension === "valuation")
    ? { ...baseValuation, evidenceState: "CONTRADICTED" as VCEvidenceState }
    : baseValuation;
  const thesis = synthesizeInvestmentThesis(drivers, thesisBreakers, missingInformation);

  return {
    signal,
    recommendation,
    thesis,
    // 수치 상충이 하나라도 있으면 결정 확신도는 상충이다 — 근거 완결성이 높아도 정본이 불명확하다.
    confidence: contradictions.length > 0 ? "CONTRADICTED" : mapConfidenceToEvidenceState(overallConfidence),
    decisionDimensions,
    drivers,
    thesisBreakers,
    missingInformation,
    contradictions,
    valuation,
  };
}
