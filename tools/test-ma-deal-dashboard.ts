/**
 * PE IC Decision Dashboard 조립 레이어(src/lib/pe/ma-deal-dashboard.ts) 검증.
 *
 * 이 파일은 financial-normalization.ts/qoe.ts/qoe-lbo-bridge.ts 자체의
 * 계산을 재검증하지 않는다(각자 test:financial-normalization,
 * test:qoe, test:qoe-lbo-bridge가 이미 담당). 여기서는 "그 엔진들의
 * 출력을 대시보드가 올바르게 골라 담고 비교하는지"만 확인한다.
 *
 * Usage: npm run test:ma-deal-dashboard
 */
import {
  computeQoESummary,
  computeLboEntryEbitda,
  computeDartStatus,
  computeFinancialQuality,
  computeReadinessMatrix,
  computeMissingInformation,
  type DashboardPeriod,
} from "../src/lib/pe/ma-deal-dashboard";
import type { FinancialCalcResult } from "../src/lib/pe/financial-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function ok(value: number): FinancialCalcResult {
  return { status: "ok", value };
}
const missing: FinancialCalcResult = { status: "missing_input", missing: ["EBITDA"] };

function period(overrides: Partial<DashboardPeriod> & { fiscalYear: number }): DashboardPeriod {
  return {
    id: `period-${overrides.fiscalYear}-${overrides.periodType ?? "ANNUAL"}`,
    periodType: "ANNUAL",
    currency: "KRW",
    lineItems: [],
    adjustments: [],
    normalizedSummary: { revenue: missing, ebitda: missing, netDebt: missing },
    ...overrides,
  };
}

// ── QoE Summary: APPROVED만 반영, 전체 합산과 다름을 확인 ──────────────

function testQoESummaryOnlyReflectsApprovedAdjustments() {
  const p = period({
    fiscalYear: 2024,
    lineItems: [{ lineItem: "EBITDA", value: 5_000_000_000, currency: "KRW", source: "MANUAL" }],
    adjustments: [
      { metric: "EBITDA", reportedValue: 5_000_000_000, adjustmentValue: 1_000_000_000, reason: "승인된 조정", status: "APPROVED", adjustmentType: "OTHER", source: "MANUAL" },
      { metric: "EBITDA", reportedValue: 5_000_000_000, adjustmentValue: 2_000_000_000, reason: "아직 초안", status: "DRAFT", adjustmentType: "OTHER", source: "MANUAL" },
      { metric: "EBITDA", reportedValue: 5_000_000_000, adjustmentValue: -500_000_000, reason: "반려됨", status: "REJECTED", adjustmentType: "OTHER", source: "MANUAL" },
    ],
  });
  const summary = computeQoESummary(p);
  assert(summary.reportedEbitda.status === "ok" && summary.reportedEbitda.value === 5_000_000_000, "reportedEbitda는 base EBITDA 그대로여야 함");
  assert(summary.adjustedEbitda.status === "ok" && summary.adjustedEbitda.value === 6_000_000_000, `승인된 조정(+10억)만 반영해야 함(DRAFT/REJECTED 제외), got ${JSON.stringify(summary.adjustedEbitda)}`);
  assert(summary.counts.total === 3 && summary.counts.approved === 1 && summary.counts.draft === 1 && summary.counts.rejected === 1, "상태별 개수가 정확해야 함");
  console.log("✅ QoE 요약은 APPROVED 조정만 Adjusted EBITDA에 반영(DRAFT/REJECTED 제외, 전체 합산 아님)");
}

function testQoESummaryWithNoAdjustmentsEqualsBase() {
  const p = period({
    fiscalYear: 2024,
    lineItems: [{ lineItem: "EBITDA", value: 3_000_000_000, currency: "KRW", source: "MANUAL" }],
  });
  const summary = computeQoESummary(p);
  assert(summary.adjustedEbitda.status === "ok" && summary.adjustedEbitda.value === 3_000_000_000, "조정이 없으면 Adjusted EBITDA = Base EBITDA");
  assert(summary.counts.total === 0, "조정 개수는 0이어야 함");
  console.log("✅ 조정이 없으면 Adjusted EBITDA = Base EBITDA, 개수 0");
}

