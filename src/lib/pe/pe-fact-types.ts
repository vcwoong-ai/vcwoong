/**
 * PE DD AI Fact Extraction & Synthesis — 타입(PR-I).
 *
 * ## Audit 결론(§0)
 *
 * - AI 호출 추상화는 `src/lib/claude.ts`(generateText/callClaudeJSON,
 *   모델 체인·타임아웃·재시도/폴백·품질 게이트 전부 이미 존재) — 새
 *   provider SDK를 추가하지 않고 그대로 재사용한다(수정하지 않음).
 *   `callClaudeJSON<T>()`가 이미 "JSON 응답이 필요한 구조화 호출용"
 *   함수이지만, AI 호출+JSON 파싱을 한 번에 묶어서 테스트에서 mock JSON을
 *   "파서에만" 통과시키기 어렵다(§54 요구: mock JSON → real parser → real
 *   validator) — 그래서 이 PR은 파싱(`parseFactExtractionResponse`,
 *   pe-fact-validation.ts)과 실제 호출(`extractPEFactsFromDocument`,
 *   pe-fact-extraction.ts)을 분리한다. 파싱 기법(마크다운 코드펜스 제거 +
 *   `{`...`}` 슬라이스)은 claude.ts의 `callClaudeJSON`/evidence-ai.ts의
 *   `extractJson`(둘 다 비공개이거나 호출과 결합돼 재사용 불가)과 동일한
 *   패턴을 이 파일 밖(pe-fact-validation.ts)에서 재구현한다.
 * - 프롬프트 인젝션 방어 delimiter는 `evidence-ai.ts`가 이미 쓰는
 *   `<<<SOURCE_DOCUMENT>>> ... <<<END_SOURCE_DOCUMENT>>>` 관례를 그대로
 *   따른다(§26의 예시 `<DOCUMENT_CONTENT>`가 아니라 실제 레포 관례를
 *   우선함 — §0/§24 지시대로).
 * - `CHEAP_MODEL_CHAIN`/`taskTier: "cheap"`(claude.ts)이 이미 "최종 투자
 *   판단에 직접 쓰이지 않는 보조 작업"(evidence-ai.ts가 그 정확한 용례)의
 *   기존 관례다 — Fact extraction도 같은 성격이라 그대로 재사용한다.
 * - 문서 파서(document-parser.ts)가 남기는 위치 표시(PDF "[페이지 N]",
 *   XLSX "[시트: X]", PPTX "[슬라이드 N]", DOCX 없음 — evidence.ts에 이미
 *   문서화됨)를 그대로 "실제 제공된 위치"의 기준으로 삼는다 — AI가 이
 *   형식과 다른 위치를 만들어내면 신뢰하지 않는다(§6/§48).
 * - PR-F(`PEEvidenceSource`/`PEEvidenceItem`/`PEClaim`/
 *   `PEFinancialPeriodIdentity`)와 PR-G(`PEDDFinding`)는 그대로 재사용한다
 *   — 이 파일은 새 Evidence/Claim/Finding 타입을 만들지 않는다.
 * - `MaFinancialSourceType`(PR-B)를 AI 추출 결과의 sourceType에도 그대로
 *   쓴다 — Source authority를 이 PR이 임의로 랭킹하지 않는다(§9).
 *
 * ## Fact Candidate Lifecycle(§2) — PR-G Finding lifecycle과 다른 축
 *
 * AI:        CANDIDATE
 * 결정론적:   VALIDATED | INVALID | NEEDS_REVIEW
 * (이후 별도 PR/사람이): CONFIRMED
 *
 * PR-G의 Finding lifecycle(DRAFT→IN_REVIEW→CONFIRMED→...)과 절대 혼동하지
 * 않는다 — 이 상태는 "AI가 읽은 숫자를 얼마나 신뢰할 수 있는가"이고,
 * PR-G의 상태는 "DD issue가 얼마나 확정됐는가"다.
 */

import type { CanonicalLineItem, MaFinancialSourceType } from "./financial-types";
import type { PEUnit } from "./pe-unit";
import type { PEDDCustomerRevenueInput } from "./dd-metrics-types";

// ─────────────────────────────────────────────────────────────
// AI Extraction Contract(§3) — AI가 실제로 반환해야 하는 JSON 형태.
// 이 타입은 "AI가 그렇게 주장했다"일 뿐이며 신뢰된 도메인 값이 아니다
// (§68 — RawAIExtraction과 ValidatedPEFact를 분리).
// ─────────────────────────────────────────────────────────────

export type PEFactType = "FINANCIAL" | "COMMERCIAL";

/** §4 — source에 명시된 값만 생성 가능한 계정/지표. 새 계정을 임의로 늘리지 않는다. */
export const PE_FINANCIAL_FACT_METRICS = [
  "REVENUE",
  "EBITDA",
  "EBIT",
  "NET_INCOME",
  "TOTAL_ASSETS",
  "TOTAL_LIABILITIES",
  "EQUITY",
  "CASH",
  "DEBT",
  "CAPEX",
  "WORKING_CAPITAL",
  "RECURRING_REVENUE",
] as const;
export type PEFinancialFactMetric = (typeof PE_FINANCIAL_FACT_METRICS)[number];

