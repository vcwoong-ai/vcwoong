/**
 * PE Financial DD Engine(PR-H) 검증 — 지표 계산(§4~§18) + Financial↔QoE↔LBO
 * end-to-end(§27, Fixture H).
 *
 * §38 요구대로 mock이 아니라 실제 normalizeFinancialPeriod()(PR-B)/
 * calculateAdjustedEbitda()(PR-D)/bridgeQoEToLboEntryEbitda()(PR-E)/
 * buildPEEvidenceLineage()·validatePEEvidenceLineage()(PR-F)/
 * buildPEDDCase()·validatePEDDCase()(PR-G)를 그대로 호출한다.
 *
 * Commercial DD 테스트는 tools/test-dd-commercial.ts에 분리되어 있다(§44
 * 회귀 체크리스트가 test:dd-financial/test:dd-commercial을 별도 항목으로
 * 요구함).
 *
 * Usage: npm run test:dd-financial
 */
import { normalizeFinancialPeriod } from "../src/lib/pe/financial-normalization";
import { calculateAdjustedEbitda } from "../src/lib/pe/qoe";
import { bridgeQoEToLboEntryEbitda } from "../src/lib/pe/qoe-lbo-bridge";
import type { FinancialLineItemInput } from "../src/lib/pe/financial-types";
import type { QoEAdjustmentInput } from "../src/lib/pe/qoe-types";
import type { PEFinancialPeriodIdentity, PEEvidenceLineage } from "../src/lib/pe/evidence-lineage-types";
import {
  createEvidenceSource,
  createEvidenceItem,
  createClaim,
  createFinancialFactReference,
  createQoEAdjustmentReference,
  createQoEResultLineageReference,
  createLboBridgeLineageReference,
  linkClaimToEvidence,
  linkFinancialFactToClaim,
  linkAdjustmentToEvidence,
  linkAdjustmentToClaim,
  buildPEEvidenceLineage,
} from "../src/lib/pe/evidence-lineage";
import { buildPEDDCase, validatePEDDCase } from "../src/lib/pe/dd-lineage";
import {
  calculateRevenueGrowth,
  calculateRevenueCagr,
  calculateEbitdaMargin,
  calculateEbitdaGrowth,
  calculateEbitdaMarginChange,
  calculateAdjustedEbitdaRatio,
  calculateTotalAssetsGrowth,
  calculateTotalLiabilitiesGrowth,
  calculateEquityGrowth,
  calculateNetDebt,
  calculateLeverage,
  evaluateFinancialRules,
  buildFinancialFindings,
  type PEDDFinancialPeriodInputs,
} from "../src/lib/pe/dd-financial";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const EOK = 100_000_000; // 1억원 = raw KRW 1e8

function fy(fiscalYear: number, id?: string): PEFinancialPeriodIdentity {
  return { id: id ?? `period_fy${fiscalYear}`, fiscalYear, periodType: "ANNUAL", currency: "KRW" };
}

function li(overrides: Partial<FinancialLineItemInput> & Pick<FinancialLineItemInput, "lineItem" | "value">): FinancialLineItemInput {
  return { currency: "KRW", sourceType: "MANUAL", ...overrides };
}

function periodInputs(period: PEFinancialPeriodIdentity, lineItems: FinancialLineItemInput[]): PEDDFinancialPeriodInputs {
  return { period, summary: normalizeFinancialPeriod({ periodCurrency: period.currency, lineItems }) };
}

// ─────────────────────────────────────────────────────────────
// Fixture A — 2023 Revenue=80억, 2024 Revenue=100억/EBITDA=10억,
// 2025 Revenue=120억/EBITDA=15억, 2025 approved QoE adjustment=+5억
// ─────────────────────────────────────────────────────────────
const FY2023 = fy(2023);
const FY2024 = fy(2024);
const FY2025 = fy(2025);