function testQoESummaryMissingBaseEbitdaPropagates() {
  const p = period({ fiscalYear: 2024, lineItems: [] });
  const summary = computeQoESummary(p);
  assert(summary.reportedEbitda.status === "missing_input", "EBITDA 계정이 없으면 missing_input이어야 함");
  assert(summary.adjustedEbitda.status === "missing_input", "base가 missing이면 adjusted도 missing이어야 함(0으로 대체 금지)");
  console.log("✅ EBITDA 계정 자체가 없으면 reported/adjusted 모두 missing_input(0 아님)");
}

// ── LBO Entry EBITDA 브릿지 ────────────────────────────────────────────

function testLboEntryEbitdaBridgeSuccess() {
  const p = period({
    fiscalYear: 2024,
    lineItems: [{ lineItem: "EBITDA", value: 12_550_000_000, currency: "KRW", source: "MANUAL" }],
  });
  const qoe = computeQoESummary(p);
  const result = computeLboEntryEbitda(p, qoe);
  assert(result.status === "ok", `브릿지가 성공해야 함, got ${JSON.stringify(result)}`);
  if (result.status === "ok") {
    assert(result.lbo.entryEbitdaInEok === 125.5, `억원 환산이 정확해야 함(12,550,000,000원 → 125.5억원), got ${result.lbo.entryEbitdaInEok}`);
    assert(result.provenance.fiscalPeriod === "FY2024", "provenance에 기간 라벨이 있어야 함");
  }
  console.log("✅ LBO Entry EBITDA 브릿지: QoE(승인) Adjusted EBITDA를 원→억원으로 정확히 환산");
}

function testLboEntryEbitdaBridgeMissingWhenNoPeriod() {
  const result = computeLboEntryEbitda(null, null);
  assert(result.status === "no_period", "재무기간이 없으면 브릿지를 호출하지 않고 no_period를 반환해야 함");
  console.log("✅ 재무기간이 없으면 LBO Entry EBITDA는 no_period(0 아님)");
}

function testLboEntryEbitdaBridgeMissingWhenEbitdaMissing() {
  const p = period({ fiscalYear: 2024, lineItems: [] });
  const qoe = computeQoESummary(p);
  const result = computeLboEntryEbitda(p, qoe);
  assert(result.status === "missing_input", `EBITDA가 없으면 missing_input이어야 함, got ${JSON.stringify(result)}`);
  console.log("✅ EBITDA를 계산할 수 없으면 LBO Entry EBITDA도 missing_input(0 아님)");
}

// ── DART 상태 ──────────────────────────────────────────────────────────

function testDartStatusDetectsImportedPeriods() {
  const p1 = period({ fiscalYear: 2023, lineItems: [{ lineItem: "REVENUE", value: 1, currency: "KRW", source: "MANUAL" }] });
  const p2 = period({ fiscalYear: 2024, lineItems: [{ lineItem: "REVENUE", value: 1, currency: "KRW", source: "DART" }] });
  const status = computeDartStatus([p2, p1]);
  assert(status.imported === true && status.periodsCount === 1 && status.latestFiscalYear === 2024, "DART 출처 line item이 있는 기간만 집계해야 함");
  console.log("✅ DART 상태: source=DART line item이 있는 기간만 '연동됨'으로 집계");
}

function testDartStatusNoneImported() {
  const p1 = period({ fiscalYear: 2024, lineItems: [{ lineItem: "REVENUE", value: 1, currency: "KRW", source: "MANUAL" }] });
  const status = computeDartStatus([p1]);
  assert(status.imported === false && status.latestFiscalYear === null, "DART 데이터가 없으면 미연동이어야 함");
  console.log("✅ DART 데이터가 없으면 미연동(imported=false, latestFiscalYear=null)");
}

// ── 재무 품질(성장률 포함) ─────────────────────────────────────────────

