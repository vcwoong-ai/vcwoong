/**
 * PE Financial & Commercial DD — Metric/Observation 타입(PR-H).
 *
 * ## Audit 결론(§0)
 *
 * - `NormalizedFinancialSummary`(financial-normalization.ts, PR-B)가 이미
 *   revenue/ebitda/netDebt/adjustedEbitda 등을 `FinancialCalcResult`로
 *   제공한다 — 이 파일/dd-financial.ts는 그 계산을 다시 하지 않고 그대로
 *   가져다 쓴다. 단, `NormalizedFinancialSummary`에는 TOTAL_ASSETS/
 *   TOTAL_LIABILITIES/EQUITY가 없다(PR-B가 재무상태표 항목을 요약에
 *   포함하지 않음 — `deriveTotalAssets` 같은 함수 자체가 없음, 확인됨) —
 *   그래서 Balance Sheet 계열 지표만 line item을 직접 조회하는 소규모
 *   로컬 헬퍼가 필요하다(dd-financial.ts에 위치, PR-B의 비공개 `buildLookup`을
 *   복제하지 않고 같은 계약을 재구현한 것임을 명시).
 * - Adjusted EBITDA는 `qoe.ts`(PR-D)의 `calculateAdjustedEbitda()` 결과
 *   (`QoEResult`)를 그대로 받는다 — `NormalizedFinancialSummary.adjustedEbitda`는
 *   status 필터링이 없는 PR-B의 원시 함수라 여기서 쓰지 않는다(PR-D가 이미
 *   APPROVED만 걸러서 넘기는 구조를 갖고 있으므로 그 결과를 재사용).
 * - `PEFinancialPeriodIdentity`(evidence-lineage-types.ts, PR-F)를 기간
 *   식별자로 그대로 재사용한다 — 새 기간 타입을 만들지 않는다.
 * - VC 쪽 `deal-scoring-evidence.ts`의 `RiskFlag`/스코어링 로직은 투자매력도
 *   판단에 결합돼 있어 재사용하지 않는다(PR-F/PR-G 감사에서 이미 확인된
 *   결론을 그대로 따름).
 *
 * ## Failure state(§29)
 *
 * 모든 계산은 `PEDDMetricStatus` 중 하나로 귀결된다 — NaN/Infinity/undefined
 * 숫자를 "정상 결과"로 반환하지 않는다.
 */

export const PE_DD_METRIC_STATUSES = [
  "available",
  "missing_input",
  "invalid_input",
  "undefined_metric",
  "unsupported_comparison",
  "unsupported_currency",
] as const;
export type PEDDMetricStatus = (typeof PE_DD_METRIC_STATUSES)[number];

/**
 * PERCENT/PERCENTAGE_POINT 값은 항상 **분수(fraction)**로 저장한다 —
 * 18%는 0.18, "4 percentage point 변화"는 0.04. `*100`·반올림·자릿수 절삭은
 * presentation layer의 책임이다(§31 — calculation layer는 raw precision을
 * 유지). PERCENT와 PERCENTAGE_POINT를 반드시 구분한다(§11 — "40% 증가"와
 * "4%p 변화"를 혼동하지 않기 위함).
 */
export type PEDDObservationUnit = "RAW_KRW" | "PERCENT" | "PERCENTAGE_POINT" | "RATIO";

/**
 * 모든 계산 결과가 공통으로 갖는 형태. `value`는 status === "available"일
 * 때만 존재한다. `inputs`는 계산에 실제로 쓰인 원천 숫자를 보존한다(§15 —
 * "Observation은 원천 숫자를 잃어버리면 안 된다").
 */
export interface PEDDObservationBase<TMetric extends string> {
  id: string;
  metric: TMetric;
  status: PEDDMetricStatus;
  financialPeriodId: string;
  comparisonPeriodId?: string;
  unit: PEDDObservationUnit;
  value?: number;
  /** status가 available이 아닐 때 이유를 사람이 읽을 수 있게 남긴다. */
  detail?: string;
  inputs: Record<string, number | string | null>;
}

// ─────────────────────────────────────────────────────────────
// Financial(§4, §5)
// ─────────────────────────────────────────────────────────────

export const PE_DD_FINANCIAL_METRICS = [
  "REVENUE_GROWTH_YOY",
  "REVENUE_CAGR",
  "EBITDA_MARGIN",
  "EBITDA_GROWTH_YOY",
  "EBITDA_MARGIN_CHANGE",
  "ADJUSTED_EBITDA_RATIO",
  "TOTAL_ASSETS_GROWTH_YOY",
  "TOTAL_LIABILITIES_GROWTH_YOY",
  "EQUITY_GROWTH_YOY",
  "NET_DEBT",
  "LEVERAGE_NET_DEBT_TO_EBITDA",
] as const;
export type PEDDFinancialMetric = (typeof PE_DD_FINANCIAL_METRICS)[number];
export type PEDDFinancialObservation = PEDDObservationBase<PEDDFinancialMetric>;

/** EBITDA를 쓰는 지표(margin/growth/leverage)에서 reported와 adjusted를
 * 혼동하지 않도록 호출자가 명시적으로 표시한다(§14). */
export type PEDDEbitdaLabel = "REPORTED" | "ADJUSTED";

// ─────────────────────────────────────────────────────────────
// Commercial(§19~§24)
// ─────────────────────────────────────────────────────────────

export const PE_DD_COMMERCIAL_METRICS = [
  "CUSTOMER_CONCENTRATION_TOP1",
  "CUSTOMER_CONCENTRATION_TOP3",
  "CUSTOMER_CONCENTRATION_TOP5",
  "CUSTOMER_REVENUE_GROWTH",
  "CUSTOMER_RETENTION",
  "RECURRING_REVENUE_RATIO",
] as const;
export type PEDDCommercialMetric = (typeof PE_DD_COMMERCIAL_METRICS)[number];
export type PEDDCommercialObservation = PEDDObservationBase<PEDDCommercialMetric>;

/** 고객별 매출 원천 입력 — Prisma model이 아니다(§35, 이번 PR에서 schema를
 * 만들지 않는다). 순수 TypeScript 입력 타입일 뿐이다. */
export interface PEDDCustomerRevenueInput {
  customerId: string;
  customerName?: string;
  financialPeriodId: string;
  revenue: number;
  currency: string;
}

/**
 * Top-N concentration의 분모(전체 매출)를 어디서 가져왔는지 명시적으로
 * 태그한다 — "customer 데이터 합계가 곧 전체 매출"이라고 암묵적으로
 * 가정하지 않기 위함이다(§19). PROVIDED_TOTAL은 별도로 제공된 전체
 * 매출값(예: Financial Fact의 REVENUE)을 쓴다는 뜻이고,
 * SUM_OF_FULL_CUSTOMER_POPULATION은 호출자가 "이 customer 목록이
 * 전체 고객 데이터셋이다"를 명시적으로 단언했다는 뜻이다.
 */
export type PEDDRevenueTotalSource = "PROVIDED_TOTAL" | "SUM_OF_FULL_CUSTOMER_POPULATION";

export interface PEDDRevenueTotal {
  value: number;
  source: PEDDRevenueTotalSource;
}
