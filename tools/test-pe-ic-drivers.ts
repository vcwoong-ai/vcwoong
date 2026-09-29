/**
 * pe-ic-drivers.ts(PR #108) 검증 — buildPEInvestmentDrivers()가 SUPPORTED
 * thesis item만 승격하는지(§5 "지어낸 driver 금지"), financialRelevance가
 * 실제 finding.financialImpact에서만 오는지 확인한다.
 *
 * Usage: npm run test:pe-ic-drivers
 */
import { buildPEInvestmentDrivers } from "../src/lib/pe/pe-ic-drivers";
import { buildPEDDCase } from "../src/lib/pe/dd-lineage";
import { createPEDDFinding, linkFindingToClaim } from "../src/lib/pe/dd-validation";
import { buildPEEvidenceLineage } from "../src/lib/pe/evidence-lineage";
import type { PEThesisItem } from "../src/lib/pe/pe-ic-decision-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function thesisItem(overrides: Partial<PEThesisItem> & { id: string; status: PEThesisItem["status"] }): PEThesisItem {
  return { statement: "테스트 주장", materiality: "INFORMATIONAL", supportingEvidenceIds: [], supportingClaimIds: [overrides.id], ...overrides };
}

function test1_onlySupportedBecomesDrivers() {
  const items: PEThesisItem[] = [
    thesisItem({ id: "c1", status: "SUPPORTED" }),
    thesisItem({ id: "c2", status: "PARTIALLY_SUPPORTED" }),
    thesisItem({ id: "c3", status: "UNSUPPORTED" }),
    thesisItem({ id: "c4", status: "CONTRADICTED" }),
  ];
  const drivers = buildPEInvestmentDrivers(items, undefined);
  assert(drivers.length === 1 && drivers[0].id === "c1", "SUPPORTED 딱 1건만 driver가 돼야 함");
  console.log("✅ Test 1 — SUPPORTED만 driver로 승격, 나머지 3개 상태는 전부 제외");
}

function test2_financialRelevanceFromRealFindingOnly() {
  const items: PEThesisItem[] = [thesisItem({ id: "c1", status: "SUPPORTED" })];
  const lineage = buildPEEvidenceLineage({});
  let finding = createPEDDFinding({
    id: "f1",
    category: "FINANCIAL",
    title: "EBITDA 개선",
    description: "원가 절감으로 EBITDA 개선",
    severity: "LOW",
    status: "CONFIRMED",
    financialImpact: { metric: "EBITDA", amount: 100, currency: "KRW", financialPeriodId: "p1", direction: "INCREASE" },
  });
  finding = linkFindingToClaim(finding, "c1");
  const ddCase = buildPEDDCase(lineage, [finding]);

  const withImpact = buildPEInvestmentDrivers(items, ddCase);
  assert(withImpact[0].financialRelevance === "EBITDA 영향", "연결된 finding에 financialImpact가 있으면 그 metric을 그대로 노출해야 함");

  const withoutDdCase = buildPEInvestmentDrivers(items, undefined);
  assert(withoutDdCase[0].financialRelevance === undefined, "ddCase가 없으면 financialRelevance를 추정하지 않고 undefined여야 함");
  console.log("✅ Test 2 — financialRelevance는 실제 finding.financialImpact에서만 오고, 없으면 undefined(추정 없음)");
}

function main() {
  console.log("\n=== PE IC Drivers 테스트 ===\n");
  test1_onlySupportedBecomesDrivers();
  test2_financialRelevanceFromRealFindingOnly();
  console.log("\n✅ PE IC Drivers 테스트 통과\n");
}

main();