function testFinancialQualityComputesGrowthAndRatios() {
  const p2023 = period({ fiscalYear: 2023, normalizedSummary: { revenue: ok(1_000_000_000), ebitda: ok(200_000_000), netDebt: ok(300_000_000) } });
  const p2024 = period({ fiscalYear: 2024, normalizedSummary: { revenue: ok(1_500_000_000), ebitda: ok(300_000_000), netDebt: ok(300_000_000) } });
  const summary = computeFinancialQuality([p2024, p2023]);
  assert(summary.latestPeriodLabel === "FY2024", "최근 기간 라벨이 맞아야 함");
  assert(summary.revenueGrowth.status === "ok" && Math.abs(summary.revenueGrowth.value - 0.5) < 1e-9, `매출 성장률 50%여야 함, got ${JSON.stringify(summary.revenueGrowth)}`);
  assert(summary.ebitdaMargin.status === "ok" && Math.abs(summary.ebitdaMargin.value - 0.2) < 1e-9, "EBITDA 마진 20%여야 함");
  assert(summary.netDebtToEbitda.status === "ok" && Math.abs(summary.netDebtToEbitda.value - 1) < 1e-9, "Net Debt/EBITDA는 1.0이어야 함");
  console.log("✅ 재무 품질: 두 기간(같은 periodType) 비교로 매출성장률·EBITDA마진·NetDebt/EBITDA 정확히 계산");
}

function testFinancialQualityHandlesMissingGracefully() {
  const summary = computeFinancialQuality([]);
  assert(summary.latestPeriodLabel === null, "기간이 없으면 라벨은 null이어야 함");
  assert(summary.revenueGrowth.status === "not_available", "기간이 없으면 성장률은 not_available이어야 함(0 아님)");
  console.log("✅ 재무기간이 없으면 전부 not_available/missing(0으로 대체 금지)");
}

function testFinancialQualityGrowthNotAvailableWithoutPriorPeriod() {
  const p2024 = period({ fiscalYear: 2024, normalizedSummary: { revenue: ok(1_000_000_000), ebitda: ok(200_000_000), netDebt: missing } });
  const summary = computeFinancialQuality([p2024]);
  assert(summary.revenueGrowth.status === "not_available", "비교할 직전 기간이 없으면 성장률은 not_available이어야 함");
  console.log("✅ 비교 가능한 직전 기간이 없으면 성장률은 not_available");
}

// ── Decision Readiness ────────────────────────────────────────────────

function testReadinessMatrixAllReadyWhenDataComplete() {
  const rows = computeReadinessMatrix({
    hasPeriods: true,
    latestEbitda: ok(1),
    latestQoEAdjustmentCount: 2,
    dartImported: true,
    lboEntryEbitdaAvailable: true,
  });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.state]));
  assert(byKey.financial === "READY", "재무 데이터가 있으면 READY");
  assert(byKey.qoe === "READY", "QoE 조정이 1건 이상이면 READY");
  assert(byKey.dart === "READY", "DART가 연동되면 READY");
  assert(byKey.lbo === "PARTIAL", "LBO는 입력이 준비돼도 영속화된 확정 케이스가 없어 PARTIAL을 넘지 않아야 함");
  assert(byKey["commercial-dd"] === "NOT_STARTED", "DD는 영속화 모델이 없어 항상 NOT_STARTED여야 함");
  assert(rows.length === 4 + 10, "재무/QoE/DART/LBO 4개 + DD 10개 = 14행이어야 함");
  console.log("✅ 데이터가 모두 있으면 재무/QoE/DART=READY, LBO=PARTIAL(자동 READY 없음), DD 10종=NOT_STARTED");
}

