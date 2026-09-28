/**
 * PE 재무 정규화 엔진 — 결정적(deterministic) 순수 함수만 둔다.
 *
 * DB 호출·LLM 호출을 절대 포함하지 않는다. 입력에 필요한 계정이 없으면
 * 0으로 조용히 대체하지 않고 missing_input을 반환한다(FinancialCalcResult).
 * 통화가 기간 통화(periodCurrency)와 다른 계정값은 계산에 쓰지 않고
 * currency_mismatch를 반환한다 — 자동 합산하지 않는다.
 *
 * 하나의 호출(NormalizeFinancialPeriodInput)은 항상 "재무기간 1개"만
 * 다룬다 — 타입 자체가 여러 기간을 한 배열에 섞을 수 없게 만들어져 있어
 * 2024 Annual과 2025 Annual을 실수로 합산할 방법이 없다.
 */

import type {
  CanonicalLineItem,
  FinancialAdjustmentInput,
  FinancialCalcResult,
  FinancialLineItemInput,
  NormalizeFinancialPeriodInput,
} from "./financial-types";

/**
 * 계정값 하나를 찾는다. 없으면 undefined, 기간 통화와 다르면
 * "currency_mismatch"를 던진다(예외가 아니라 내부적으로 감지해 호출자가
 * 처리 — 아래 lookup()이 감싼다).
 */
function findLineItem(
  lineItems: FinancialLineItemInput[],
  key: CanonicalLineItem
): FinancialLineItemInput | undefined {
  return lineItems.find((item) => item.lineItem === key);
}

