/**
 * PE Commercial DD Engine(PR-H) 검증 — 고객 집중도/성장/recurring revenue
 * 지표(§19~§25) + Commercial→DD Finding end-to-end.
 *
 * Financial DD 테스트는 tools/test-dd-financial.ts에 분리되어 있다(§44
 * 회귀 체크리스트의 test:dd-financial/test:dd-commercial 구분과 동일).
 *
 * Usage: npm run test:dd-commercial
 */
import type { PEFinancialPeriodIdentity } from "../src/lib/pe/evidence-lineage-types";
import { createEvidenceSource, createEvidenceItem, createClaim, linkClaimToEvidence, buildPEEvidenceLineage } from "../src/lib/pe/evidence-lineage";
import { linkFindingToEvidence, linkFindingToClaim } from "../src/lib/pe/dd-validation";
import { buildPEDDCase, validatePEDDCase } from "../src/lib/pe/dd-lineage";
import {
  calculateCustomerConcentration,
  calculateCustomerRevenueGrowth,
  calculateRecurringRevenueRatio,
  findCustomerDatasetIssues,
  evaluateCommercialRules,
  buildCommercialFindings,
} from "../src/lib/pe/dd-commercial";
import type { PEDDCustomerRevenueInput } from "../src/lib/pe/dd-metrics-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function fy(fiscalYear: number, id?: string): PEFinancialPeriodIdentity {
  return { id: id ?? `period_fy${fiscalYear}`, fiscalYear, periodType: "ANNUAL", currency: "KRW" };
}

// ─────────────────────────────────────────────────────────────
// Fixture E — A=40,B=20,C=10,D=10,E=10,F=10, total=100
// ─────────────────────────────────────────────────────────────
const FY2025_COMMERCIAL = fy(2025, "period_commercial_fy2025");

function fixtureECustomers(): PEDDCustomerRevenueInput[] {
  return [
    { customerId: "A", financialPeriodId: FY2025_COMMERCIAL.id, revenue: 40, currency: "KRW" },
    { customerId: "B", financialPeriodId: FY2025_COMMERCIAL.id, revenue: 20, currency: "KRW" },
    { customerId: "C", financialPeriodId: FY2025_COMMERCIAL.id, revenue: 10, currency: "KRW" },
    { customerId: "D", financialPeriodId: FY2025_COMMERCIAL.id, revenue: 10, currency: "KRW" },
    { customerId: "E", financialPeriodId: FY2025_COMMERCIAL.id, revenue: 10, currency: "KRW" },
    { customerId: "F", financialPeriodId: FY2025_COMMERCIAL.id, revenue: 10, currency: "KRW" },
  ];
}

// ═════════════════════════════════════════════════════════════
// Commercial(30-40)
// ═════════════════════════════════════════════════════════════

function test30_top1Concentration() {
  const obs = calculateCustomerConcentration("t30", "CUSTOMER_CONCENTRATION_TOP1", 1, FY2025_COMMERCIAL, fixtureECustomers(), {
    value: 100,
    source: "SUM_OF_FULL_CUSTOMER_POPULATION",
  });
  assert(obs.status === "available" && Math.abs(obs.value! - 0.4) < 1e-9, "Top1 = 40%");
  console.log("✅ Test 30 — top1 concentration(40%, Fixture E)");
}

function test31_top3Concentration() {
  const obs = calculateCustomerConcentration("t31", "CUSTOMER_CONCENTRATION_TOP3", 3, FY2025_COMMERCIAL, fixtureECustomers(), {
    value: 100,
    source: "SUM_OF_FULL_CUSTOMER_POPULATION",
  });
  assert(obs.status === "available" && Math.abs(obs.value! - 0.7) < 1e-9, "Top3 = 70%");
  console.log("✅ Test 31 — top3 concentration(70%, Fixture E)");
}

function test32_top5Concentration() {
  const obs = calculateCustomerConcentration("t32", "CUSTOMER_CONCENTRATION_TOP5", 5, FY2025_COMMERCIAL, fixtureECustomers(), {
    value: 100,
    source: "SUM_OF_FULL_CUSTOMER_POPULATION",
  });
  assert(obs.status === "available" && Math.abs(obs.value! - 0.9) < 1e-9, "Top5 = 90%");
  console.log("✅ Test 32 — top5 concentration(90%, Fixture E)");
}

