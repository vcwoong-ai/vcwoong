/**
 * PE Financial DD — 결정론적 지표 계산 + rule 평가 + Finding 생성(PR-H).
 *
 * 순서: Normalized Financial Data(PR-B) / QoE Result(PR-D) → Observation →
 * Rule 평가 → PEDDFinding(PR-G) + Evidence/Claim lineage(PR-F, 참조만).
 *
 * 이 파일의 모든 계산 함수는 순수하고 결정론적이다 — DB/네트워크/AI 호출,
 * `Date.now()`/`Math.random()`이 전혀 없다. 실패는 항상
 * `PEDDMetricStatus`로 표현하고 NaN/Infinity를 반환하지 않는다(§29).
 */

import type {
  FinancialCalcResult,
  FinancialLineItemInput,
} from "./financial-types";
import type { NormalizedFinancialSummary } from "./financial-normalization";
import type { QoEResult } from "./qoe";
import type { PEFinancialPeriodIdentity } from "./evidence-lineage-types";
import { createPEDDFinding } from "./dd-validation";
import type { PEDDFinding, PEDDFindingStatus, PEDDSeverity } from "./dd-types";
import type {
  PEDDEbitdaLabel,
  PEDDFinancialMetric,
  PEDDFinancialObservation,
  PEDDMetricStatus,
} from "./dd-metrics-types";

/** 재무기간 1개에 대한 정규화 결과 + 그 기간의 identity(PR-F 재사용). */
export interface PEDDFinancialPeriodInputs {
  period: PEFinancialPeriodIdentity;
  summary: NormalizedFinancialSummary;
}

function baseObservation(
  id: string,
  metric: PEDDFinancialMetric,
  financialPeriodId: string,
  unit: PEDDFinancialObservation["unit"],
  comparisonPeriodId?: string
): Omit<PEDDFinancialObservation, "status" | "inputs"> {
  return { id, metric, financialPeriodId, unit, comparisonPeriodId };
}

function fromCalcResultFailure(
  result: Extract<FinancialCalcResult, { status: "missing_input" | "currency_mismatch" }>
): { status: PEDDMetricStatus; detail: string } {
  if (result.status === "currency_mismatch") {
    return { status: "unsupported_currency", detail: result.detail };
  }
  return { status: "missing_input", detail: `필요한 입력이 없습니다: ${result.missing.join(", ")}` };
}

// ─────────────────────────────────────────────────────────────
// Revenue(§7)
// ─────────────────────────────────────────────────────────────

/** growth = (current - previous) / abs(previous). previous === 0이면 undefined_metric(0으로 나누지 않음). */
export function calculateRevenueGrowth(
  id: string,
  current: PEDDFinancialPeriodInputs,
  previous: PEDDFinancialPeriodInputs
): PEDDFinancialObservation {
  const base = baseObservation(id, "REVENUE_GROWTH_YOY", current.period.id, "PERCENT", previous.period.id);

  if (current.period.periodType !== previous.period.periodType) {
    return {
      ...base,
      status: "unsupported_comparison",
      inputs: {},
      detail: `periodType이 달라 비교할 수 없습니다: ${current.period.periodType} vs ${previous.period.periodType}(§6)`,
    };
  }

  const cur = current.summary.revenue;
  const prev = previous.summary.revenue;
  if (cur.status !== "ok") return { ...base, ...fromCalcResultFailure(cur as never), inputs: {} };
  if (prev.status !== "ok") return { ...base, ...fromCalcResultFailure(prev as never), inputs: {} };

  const inputs = { currentRevenue: cur.value, previousRevenue: prev.value };
  if (prev.value === 0) {
    return { ...base, status: "undefined_metric", inputs, detail: "이전 기간 Revenue가 0이면 성장률을 정의할 수 없습니다" };
  }
  return { ...base, status: "available", value: (cur.value - prev.value) / Math.abs(prev.value), inputs };
}

