/**
 * PE IC Decision Assembler(pe-ic-decision.ts, pe-ic-thesis.ts, PR #108) 검증.
 *
 * buildPEDecisionReadiness()/calculateAdjustedEbitda()/qoe-lbo-bridge.ts
 * 자체의 판정 로직은 재검증하지 않는다(각자 전용 test:*가 이미 담당).
 * 여기서는 "그 출력들을 buildPEICDecision()이 재판단 없이 올바르게
 * 조립하는지", 그리고 "AI/추정 없이 정직한 상태만 만드는지"를 adversarial
 * 시나리오로 확인한다(PR #108 Step 13 데이터 시나리오 A~I 대부분 커버).
 *
 * Usage: npm run test:pe-ic-decision
 */
import { buildPEICDecision, type PEICDecisionInput } from "../src/lib/pe/pe-ic-decision";
import { buildPEDDCase } from "../src/lib/pe/dd-lineage";
import { createPEDDFinding, linkFindingToEvidence } from "../src/lib/pe/dd-validation";
import { buildPEEvidenceLineage, createEvidenceSource, createEvidenceItem, createClaim } from "../src/lib/pe/evidence-lineage";
import { buildPEDecisionReadiness, type PEDecisionPeriod, type ReadinessState } from "../src/lib/pe/pe-decision-readiness";
import type { FinancialCalcResult } from "../src/lib/pe/financial-types";
import type { PEDDCase } from "../src/lib/pe/dd-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function ok(value: number): FinancialCalcResult {
  return { status: "ok", value };
}
const missingInput: FinancialCalcResult = { status: "missing_input", missing: ["EBITDA"] };

function period(overrides: Partial<PEDecisionPeriod> & { fiscalYear: number }): PEDecisionPeriod {
  return {
    id: `period-${overrides.fiscalYear}-${overrides.periodType ?? "ANNUAL"}`,
    periodType: "ANNUAL",
    currency: "KRW",
    lineItems: [],
    adjustments: [],
    normalizedSummary: { revenue: missingInput, ebitda: missingInput, netDebt: missingInput },
    ...overrides,
  };
}

/** 최소 입력만 채우고 나머지는 buildPEICDecision()이 실제로 쓰는 필드만 넘긴다. */
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

// ── A. 완전히 빈 딜 — fabrication 없음 ────────────────────────────────

function testA_emptyDeal() {
  const readiness = buildPEDecisionReadiness({ periods: [] });
  const decision = buildPEICDecision(baseInput({ readiness }));

  assert(decision.processState === "NOT_READY", "빈 딜은 NOT_READY여야 함(BUY/PASS 아님)");
  assert(decision.thesis.length === 0, "claim이 없으면 thesis도 비어있어야 함");
  assert(decision.drivers.length === 0, "빈 딜에서 driver가 지어내지면 안 됨");
  assert(decision.dd.findingCount === 0, "ddCase 없으면 finding 0건");
  assert(decision.processStateReasons.length > 0, "processStateReasons는 최소 1개(readiness.summary) 있어야 함");
  const serialized = JSON.stringify(decision);
  for (const forbidden of ["BUY", "PASS", "\"moic\"", "\"irr\"", "투자 점수", "추천"]) {
    assert(!serialized.includes(forbidden), `IC Decision 출력에 금지 표현 "${forbidden}"가 없어야 함`);
  }
  console.log("✅ A — 빈 딜: NOT_READY, thesis/drivers 빈 배열, BUY/PASS/투자판단 fabrication 없음");
}

// ── B. 재무 충돌 — BLOCKED 전파 ─────────────────────────────────────────