const fixtureA2023 = periodInputs(FY2023, [li({ lineItem: "REVENUE", value: 80 * EOK })]);
const fixtureA2024 = periodInputs(FY2024, [
  li({ lineItem: "REVENUE", value: 100 * EOK }),
  li({ lineItem: "EBITDA", value: 10 * EOK }),
]);
const fixtureA2025 = periodInputs(FY2025, [
  li({ lineItem: "REVENUE", value: 120 * EOK }),
  li({ lineItem: "EBITDA", value: 15 * EOK }),
]);
const fixtureAApprovedAdjustment: QoEAdjustmentInput = {
  metric: "EBITDA",
  reportedValue: 15 * EOK,
  adjustmentValue: 5 * EOK,
  reason: "일회성 항목 조정",
  adjustmentType: "OTHER",
  status: "APPROVED",
  sourceType: "MANUAL",
};

// ═════════════════════════════════════════════════════════════
// Financial Metrics(1-14)
// ═════════════════════════════════════════════════════════════

function test01_revenueYoyPositive() {
  const obs = calculateRevenueGrowth("t1", fixtureA2025, fixtureA2024);
  assert(obs.status === "available" && Math.abs(obs.value! - 0.2) < 1e-9, "2024→2025 Revenue YoY는 +20%여야 함");
  console.log("✅ Test 1 — Revenue YoY positive(+20%)");
}

function test02_revenueYoyNegative() {
  const cur = periodInputs(fy(2025, "p_b_2025"), [li({ lineItem: "REVENUE", value: 88 * EOK })]);
  const prev = periodInputs(fy(2024, "p_b_2024"), [li({ lineItem: "REVENUE", value: 100 * EOK })]);
  const obs = calculateRevenueGrowth("t2", cur, prev);
  assert(obs.status === "available" && Math.abs(obs.value! - -0.12) < 1e-9, "Fixture B: Revenue YoY는 -12%여야 함");
  console.log("✅ Test 2 — Revenue YoY negative(-12%, Fixture B)");
}

function test03_revenueYoyZero() {
  const cur = periodInputs(fy(2025, "p3_cur"), [li({ lineItem: "REVENUE", value: 100 * EOK })]);
  const prev = periodInputs(fy(2024, "p3_prev"), [li({ lineItem: "REVENUE", value: 100 * EOK })]);
  const obs = calculateRevenueGrowth("t3", cur, prev);
  assert(obs.status === "available" && obs.value === 0, "동일 revenue면 YoY 0%여야 함");
  console.log("✅ Test 3 — Revenue YoY zero growth");
}

function test04_previousRevenueZero() {
  const cur = periodInputs(fy(2025, "p4_cur"), [li({ lineItem: "REVENUE", value: 100 * EOK })]);
  const prev = periodInputs(fy(2024, "p4_prev"), [li({ lineItem: "REVENUE", value: 0 })]);
  const obs = calculateRevenueGrowth("t4", cur, prev);
  assert(obs.status === "undefined_metric" && obs.value === undefined, "Fixture C: previous revenue=0 → undefined_metric(NaN/Infinity 금지)");
  console.log("✅ Test 4 — Previous revenue zero(Fixture C, undefined_metric)");
}

function test05_revenueMissing() {
  const cur = periodInputs(fy(2025, "p5_cur"), []); // REVENUE 없음
  const prev = periodInputs(fy(2024, "p5_prev"), [li({ lineItem: "REVENUE", value: 100 * EOK })]);
  const obs = calculateRevenueGrowth("t5", cur, prev);
  assert(obs.status === "missing_input", "REVENUE line item이 없으면 missing_input");
  console.log("✅ Test 5 — Revenue missing");
}

function test06_ebitdaMarginPositive() {
  const obs = calculateEbitdaMargin("t6", FY2025, fixtureA2025.summary.revenue, fixtureA2025.summary.ebitda, "REPORTED");
  assert(obs.status === "available" && Math.abs(obs.value! - 0.125) < 1e-9, "2025 EBITDA Margin = 12.5%여야 함");
  console.log("✅ Test 6 — EBITDA margin positive(12.5%)");
}

