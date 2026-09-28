/**
 * PE IC Decision Dashboard — 조회 조립 레이어(PR #102).
 *
 * 이 파일은 새 재무/QoE/LBO 계산을 하지 않는다. 이미 존재하는 엔진의
 * 출력을 "IC가 한눈에 보기 좋은 모양"으로 골라 담고 비교할 뿐이다:
 * - 재무 정규화: financial-normalization.ts(PR-B, 수정 없음)
 * - QoE(승인된 조정만 반영): qoe.ts(PR-D, 수정 없음) — 상세 화면(PR #101)이
 *   써온 normalizeFinancialPeriod().adjustedEbitda는 상태와 무관하게 전체
 *   조정을 합산하므로, IC 대시보드는 대신 이 파일을 써서 "승인된 것만"
 *   반영한 값을 보여준다(§7 요구사항 — 승인 아닌 조정을 승인된 것처럼
 *   보이면 안 됨).
 * - QoE→LBO 브릿지: qoe-lbo-bridge.ts(PR-E, 수정 없음) — Entry EBITDA(억원)를
 *   임의로 지어내지 않고 이 브릿지의 provenance 그대로 노출한다.
 *
 * DD(실사)/evidence-lineage는 아직 Prisma에 영속화 모델이 없다(schema.prisma
 * 확인 — MADeal/MADocument/MAReport/MAReportSection/MAFinancialPeriod/
 * MAFinancialLineItem/MAFinancialAdjustment뿐). 그래서 이 대시보드의 DD
 * 카테고리는 전부 NOT_STARTED로 표시한다 — AI로 추정하지 않고 실제
 * 데이터 부재를 그대로 보여준다.
 */

import { calculateAdjustedEbitda, type QoEResult } from "./qoe";
import { bridgeQoEToLboEntryEbitda, type QoEToLboBridgeResult, type QoEToLboBridgePeriodIdentity } from "./qoe-lbo-bridge";
import type {
  CanonicalLineItem,
  FinancialCalcResult,
  FinancialLineItemInput,
  MaFinancialSourceType,
} from "./financial-types";
import type { QoEAdjustmentInput, QoEAdjustmentStatus } from "./qoe-types";

export interface DashboardLineItemRow {
  lineItem: string;
  value: number;
  currency: string;
  source: string;
  sourceName?: string | null;
  sourceLocation?: string | null;
}

export interface DashboardAdjustmentRow {
  metric: string;
  reportedValue: number;
  adjustmentValue: number;
  reason: string;
  status: QoEAdjustmentStatus;
  adjustmentType: string;
  source: string;
  sourceName?: string | null;
  sourceLocation?: string | null;
}

export interface DashboardPeriod {
  id: string;
  fiscalYear: number;
  periodType: "ANNUAL" | "QUARTERLY" | "TTM";
  currency: string;
  lineItems: DashboardLineItemRow[];
  adjustments: DashboardAdjustmentRow[];
  /** 이미 계산된 값(page.tsx가 financials route와 동일한 normalizeFinancialPeriod 호출로 산출) — 여기서 다시 계산하지 않는다 */
  normalizedSummary: {
    revenue: FinancialCalcResult;
    ebitda: FinancialCalcResult;
    netDebt: FinancialCalcResult;
  };
}

function toFinancialLineItemInputs(lineItems: DashboardLineItemRow[]): FinancialLineItemInput[] {
  return lineItems.map((li) => ({
    lineItem: li.lineItem as CanonicalLineItem,
    value: li.value,
    currency: li.currency,
    sourceType: li.source as MaFinancialSourceType,
    sourceName: li.sourceName ?? undefined,
    sourceLocation: li.sourceLocation ?? undefined,
  }));
}