function testB_financialConflict() {
  const p = period({
    fiscalYear: 2024,
    lineItems: [
      { id: "li-1", lineItem: "REVENUE", value: 1000, currency: "KRW", source: "DART" },
      { id: "li-2", lineItem: "REVENUE", value: 1200, currency: "KRW", source: "MANUAL" },
    ],
    normalizedSummary: { revenue: ok(1000), ebitda: ok(200), netDebt: ok(0) },
  });
  const readiness = buildPEDecisionReadiness({ periods: [p] });
  const decision = buildPEICDecision(baseInput({ readiness, financialQuality: { latestPeriodLabel: "FY2024", revenue: ok(1000), revenueGrowth: { status: "not_available" }, ebitda: ok(200), ebitdaMargin: { status: "not_available" }, netDebt: ok(0), netDebtToEbitda: { status: "not_available" } } }));

  assert(decision.processState === "BLOCKED", "재무 충돌 → 전체 프로세스 상태가 BLOCKED여야 함");
  assert(decision.financial.hasConflict, "financial snapshot이 충돌 존재를 표시해야 함");
  assert(decision.financial.conflictCount === 1, "충돌 건수가 정확해야 함");
  assert(decision.processStateReasons.some((r) => r.includes("REVENUE")), "processStateReasons에 실제 충돌 계정명이 포함돼야 함(지어낸 문구 아님)");
  console.log("✅ B — 재무 데이터 충돌: processState=BLOCKED, 충돌이 그대로 노출됨");
}

// ── C. LBO 가정 누락 ─────────────────────────────────────────────────────

function testC_missingLboAssumptions() {
  const readiness = buildPEDecisionReadiness({ periods: [] });
  const decision = buildPEICDecision(
    baseInput({ readiness, lboEntryEbitda: { status: "ok", lbo: { entryEbitdaInEok: 20 }, provenance: { fiscalPeriod: "FY2024", baseEbitdaKrw: 2_000_000_000, approvedAdjustmentTotalKrw: 0 } } as PEICDecisionInput["lboEntryEbitda"] })
  );
  assert(decision.lbo.entryEbitdaStatus === "ok", "Entry EBITDA가 있으면 ok여야 함");
  assert(decision.lbo.assumptionsMissing, "가정을 하나도 안 넘기면 assumptionsMissing=true여야 함");
  assert(decision.lbo.missingAssumptionLabels.length === 8, "8개 가정이 전부 미입력으로 잡혀야 함(자동 산정 안 함)");
  console.log("✅ C — LBO 가정 누락: assumptionsMissing=true, 8개 라벨 그대로 노출(MOIC/IRR 지어내지 않음)");
}

// ── D. DD finding + evidence ─────────────────────────────────────────────

function testD_findingWithEvidence() {
  const source = createEvidenceSource({ id: "src-1", sourceType: "UPLOADED_DOCUMENT", sourceName: "실사자료.pdf" });
  const evidence = createEvidenceItem({ id: "ev-1", sourceId: "src-1", excerpt: "고객 이탈률 상승" });
  const lineage = buildPEEvidenceLineage({ sources: [source], evidence: [evidence] });
  let finding = createPEDDFinding({ id: "f-1", category: "COMMERCIAL", title: "고객 집중도 리스크", description: "상위 3개 고객 60%", severity: "HIGH", status: "DRAFT" });
  finding = linkFindingToEvidence(finding, "ev-1");
  const ddCase = buildPEDDCase(lineage, [finding]);
  const readiness = buildPEDecisionReadiness({ periods: [], ddCase, evidenceLineage: lineage });
  const decision = buildPEICDecision(baseInput({ readiness, ddCase }));

  assert(decision.dd.findingCount === 1, "finding이 그대로 카운트돼야 함");
  assert(decision.dd.findings[0].id === "f-1", "dd.findings가 실제 finding을 그대로 담아야 함(메모 8/9섹션이 이걸 씀)");
  assert(decision.dd.openMaterialFindingCount === 1, "HIGH + open 상태는 openMaterialFindingCount에 포함돼야 함");
  assert(decision.breakers.some((b) => b.sourceType === "DD_FINDING" && b.id === "DD_FINDING:f-1"), "HIGH severity open finding은 thesis breaker가 돼야 함");
  console.log("✅ D — DD finding+evidence: dd snapshot에 반영, HIGH severity → thesis breaker 생성");
}

// ── E. Unsupported thesis — driver로 승격되면 안 됨 ─────────────────────