function test07_ebitdaMarginNegative() {
  const period = periodInputs(fy(2025, "p7"), [
    li({ lineItem: "REVENUE", value: 50 * EOK }),
    li({ lineItem: "EBITDA", value: -5 * EOK }),
  ]);
  const obs = calculateEbitdaMargin("t7", fy(2025, "p7"), period.summary.revenue, period.summary.ebitda, "REPORTED");
  assert(obs.status === "available" && Math.abs(obs.value! - -0.1) < 1e-9, "Fixture D: EBITDA margin = -10%여야 함(revenue가 valid하면 계산 가능)");
  console.log("✅ Test 7 — EBITDA margin negative(-10%, Fixture D)");
}

function test08_revenueZeroForMargin() {
  const period = periodInputs(fy(2025, "p8"), [
    li({ lineItem: "REVENUE", value: 0 }),
    li({ lineItem: "EBITDA", value: 10 * EOK }),
  ]);
  const obs = calculateEbitdaMargin("t8", fy(2025, "p8"), period.summary.revenue, period.summary.ebitda, "REPORTED");
  assert(obs.status === "undefined_metric", "Revenue=0이면 margin은 undefined_metric(Infinity 금지)");
  console.log("✅ Test 8 — Revenue zero(margin undefined_metric)");
}

function test09_ebitdaGrowth() {
  const obs = calculateEbitdaGrowth(
    "t9",
    { period: FY2025, ebitda: fixtureA2025.summary.ebitda },
    { period: FY2024, ebitda: fixtureA2024.summary.ebitda },
    "REPORTED"
  );
  assert(obs.status === "available" && Math.abs(obs.value! - 0.5) < 1e-9, "2024→2025 EBITDA 성장률은 +50%여야 함(10→15)");
  console.log("✅ Test 9 — EBITDA growth(+50%)");
}

function test10_ebitdaDecline() {
  const cur = periodInputs(fy(2025, "p10_cur"), [li({ lineItem: "EBITDA", value: 10 * EOK })]);
  const prev = periodInputs(fy(2024, "p10_prev"), [li({ lineItem: "EBITDA", value: 15 * EOK })]);
  const obs = calculateEbitdaGrowth("t10", { period: fy(2025, "p10_cur"), ebitda: cur.summary.ebitda }, { period: fy(2024, "p10_prev"), ebitda: prev.summary.ebitda }, "REPORTED");
  assert(obs.status === "available" && Math.abs(obs.value! - -1 / 3) < 1e-9, "EBITDA 15→10은 -33.3%여야 함");
  console.log("✅ Test 10 — EBITDA decline(-33.3%)");
}

function test11_marginChange() {
  const margin2024 = calculateEbitdaMargin("m2024", FY2024, fixtureA2024.summary.revenue, fixtureA2024.summary.ebitda, "REPORTED");
  const margin2025 = calculateEbitdaMargin("m2025", FY2025, fixtureA2025.summary.revenue, fixtureA2025.summary.ebitda, "REPORTED");
  const change = calculateEbitdaMarginChange("t11", margin2025, margin2024);
  assert(change.unit === "PERCENTAGE_POINT", "margin change의 unit은 PERCENTAGE_POINT여야 함(§11)");
  assert(change.status === "available" && Math.abs(change.value! - 0.025) < 1e-9, "10%→12.5%는 +2.5%p여야 함(40% 증가와 혼동 금지)");
  console.log("✅ Test 11 — EBITDA margin change(+2.5pp, not +25%)");
}

function test12_multiYearCagr() {
  const obs = calculateRevenueCagr("t12", [fixtureA2023, fixtureA2025]);
  const expected = Math.pow(120 / 80, 1 / 2) - 1;
  assert(obs.status === "available" && Math.abs(obs.value! - expected) < 1e-9, "2023→2025 Revenue CAGR이 정확해야 함");
  console.log(`✅ Test 12 — multi-year CAGR(${(expected * 100).toFixed(2)}%)`);
}

function test13_cagrInsufficientPeriods() {
  const obs = calculateRevenueCagr("t13", [fixtureA2025]);
  assert(obs.status === "undefined_metric", "기간이 1개뿐이면 CAGR은 undefined_metric이어야 함");
  console.log("✅ Test 13 — CAGR insufficient periods");
}

