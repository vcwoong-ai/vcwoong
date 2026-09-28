/**
 * PE Commercial DD — 결정론적 지표 계산 + rule 평가 + Finding 생성(PR-H).
 *
 * financial statement만으로 만들어내지 않는다(§19) — 고객/매출 데이터가
 * 실제로 존재하는 경우에만 계산한다. Prisma model을 새로 만들지 않으며
 * (§35), `PEDDCustomerRevenueInput`은 순수 TypeScript 입력 타입이다.
 */

import type { PEFinancialPeriodIdentity } from "./evidence-lineage-types";
import { createPEDDFinding } from "./dd-validation";
import type { PEDDFinding, PEDDFindingStatus, PEDDSeverity } from "./dd-types";
import type {
  PEDDCommercialMetric,
  PEDDCommercialObservation,
  PEDDCustomerRevenueInput,
  PEDDRevenueTotal,
} from "./dd-metrics-types";

function baseObservation(
  id: string,
  metric: PEDDCommercialMetric,
  financialPeriodId: string,
  unit: PEDDCommercialObservation["unit"],
  comparisonPeriodId?: string
): Omit<PEDDCommercialObservation, "status" | "inputs"> {
  return { id, metric, financialPeriodId, unit, comparisonPeriodId };
}

/**
 * §21 — 구조적 위반(빈 customerId/financialPeriodId, 동일 customerId+period
 * 중복)만 검사한다. 음수 revenue는 reject하지 않는다 — 이 저장소의 기존
 * 재무 검증 관례(financial-validation.ts의 `financeNumberSchema`는
 * `.finite()`만 요구하고 부호를 제한하지 않음, 확인됨 — adjustmentValue도
 * 음수를 정상으로 허용)를 그대로 따른 것으로, credit note/반품 등으로 인한
 * 음수 매출을 구조적으로 배제하지 않기 위함이다.
 */
export function findCustomerDatasetIssues(customers: PEDDCustomerRevenueInput[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const c of customers) {
    if (!c.customerId || !c.customerId.trim()) {
      issues.push("customerId가 비어 있는 row가 있습니다");
      continue;
    }
    if (!c.financialPeriodId || !c.financialPeriodId.trim()) {
      issues.push(`customer ${c.customerId}의 financialPeriodId가 비어 있습니다`);
      continue;
    }
    const key = `${c.customerId}|${c.financialPeriodId}`;
    if (seen.has(key)) {
      issues.push(`중복된 customer+period 조합입니다: ${key}`);
      continue;
    }
    seen.add(key);
  }
  return issues;
}

function customersForPeriod(customers: PEDDCustomerRevenueInput[], financialPeriodId: string): PEDDCustomerRevenueInput[] {
  return customers.filter((c) => c.financialPeriodId === financialPeriodId);
}

/** 정렬: revenue 내림차순, 동률이면 customerId 오름차순(§20 — 항상 동일한 순서). */
function sortDeterministic(customers: PEDDCustomerRevenueInput[]): PEDDCustomerRevenueInput[] {
  return [...customers].sort((a, b) => b.revenue - a.revenue || a.customerId.localeCompare(b.customerId));
}

/**
 * Top-N concentration = sum(top N revenue) / totalRevenue.value.
 *
 * `totalRevenue`는 반드시 명시적으로 넘긴다 — customer 목록의 합계를
 * 몰래 "전체 매출"로 간주하지 않는다(§19). `source: "SUM_OF_FULL_CUSTOMER_POPULATION"`을
 * 쓰려면 그 합계가 실제로 customer 목록 합계와 일치해야 하며(호출자의 단언을
 * 검증), 그렇지 않으면 invalid_input이다.
 */