/**
 * CAGR = (end/start)^(1/years) - 1. 2개 이상의 comparable(동일 periodType)
 * 기간이 필요하다(§8) — 제공된 기간 중 fiscalYear가 가장 이르고/늦은 것을
 * start/end로 쓴다. start<=0 또는 end<=0이면 invalid_input(억지로 계산하지 않음).
 */
export function calculateRevenueCagr(
  id: string,
  periods: PEDDFinancialPeriodInputs[]
): PEDDFinancialObservation {
  if (periods.length < 2) {
    return {
      id,
      metric: "REVENUE_CAGR",
      status: "undefined_metric",
      financialPeriodId: periods[0]?.period.id ?? "",
      unit: "PERCENT",
      inputs: {},
      detail: "CAGR 계산에는 2개 이상의 비교 가능한 기간이 필요합니다",
    };
  }
  const sorted = [...periods].sort((a, b) => a.period.fiscalYear - b.period.fiscalYear);
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  const base = baseObservation(id, "REVENUE_CAGR", end.period.id, "PERCENT", start.period.id);

  if (start.period.periodType !== end.period.periodType) {
    return {
      ...base,
      status: "unsupported_comparison",
      inputs: {},
      detail: `periodType이 달라 비교할 수 없습니다: ${start.period.periodType} vs ${end.period.periodType}`,
    };
  }
  const years = end.period.fiscalYear - start.period.fiscalYear;
  if (years <= 0) {
    return { ...base, status: "undefined_metric", inputs: {}, detail: "시작·종료 기간의 fiscalYear가 같거나 역순입니다" };
  }

  const startRevenue = start.summary.revenue;
  const endRevenue = end.summary.revenue;
  if (startRevenue.status !== "ok") return { ...base, ...fromCalcResultFailure(startRevenue as never), inputs: {} };
  if (endRevenue.status !== "ok") return { ...base, ...fromCalcResultFailure(endRevenue as never), inputs: {} };

  const inputs = { startRevenue: startRevenue.value, endRevenue: endRevenue.value, years };
  if (startRevenue.value <= 0 || endRevenue.value <= 0) {
    return { ...base, status: "invalid_input", inputs, detail: "시작 또는 종료 Revenue가 0 이하이면 일반적인 CAGR을 정의할 수 없습니다(§8)" };
  }
  const cagr = Math.pow(endRevenue.value / startRevenue.value, 1 / years) - 1;
  return { ...base, status: "available", value: cagr, inputs };
}

// ─────────────────────────────────────────────────────────────
// EBITDA(§9, §11) — reported/adjusted를 호출자가 명시적으로 골라 넘긴다.
// ─────────────────────────────────────────────────────────────

/** margin = ebitda/revenue. revenue===0이면 계산하지 않는다(Infinity/NaN 금지). */
export function calculateEbitdaMargin(
  id: string,
  period: PEFinancialPeriodIdentity,
  revenue: FinancialCalcResult,
  ebitda: FinancialCalcResult,
  ebitdaLabel: PEDDEbitdaLabel
): PEDDFinancialObservation {
  const base = baseObservation(id, "EBITDA_MARGIN", period.id, "PERCENT");
  if (revenue.status !== "ok") return { ...base, ...fromCalcResultFailure(revenue as never), inputs: { ebitdaLabel } };
  if (ebitda.status !== "ok") return { ...base, ...fromCalcResultFailure(ebitda as never), inputs: { ebitdaLabel } };

  const inputs = { revenue: revenue.value, ebitda: ebitda.value, ebitdaLabel };
  if (revenue.value === 0) {
    return { ...base, status: "undefined_metric", inputs, detail: "Revenue가 0이면 EBITDA margin을 정의할 수 없습니다" };
  }
  return { ...base, status: "available", value: ebitda.value / revenue.value, inputs };
}