function test14_cagrInvalidNegativeBase() {
  const negStart = periodInputs(fy(2023, "p14_start"), [li({ lineItem: "REVENUE", value: -10 * EOK })]);
  const obs = calculateRevenueCagr("t14", [negStart, fixtureA2025]);
  assert(obs.status === "invalid_input", "시작 Revenue가 음수이면 invalid_input이어야 함(억지 계산 금지)");
  console.log("✅ Test 14 — CAGR invalid negative base");
}

// ═════════════════════════════════════════════════════════════
// QoE(15-21)
// ═════════════════════════════════════════════════════════════

function qoeResultFixtureA() {
  return calculateAdjustedEbitda(
    "KRW",
    [{ lineItem: "EBITDA", value: 15 * EOK, currency: "KRW", sourceType: "MANUAL" }],
    [fixtureAApprovedAdjustment]
  );
}

function test15_reportedEbitda() {
  const qoeResult = qoeResultFixtureA();
  assert(qoeResult.baseEbitda.status === "ok" && qoeResult.baseEbitda.value === 15 * EOK, "Reported EBITDA = 15억원");
  console.log("✅ Test 15 — reported EBITDA(15억원)");
}

function test16_approvedAdjustment() {
  const qoeResult = qoeResultFixtureA();
  const obs = calculateAdjustedEbitdaRatio("t16", FY2025, qoeResult);
  assert(obs.inputs.approvedAdjustmentTotal === 5 * EOK, "approved adjustment total = 5억원이 inputs에 보존되어야 함");
  console.log("✅ Test 16 — approved adjustment(5억원)");
}

function test17_adjustedEbitda() {
  const qoeResult = qoeResultFixtureA();
  assert(qoeResult.adjustedEbitda.status === "ok" && qoeResult.adjustedEbitda.value === 20 * EOK, "Adjusted EBITDA = 20억원(15+5)");
  console.log("✅ Test 17 — adjusted EBITDA(20억원)");
}

function test18_adjustmentRatio() {
  const qoeResult = qoeResultFixtureA();
  const obs = calculateAdjustedEbitdaRatio("t18", FY2025, qoeResult);
  assert(obs.status === "available" && Math.abs(obs.value! - 5 / 15) < 1e-9, "조정 비율 = 5/15(raw value 보존)");
  console.log("✅ Test 18 — adjustment ratio(5/15)");
}

function test19_zeroReportedEbitda() {
  const qoeResult = calculateAdjustedEbitda("KRW", [{ lineItem: "EBITDA", value: 0, currency: "KRW", sourceType: "MANUAL" }], []);
  const obs = calculateAdjustedEbitdaRatio("t19", FY2025, qoeResult);
  assert(obs.status === "undefined_metric", "Reported EBITDA=0이면 조정 비율은 undefined_metric");
  console.log("✅ Test 19 — zero reported EBITDA");
}

function test20_proposedAdjustmentExcluded() {
  const qoeResult = calculateAdjustedEbitda(
    "KRW",
    [{ lineItem: "EBITDA", value: 15 * EOK, currency: "KRW", sourceType: "MANUAL" }],
    [{ ...fixtureAApprovedAdjustment, status: "PROPOSED", adjustmentValue: 100 * EOK }]
  );
  const obs = calculateAdjustedEbitdaRatio("t20", FY2025, qoeResult);
  assert(obs.inputs.approvedAdjustmentTotal === 0, "PROPOSED adjustment는 approvedAdjustmentTotal에서 제외되어야 함(qoe.ts APPROVED-only)");
  console.log("✅ Test 20 — proposed adjustment excluded");
}

function test21_rejectedAdjustmentExcluded() {
  const qoeResult = calculateAdjustedEbitda(
    "KRW",
    [{ lineItem: "EBITDA", value: 15 * EOK, currency: "KRW", sourceType: "MANUAL" }],
    [{ ...fixtureAApprovedAdjustment, status: "REJECTED", adjustmentValue: 100 * EOK }]
  );
  const obs = calculateAdjustedEbitdaRatio("t21", FY2025, qoeResult);
  assert(obs.inputs.approvedAdjustmentTotal === 0, "REJECTED adjustment는 approvedAdjustmentTotal에서 제외되어야 함");
  console.log("✅ Test 21 — rejected adjustment excluded");
}