/** 값 존재 여부만 판단 — 0/음수도 유효한 값이므로 truthy 체크를 쓰지 않는다 */
function hasValue(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export interface Lookup {
  get(key: CanonicalLineItem): FinancialCalcResult;
}

function buildLookup(
  lineItems: FinancialLineItemInput[],
  periodCurrency: string
): Lookup {
  return {
    get(key: CanonicalLineItem): FinancialCalcResult {
      const item = findLineItem(lineItems, key);
      if (!item) {
        return { status: "missing_input", missing: [key] };
      }
      if (item.currency !== periodCurrency) {
        return {
          status: "currency_mismatch",
          detail: `${key}의 통화(${item.currency})가 기간 통화(${periodCurrency})와 다릅니다`,
        };
      }
      if (!Number.isFinite(item.value)) {
        return { status: "missing_input", missing: [key] };
      }
      return { status: "ok", value: item.value };
    },
  };
}

/** 두 계산 결과를 합칠 때 missing/currency_mismatch를 전파한다 */
function combine(
  results: FinancialCalcResult[],
  compute: (values: number[]) => number
): FinancialCalcResult {
  const mismatch = results.find((r) => r.status === "currency_mismatch");
  if (mismatch) return mismatch;

  const missing = results
    .filter((r): r is { status: "missing_input"; missing: string[] } => r.status === "missing_input")
    .flatMap((r) => r.missing);
  if (missing.length > 0) {
    return { status: "missing_input", missing };
  }

  const values = results.map((r) => (r as { status: "ok"; value: number }).value);
  return { status: "ok", value: compute(values) };
}

export function deriveRevenue(lookup: Lookup): FinancialCalcResult {
  return lookup.get("REVENUE");
}

export function deriveGrossProfit(lookup: Lookup): FinancialCalcResult {
  const reported = lookup.get("GROSS_PROFIT");
  if (reported.status === "ok") return reported;
  const revenue = lookup.get("REVENUE");
  const cogs = lookup.get("COGS");
  return combine([revenue, cogs], ([r, c]) => r - c);
}

export function deriveEbit(lookup: Lookup): FinancialCalcResult {
  const reported = lookup.get("EBIT");
  if (reported.status === "ok") return reported;
  const ebitda = lookup.get("EBITDA");
  const da = lookup.get("DA");
  return combine([ebitda, da], ([e, d]) => e - d);
}

/** EBITDA = EBIT + D&A(원천에 EBITDA가 직접 있으면 그 값을 우선한다) */
export function deriveEbitda(lookup: Lookup): FinancialCalcResult {
  const reported = lookup.get("EBITDA");
  if (reported.status === "ok") return reported;
  const ebit = lookup.get("EBIT");
  const da = lookup.get("DA");
  return combine([ebit, da], ([e, d]) => e + d);
}

export function deriveNetIncome(lookup: Lookup): FinancialCalcResult {
  return lookup.get("NET_INCOME");
}

export function deriveCash(lookup: Lookup): FinancialCalcResult {
  return lookup.get("CASH");
}

export function deriveTotalDebt(lookup: Lookup): FinancialCalcResult {
  const shortTerm = lookup.get("SHORT_TERM_DEBT");
  const longTerm = lookup.get("LONG_TERM_DEBT");
  return combine([shortTerm, longTerm], ([s, l]) => s + l);
}

/** Net Debt = Total Debt - Cash */
export function deriveNetDebt(lookup: Lookup): FinancialCalcResult {
  const totalDebt = deriveTotalDebt(lookup);
  const cash = lookup.get("CASH");
  return combine([totalDebt, cash], ([d, c]) => d - c);
}

export function deriveCapex(lookup: Lookup): FinancialCalcResult {
  return lookup.get("CAPEX");
}

/** FCF = Operating Cash Flow - Capex(원천에 FCF가 직접 있으면 그 값을 우선한다) */
export function deriveFreeCashFlow(lookup: Lookup): FinancialCalcResult {
  const reported = lookup.get("FREE_CASH_FLOW");
  if (reported.status === "ok") return reported;
  const ocf = lookup.get("OPERATING_CASH_FLOW");
  const capex = lookup.get("CAPEX");
  return combine([ocf, capex], ([o, c]) => o - c);
}

/**
 * Adjusted EBITDA = Reported/Derived EBITDA + Σ(adjustmentValue) —
 * metric이 "EBITDA"인 조정만 합산한다. adjustments가 없으면 원본 EBITDA를
 * 그대로 반환한다(조정 0건 = 무조정).
 */
export function deriveAdjustedEbitda(
  lookup: Lookup,
  adjustments: FinancialAdjustmentInput[]
): FinancialCalcResult {
  const baseEbitda = deriveEbitda(lookup);
  if (baseEbitda.status !== "ok") return baseEbitda;

  const ebitdaAdjustments = adjustments.filter((a) => a.metric === "EBITDA");
  if (ebitdaAdjustments.length === 0) return baseEbitda;

  const sum = ebitdaAdjustments.reduce((acc, a) => acc + a.adjustmentValue, 0);
  return { status: "ok", value: baseEbitda.value + sum };
}

export interface NormalizedFinancialSummary {
  revenue: FinancialCalcResult;
  grossProfit: FinancialCalcResult;
  ebitda: FinancialCalcResult;
  ebit: FinancialCalcResult;
  netIncome: FinancialCalcResult;
  cash: FinancialCalcResult;
  totalDebt: FinancialCalcResult;
  netDebt: FinancialCalcResult;
  capex: FinancialCalcResult;
  freeCashFlow: FinancialCalcResult;
  adjustedEbitda: FinancialCalcResult;
}

/**
 * 재무기간 1개를 정규화한다 — Revenue/Gross Profit/EBITDA/EBIT/Net Income/
 * Cash/Debt/Net Debt/Capex/FCF/Adjusted EBITDA 11개 지표를 각각
 * FinancialCalcResult로 반환한다(하나가 missing_input이어도 나머지는
 * 계산 가능하면 계산한다 — 부분 실패를 조용히 삼키지 않는다).
 */
export function normalizeFinancialPeriod(
  input: NormalizeFinancialPeriodInput
): NormalizedFinancialSummary {
  const lookup = buildLookup(input.lineItems, input.periodCurrency);
  const adjustments = input.adjustments ?? [];

  return {
    revenue: deriveRevenue(lookup),
    grossProfit: deriveGrossProfit(lookup),
    ebitda: deriveEbitda(lookup),
    ebit: deriveEbit(lookup),
    netIncome: deriveNetIncome(lookup),
    cash: deriveCash(lookup),
    totalDebt: deriveTotalDebt(lookup),
    netDebt: deriveNetDebt(lookup),
    capex: deriveCapex(lookup),
    freeCashFlow: deriveFreeCashFlow(lookup),
    adjustedEbitda: deriveAdjustedEbitda(lookup, adjustments),
  };
}

/**
 * 여러 DB row(재무기간이 섞여 들어올 수 있음)가 정말 한 기간의 것인지
 * 확인한다 — 2025 Q1과 2025 Annual처럼 다른 기간의 line item이 실수로
 * 같은 정규화 호출에 섞여 들어가는 것을 막는다. API 레이어가
 * normalizeFinancialPeriod() 호출 전에 사용한다.
 */
export function assertSinglePeriod(
  rows: { financialPeriodId: string }[]
): { status: "ok" } | { status: "period_mismatch"; periodIds: string[] } {
  const periodIds = Array.from(new Set(rows.map((r) => r.financialPeriodId)));
  if (periodIds.length > 1) {
    return { status: "period_mismatch", periodIds };
  }
  return { status: "ok" };
}

/** MAFinancialAdjustment.normalizedValue = reportedValue + adjustmentValue */
export function computeAdjustmentNormalizedValue(
  reportedValue: number,
  adjustmentValue: number
): number {
  return reportedValue + adjustmentValue;
}

/** hasValue는 다른 모듈(검증 등)에서도 "값이 실제로 있는지"를 동일 기준으로 판단하도록 export한다 */
export { hasValue };