function testE_unsupportedThesisNeverBecomesDriver() {
  const claim = createClaim({ id: "claim-1", statement: "시장 점유율이 확대되고 있다", claimType: "qualitative", evidenceIds: [] });
  const lineage = buildPEEvidenceLineage({ claims: [claim] });
  const ddCase = buildPEDDCase(lineage, []);
  const readiness = buildPEDecisionReadiness({ periods: [], ddCase, evidenceLineage: lineage });
  const decision = buildPEICDecision(baseInput({ readiness, ddCase }));

  assert(decision.thesis.length === 1 && decision.thesis[0].status === "UNSUPPORTED", "근거 없는 claim은 UNSUPPORTED여야 함");
  assert(decision.drivers.length === 0, "UNSUPPORTED thesis는 절대 driver로 승격되면 안 됨(§5)");
  console.log("✅ E — 근거 없는 thesis: UNSUPPORTED로 남고 driver로 승격되지 않음");
}

// ── F. Contradicted thesis — factConflict와 겹치는 기간 ──────────────────

function testF_contradictedThesis() {
  const p = period({
    fiscalYear: 2024,
    lineItems: [
      { id: "li-1", lineItem: "REVENUE", value: 1000, currency: "KRW", source: "DART" },
      { id: "li-2", lineItem: "REVENUE", value: 1500, currency: "KRW", source: "MANUAL" },
    ],
    normalizedSummary: { revenue: ok(1000), ebitda: missingInput, netDebt: missingInput },
  });
  const claim = createClaim({ id: "claim-1", statement: "2024년 매출이 견조하게 성장했다", claimType: "qualitative", financialPeriodId: p.id, evidenceIds: ["ev-1"] });
  const source = createEvidenceSource({ id: "src-1", sourceType: "MANUAL", sourceName: "경영진 인터뷰" });
  const evidence = createEvidenceItem({ id: "ev-1", sourceId: "src-1" });
  const lineage = buildPEEvidenceLineage({ periods: [{ id: p.id, fiscalYear: 2024, periodType: "ANNUAL", currency: "KRW" }], sources: [source], evidence: [evidence], claims: [claim] });
  const ddCase = buildPEDDCase(lineage, []);
  const readiness = buildPEDecisionReadiness({ periods: [p], ddCase, evidenceLineage: lineage });
  const decision = buildPEICDecision(baseInput({ readiness, ddCase }));

  assert(decision.thesis[0].status === "CONTRADICTED", "factConflict가 있는 기간의 claim은 evidence가 있어도 CONTRADICTED여야 함");
  assert(decision.breakers.some((b) => b.sourceType === "CONTRADICTED_THESIS"), "CONTRADICTED thesis는 thesis breaker로도 나타나야 함");
  console.log("✅ F — 상충하는 재무 데이터를 가리키는 thesis: CONTRADICTED, breaker로도 노출");
}

// ── H. 고객 데이터 없음 → 추정하지 않음 ──────────────────────────────────

function testH_noCustomerDataNeverEstimated() {
  const readiness = buildPEDecisionReadiness({ periods: [] }); // commercialCustomers 생략 → COMMERCIAL=NOT_STARTED
  const decision = buildPEICDecision(baseInput({ readiness }));
  const gap = decision.breakers.find((b) => b.sourceType === "STRUCTURAL_DATA_GAP");
  assert(gap !== undefined, "고객 데이터가 없으면 STRUCTURAL_DATA_GAP breaker가 있어야 함");
  assert(gap!.currentState === "CANNOT_BE_ESTABLISHED", "고객 집중도는 CANNOT_BE_ESTABLISHED여야 함(추정 금지)");
  assert(!JSON.stringify(gap).match(/\d+%/), "고객 집중도 breaker에 지어낸 퍼센트 숫자가 없어야 함");
  console.log("✅ H — 고객 데이터 없음: CANNOT_BE_ESTABLISHED, 숫자를 추정하지 않음");
}

// ── I. QoE 조정 0건 — '클린'으로 오독되지 않음 ───────────────────────────