// ═════════════════════════════════════════════════════════════
// Balance Sheet(22-24)
// ═════════════════════════════════════════════════════════════

function test22_assetGrowth() {
  const cur = { period: fy(2025, "p22_cur"), lineItems: [li({ lineItem: "TOTAL_ASSETS", value: 120 * EOK })] };
  const prev = { period: fy(2024, "p22_prev"), lineItems: [li({ lineItem: "TOTAL_ASSETS", value: 100 * EOK })] };
  const obs = calculateTotalAssetsGrowth("t22", cur, prev);
  assert(obs.status === "available" && Math.abs(obs.value! - 0.2) < 1e-9, "Total Assets 성장률 +20%");
  console.log("✅ Test 22 — asset growth(+20%)");
}

function test23_liabilityGrowth() {
  const cur = { period: fy(2025, "p23_cur"), lineItems: [li({ lineItem: "TOTAL_LIABILITIES", value: 60 * EOK })] };
  const prev = { period: fy(2024, "p23_prev"), lineItems: [li({ lineItem: "TOTAL_LIABILITIES", value: 50 * EOK })] };
  const obs = calculateTotalLiabilitiesGrowth("t23", cur, prev);
  assert(obs.status === "available" && Math.abs(obs.value! - 0.2) < 1e-9, "Total Liabilities 성장률 +20%");
  console.log("✅ Test 23 — liability growth(+20%)");
}

function test24_equityGrowth() {
  const cur = { period: fy(2025, "p24_cur"), lineItems: [li({ lineItem: "EQUITY", value: 60 * EOK })] };
  const prev = { period: fy(2024, "p24_prev"), lineItems: [li({ lineItem: "EQUITY", value: 50 * EOK })] };
  const obs = calculateEquityGrowth("t24", cur, prev);
  assert(obs.status === "available" && Math.abs(obs.value! - 0.2) < 1e-9, "Equity 성장률 +20%");
  console.log("✅ Test 24 — equity growth(+20%)");
}

// ═════════════════════════════════════════════════════════════
// Debt(25-29)
// ═════════════════════════════════════════════════════════════

function test25_netDebt() {
  const period = periodInputs(fy(2025, "p25"), [
    li({ lineItem: "SHORT_TERM_DEBT", value: 20 * EOK }),
    li({ lineItem: "LONG_TERM_DEBT", value: 30 * EOK }),
    li({ lineItem: "CASH", value: 10 * EOK }),
  ]);
  const obs = calculateNetDebt("t25", fy(2025, "p25"), period.summary);
  assert(obs.status === "available" && obs.value === 40 * EOK, "Net Debt = (20+30)-10 = 40억원");
  console.log("✅ Test 25 — net debt(40억원)");
}

function test26_missingDebt() {
  const period = periodInputs(fy(2025, "p26"), [li({ lineItem: "CASH", value: 10 * EOK })]);
  const obs = calculateNetDebt("t26", fy(2025, "p26"), period.summary);
  assert(obs.status === "missing_input", "Debt 데이터가 없으면 missing_input(Total Liabilities로 대체 금지)");
  console.log("✅ Test 26 — missing debt");
}

function test27_missingCash() {
  const period = periodInputs(fy(2025, "p27"), [li({ lineItem: "SHORT_TERM_DEBT", value: 20 * EOK })]);
  const obs = calculateNetDebt("t27", fy(2025, "p27"), period.summary);
  assert(obs.status === "missing_input", "Cash 데이터가 없으면 missing_input");
  console.log("✅ Test 27 — missing cash");
}

function test28_leverage() {
  const period = periodInputs(fy(2025, "p28"), [
    li({ lineItem: "SHORT_TERM_DEBT", value: 20 * EOK }),
    li({ lineItem: "LONG_TERM_DEBT", value: 30 * EOK }),
    li({ lineItem: "CASH", value: 10 * EOK }),
    li({ lineItem: "EBITDA", value: 20 * EOK }),
  ]);
  const obs = calculateLeverage("t28", fy(2025, "p28"), period.summary.netDebt, period.summary.ebitda, "REPORTED");
  assert(obs.status === "available" && obs.value === 2, "Leverage = 40/20 = 2.0x");
  console.log("✅ Test 28 — leverage(2.0x)");
}