function toQoEAdjustmentInputs(adjustments: DashboardAdjustmentRow[]): QoEAdjustmentInput[] {
  return adjustments.map((a) => ({
    metric: a.metric as CanonicalLineItem,
    reportedValue: a.reportedValue,
    adjustmentValue: a.adjustmentValue,
    reason: a.reason,
    adjustmentType: a.adjustmentType as QoEAdjustmentInput["adjustmentType"],
    status: a.status,
    sourceType: a.source as MaFinancialSourceType,
    sourceName: a.sourceName ?? undefined,
    sourceLocation: a.sourceLocation ?? undefined,
  }));
}

// ── QoE Summary ───────────────────────────────────────────────────────────

export interface QoEAdjustmentCounts {
  total: number;
  approved: number;
  proposed: number;
  draft: number;
  rejected: number;
}

export interface QoESummaryView {
  reportedEbitda: FinancialCalcResult;
  /** qoe.ts calculateAdjustedEbitda — APPROVED 조정만 반영(전체 합산 아님) */
  adjustedEbitda: FinancialCalcResult;
  approvedAdjustmentTotal: number;
  counts: QoEAdjustmentCounts;
}

function countByStatus(adjustments: DashboardAdjustmentRow[]): QoEAdjustmentCounts {
  return {
    total: adjustments.length,
    approved: adjustments.filter((a) => a.status === "APPROVED").length,
    proposed: adjustments.filter((a) => a.status === "PROPOSED").length,
    draft: adjustments.filter((a) => a.status === "DRAFT").length,
    rejected: adjustments.filter((a) => a.status === "REJECTED").length,
  };
}

export function computeQoESummary(period: DashboardPeriod): QoESummaryView {
  const result: QoEResult = calculateAdjustedEbitda(
    period.currency,
    toFinancialLineItemInputs(period.lineItems),
    toQoEAdjustmentInputs(period.adjustments)
  );
  return {
    reportedEbitda: result.baseEbitda,
    adjustedEbitda: result.adjustedEbitda,
    approvedAdjustmentTotal: result.approvedAdjustmentTotal,
    counts: countByStatus(period.adjustments),
  };
}

// ── LBO Entry EBITDA (QoE → LBO bridge) ─────────────────────────────────

/** period가 없거나 QoE 계산이 안 되면 브릿지를 아예 호출하지 않고 그 이유를 그대로 반환한다 */
export function computeLboEntryEbitda(
  period: DashboardPeriod | null,
  qoe: QoESummaryView | null
): QoEToLboBridgeResult | { status: "no_period" } {
  if (!period || !qoe) return { status: "no_period" };
  const identity: QoEToLboBridgePeriodIdentity = {
    financialPeriodId: period.id,
    fiscalYear: period.fiscalYear,
    periodType: period.periodType,
  };
  const qoeResult: QoEResult = {
    baseEbitda: qoe.reportedEbitda,
    adjustedEbitda: qoe.adjustedEbitda,
    approvedAdjustmentTotal: qoe.approvedAdjustmentTotal,
    allAdjustments: toQoEAdjustmentInputs(period.adjustments),
  };
  return bridgeQoEToLboEntryEbitda(identity, period.currency, qoeResult);
}

// ── DART 연동 상태 ────────────────────────────────────────────────────────

export interface DartStatusView {
  imported: boolean;
  periodsCount: number;
  latestFiscalYear: number | null;
}

export function computeDartStatus(periods: DashboardPeriod[]): DartStatusView {
  const dartPeriods = periods.filter((p) => p.lineItems.some((li) => li.source === "DART"));
  return {
    imported: dartPeriods.length > 0,
    periodsCount: dartPeriods.length,
    latestFiscalYear:
      dartPeriods.length > 0 ? Math.max(...dartPeriods.map((p) => p.fiscalYear)) : null,
  };
}

// ── 재무 품질 요약(Key Investment Facts) ─────────────────────────────────

export type DerivedRatio = { status: "ok"; value: number } | { status: "not_available" };