function testReadinessMatrixNotStartedWhenNoPeriods() {
  const rows = computeReadinessMatrix({
    hasPeriods: false,
    latestEbitda: null,
    latestQoEAdjustmentCount: 0,
    dartImported: false,
    lboEntryEbitdaAvailable: false,
  });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.state]));
  assert(byKey.financial === "NOT_STARTED" && byKey.qoe === "NOT_STARTED", "재무기간이 아예 없으면 재무/QoE 모두 NOT_STARTED");
  assert(byKey.lbo === "MISSING", "EBITDA를 못 구하면 LBO는 MISSING");
  console.log("✅ 재무 데이터가 전혀 없으면 재무/QoE=NOT_STARTED, LBO=MISSING");
}

function testReadinessMatrixPartialQoeWhenNoAdjustmentsReviewed() {
  const rows = computeReadinessMatrix({
    hasPeriods: true,
    latestEbitda: ok(1),
    latestQoEAdjustmentCount: 0,
    dartImported: false,
    lboEntryEbitdaAvailable: true,
  });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.state]));
  assert(byKey.qoe === "PARTIAL", "EBITDA는 있지만 QoE 조정 검토가 없으면 PARTIAL이어야 함(자동 READY 금지)");
  console.log("✅ EBITDA는 있지만 QoE 조정 기록이 없으면 QoE=PARTIAL(검토 안 됐다고 정직하게 표시)");
}

// ── Missing Information ───────────────────────────────────────────────

function testMissingInformationListsGaps() {
  const items = computeMissingInformation({
    hasPeriods: false,
    latestEbitda: null,
    latestQoEAdjustmentCount: 0,
    dartImported: false,
    lboEntryEbitdaAvailable: false,
  });
  const ids = items.map((i) => i.id);
  assert(ids.includes("no-financials"), "재무기간 없음이 목록에 있어야 함");
  assert(ids.includes("dart-not-imported"), "DART 미연동이 목록에 있어야 함");
  assert(ids.includes("lbo-input-missing"), "LBO 입력 부족이 목록에 있어야 함");
  assert(ids.includes("dd-not-started"), "DD 미적재가 목록에 있어야 함(항상 포함)");
  console.log("✅ 데이터가 전혀 없을 때 미확인 목록이 실제 부재를 정확히 나열(추정 없음)");
}

function testMissingInformationEmptyWhenComplete() {
  const items = computeMissingInformation({
    hasPeriods: true,
    latestEbitda: ok(1),
    latestQoEAdjustmentCount: 1,
    dartImported: true,
    lboEntryEbitdaAvailable: true,
  });
  const ids = items.map((i) => i.id);
  assert(!ids.includes("no-financials") && !ids.includes("dart-not-imported") && !ids.includes("lbo-input-missing"), "데이터가 갖춰지면 해당 항목은 목록에서 빠져야 함");
  assert(ids.includes("dd-not-started"), "DD는 영속화 모델이 없는 한 항상 목록에 남아야 함");
  console.log("✅ 데이터가 갖춰지면 해당 gap은 목록에서 제외되지만 DD 미적재는 계속 표시됨");
}

function main() {
  console.log("\n=== PE IC Decision Dashboard 조립 레이어 테스트 ===\n");
  testQoESummaryOnlyReflectsApprovedAdjustments();
  testQoESummaryWithNoAdjustmentsEqualsBase();
  testQoESummaryMissingBaseEbitdaPropagates();
  testLboEntryEbitdaBridgeSuccess();
  testLboEntryEbitdaBridgeMissingWhenNoPeriod();
  testLboEntryEbitdaBridgeMissingWhenEbitdaMissing();
  testDartStatusDetectsImportedPeriods();
  testDartStatusNoneImported();
  testFinancialQualityComputesGrowthAndRatios();
  testFinancialQualityHandlesMissingGracefully();
  testFinancialQualityGrowthNotAvailableWithoutPriorPeriod();
  testReadinessMatrixAllReadyWhenDataComplete();
  testReadinessMatrixNotStartedWhenNoPeriods();
  testReadinessMatrixPartialQoeWhenNoAdjustmentsReviewed();
  testMissingInformationListsGaps();
  testMissingInformationEmptyWhenComplete();
  console.log("\n✅ PE IC Decision Dashboard 조립 레이어 테스트 통과\n");
}

main();