function test29_negativeEbitdaLeverageFailure() {
  const period = periodInputs(fy(2025, "p29"), [
    li({ lineItem: "SHORT_TERM_DEBT", value: 20 * EOK }),
    li({ lineItem: "LONG_TERM_DEBT", value: 30 * EOK }),
    li({ lineItem: "CASH", value: 10 * EOK }),
    li({ lineItem: "EBITDA", value: -5 * EOK }),
  ]);
  const obs = calculateLeverage("t29", fy(2025, "p29"), period.summary.netDebt, period.summary.ebitda, "REPORTED");
  assert(obs.status === "invalid_input", "Fixture D: EBITDA<=0이면 leverage는 invalid_input(억지 계산 금지)");
  console.log("✅ Test 29 — negative EBITDA leverage failure(Fixture D)");
}

// ═════════════════════════════════════════════════════════════
// DD(41, 43, 44 — Financial 관련분만. 42/45/47은 test-dd-commercial.ts)
// ═════════════════════════════════════════════════════════════

function test41_financialObservationToFinding() {
  const declineObs = calculateRevenueGrowth(
    "t41_obs",
    periodInputs(fy(2025, "p41_cur"), [li({ lineItem: "REVENUE", value: 88 })]),
    periodInputs(fy(2024, "p41_prev"), [li({ lineItem: "REVENUE", value: 100 })])
  );
  const ruleResults = evaluateFinancialRules([declineObs]);
  const findings = buildFinancialFindings(ruleResults, { idFor: () => "finding_t41", severityFor: () => "MEDIUM" });
  assert(findings.length === 1 && findings[0].category === "FINANCIAL" && findings[0].status === "CONFIRMED", "Revenue decline observation → FINANCIAL finding 생성");
  console.log("✅ Test 41 — financial observation → finding");
}

function test43_evidenceLineagePreserved() {
  const source = createEvidenceSource({ id: "t43_src", sourceType: "UPLOADED_DOCUMENT", sourceName: "재무제표.pdf" });
  const evidence = createEvidenceItem({ id: "t43_ev", sourceId: source.id });
  const declineObs = calculateRevenueGrowth(
    "t43_obs",
    periodInputs(fy(2025, "t43_cur"), [li({ lineItem: "REVENUE", value: 88 })]),
    periodInputs(fy(2024, "t43_prev"), [li({ lineItem: "REVENUE", value: 100 })])
  );
  const ruleResults = evaluateFinancialRules([declineObs]);
  const findings = buildFinancialFindings(ruleResults, { idFor: () => "t43_finding", severityFor: () => "MEDIUM", evidenceIds: [evidence.id] });
  const lineage = buildPEEvidenceLineage({ periods: [fy(2025, "t43_cur")], sources: [source], evidence: [evidence] });
  const ddCase = buildPEDDCase(lineage, findings);
  assert(validatePEDDCase(ddCase).status === "ok", "Finding의 evidence 참조가 실제 lineage와 valid하게 연결되어야 함");
  console.log("✅ Test 43 — evidence lineage preserved");
}

function test44_findingReferencesValid() {
  const claim = createClaim({ id: "t44_claim", statement: "테스트", claimType: "numeric" });
  const finding = buildFinancialFindings(
    evaluateFinancialRules([
      calculateRevenueGrowth(
        "t44_obs",
        periodInputs(fy(2025, "t44_cur"), [li({ lineItem: "REVENUE", value: 50 })]),
        periodInputs(fy(2024, "t44_prev"), [li({ lineItem: "REVENUE", value: 100 })])
      ),
    ]),
    { idFor: () => "t44_finding", severityFor: () => "HIGH", claimIds: [claim.id] }
  );
  const ddCase = buildPEDDCase(buildPEEvidenceLineage({ periods: [fy(2025, "t44_cur")], claims: [claim] }), finding);
  assert(validatePEDDCase(ddCase).status === "ok", "claim 참조가 유효하면 finding validation도 ok여야 함");
  console.log("✅ Test 44 — finding references valid");
}