export function calculateCustomerConcentration(
  id: string,
  metric: Extract<PEDDCommercialMetric, "CUSTOMER_CONCENTRATION_TOP1" | "CUSTOMER_CONCENTRATION_TOP3" | "CUSTOMER_CONCENTRATION_TOP5">,
  topN: 1 | 3 | 5,
  period: PEFinancialPeriodIdentity,
  customers: PEDDCustomerRevenueInput[],
  totalRevenue: PEDDRevenueTotal
): PEDDCommercialObservation {
  const base = baseObservation(id, metric, period.id, "PERCENT");

  const issues = findCustomerDatasetIssues(customers);
  if (issues.length > 0) {
    return { ...base, status: "invalid_input", inputs: {}, detail: issues.join("; ") };
  }

  const periodCustomers = customersForPeriod(customers, period.id);
  if (periodCustomers.length === 0) {
    return { ...base, status: "missing_input", inputs: {}, detail: "해당 기간의 customer revenue 데이터가 없습니다" };
  }

  const currencies = new Set(periodCustomers.map((c) => c.currency));
  if (currencies.size > 1) {
    return {
      ...base,
      status: "unsupported_currency",
      inputs: {},
      detail: `customer 데이터의 통화가 섞여 있습니다: ${Array.from(currencies).join(", ")}`,
    };
  }

  const populationSum = periodCustomers.reduce((sum, c) => sum + c.revenue, 0);
  if (totalRevenue.source === "SUM_OF_FULL_CUSTOMER_POPULATION" && totalRevenue.value !== populationSum) {
    return {
      ...base,
      status: "invalid_input",
      inputs: { populationSum, claimedTotal: totalRevenue.value },
      detail: "SUM_OF_FULL_CUSTOMER_POPULATION으로 단언했지만 customer 합계와 제공된 total이 일치하지 않습니다",
    };
  }
  if (totalRevenue.value === 0) {
    return { ...base, status: "undefined_metric", inputs: { totalRevenue: 0 }, detail: "전체 매출이 0이면 concentration을 정의할 수 없습니다" };
  }

  const sorted = sortDeterministic(periodCustomers);
  const top = sorted.slice(0, topN);
  const topSum = top.reduce((sum, c) => sum + c.revenue, 0);

  return {
    ...base,
    status: "available",
    value: topSum / totalRevenue.value,
    inputs: {
      topN,
      topCustomerIds: top.map((c) => c.customerId).join(","),
      topRevenueSum: topSum,
      totalRevenue: totalRevenue.value,
      totalRevenueSource: totalRevenue.source,
    },
  };
}

/**
 * 특정 고객 1건의 YoY 성장률(§22) — "2024년에 없고 2025년에 있음"만으로
 * churn/신규를 판단하지 않기 위해, 고객이 두 기간 모두에 존재해야 계산한다.
 * 한쪽에만 존재하면 missing_input(추정하지 않음).
 */
export function calculateCustomerRevenueGrowth(
  id: string,
  customerId: string,
  current: { period: PEFinancialPeriodIdentity; customers: PEDDCustomerRevenueInput[] },
  previous: { period: PEFinancialPeriodIdentity; customers: PEDDCustomerRevenueInput[] }
): PEDDCommercialObservation {
  const base = baseObservation(id, "CUSTOMER_REVENUE_GROWTH", current.period.id, "PERCENT", previous.period.id);
  if (current.period.periodType !== previous.period.periodType) {
    return { ...base, status: "unsupported_comparison", inputs: { customerId }, detail: `periodType 불일치: ${current.period.periodType} vs ${previous.period.periodType}` };
  }

  const curRow = customersForPeriod(current.customers, current.period.id).find((c) => c.customerId === customerId);
  const prevRow = customersForPeriod(previous.customers, previous.period.id).find((c) => c.customerId === customerId);
  if (!curRow || !prevRow) {
    return {
      ...base,
      status: "missing_input",
      inputs: { customerId },
      detail: "두 기간 모두에 해당 고객의 revenue 데이터가 있어야 성장률을 계산할 수 있습니다(단순 부재를 churn으로 추정하지 않음)",
    };
  }
  if (curRow.currency !== prevRow.currency) {
    return { ...base, status: "unsupported_currency", inputs: { customerId }, detail: `통화 불일치: ${curRow.currency} vs ${prevRow.currency}` };
  }
  const inputs = { customerId, currentRevenue: curRow.revenue, previousRevenue: prevRow.revenue };
  if (prevRow.revenue === 0) {
    return { ...base, status: "undefined_metric", inputs, detail: "이전 기간 revenue가 0이면 성장률을 정의할 수 없습니다" };
  }
  return { ...base, status: "available", value: (curRow.revenue - prevRow.revenue) / Math.abs(prevRow.revenue), inputs };
}

/**
 * Retention = (이전 기간에 revenue가 있었고 현재 기간에도 revenue가 있는
 * 고객 수) / (이전 기간에 revenue가 있었던 고객 수). 이 정의를 명시적으로
 * 채택한다(§22 — "정의되지 않은 경우 구현하지 않는다"의 반대로, 여기서는
 * 정의를 명확히 하고 구현한다). revenue 금액이 아니라 "존재 여부"만 본다.
 */
export function calculateCustomerRetention(
  id: string,
  current: { period: PEFinancialPeriodIdentity; customers: PEDDCustomerRevenueInput[] },
  previous: { period: PEFinancialPeriodIdentity; customers: PEDDCustomerRevenueInput[] }
): PEDDCommercialObservation {
  const base = baseObservation(id, "CUSTOMER_RETENTION", current.period.id, "PERCENT", previous.period.id);
  if (current.period.periodType !== previous.period.periodType) {
    return { ...base, status: "unsupported_comparison", inputs: {}, detail: `periodType 불일치: ${current.period.periodType} vs ${previous.period.periodType}` };
  }
  const prevCustomers = customersForPeriod(previous.customers, previous.period.id).filter((c) => c.revenue > 0);
  const curCustomerIds = new Set(customersForPeriod(current.customers, current.period.id).filter((c) => c.revenue > 0).map((c) => c.customerId));

  if (prevCustomers.length === 0) {
    return { ...base, status: "missing_input", inputs: {}, detail: "이전 기간에 매출이 있던 고객이 없으면 retention을 정의할 수 없습니다" };
  }
  const retained = prevCustomers.filter((c) => curCustomerIds.has(c.customerId)).length;
  return {
    ...base,
    status: "available",
    value: retained / prevCustomers.length,
    inputs: { previousActiveCustomers: prevCustomers.length, retainedCustomers: retained },
  };
}