function test33_deterministicTieOrdering() {
  const shuffled = [...fixtureECustomers()].reverse();
  const obs1 = calculateCustomerConcentration("t33a", "CUSTOMER_CONCENTRATION_TOP5", 5, FY2025_COMMERCIAL, fixtureECustomers(), {
    value: 100,
    source: "SUM_OF_FULL_CUSTOMER_POPULATION",
  });
  const obs2 = calculateCustomerConcentration("t33b", "CUSTOMER_CONCENTRATION_TOP5", 5, FY2025_COMMERCIAL, shuffled, {
    value: 100,
    source: "SUM_OF_FULL_CUSTOMER_POPULATION",
  });
  assert(obs1.inputs.topCustomerIds === obs2.inputs.topCustomerIds, "입력 순서를 바꿔도 top customer 순서는 항상 동일해야 함(동률은 customerId 오름차순)");
  assert(obs1.inputs.topCustomerIds === "A,B,C,D,E", `동률 tie-break가 customerId 오름차순이어야 함(실제: ${obs1.inputs.topCustomerIds})`);
  console.log("✅ Test 33 — deterministic tie ordering(customerId 오름차순)");
}

function test34_duplicateCustomerReject() {
  const customers: PEDDCustomerRevenueInput[] = [
    { customerId: "A", financialPeriodId: FY2025_COMMERCIAL.id, revenue: 10, currency: "KRW" },
    { customerId: "A", financialPeriodId: FY2025_COMMERCIAL.id, revenue: 20, currency: "KRW" },
  ];
  const issues = findCustomerDatasetIssues(customers);
  assert(issues.length > 0, "동일 customerId+period 중복은 issue로 잡혀야 함");
  const obs = calculateCustomerConcentration("t34", "CUSTOMER_CONCENTRATION_TOP1", 1, FY2025_COMMERCIAL, customers, {
    value: 30,
    source: "SUM_OF_FULL_CUSTOMER_POPULATION",
  });
  assert(obs.status === "invalid_input", "중복 customer가 있으면 concentration 계산도 invalid_input이어야 함");
  console.log("✅ Test 34 — duplicate customer reject");
}

function test35_missingCustomerId() {
  const customers: PEDDCustomerRevenueInput[] = [{ customerId: "", financialPeriodId: FY2025_COMMERCIAL.id, revenue: 10, currency: "KRW" }];
  const issues = findCustomerDatasetIssues(customers);
  assert(issues.length > 0, "빈 customerId는 issue로 잡혀야 함");
  console.log("✅ Test 35 — missing customer ID");
}

function test36_negativeRevenueHandling() {
  const customers: PEDDCustomerRevenueInput[] = [
    { customerId: "A", financialPeriodId: FY2025_COMMERCIAL.id, revenue: 50, currency: "KRW" },
    { customerId: "B", financialPeriodId: FY2025_COMMERCIAL.id, revenue: -10, currency: "KRW" }, // credit note
  ];
  const issues = findCustomerDatasetIssues(customers);
  assert(issues.length === 0, "음수 revenue 자체는 reject하지 않아야 함(financeNumberSchema 관례 — credit note 허용)");
  const obs = calculateCustomerConcentration("t36", "CUSTOMER_CONCENTRATION_TOP1", 1, FY2025_COMMERCIAL, customers, {
    value: 40,
    source: "SUM_OF_FULL_CUSTOMER_POPULATION",
  });
  assert(obs.status === "available", "음수 revenue가 섞여도 나머지 계산은 진행되어야 함");
  console.log("✅ Test 36 — negative revenue handling(credit note 허용)");
}

function test37_missingCustomerDataset() {
  const obs = calculateCustomerConcentration("t37", "CUSTOMER_CONCENTRATION_TOP1", 1, FY2025_COMMERCIAL, [], {
    value: 0,
    source: "SUM_OF_FULL_CUSTOMER_POPULATION",
  });
  assert(obs.status === "missing_input", "Fixture F: customer dataset이 없으면 missing_input");
  console.log("✅ Test 37 — missing customer dataset(Fixture F)");
}

function test38_customerGrowth() {
  const cur = { period: fy(2025, "p38_cur"), customers: [{ customerId: "A", financialPeriodId: "p38_cur", revenue: 120, currency: "KRW" }] };
  const prev = { period: fy(2024, "p38_prev"), customers: [{ customerId: "A", financialPeriodId: "p38_prev", revenue: 100, currency: "KRW" }] };
  const obs = calculateCustomerRevenueGrowth("t38", "A", cur, prev);
  assert(obs.status === "available" && Math.abs(obs.value! - 0.2) < 1e-9, "고객 A의 YoY 성장률 = +20%");
  console.log("✅ Test 38 — customer growth(+20%)");
}

function test39_recurringRevenueRatio() {
  const obs = calculateRecurringRevenueRatio("t39", FY2025_COMMERCIAL, 100, 70);
  assert(obs.status === "available" && Math.abs(obs.value! - 0.7) < 1e-9, "Fixture G: Recurring Revenue Ratio = 70%");
  console.log("✅ Test 39 — recurring revenue ratio(70%, Fixture G)");
}