// ═════════════════════════════════════════════════════════════
// End-to-end(46, 48) — Fixture H: Source→Evidence→Claim→Financial Fact→
// QoE Adjustment→QoE Result→LBO Bridge→Observation→Finding
// ═════════════════════════════════════════════════════════════

function buildFixtureHLineage(): {
  lineage: PEEvidenceLineage;
  observation: ReturnType<typeof calculateAdjustedEbitdaRatio>;
  entryEbitdaInEok: number;
  findingEvidenceId: string;
  findingClaimId: string;
  bridgeLineageId: string;
} {
  const period = fy(2025, "h_period");
  const source = createEvidenceSource({ id: "h_src", sourceType: "UPLOADED_DOCUMENT", sourceName: "2025_실사보고서.pdf", sourceLocation: "17페이지" });
  const evidence = createEvidenceItem({ id: "h_ev", sourceId: source.id, locator: "17페이지", excerpt: "일회성 법률비용 5억원" });
  let claim = createClaim({ id: "h_claim", statement: "5억원의 일회성 법률비용이 발생했다.", claimType: "numeric", financialPeriodId: period.id });
  claim = linkClaimToEvidence(claim, evidence.id);

  let fact = createFinancialFactReference({ id: "h_fact", financialPeriodId: period.id, metric: "EBITDA", value: 5 * EOK, currency: "KRW" });
  fact = linkFinancialFactToClaim(fact, claim.id);

  const adjustmentInput: QoEAdjustmentInput = {
    metric: "EBITDA",
    reportedValue: 15 * EOK,
    adjustmentValue: 5 * EOK,
    reason: "일회성 법률비용 제거",
    adjustmentType: "ONE_OFF_EXPENSE",
    status: "APPROVED",
    sourceType: "UPLOADED_DOCUMENT",
    sourceName: "2025_실사보고서.pdf",
    sourceLocation: "17페이지",
  };
  let adjustmentRef = createQoEAdjustmentReference({ id: "h_adj", financialPeriodId: period.id, adjustment: adjustmentInput });
  adjustmentRef = linkAdjustmentToEvidence(adjustmentRef, evidence.id);
  adjustmentRef = linkAdjustmentToClaim(adjustmentRef, claim.id);

  const qoeResult = calculateAdjustedEbitda("KRW", [{ lineItem: "EBITDA", value: 15 * EOK, currency: "KRW", sourceType: "UPLOADED_DOCUMENT" }], [adjustmentInput]);
  const qoeBuilt = createQoEResultLineageReference("h_qoe", period.id, qoeResult, [adjustmentRef]);
  if (qoeBuilt.status !== "ok") throw new Error("Fixture H QoE lineage 생성 실패");

  const bridgeResult = bridgeQoEToLboEntryEbitda({ financialPeriodId: period.id, fiscalYear: period.fiscalYear, periodType: period.periodType }, "KRW", qoeResult);
  const bridgeBuilt = createLboBridgeLineageReference("h_bridge", qoeBuilt.reference.id, bridgeResult);
  if (bridgeBuilt.status !== "ok") throw new Error("Fixture H LBO bridge lineage 생성 실패");

  const observation = calculateAdjustedEbitdaRatio("h_observation", period, qoeResult);

  const lineage = buildPEEvidenceLineage({
    periods: [period],
    sources: [source],
    evidence: [evidence],
    claims: [claim],
    financialFacts: [fact],
    adjustments: [adjustmentRef],
    qoeResults: [qoeBuilt.reference],
    lboBridges: [bridgeBuilt.reference],
  });

  return {
    lineage,
    observation,
    entryEbitdaInEok: bridgeBuilt.reference.provenance.entryEbitdaInEok,
    findingEvidenceId: evidence.id,
    findingClaimId: claim.id,
    bridgeLineageId: bridgeBuilt.reference.id,
  };
}