function testI_zeroAdjustmentsNotMisrepresented() {
  const p = period({
    fiscalYear: 2024,
    lineItems: [{ id: "li-1", lineItem: "EBITDA", value: 2_000_000_000, currency: "KRW", source: "MANUAL" }],
    normalizedSummary: { revenue: missingInput, ebitda: ok(2_000_000_000), netDebt: missingInput },
  });
  const readiness = buildPEDecisionReadiness({ periods: [p] });
  const decision = buildPEICDecision(
    baseInput({
      readiness,
      qoeSummary: { reportedEbitda: ok(2_000_000_000), adjustedEbitda: ok(2_000_000_000), approvedAdjustmentTotal: 0, counts: { total: 0, approved: 0, proposed: 0, draft: 0, rejected: 0 } },
    })
  );
  assert(decision.qoe.approvedAdjustmentCount === 0 && decision.qoe.totalAdjustmentCount === 0, "조정 0건은 그대로 0으로 남아야 함");
  assert(decision.qoe.reviewTrackingLimitation.length > 0, "'조정 0건'과 '검토 안 함'을 구분 못하는 한계가 명시돼야 함(§7과 동일 원칙)");
  console.log("✅ I — QoE 조정 0건: 숫자는 그대로 0, '검증 완료'로 과장되지 않음(한계 명시)");
}

// ── J. EBITDA 자체는 계산 가능해도 상위 재무가 BLOCKED면 신뢰 불가 경고 ──
// (실사용 중 발견 — REVENUE 충돌인데 LBO Entry EBITDA는 경고 없이 노출되는 문제)

function testJ_lboEntryOkButUpstreamBlockedMustWarn() {
  const p = period({
    fiscalYear: 2024,
    lineItems: [
      { id: "li-rev-1", lineItem: "REVENUE", value: 1000, currency: "KRW", source: "DART" },
      { id: "li-rev-2", lineItem: "REVENUE", value: 1200, currency: "KRW", source: "MANUAL" },
      { id: "li-ebitda", lineItem: "EBITDA", value: 200, currency: "KRW", source: "MANUAL" },
    ],
    normalizedSummary: { revenue: ok(1000), ebitda: ok(200), netDebt: missingInput },
  });
  const readiness = buildPEDecisionReadiness({ periods: [p] });
  // computeLboEntryEbitda 자체는 readiness와 무관하게 EBITDA line item만
  // 보고 계산에 성공한다(실제 ma-deal-dashboard.ts 동작 재현) — 이 테스트는
  // 그 "계산 성공"과 readiness의 "신뢰 불가(BLOCKED)" 판정이 함께 있을 때
  // buildPEICDecision이 그 간극을 숨기지 않는지 확인한다.
  const decision = buildPEICDecision(
    baseInput({
      readiness,
      lboEntryEbitda: { status: "ok", lbo: { entryEbitdaInEok: 20 }, provenance: { fiscalPeriod: "FY2024", baseEbitdaKrw: 200, approvedAdjustmentTotalKrw: 0 } } as PEICDecisionInput["lboEntryEbitda"],
    })
  );
  assert(decision.lbo.entryEbitdaStatus === "ok", "Entry EBITDA 자체는 계산 가능해야 함(값을 숨기지 않음)");
  assert(decision.lbo.upstreamBlocked, "상위 FINANCIAL이 BLOCKED면 upstreamBlocked=true로 신뢰 불가를 명시해야 함(§9 오도 방지)");
  console.log("✅ J — EBITDA 자체는 계산돼도 상위 재무가 BLOCKED면 upstreamBlocked=true로 신뢰 불가 경고");
}

// ── 결정론 ────────────────────────────────────────────────────────────

function testDeterminism() {
  const readiness = buildPEDecisionReadiness({ periods: [] });
  const input = baseInput({ readiness });
  const a = JSON.stringify(buildPEICDecision(input));
  const b = JSON.stringify(buildPEICDecision(input));
  assert(a === b, "같은 입력이면 항상 같은 IC Decision을 반환해야 함(결정론)");
  console.log("✅ 결정론 — 같은 입력 → 같은 출력");
}

function main() {
  console.log("\n=== PE IC Decision Assembler 테스트 ===\n");
  testA_emptyDeal();
  testB_financialConflict();
  testC_missingLboAssumptions();
  testD_findingWithEvidence();
  testE_unsupportedThesisNeverBecomesDriver();
  testF_contradictedThesis();
  testH_noCustomerDataNeverEstimated();
  testI_zeroAdjustmentsNotMisrepresented();
  testJ_lboEntryOkButUpstreamBlockedMustWarn();
  testDeterminism();
  console.log("\n✅ PE IC Decision Assembler 테스트 통과\n");
}

main();