export function calculateEbitdaGrowth(
  id: string,
  current: { period: PEFinancialPeriodIdentity; ebitda: FinancialCalcResult },
  previous: { period: PEFinancialPeriodIdentity; ebitda: FinancialCalcResult },
  ebitdaLabel: PEDDEbitdaLabel
): PEDDFinancialObservation {
  const base = baseObservation(id, "EBITDA_GROWTH_YOY", current.period.id, "PERCENT", previous.period.id);
  if (current.period.periodType !== previous.period.periodType) {
    return { ...base, status: "unsupported_comparison", inputs: { ebitdaLabel }, detail: `periodType 불일치: ${current.period.periodType} vs ${previous.period.periodType}` };
  }
  if (current.ebitda.status !== "ok") return { ...base, ...fromCalcResultFailure(current.ebitda as never), inputs: { ebitdaLabel } };
  if (previous.ebitda.status !== "ok") return { ...base, ...fromCalcResultFailure(previous.ebitda as never), inputs: { ebitdaLabel } };

  const inputs = { currentEbitda: current.ebitda.value, previousEbitda: previous.ebitda.value, ebitdaLabel };
  if (previous.ebitda.value === 0) {
    return { ...base, status: "undefined_metric", inputs, detail: "이전 기간 EBITDA가 0이면 성장률을 정의할 수 없습니다" };
  }
  return { ...base, status: "available", value: (current.ebitda.value - previous.ebitda.value) / Math.abs(previous.ebitda.value), inputs };
}

/**
 * marginChange = currentMargin - previousMargin, percentage-point 단위(§11).
 * "40% 증가"가 아니라 "4%p 변화"라는 점을 unit(PERCENTAGE_POINT)으로 명시한다.
 * 두 margin observation 모두 status === "available"이어야 계산한다.
 */
export function calculateEbitdaMarginChange(
  id: string,
  currentMargin: PEDDFinancialObservation,
  previousMargin: PEDDFinancialObservation
): PEDDFinancialObservation {
  const base = baseObservation(id, "EBITDA_MARGIN_CHANGE", currentMargin.financialPeriodId, "PERCENTAGE_POINT", previousMargin.financialPeriodId);
  if (currentMargin.metric !== "EBITDA_MARGIN" || previousMargin.metric !== "EBITDA_MARGIN") {
    return { ...base, status: "invalid_input", inputs: {}, detail: "EBITDA_MARGIN observation 2개가 필요합니다" };
  }
  if (currentMargin.status !== "available" || previousMargin.status !== "available") {
    return { ...base, status: "missing_input", inputs: {}, detail: "두 기간의 EBITDA margin이 모두 available이어야 합니다" };
  }
  const inputs = { currentMargin: currentMargin.value!, previousMargin: previousMargin.value! };
  return { ...base, status: "available", value: currentMargin.value! - previousMargin.value!, inputs };
}

// ─────────────────────────────────────────────────────────────
// Adjusted EBITDA(§10) — qoe.ts의 QoEResult를 그대로 쓴다. 재계산하지 않는다.
// ─────────────────────────────────────────────────────────────

/** ratio = approvedAdjustmentTotal / abs(reportedEbitda). reportedEbitda===0이면 undefined_metric. */
export function calculateAdjustedEbitdaRatio(
  id: string,
  period: PEFinancialPeriodIdentity,
  qoeResult: QoEResult
): PEDDFinancialObservation {
  const base = baseObservation(id, "ADJUSTED_EBITDA_RATIO", period.id, "RATIO");
  if (qoeResult.baseEbitda.status !== "ok") {
    return { ...base, ...fromCalcResultFailure(qoeResult.baseEbitda as never), inputs: {} };
  }
  const reportedEbitda = qoeResult.baseEbitda.value;
  const inputs = {
    reportedEbitda,
    approvedAdjustmentTotal: qoeResult.approvedAdjustmentTotal,
    adjustedEbitda: qoeResult.adjustedEbitda.status === "ok" ? qoeResult.adjustedEbitda.value : null,
  };
  if (reportedEbitda === 0) {
    return { ...base, status: "undefined_metric", inputs, detail: "Reported EBITDA가 0이면 조정 비율을 정의할 수 없습니다" };
  }
  return { ...base, status: "available", value: qoeResult.approvedAdjustmentTotal / Math.abs(reportedEbitda), inputs };
}