export const PE_COMMERCIAL_FACT_METRICS = [
  "CUSTOMER_REVENUE",
  "CUSTOMER_COUNT",
  "ACTIVE_CUSTOMER",
  "CONTRACT_VALUE",
  "RECURRING_REVENUE",
  "RETENTION",
  "CHURN",
] as const;
export type PECommercialFactMetric = (typeof PE_COMMERCIAL_FACT_METRICS)[number];

/** AI가 반환한 fact 1건(검증 전, raw) — `.strict()` 스키마(pe-fact-validation.ts)를
 * 통과해야만 여기까지 온다(알 수 없는 필드=hallucinated field는 그 단계에서 reject). */
export interface RawAIExtractedFact {
  id?: string;
  factType: PEFactType;
  metric: string;
  value: number;
  unit?: string;
  currency?: string;
  fiscalYear?: number;
  /** AI가 자유 형식으로 반환("FY2025"/"2025 fiscal year"/"2025.12" 등) —
   * normalizePeriodTypeString()으로 정규화 전에는 계산 엔진에 넣지 않는다(§12). */
  periodType?: string;
  sourceEvidenceId?: string;
  sourceLocation?: string;
  /** AI의 판독 확신도 — evidence.confidence(출처 자체의 신뢰도)와 다른 축(§8). */
  confidence?: number;
  /** metric === "CUSTOMER_REVENUE"일 때만 의미가 있다(PR-I.1 Finding #9) —
   * 다른 metric에는 강제하지 않는다(고객 식별은 재무 계산이 아니라 데이터
   * 식별 필드). */
  customerId?: string;
  customerName?: string;
}

export interface RawAIExtraction {
  documentId: string;
  facts: RawAIExtractedFact[];
}

// ─────────────────────────────────────────────────────────────
// Validated Fact Candidate(§10) — deterministic validator를 거친 결과.
// ─────────────────────────────────────────────────────────────

export const PE_FACT_CANDIDATE_STATUSES = [
  "CANDIDATE",
  "VALIDATED",
  "INVALID",
  "NEEDS_REVIEW",
  "CONFIRMED",
] as const;
export type PEFactCandidateStatus = (typeof PE_FACT_CANDIDATE_STATUSES)[number];

export interface PEFactCandidate {
  /** deriveFactId()로 결정론적으로 생성(§69) — AI가 준 id는 신뢰하지 않는다. */
  id: string;
  documentId: string;
  factType: PEFactType;
  metric: string;
  value: number;
  unit?: string;
  currency?: string;
  fiscalYear?: number;
  /** normalizePeriodTypeString()이 정규화한 값. 정규화 실패 시 undefined(추측 금지). */
  normalizedPeriodType?: "ANNUAL" | "QUARTERLY" | "TTM";
  /** normalizeUnitString()이 정규화한 값(PR-I.1 Finding #4) — 자유 텍스트
   * unit을 dedupe/충돌 판정에 그대로 쓰지 않기 위함. 정규화 실패 시에도
   * "UNKNOWN"으로 채워진다(raw.unit 자체가 없을 때만 undefined). */
  normalizedUnit?: PEUnit;
  sourceEvidenceId: string;
  sourceLocation?: string;
  aiConfidence?: number;
  status: PEFactCandidateStatus;
  /** VALIDATED가 아니면 이유를 남긴다(빈 배열=VALIDATED). */
  rejectionReasons: string[];
  customerId?: string;
  customerName?: string;
}

// ─────────────────────────────────────────────────────────────
// Conflict(§21~§23)
// ─────────────────────────────────────────────────────────────

/** UNIT_MISMATCH — PR-I.1 Finding #4: 값·통화는 같은데 unit이 다른 경우(예:
 * "10 USD million" vs "10 USD billion") 이제 dedupe로 조용히 사라지지
 * 않고 이 conflictType으로 남는다. */
export type PEFactConflictType = "VALUE_MISMATCH" | "CURRENCY_MISMATCH" | "UNIT_MISMATCH";
export type PEFactConflictResolutionStatus = "UNRESOLVED" | "RESOLVED";

export interface PEFactConflict {
  id: string;
  factIds: string[];
  conflictType: PEFactConflictType;
  metric: string;
  fiscalYear: number;
  periodType: string;
  /** AI가 자동으로 RESOLVED를 만들지 않는다(§23) — 항상 UNRESOLVED로 생성된다. */
  resolutionStatus: PEFactConflictResolutionStatus;
}

// ─────────────────────────────────────────────────────────────
// IC Synthesis(§34, §61) — 투자 추천을 만들지 않는다(§16, §75, §76).
// ─────────────────────────────────────────────────────────────

/** 모든 narrative 항목은 근거 ID를 갖는다(§39) — text만 있고 참조가 없는
 * 항목은 mergeAISynthesisNarrative()가 병합을 거부한다(§35, §60). */
export interface PESynthesisItem {
  text: string;
  evidenceIds: string[];
  claimIds: string[];
  factIds: string[];
}