export interface FinancialQualityView {
  latestPeriodLabel: string | null;
  revenue: FinancialCalcResult;
  /** 같은 periodType의 직전 기간 대비 성장률 — 두 기간 모두 revenue가 ok일 때만 계산 */
  revenueGrowth: DerivedRatio;
  ebitda: FinancialCalcResult;
  ebitdaMargin: DerivedRatio;
  netDebt: FinancialCalcResult;
  netDebtToEbitda: DerivedRatio;
}

function ratio(numerator: FinancialCalcResult, denominator: FinancialCalcResult): DerivedRatio {
  if (numerator.status !== "ok" || denominator.status !== "ok") return { status: "not_available" };
  if (denominator.value === 0) return { status: "not_available" };
  return { status: "ok", value: numerator.value / denominator.value };
}

function periodLabel(p: DashboardPeriod): string {
  return p.periodType === "ANNUAL" ? `FY${p.fiscalYear}` : `FY${p.fiscalYear} ${p.periodType}`;
}

export function computeFinancialQuality(periods: DashboardPeriod[]): FinancialQualityView {
  if (periods.length === 0) {
    const notAvailable: FinancialCalcResult = { status: "missing_input", missing: [] };
    return {
      latestPeriodLabel: null,
      revenue: notAvailable,
      revenueGrowth: { status: "not_available" },
      ebitda: notAvailable,
      ebitdaMargin: { status: "not_available" },
      netDebt: notAvailable,
      netDebtToEbitda: { status: "not_available" },
    };
  }

  const latest = periods[0];
  const priorSamePeriodType = periods
    .slice(1)
    .find((p) => p.periodType === latest.periodType);

  const revenueGrowth: DerivedRatio =
    priorSamePeriodType &&
    latest.normalizedSummary.revenue.status === "ok" &&
    priorSamePeriodType.normalizedSummary.revenue.status === "ok" &&
    priorSamePeriodType.normalizedSummary.revenue.value !== 0
      ? {
          status: "ok",
          value:
            (latest.normalizedSummary.revenue.value -
              priorSamePeriodType.normalizedSummary.revenue.value) /
            priorSamePeriodType.normalizedSummary.revenue.value,
        }
      : { status: "not_available" };

  return {
    latestPeriodLabel: periodLabel(latest),
    revenue: latest.normalizedSummary.revenue,
    revenueGrowth,
    ebitda: latest.normalizedSummary.ebitda,
    ebitdaMargin: ratio(latest.normalizedSummary.ebitda, latest.normalizedSummary.revenue),
    netDebt: latest.normalizedSummary.netDebt,
    netDebtToEbitda: ratio(latest.normalizedSummary.netDebt, latest.normalizedSummary.ebitda),
  };
}

// ── Decision Readiness ────────────────────────────────────────────────────

export type ReadinessState = "READY" | "PARTIAL" | "MISSING" | "NOT_STARTED";

export interface ReadinessRow {
  key: string;
  label: string;
  state: ReadinessState;
}

/** DD는 아직 영속화 모델이 없어 데이터 자체가 존재할 수 없다 — 항상 NOT_STARTED. */
const DD_CATEGORY_LABELS: Array<{ key: string; label: string }> = [
  { key: "commercial-dd", label: "상업 실사" },
  { key: "operational-dd", label: "운영 실사" },
  { key: "legal-dd", label: "법무 실사" },
  { key: "tax-dd", label: "세무 실사" },
  { key: "hr-dd", label: "인사 실사" },
  { key: "technology-dd", label: "기술 실사" },
  { key: "it-security-dd", label: "IT 보안 실사" },
  { key: "regulatory-dd", label: "규제 실사" },
  { key: "esg-dd", label: "ESG 실사" },
  { key: "management-dd", label: "경영진 실사" },
];

export interface ReadinessInput {
  hasPeriods: boolean;
  latestEbitda: FinancialCalcResult | null;
  latestQoEAdjustmentCount: number;
  dartImported: boolean;
  lboEntryEbitdaAvailable: boolean;
}