// ─────────────────────────────────────────────────────────────
// Balance Sheet(§12) — NormalizedFinancialSummary에 없는 계정이라
// line item을 직접 조회한다(로컬 헬퍼 — PR-B의 buildLookup과 같은 계약을
// 재구현, PR-B 파일 자체는 수정하지 않음. dd-metrics-types.ts 상단 주석 참고).
// ─────────────────────────────────────────────────────────────

function findLineItemValue(
  lineItems: FinancialLineItemInput[],
  periodCurrency: string,
  key: "TOTAL_ASSETS" | "TOTAL_LIABILITIES" | "EQUITY"
): FinancialCalcResult {
  const item = lineItems.find((i) => i.lineItem === key);
  if (!item) return { status: "missing_input", missing: [key] };
  if (item.currency !== periodCurrency) {
    return { status: "currency_mismatch", detail: `${key}의 통화(${item.currency})가 기간 통화(${periodCurrency})와 다릅니다` };
  }
  if (!Number.isFinite(item.value)) return { status: "missing_input", missing: [key] };
  return { status: "ok", value: item.value };
}

function calculateLineItemGrowth(
  id: string,
  metric: PEDDFinancialMetric,
  lineItemKey: "TOTAL_ASSETS" | "TOTAL_LIABILITIES" | "EQUITY",
  current: { period: PEFinancialPeriodIdentity; lineItems: FinancialLineItemInput[] },
  previous: { period: PEFinancialPeriodIdentity; lineItems: FinancialLineItemInput[] }
): PEDDFinancialObservation {
  const base = baseObservation(id, metric, current.period.id, "PERCENT", previous.period.id);
  if (current.period.periodType !== previous.period.periodType) {
    return { ...base, status: "unsupported_comparison", inputs: {}, detail: `periodType 불일치: ${current.period.periodType} vs ${previous.period.periodType}` };
  }
  const cur = findLineItemValue(current.lineItems, current.period.currency, lineItemKey);
  const prev = findLineItemValue(previous.lineItems, previous.period.currency, lineItemKey);
  if (cur.status !== "ok") return { ...base, ...fromCalcResultFailure(cur as never), inputs: {} };
  if (prev.status !== "ok") return { ...base, ...fromCalcResultFailure(prev as never), inputs: {} };

  const inputs = { current: cur.value, previous: prev.value };
  if (prev.value === 0) {
    return { ...base, status: "undefined_metric", inputs, detail: `이전 기간 ${lineItemKey}가 0이면 성장률을 정의할 수 없습니다` };
  }
  return { ...base, status: "available", value: (cur.value - prev.value) / Math.abs(prev.value), inputs };
}

export function calculateTotalAssetsGrowth(
  id: string,
  current: { period: PEFinancialPeriodIdentity; lineItems: FinancialLineItemInput[] },
  previous: { period: PEFinancialPeriodIdentity; lineItems: FinancialLineItemInput[] }
): PEDDFinancialObservation {
  return calculateLineItemGrowth(id, "TOTAL_ASSETS_GROWTH_YOY", "TOTAL_ASSETS", current, previous);
}

export function calculateTotalLiabilitiesGrowth(
  id: string,
  current: { period: PEFinancialPeriodIdentity; lineItems: FinancialLineItemInput[] },
  previous: { period: PEFinancialPeriodIdentity; lineItems: FinancialLineItemInput[] }
): PEDDFinancialObservation {
  return calculateLineItemGrowth(id, "TOTAL_LIABILITIES_GROWTH_YOY", "TOTAL_LIABILITIES", current, previous);
}

export function calculateEquityGrowth(
  id: string,
  current: { period: PEFinancialPeriodIdentity; lineItems: FinancialLineItemInput[] },
  previous: { period: PEFinancialPeriodIdentity; lineItems: FinancialLineItemInput[] }
): PEDDFinancialObservation {
  return calculateLineItemGrowth(id, "EQUITY_GROWTH_YOY", "EQUITY", current, previous);
}

// ─────────────────────────────────────────────────────────────
// Debt / Leverage(§13, §14)
// ─────────────────────────────────────────────────────────────

