/**
 * pe-ic-breakers.ts(PR #108) 검증 — thesis breaker는 오직 세 가지 실제
 * 소스(DD finding/CONTRADICTED thesis/STRUCTURAL_DATA_GAP)에서만 온다는
 * 계약을 확인한다. 임의의 "리스크 요인" 생성이 없어야 한다.
 *
 * Usage: npm run test:pe-ic-breakers
 */
import { buildPEThesisBreakers } from "../src/lib/pe/pe-ic-breakers";
import { buildPEDDCase } from "../src/lib/pe/dd-lineage";
import { createPEDDFinding } from "../src/lib/pe/dd-validation";
import { buildPEEvidenceLineage } from "../src/lib/pe/evidence-lineage";
import { buildPEDecisionReadiness } from "../src/lib/pe/pe-decision-readiness";
import type { PEThesisItem } from "../src/lib/pe/pe-ic-decision-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function test1_onlyMaterialOpenFindingsBecomeBreakers() {
  const lineage = buildPEEvidenceLineage({});
  const ddCase = buildPEDDCase(lineage, [
    createPEDDFinding({ id: "f-critical-open", category: "LEGAL", title: "라이선스 해지 조항", description: "d", severity: "CRITICAL", status: "DRAFT" }),
    createPEDDFinding({ id: "f-medium-open", category: "OPERATIONAL", title: "경미한 이슈", description: "d", severity: "MEDIUM", status: "DRAFT" }),
    createPEDDFinding({ id: "f-critical-closed", category: "TAX", title: "이미 종결된 이슈", description: "d", severity: "CRITICAL", status: "CLOSED" }),
    createPEDDFinding({ id: "f-critical-rejected", category: "HR", title: "기각된 이슈", description: "d", severity: "CRITICAL", status: "REJECTED" }),
  ]);
  const readiness = buildPEDecisionReadiness({ periods: [] });
  const breakers = buildPEThesisBreakers(ddCase, [], readiness);
  const findingBreakerIds = breakers.filter((b) => b.sourceType === "DD_FINDING").map((b) => b.id);

  assert(findingBreakerIds.includes("DD_FINDING:f-critical-open"), "CRITICAL + open finding은 breaker여야 함");
  assert(!findingBreakerIds.includes("DD_FINDING:f-medium-open"), "MEDIUM severity는 breaker가 아니어야 함(CRITICAL/HIGH만)");
  assert(!findingBreakerIds.includes("DD_FINDING:f-critical-closed"), "CLOSED finding은 이미 결론이 난 상태라 breaker가 아니어야 함");
  assert(!findingBreakerIds.includes("DD_FINDING:f-critical-rejected"), "REJECTED finding은 breaker가 아니어야 함");
  console.log("✅ Test 1 — CRITICAL/HIGH + 열려있는 finding만 breaker(MEDIUM/CLOSED/REJECTED 제외)");
}

function test2_contradictedThesisBecomesBreaker() {
  const items: PEThesisItem[] = [
    { id: "c1", statement: "상충하는 주장", status: "CONTRADICTED", materiality: "MATERIAL", supportingEvidenceIds: [], supportingClaimIds: ["c1"] },
    { id: "c2", statement: "지지되는 주장", status: "SUPPORTED", materiality: "MATERIAL", supportingEvidenceIds: ["ev1"], supportingClaimIds: ["c2"] },
  ];
  const readiness = buildPEDecisionReadiness({ periods: [] });
  const breakers = buildPEThesisBreakers(undefined, items, readiness);
  const contradictedBreakers = breakers.filter((b) => b.sourceType === "CONTRADICTED_THESIS");
  assert(contradictedBreakers.length === 1 && contradictedBreakers[0].id === "CONTRADICTED_THESIS:c1", "CONTRADICTED thesis(c1)만 breaker가 되고 SUPPORTED(c2)는 되지 않아야 함");
  console.log("✅ Test 2 — CONTRADICTED thesis만 breaker화, SUPPORTED는 제외");
}

function test3_structuralGapOnlyWhenCommercialNotStarted() {
  const readinessNoCustomer = buildPEDecisionReadiness({ periods: [] }); // commercialCustomers 생략
  const breakersNoCustomer = buildPEThesisBreakers(undefined, [], readinessNoCustomer);
  assert(
    breakersNoCustomer.some((b) => b.sourceType === "STRUCTURAL_DATA_GAP" && b.currentState === "CANNOT_BE_ESTABLISHED"),
    "고객 데이터가 전혀 없으면 STRUCTURAL_DATA_GAP이 있어야 하고 상태는 반드시 CANNOT_BE_ESTABLISHED여야 함"
  );

  const readinessWithCustomer = buildPEDecisionReadiness({
    periods: [],
    commercialCustomers: [{ customerId: "c1", financialPeriodId: "p1", revenue: 100, currency: "KRW" }],
  });
  const breakersWithCustomer = buildPEThesisBreakers(undefined, [], readinessWithCustomer);
  assert(
    !breakersWithCustomer.some((b) => b.sourceType === "STRUCTURAL_DATA_GAP"),
    "고객 데이터가 있으면(COMMERCIAL != NOT_STARTED) structural gap을 만들면 안 됨"
  );
  console.log("✅ Test 3 — STRUCTURAL_DATA_GAP은 COMMERCIAL=NOT_STARTED일 때만 생성됨");
}

function main() {
  console.log("\n=== PE IC Thesis Breakers 테스트 ===\n");
  test1_onlyMaterialOpenFindingsBecomeBreakers();
  test2_contradictedThesisBecomesBreaker();
  test3_structuralGapOnlyWhenCommercialNotStarted();
  console.log("\n✅ PE IC Thesis Breakers 테스트 통과\n");
}

main();