/**
 * 각 행의 판정 규칙(결정적, AI/주관적 점수 없음):
 *
 * - FINANCIAL: 재무기간이 없으면 NOT_STARTED, 있는데 최근 기간 EBITDA를
 *   못 구하면(필수 계정 누락) MISSING, 구해지면 READY.
 * - QOE: 재무기간이 없으면 NOT_STARTED, EBITDA를 못 구하면(QoE 계산 자체가
 *   불가능) MISSING, EBITDA는 구해지는데 조정 기록이 하나도 없으면(=아직
 *   아무도 QoE 검토를 안 함) PARTIAL, 조정이 1건이라도 있으면 READY.
 * - DART: 임포트된 적 없으면 NOT_STARTED, 있으면 READY.
 * - LBO: (QoE 승인 반영) Entry EBITDA를 브릿지가 못 만들면 MISSING, 만들면
 *   PARTIAL — 영속화된 "IC가 확정한 케이스"가 없으므로 READY는 절대
 *   자동으로 매기지 않는다(사람이 실제로 시뮬레이션을 검토·확정해야 READY).
 * - DD 10종: 영속화 모델 자체가 없으므로 전부 NOT_STARTED.
 */
export function computeReadinessMatrix(input: ReadinessInput): ReadinessRow[] {
  const financial: ReadinessState = !input.hasPeriods
    ? "NOT_STARTED"
    : input.latestEbitda?.status === "ok"
      ? "READY"
      : "MISSING";

  const qoe: ReadinessState = !input.hasPeriods
    ? "NOT_STARTED"
    : input.latestEbitda?.status !== "ok"
      ? "MISSING"
      : input.latestQoEAdjustmentCount > 0
        ? "READY"
        : "PARTIAL";

  const dart: ReadinessState = input.dartImported ? "READY" : "NOT_STARTED";

  const lbo: ReadinessState = input.lboEntryEbitdaAvailable ? "PARTIAL" : "MISSING";

  return [
    { key: "financial", label: "재무", state: financial },
    { key: "qoe", label: "QoE", state: qoe },
    { key: "dart", label: "DART", state: dart },
    { key: "lbo", label: "LBO", state: lbo },
    ...DD_CATEGORY_LABELS.map((c) => ({ ...c, state: "NOT_STARTED" as ReadinessState })),
  ];
}

// ── 미확인/추가 확인 필요 ───────────────────────────────────────────────

export interface MissingInfoItem {
  id: string;
  label: string;
}

export function computeMissingInformation(input: ReadinessInput): MissingInfoItem[] {
  const items: MissingInfoItem[] = [];
  if (!input.hasPeriods) {
    items.push({ id: "no-financials", label: "등록된 재무 기간이 없습니다" });
  } else if (input.latestEbitda?.status !== "ok") {
    items.push({
      id: "ebitda-missing",
      label: "최근 재무기간에서 EBITDA를 계산할 수 없습니다(필요 계정 누락)",
    });
  }
  if (input.hasPeriods && input.latestQoEAdjustmentCount === 0) {
    items.push({ id: "qoe-not-reviewed", label: "QoE 조정 검토가 아직 이뤄지지 않았습니다" });
  }
  if (!input.dartImported) {
    items.push({ id: "dart-not-imported", label: "DART 공시 데이터가 아직 연동되지 않았습니다" });
  }
  if (!input.lboEntryEbitdaAvailable) {
    items.push({
      id: "lbo-input-missing",
      label: "LBO 시뮬레이션에 필요한 Entry EBITDA를 아직 계산할 수 없습니다",
    });
  }
  items.push({
    id: "dd-not-started",
    label: "실사(DD) 데이터가 아직 적재되지 않았습니다(상업·운영·법무·세무 등 전 카테고리)",
  });
  return items;
}