/**
 * PR-B의 `NormalizedFinancialSummary.netDebt`(= Debt - Cash, deriveNetDebt)를
 * 그대로 Observation으로 감쌀 뿐 다시 계산하지 않는다. Debt/Cash 둘 중
 * 하나라도 없으면 PR-B가 이미 missing_input을 반환하므로, 여기서
 * Total Liabilities로 대체하는 등의 추정은 애초에 발생할 수 없다(§13 금지사항).
 */
export function calculateNetDebt(
  id: string,
  period: PEFinancialPeriodIdentity,
  summary: NormalizedFinancialSummary
): PEDDFinancialObservation {
  const base = baseObservation(id, "NET_DEBT", period.id, "RAW_KRW");
  const netDebt = summary.netDebt;
  if (netDebt.status !== "ok") return { ...base, ...fromCalcResultFailure(netDebt as never), inputs: {} };
  return { ...base, status: "available", value: netDebt.value, inputs: { netDebt: netDebt.value } };
}

/** leverage = netDebt/ebitda. ebitda<=0이면 계산하지 않는다(§14, invalid_input). */
export function calculateLeverage(
  id: string,
  period: PEFinancialPeriodIdentity,
  netDebt: FinancialCalcResult,
  ebitda: FinancialCalcResult,
  ebitdaLabel: PEDDEbitdaLabel
): PEDDFinancialObservation {
  const base = baseObservation(id, "LEVERAGE_NET_DEBT_TO_EBITDA", period.id, "RATIO");
  if (netDebt.status !== "ok") return { ...base, ...fromCalcResultFailure(netDebt as never), inputs: { ebitdaLabel } };
  if (ebitda.status !== "ok") return { ...base, ...fromCalcResultFailure(ebitda as never), inputs: { ebitdaLabel } };

  const inputs = { netDebt: netDebt.value, ebitda: ebitda.value, ebitdaLabel };
  if (ebitda.value <= 0) {
    return { ...base, status: "invalid_input", inputs, detail: "EBITDA가 0 이하이면 leverage multiple을 정의하지 않습니다(§14)" };
  }
  return { ...base, status: "available", value: netDebt.value / ebitda.value, inputs };
}

// ─────────────────────────────────────────────────────────────
// Rule 평가(§16, §39, §40) — threshold는 항상 호출자가 명시한다. 기본값은
// "판단"이 필요 없는 부호 기준(0) 하나뿐이며, 그 외에는 기본값을 두지
// 않는다("시장 표준" 주장 금지 — 이 코드가 대신 판단하지 않는다는 뜻).
// ─────────────────────────────────────────────────────────────

export interface PEDDFinancialRuleConfig {
  /** REVENUE_GROWTH_YOY < 이 값이면 "매출 감소"로 감지한다. 기본값 0 —
   * "성장률이 음수"는 magnitude 판단이 아니라 부호 판정이라 임의성이 없다. */
  revenueDeclineThreshold?: number;
  /** EBITDA_MARGIN_CHANGE(percentage-point, 분수)가 -이 값 이하로 하락하면
   * 감지한다. 기본값 없음 — 얼마나 떨어져야 "의미 있는 하락"인지는 판단이
   * 필요한 magnitude라 호출자가 명시하지 않으면 이 rule은 평가하지 않는다. */
  marginDeclineThresholdPp?: number;
  /** ADJUSTED_EBITDA_RATIO의 절댓값이 이 값 이상이면 "중대한 QoE 조정"으로
   * 감지한다. 기본값 없음(위와 같은 이유). */
  materialAdjustmentRatio?: number;
}

export type PEDDFinancialRuleName = "REVENUE_DECLINE" | "EBITDA_MARGIN_DECLINE" | "MATERIAL_QOE_ADJUSTMENT";

export interface PEDDFinancialRuleResult {
  rule: PEDDFinancialRuleName;
  triggered: boolean;
  observation: PEDDFinancialObservation;
}

