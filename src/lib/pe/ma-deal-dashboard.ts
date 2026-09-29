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
 * ## Decision Readiness(PR #104부터)
 *
 * "이 딜이 지금 얼마나 준비됐는가"는 더 이상 이 파일이 판단하지 않는다.
 * PR #103의 `buildPEDecisionReadiness()`(pe-decision-readiness.ts, 수정하지
 * 않음)가 유일한 판정처다 — 이 파일은 그 함수가 요구하는 입력 모양으로
 * 변환하는 `toPEDecisionReadinessInput()`만 제공한다(새 판단 로직 없음,
 * 순수 매핑). 이전에 여기 있던 `computeReadinessMatrix`/
 * `computeMissingInformation`(자체 readiness 판정 — 예: "조정 0건이면
 * QOE=PARTIAL")은 PR #103 엔진의 판정과 어긋날 수 있는 중복 로직이라
 * 제거했다.
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
import type { PEDecisionAdjustmentRow, PEDecisionReadinessInput } from "./pe-decision-readiness";
import type { PEDDCase } from "./dd-types";
import type { PEEvidenceLineage } from "./evidence-lineage-types";

export interface DashboardLineItemRow {
  /** PR #104부터 필수 — pe-decision-readiness.ts의 fact-conflict 표시에 실제 DB id로 필요함 */
  id: string;
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

// ── Decision Readiness 입력 변환(판단 없음 — pe-decision-readiness.ts로 그대로 전달) ──

/**
 * `DashboardPeriod[]`(이미 이 파일의 다른 함수들이 쓰는 모양)를
 * `buildPEDecisionReadiness()`(pe-decision-readiness.ts, PR #103, 수정 없음)의
 * 입력 모양으로 옮겨 담기만 한다 — 새 판단/계산 없음.
 *
 * `lboAssumptions`/`commercialCustomers`는 여전히 어떤 실제 딜에도 영속화할
 * 방법이 없으므로(LBO 시뮬레이터는 세션 한정 클라이언트 state일 뿐 DB
 * 테이블이 없음 — lbo-simulator-panel.tsx 참고. 고객 매출 데이터셋도
 * schema.prisma에 없음) 계속 undefined로 둔다.
 *
 * `ddCase`/`evidenceLineage`는 PR #105부터 실제로 영속화되므로(PEDDCase/
 * PEDDFinding/PEEvidence) `extra` 인자로 받으면 그대로 전달한다(PR #107) —
 * 호출자(page.tsx)가 이미 조회해 온 값을 옮겨 담을 뿐, 여기서 새로 조회하거나
 * 판단하지 않는다.
 */
export function toPEDecisionReadinessInput(
  periods: DashboardPeriod[],
  extra?: { ddCase?: PEDDCase; evidenceLineage?: PEEvidenceLineage }
): PEDecisionReadinessInput {
  return {
    ddCase: extra?.ddCase,
    evidenceLineage: extra?.evidenceLineage,
    periods: periods.map((p) => ({
      id: p.id,
      fiscalYear: p.fiscalYear,
      periodType: p.periodType,
      currency: p.currency,
      lineItems: p.lineItems.map((li) => ({
        id: li.id,
        lineItem: li.lineItem,
        value: li.value,
        currency: li.currency,
        source: li.source,
        sourceName: li.sourceName,
        sourceLocation: li.sourceLocation,
      })),
      adjustments: p.adjustments as unknown as PEDecisionAdjustmentRow[],
      normalizedSummary: {
        revenue: p.normalizedSummary.revenue,
        ebitda: p.normalizedSummary.ebitda,
        netDebt: p.normalizedSummary.netDebt,
      },
    })),
  };
}