function test46_financialQoeLboFinding() {
  const { lineage, observation, entryEbitdaInEok, findingEvidenceId, findingClaimId, bridgeLineageId } = buildFixtureHLineage();
  assert(observation.status === "available" && Math.abs(observation.value! - 5 / 15) < 1e-9, "QoE adjustment ratio = 5/15");
  assert(entryEbitdaInEok === 20, "LBO Entry EBITDA = 20억원(15+5)");

  const ruleResults = evaluateFinancialRules([observation], { materialAdjustmentRatio: 0.2 });
  assert(ruleResults.length === 1 && ruleResults[0].triggered, "0.333 >= 0.2 threshold → 규칙 triggered");
  let findings = buildFinancialFindings(ruleResults, {
    idFor: () => "h_finding",
    severityFor: () => "MEDIUM",
    evidenceIds: [findingEvidenceId],
    claimIds: [findingClaimId],
  });
  findings = findings.map((f) => ({ ...f, lboImpact: { affectedTarget: "ENTRY_EBITDA" as const, lboBridgeLineageId: bridgeLineageId } }));

  const ddCase = buildPEDDCase(lineage, findings);
  const result = validatePEDDCase(ddCase);
  assert(result.status === "ok", `Financial→QoE→LBO→DD Finding 체인은 valid해야 함: ${result.status === "invalid" ? JSON.stringify(result.issues) : ""}`);
  console.log("✅ Test 46 — Financial → QoE → LBO → DD Finding(Fixture H)");
}

function test48_fullProvenancePreserved() {
  const { lineage, entryEbitdaInEok, findingEvidenceId, findingClaimId, bridgeLineageId } = buildFixtureHLineage();
  const adjustment = lineage.adjustments.find((a) => a.id === "h_adj")!;
  assert(adjustment.sourceName === "2025_실사보고서.pdf" && adjustment.sourceLocation === "17페이지", "Adjustment의 sourceName/sourceLocation 보존");
  const bridge = lineage.lboBridges.find((b) => b.id === bridgeLineageId)!;
  assert(bridge.provenance.entryEbitdaInEok === entryEbitdaInEok, "LBO Bridge provenance의 entryEbitdaInEok 보존");
  const evidence = lineage.evidence.find((e) => e.id === findingEvidenceId)!;
  assert(evidence.excerpt === "일회성 법률비용 5억원", "Evidence excerpt 보존");
  const claim = lineage.claims.find((c) => c.id === findingClaimId)!;
  assert(claim.statement === "5억원의 일회성 법률비용이 발생했다.", "Claim statement 보존");
  const src = lineage.sources.find((s) => s.id === "h_src")!;
  assert(src.sourceName === "2025_실사보고서.pdf", "Finding에서 원본 Source까지 전체 provenance 보존");
  console.log("✅ Test 48 — full provenance preserved");
}

function main() {
  console.log("\n=== DealMind PE Financial DD Engine(PR-H) 테스트 ===\n");
  test01_revenueYoyPositive();
  test02_revenueYoyNegative();
  test03_revenueYoyZero();
  test04_previousRevenueZero();
  test05_revenueMissing();
  test06_ebitdaMarginPositive();
  test07_ebitdaMarginNegative();
  test08_revenueZeroForMargin();
  test09_ebitdaGrowth();
  test10_ebitdaDecline();
  test11_marginChange();
  test12_multiYearCagr();
  test13_cagrInsufficientPeriods();
  test14_cagrInvalidNegativeBase();
  test15_reportedEbitda();
  test16_approvedAdjustment();
  test17_adjustedEbitda();
  test18_adjustmentRatio();
  test19_zeroReportedEbitda();
  test20_proposedAdjustmentExcluded();
  test21_rejectedAdjustmentExcluded();
  test22_assetGrowth();
  test23_liabilityGrowth();
  test24_equityGrowth();
  test25_netDebt();
  test26_missingDebt();
  test27_missingCash();
  test28_leverage();
  test29_negativeEbitdaLeverageFailure();
  test41_financialObservationToFinding();
  test43_evidenceLineagePreserved();
  test44_findingReferencesValid();
  test46_financialQoeLboFinding();
  test48_fullProvenancePreserved();
  console.log("\n✅ PE Financial DD Engine(PR-H) 테스트 통과(33/33)\n");
}

main();