/** available 상태의 observation만 평가한다 — missing/invalid 상태는 rule 판단 대상이 아니다. */
export function evaluateFinancialRules(
  observations: PEDDFinancialObservation[],
  config: PEDDFinancialRuleConfig = {}
): PEDDFinancialRuleResult[] {
  const revenueDeclineThreshold = config.revenueDeclineThreshold ?? 0;
  const results: PEDDFinancialRuleResult[] = [];

  for (const obs of observations) {
    if (obs.status !== "available" || obs.value === undefined) continue;

    if (obs.metric === "REVENUE_GROWTH_YOY") {
      results.push({ rule: "REVENUE_DECLINE", triggered: obs.value < revenueDeclineThreshold, observation: obs });
    }
    if (obs.metric === "EBITDA_MARGIN_CHANGE" && config.marginDeclineThresholdPp !== undefined) {
      results.push({
        rule: "EBITDA_MARGIN_DECLINE",
        triggered: obs.value <= -config.marginDeclineThresholdPp,
        observation: obs,
      });
    }
    if (obs.metric === "ADJUSTED_EBITDA_RATIO" && config.materialAdjustmentRatio !== undefined) {
      results.push({
        rule: "MATERIAL_QOE_ADJUSTMENT",
        triggered: Math.abs(obs.value) >= config.materialAdjustmentRatio,
        observation: obs,
      });
    }
  }
  return results;
}

const FINANCIAL_RULE_TITLES: Record<PEDDFinancialRuleName, string> = {
  REVENUE_DECLINE: "Revenue decline",
  EBITDA_MARGIN_DECLINE: "EBITDA margin decline",
  MATERIAL_QOE_ADJUSTMENT: "Material QoE adjustment",
};

function describeFinancialRuleResult(result: PEDDFinancialRuleResult): string {
  const v = result.observation.value ?? 0;
  switch (result.rule) {
    case "REVENUE_DECLINE":
      return `Revenue YoY ${(v * 100).toFixed(1)}%`;
    case "EBITDA_MARGIN_DECLINE":
      return `EBITDA margin change ${(v * 100).toFixed(1)}pp`;
    case "MATERIAL_QOE_ADJUSTMENT":
      return `QoE adjustment ratio ${(v * 100).toFixed(1)}%`;
  }
}

/**
 * triggered인 rule result만 PR-G `PEDDFinding`으로 만든다(§18 — rule이 실제
 * DD issue로 인정되는 경우에만). severity/status는 이 함수가 임의로
 * 추정하지 않는다 — 호출자가 명시적으로 넘겨야 한다(§17, §40 — 투자판단
 * 자동화 금지, severity 자동 생성 금지). evidence/claim은 이 batch의
 * 모든 finding이 공유하는 근거를 참조로만 연결한다(중복 저장 없음, §26) —
 * finding별로 다른 근거가 필요하면 dd-validation.ts의 `linkFindingToEvidence`/
 * `linkFindingToClaim`으로 이후에 개별 조정한다.
 */
export function buildFinancialFindings(
  ruleResults: PEDDFinancialRuleResult[],
  options: {
    idFor: (ruleResult: PEDDFinancialRuleResult) => string;
    severityFor: (ruleResult: PEDDFinancialRuleResult) => PEDDSeverity;
    statusFor?: (ruleResult: PEDDFinancialRuleResult) => PEDDFindingStatus;
    evidenceIds?: string[];
    claimIds?: string[];
  }
): PEDDFinding[] {
  return ruleResults
    .filter((r) => r.triggered)
    .map((r) =>
      createPEDDFinding({
        id: options.idFor(r),
        category: "FINANCIAL",
        subCategory: r.rule,
        title: FINANCIAL_RULE_TITLES[r.rule],
        description: describeFinancialRuleResult(r),
        severity: options.severityFor(r),
        status: options.statusFor ? options.statusFor(r) : "CONFIRMED",
        financialPeriodId: r.observation.financialPeriodId,
        evidenceIds: options.evidenceIds ?? [],
        claimIds: options.claimIds ?? [],
      })
    );
}