function test40_revenueNotEqualRecurring() {
  const allRecurring = calculateRecurringRevenueRatio("t40a", FY2025_COMMERCIAL, 100, 100);
  const partialRecurring = calculateRecurringRevenueRatio("t40b", FY2025_COMMERCIAL, 100, 70);
  assert(allRecurring.value === 1 && partialRecurring.value === 0.7, "recurringRevenue를 명시적으로 다르게 넘기면 ratio도 달라져야 함");
  assert(partialRecurring.value !== 1, "totalRevenue만으로 recurringRevenue=totalRevenue를 추정하지 않는다(§23)");
  console.log("✅ Test 40 — revenue ≠ recurring revenue(자동 추정 없음)");
}

// ═════════════════════════════════════════════════════════════
// DD(42, 45, 47 — Commercial 관련분)
// ═════════════════════════════════════════════════════════════

function test42_commercialObservationToFinding() {
  const obs = calculateCustomerConcentration("t42_obs", "CUSTOMER_CONCENTRATION_TOP3", 3, FY2025_COMMERCIAL, fixtureECustomers(), {
    value: 100,
    source: "SUM_OF_FULL_CUSTOMER_POPULATION",
  });
  const ruleResults = evaluateCommercialRules([obs], { concentrationThreshold: 0.5 });
  const findings = buildCommercialFindings(ruleResults, { idFor: () => "finding_t42", severityFor: () => "HIGH" });
  assert(findings.length === 1 && findings[0].category === "COMMERCIAL", "70% > 50% threshold → COMMERCIAL finding 생성");
  console.log("✅ Test 42 — commercial observation → finding");
}

function test45_missingInputDoesNotCreateFalseFinding() {
  const missingObs = calculateCustomerConcentration("t45_obs", "CUSTOMER_CONCENTRATION_TOP1", 1, FY2025_COMMERCIAL, [], {
    value: 0,
    source: "SUM_OF_FULL_CUSTOMER_POPULATION",
  });
  assert(missingObs.status === "missing_input", "전제 조건: observation이 missing_input이어야 함");
  const ruleResults = evaluateCommercialRules([missingObs], { concentrationThreshold: 0 });
  assert(ruleResults.length === 0, "missing_input observation은 rule 평가 대상에서 제외되어야 함(false positive finding 방지)");
  const findings = buildCommercialFindings(ruleResults, { idFor: () => "should_not_exist", severityFor: () => "LOW" });
  assert(findings.length === 0, "missing_input에서는 finding이 생성되면 안 됨");
  console.log("✅ Test 45 — missing input does not create false finding");
}

function test47_commercialFinding() {
  const source = createEvidenceSource({ id: "t47_src", sourceType: "EXCEL", sourceName: "Customer analysis.xlsx" });
  const evidence = createEvidenceItem({ id: "t47_ev", sourceId: source.id, locator: "Customer concentration sheet" });
  let claim = createClaim({ id: "t47_claim", statement: "Top 3 customers account for 70% of revenue.", claimType: "numeric" });
  claim = linkClaimToEvidence(claim, evidence.id);

  const obs = calculateCustomerConcentration("t47_obs", "CUSTOMER_CONCENTRATION_TOP3", 3, FY2025_COMMERCIAL, fixtureECustomers(), {
    value: 100,
    source: "SUM_OF_FULL_CUSTOMER_POPULATION",
  });
  const ruleResults = evaluateCommercialRules([obs], { concentrationThreshold: 0.5 });
  let findings = buildCommercialFindings(ruleResults, { idFor: () => "t47_finding", severityFor: () => "HIGH" });
  findings = findings.map((f) => linkFindingToClaim(linkFindingToEvidence(f, evidence.id), claim.id));

  const lineage = buildPEEvidenceLineage({ periods: [FY2025_COMMERCIAL], sources: [source], evidence: [evidence], claims: [claim] });
  const ddCase = buildPEDDCase(lineage, findings);
  const result = validatePEDDCase(ddCase);
  assert(result.status === "ok" && findings.length === 1, "Commercial → DD Finding 체인은 valid해야 함");
  console.log("✅ Test 47 — Commercial → DD Finding");
}

function main() {
  console.log("\n=== DealMind PE Commercial DD Engine(PR-H) 테스트 ===\n");
  test30_top1Concentration();
  test31_top3Concentration();
  test32_top5Concentration();
  test33_deterministicTieOrdering();
  test34_duplicateCustomerReject();
  test35_missingCustomerId();
  test36_negativeRevenueHandling();
  test37_missingCustomerDataset();
  test38_customerGrowth();
  test39_recurringRevenueRatio();
  test40_revenueNotEqualRecurring();
  test42_commercialObservationToFinding();
  test45_missingInputDoesNotCreateFalseFinding();
  test47_commercialFinding();
  console.log("\n✅ PE Commercial DD Engine(PR-H) 테스트 통과(14/14)\n");
}

main();