export interface PEICSynthesis {
  keyFacts: PESynthesisItem[];
  financialObservations: PESynthesisItem[];
  commercialObservations: PESynthesisItem[];
  findings: PESynthesisItem[];
  evidenceGaps: PESynthesisItem[];
  openQuestions: PESynthesisItem[];
  conflicts: PESynthesisItem[];
}

/**
 * 구조화된 수치 주장(PR-I.1 Finding #1) — narrative 문장이 특정 수치를
 * 주장할 때만 채운다. factId 또는 observationMetric 중 하나로 "무엇에 대한
 * 주장인가"를 가리키고, value(및 선택적으로 unit/currency/기간)로 "그
 * 대상의 실제 값과 일치하는가"를 검증받는다 — 임의의 자연어 문장에서
 * 숫자를 정규식으로 추출하려 하지 않는다(그런 파서는 취약하다). 순수
 * 서술형 문장(수치 주장이 없는 문장)은 이 필드를 비워두면 되고, 그 경우
 * 기존처럼 evidenceIds/claimIds/factIds 존재 여부만 검증된다.
 */
export interface AISynthesisGroundingAssertion {
  /** PEFactCandidate.id를 가리킨다 — observationMetric과 동시에 쓰지 않는다. */
  factId?: string;
  /** PEDDFinancialObservation/PEDDCommercialObservation의 metric 문자열을
   * 가리킨다(예: "REVENUE_GROWTH_YOY") — factId와 동시에 쓰지 않는다. */
  observationMetric?: string;
  value?: number;
  unit?: string;
  currency?: string;
  fiscalYear?: number;
  periodType?: string;
}

/** AI가 제안하는 narrative 문장(검증 전) — mergeAISynthesisNarrative()가 통과시켜야만
 * PEICSynthesis에 들어간다. */
export interface RawAISynthesisNarrative {
  section: keyof PEICSynthesis;
  text: string;
  evidenceIds?: string[];
  claimIds?: string[];
  factIds?: string[];
  groundingAssertion?: AISynthesisGroundingAssertion;
}

// ─────────────────────────────────────────────────────────────
// metric 매핑 — PE_FINANCIAL_FACT_METRICS는 financial-types.ts의
// CanonicalLineItem(PR-B)보다 어휘가 넓다(DEBT/CAPEX/WORKING_CAPITAL/
// RECURRING_REVENUE는 CanonicalLineItem에 정확히 대응하는 항목이 없음 —
// DEBT는 SHORT_TERM_DEBT/LONG_TERM_DEBT로 쪼개져 있고, WORKING_CAPITAL/
// RECURRING_REVENUE는 아예 없음). 대응되는 것만 매핑하고, 대응 안 되는
// 것은 null을 반환한다(억지로 끼워 맞추지 않음) — PR-F Financial Fact
// Reference로 연결할 때 이 매핑을 거친다.
// ─────────────────────────────────────────────────────────────

const FACT_METRIC_TO_CANONICAL_LINE_ITEM: Partial<Record<PEFinancialFactMetric, CanonicalLineItem>> = {
  REVENUE: "REVENUE",
  EBITDA: "EBITDA",
  EBIT: "EBIT",
  NET_INCOME: "NET_INCOME",
  TOTAL_ASSETS: "TOTAL_ASSETS",
  TOTAL_LIABILITIES: "TOTAL_LIABILITIES",
  EQUITY: "EQUITY",
  CASH: "CASH",
};

export function mapFactMetricToCanonicalLineItem(metric: string): CanonicalLineItem | null {
  return FACT_METRIC_TO_CANONICAL_LINE_ITEM[metric as PEFinancialFactMetric] ?? null;
}

/**
 * PR-I.1 Finding #9 — CUSTOMER_REVENUE fact를 PR-H의 PEDDCustomerRevenueInput으로
 * 변환한다. concentration 계산은 절대 여기서 하지 않는다(PR-H 책임 그대로) —
 * 필드만 옮긴다. VALIDATED가 아닌 fact, CUSTOMER_REVENUE가 아닌 metric,
 * customerId가 없는 fact는 null(호출자가 걸러야 함을 명시).
 *
 * `financialPeriodId`는 fact가 직접 갖고 있지 않다(fiscalYear+normalizedPeriodType만
 * 있음) — 실제 PEFinancialPeriodIdentity.id는 호출자가 이미 알고 있는
 * 값을 넘겨야 한다(이 함수가 지어내지 않는다).
 */
export function factCandidateToCustomerRevenueInput(
  fact: PEFactCandidate,
  financialPeriodId: string
): PEDDCustomerRevenueInput | null {
  if (fact.status !== "VALIDATED") return null;
  if (fact.metric !== "CUSTOMER_REVENUE") return null;
  if (!fact.customerId) return null;
  return {
    customerId: fact.customerId,
    customerName: fact.customerName,
    financialPeriodId,
    revenue: fact.value,
    currency: fact.currency ?? "KRW",
  };
}

/** DART/문서 등 fact의 원천 — MaFinancialSourceType(PR-B) 그대로. Source
 * authority를 이 파일이 랭킹하지 않는다(§9) — 값만 보존한다. */
export type PEFactSourceType = MaFinancialSourceType;
