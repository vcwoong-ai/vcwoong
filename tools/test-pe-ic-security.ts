/**
 * PE IC Decision — 구조적 격리 검증(PR #108, 순수 함수 레벨).
 *
 * `buildPEICDecision()`/`buildPEThesisItems()`/`buildPEInvestmentDrivers()`/
 * `buildPEThesisBreakers()`는 전부 순수 함수라 전역 상태·캐시가 없다 —
 * 이 테스트는 "Deal A의 데이터로 호출한 결과에 Deal B의 finding/evidence가
 * 절대 섞이지 않는다"는 구조적 보장을 회귀 테스트로 고정한다.
 *
 * 실제 인가 경계(비회원 접근 차단, 다른 딜 조회 시 not_found, ANALYST
 * 읽기 권한 등)는 이 파일이 아니라 라이브 DB 어드버서리얼 스크립트로
 * 검증했다(PR 설명 참고 — 이 저장소의 기존 관례상 라이브 DB 왕복 테스트는
 * test:all에 포함하지 않는다, pe-dd-persistence/PR #107의 관례와 동일).
 *
 * Usage: npm run test:pe-ic-security
 */
import { buildPEICDecision, type PEICDecisionInput } from "../src/lib/pe/pe-ic-decision";
import { buildPEDDCase } from "../src/lib/pe/dd-lineage";
import { createPEDDFinding, linkFindingToEvidence } from "../src/lib/pe/dd-validation";
import { buildPEEvidenceLineage, createEvidenceSource, createEvidenceItem, createClaim } from "../src/lib/pe/evidence-lineage";
import { buildPEDecisionReadiness } from "../src/lib/pe/pe-decision-readiness";
import type { FinancialCalcResult } from "../src/lib/pe/financial-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const missingInput: FinancialCalcResult = { status: "missing_input", missing: ["EBITDA"] };

function baseInput(overrides: Partial<PEICDecisionInput> & { readiness: PEICDecisionInput["readiness"] }): PEICDecisionInput {
  return {
    dealId: "deal-1",
    financialQuality: { latestPeriodLabel: null, revenue: missingInput, revenueGrowth: { status: "not_available" }, ebitda: missingInput, ebitdaMargin: { status: "not_available" }, netDebt: missingInput, netDebtToEbitda: { status: "not_available" } },
    qoeSummary: null,
    lboEntryEbitda: { status: "no_period" },
    dartStatus: { imported: false, periodsCount: 0, latestFiscalYear: null },
    ...overrides,
  };
}

function ddCaseFor(dealLabel: string) {
  const source = createEvidenceSource({ id: `${dealLabel}-src`, sourceType: "MANUAL", sourceName: `${dealLabel} 근거` });
  const evidence = createEvidenceItem({ id: `${dealLabel}-ev`, sourceId: `${dealLabel}-src` });
  const claim = createClaim({ id: `${dealLabel}-claim`, statement: `${dealLabel}만의 주장`, claimType: "qualitative", evidenceIds: [`${dealLabel}-ev`] });
  const lineage = buildPEEvidenceLineage({ sources: [source], evidence: [evidence], claims: [claim] });
  let finding = createPEDDFinding({ id: `${dealLabel}-finding`, category: "LEGAL", title: `${dealLabel}만의 finding`, description: "d", severity: "CRITICAL", status: "DRAFT" });
  finding = linkFindingToEvidence(finding, `${dealLabel}-ev`);
  return buildPEDDCase(lineage, [finding]);
}

// ── 1. Deal A 데이터로 조립한 결과에 Deal B의 finding/evidence가 절대 없음 ──