/**
 * Recurring Revenue Ratio = recurringRevenue / totalRevenue(§23). 두 값 모두
 * 호출자가 명시적으로 넘겨야 하는 필수 인자다 — `recurringRevenue`에 기본값을
 * 두지 않음으로써 "Revenue를 recurring revenue로 자동 간주"가 이 함수
 * 시그니처상 구조적으로 불가능하다.
 */
export function calculateRecurringRevenueRatio(
  id: string,
  period: PEFinancialPeriodIdentity,
  totalRevenue: number,
  recurringRevenue: number
): PEDDCommercialObservation {
  const base = baseObservation(id, "RECURRING_REVENUE_RATIO", period.id, "PERCENT");
  const inputs = { totalRevenue, recurringRevenue };
  if (!Number.isFinite(totalRevenue) || !Number.isFinite(recurringRevenue)) {
    return { ...base, status: "invalid_input", inputs, detail: "totalRevenue/recurringRevenue가 유효한 숫자가 아닙니다" };
  }
  if (totalRevenue === 0) {
    return { ...base, status: "undefined_metric", inputs, detail: "전체 매출이 0이면 recurring revenue ratio를 정의할 수 없습니다" };
  }
  return { ...base, status: "available", value: recurringRevenue / totalRevenue, inputs };
}

// ─────────────────────────────────────────────────────────────
// Rule 평가 + Finding 생성(§25, §39, §40) — Financial과 동일한 원칙:
// threshold는 항상 호출자가 명시하고, severity/status도 이 함수가 추정하지 않는다.
// ─────────────────────────────────────────────────────────────

export interface PEDDCommercialRuleConfig {
  /** CUSTOMER_CONCENTRATION_TOP1/TOP3/TOP5 중 하나라도 이 값 이상이면 감지한다.
   * 기본값 없음 — "몇 %가 위험한 집중도인가"는 이 PR이 판단하지 않는다(§11 예시 그대로 유지). */
  concentrationThreshold?: number;
}

export type PEDDCommercialRuleName = "CUSTOMER_CONCENTRATION";

export interface PEDDCommercialRuleResult {
  rule: PEDDCommercialRuleName;
  triggered: boolean;
  observation: PEDDCommercialObservation;
}

export function evaluateCommercialRules(
  observations: PEDDCommercialObservation[],
  config: PEDDCommercialRuleConfig = {}
): PEDDCommercialRuleResult[] {
  if (config.concentrationThreshold === undefined) return [];
  const results: PEDDCommercialRuleResult[] = [];
  for (const obs of observations) {
    if (obs.status !== "available" || obs.value === undefined) continue;
    if (
      obs.metric === "CUSTOMER_CONCENTRATION_TOP1" ||
      obs.metric === "CUSTOMER_CONCENTRATION_TOP3" ||
      obs.metric === "CUSTOMER_CONCENTRATION_TOP5"
    ) {
      results.push({
        rule: "CUSTOMER_CONCENTRATION",
        triggered: obs.value >= config.concentrationThreshold,
        observation: obs,
      });
    }
  }
  return results;
}

function describeCommercialRuleResult(result: PEDDCommercialRuleResult): string {
  const pct = ((result.observation.value ?? 0) * 100).toFixed(1);
  return `${result.observation.metric} = ${pct}%`;
}

export function buildCommercialFindings(
  ruleResults: PEDDCommercialRuleResult[],
  options: {
    idFor: (ruleResult: PEDDCommercialRuleResult) => string;
    severityFor: (ruleResult: PEDDCommercialRuleResult) => PEDDSeverity;
    statusFor?: (ruleResult: PEDDCommercialRuleResult) => PEDDFindingStatus;
    evidenceIds?: string[];
    claimIds?: string[];
  }
): PEDDFinding[] {
  return ruleResults
    .filter((r) => r.triggered)
    .map((r) =>
      createPEDDFinding({
        id: options.idFor(r),
        category: "COMMERCIAL",
        subCategory: "CUSTOMER_CONCENTRATION",
        title: "Customer concentration",
        description: describeCommercialRuleResult(r),
        severity: options.severityFor(r),
        status: options.statusFor ? options.statusFor(r) : "CONFIRMED",
        financialPeriodId: r.observation.financialPeriodId,
        evidenceIds: options.evidenceIds ?? [],
        claimIds: options.claimIds ?? [],
      })
    );
}