function test1_crossDealDataNeverLeaks() {
  const ddCaseA = ddCaseFor("dealA");
  const ddCaseB = ddCaseFor("dealB");
  const readinessA = buildPEDecisionReadiness({ periods: [], ddCase: ddCaseA, evidenceLineage: ddCaseA.lineage });
  const readinessB = buildPEDecisionReadiness({ periods: [], ddCase: ddCaseB, evidenceLineage: ddCaseB.lineage });

  const decisionA = buildPEICDecision(baseInput({ dealId: "dealA", readiness: readinessA, ddCase: ddCaseA }));
  const decisionB = buildPEICDecision(baseInput({ dealId: "dealB", readiness: readinessB, ddCase: ddCaseB }));

  assert(decisionA.dealId === "dealA" && decisionB.dealId === "dealB", "dealId가 각자 입력받은 값 그대로여야 함");
  assert(decisionA.dd.findings.every((f) => f.id === "dealA-finding"), "Deal A 결과는 Deal A finding만 포함해야 함");
  assert(decisionB.dd.findings.every((f) => f.id === "dealB-finding"), "Deal B 결과는 Deal B finding만 포함해야 함");
  assert(
    !JSON.stringify(decisionA).includes("dealB") && !JSON.stringify(decisionB).includes("dealA"),
    "직렬화된 결과 어디에도 다른 딜의 id/문구가 절대 섞이면 안 됨(evidence/thesis/breaker/questions 전부 포함해 전수 검사)"
  );
  console.log("✅ Test 1 — Deal A/B를 각각 조립해도 서로의 finding/evidence/claim이 절대 섞이지 않음");
}

// ── 2. 같은 프로세스에서 연속 호출해도 side-effect로 상태가 새지 않음(전역 캐시 없음) ──

function test2_noSharedMutableState() {
  const ddCaseA = ddCaseFor("dealA");
  const readinessA = buildPEDecisionReadiness({ periods: [], ddCase: ddCaseA, evidenceLineage: ddCaseA.lineage });
  const first = buildPEICDecision(baseInput({ dealId: "dealA", readiness: readinessA, ddCase: ddCaseA }));

  // 중간에 완전히 다른(비어있는) 딜을 여러 번 조립한다 — 이후 dealA를 다시
  // 조립했을 때 앞선 호출의 잔여 상태가 섞이면 안 된다.
  for (let i = 0; i < 5; i++) {
    const emptyReadiness = buildPEDecisionReadiness({ periods: [] });
    buildPEICDecision(baseInput({ dealId: `empty-${i}`, readiness: emptyReadiness }));
  }

  const second = buildPEICDecision(baseInput({ dealId: "dealA", readiness: readinessA, ddCase: ddCaseA }));
  assert(JSON.stringify(first) === JSON.stringify(second), "같은 입력을 반복 호출하면 중간 호출과 무관하게 항상 같은 결과여야 함(전역 mutable state 없음)");
  console.log("✅ Test 2 — 다른 딜을 여러 번 조립해도 이전 딜 재조립 결과가 오염되지 않음(전역 상태 없음)");
}

// ── 3. ddCase를 아예 안 주면 다른 딜의 잔여 정보가 새어 들어올 방법 자체가 없음 ──

function test3_undefinedDdCaseCannotLeakAnything() {
  const readiness = buildPEDecisionReadiness({ periods: [] });
  const decision = buildPEICDecision(baseInput({ dealId: "deal-no-dd", readiness }));
  assert(decision.dd.findings.length === 0 && decision.thesis.length === 0 && decision.breakers.filter((b) => b.sourceType !== "STRUCTURAL_DATA_GAP").length === 0, "ddCase가 undefined면 DD/thesis/evidence 기반 breaker가 전부 비어있어야 함");
  console.log("✅ Test 3 — ddCase 미제공 시 DD/thesis 관련 정보가 구조적으로 전혀 생길 수 없음");
}

function main() {
  console.log("\n=== PE IC Decision 구조적 격리(cross-deal) 테스트 ===\n");
  test1_crossDealDataNeverLeaks();
  test2_noSharedMutableState();
  test3_undefinedDdCaseCannotLeakAnything();
  console.log("\n✅ PE IC Decision 구조적 격리 테스트 통과\n");
}

main();
