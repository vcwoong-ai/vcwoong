/**
 * PE Due Diligence Framework Core(PR-G) 검증.
 *
 * 이 레포의 다른 test:*와 동일한 관례 — DB/네트워크/AI 호출 없이 순수
 * 함수만 확인한다(jest/vitest 없음, tsx로 직접 실행). Financial DD
 * end-to-end 시나리오는 qoe.ts/qoe-lbo-bridge.ts(PR-D/PR-E, 둘 다 수정하지
 * 않음)와 evidence-lineage.ts(PR-F, 수정하지 않음)를 실제로 호출해서
 * 만든다.
 *
 * Usage: npm run test:dd-framework
 */
import { calculateAdjustedEbitda } from "../src/lib/pe/qoe";
import { bridgeQoEToLboEntryEbitda } from "../src/lib/pe/qoe-lbo-bridge";
import type { FinancialLineItemInput } from "../src/lib/pe/financial-types";
import type { QoEAdjustmentInput } from "../src/lib/pe/qoe-types";
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
import type { PEFinancialPeriodIdentity, PEEvidenceLineage } from "../src/lib/pe/evidence-lineage-types";
import {
  PE_DD_CATEGORIES,
  PE_DD_LBO_IMPACT_TARGETS,
  type PEDDFinding,
} from "../src/lib/pe/dd-types";
import {
  createPEDDFinding,
  linkFindingToEvidence,
  linkFindingToClaim,
  isValidFindingStatusTransition,
  transitionFindingStatus,
} from "../src/lib/pe/dd-validation";
import {
  buildPEDDCase,
  validatePEDDCase,
  findOrphanFindings,
  findUnsupportedFindings,
  findDanglingReferences,
} from "../src/lib/pe/dd-lineage";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertThrows(fn: () => void, msg: string) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, msg);
}

const FY2025: PEFinancialPeriodIdentity = {
  id: "period_fy2025",
  fiscalYear: 2025,
  periodType: "ANNUAL",
  currency: "KRW",
};

function baseFindingInput(overrides: Partial<Parameters<typeof createPEDDFinding>[0]> = {}) {
  return {
    id: "f_1",
    category: "FINANCIAL" as const,
    title: "테스트 finding",
    description: "테스트용 설명",
    severity: "MEDIUM" as const,
    status: "DRAFT" as const,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// Taxonomy
// ─────────────────────────────────────────────────────────────

function testAllCategoriesCreatable() {
  for (const category of PE_DD_CATEGORIES) {
    const finding = createPEDDFinding(baseFindingInput({ id: `cat_${category}`, category }));
    assert(finding.category === category, `${category} 카테고리로 finding이 생성되어야 함`);
  }
  console.log(`✅ Test 1 — 모든 DD category(${PE_DD_CATEGORIES.length}개) 생성`);
}

function testInvalidCategoryRejected() {
  assertThrows(
    () => createPEDDFinding(baseFindingInput({ category: "NOT_A_CATEGORY" as never })),
    "정의되지 않은 category는 reject되어야 함"
  );
  console.log("✅ Test 2 — invalid category reject");
}

// ─────────────────────────────────────────────────────────────
// Finding
// ─────────────────────────────────────────────────────────────

function testValidFinding() {
  const finding = createPEDDFinding(baseFindingInput());
  assert(finding.id === "f_1" && finding.evidenceIds.length === 0 && finding.claimIds.length === 0, "정상 finding 생성");
  console.log("✅ Test 3 — valid finding");
}

function testInvalidSeverityRejected() {
  assertThrows(
    () => createPEDDFinding(baseFindingInput({ severity: "SUPER_BAD" as never })),
    "정의되지 않은 severity는 reject되어야 함"
  );
  console.log("✅ Test 4 — invalid severity");
}

function testInvalidStatusRejected() {
  assertThrows(
    () => createPEDDFinding(baseFindingInput({ status: "DONE" as never })),
    "정의되지 않은 status는 reject되어야 함"
  );
  console.log("✅ Test 5 — invalid status");
}

function testMissingTitleRejected() {
  assertThrows(() => createPEDDFinding(baseFindingInput({ title: "" })), "빈 title은 reject되어야 함");
  console.log("✅ Test 6 — missing title");
}

// ─────────────────────────────────────────────────────────────
// Evidence
// ─────────────────────────────────────────────────────────────

function testFindingToEvidenceLink() {
  const source = createEvidenceSource({ id: "src_1", sourceType: "MANUAL", sourceName: "메모" });
  const evidence = createEvidenceItem({ id: "ev_1", sourceId: source.id });
  let finding = createPEDDFinding(baseFindingInput({ id: "f_ev" }));
  finding = linkFindingToEvidence(finding, evidence.id);
  const lineage = buildPEEvidenceLineage({ sources: [source], evidence: [evidence] });
  const ddCase = buildPEDDCase(lineage, [finding]);
  assert(validatePEDDCase(ddCase).status === "ok", "finding → evidence 연결이 정상이면 valid여야 함");
  console.log("✅ Test 7 — Finding → Evidence 연결");
}

function testDanglingEvidenceRejected() {
  let finding = createPEDDFinding(baseFindingInput({ id: "f_dangling_ev" }));
  finding = linkFindingToEvidence(finding, "ev_없음");
  const ddCase = buildPEDDCase(buildPEEvidenceLineage({}), [finding]);
  const result = validatePEDDCase(ddCase);
  assert(result.status === "invalid", "존재하지 않는 evidence 참조는 invalid여야 함");
  if (result.status === "invalid") {
    assert(result.issues.some((i) => i.rule === "dangling_evidence"), "dangling_evidence 이슈여야 함");
  }
  console.log("✅ Test 8 — dangling evidence reject");
}

function testFindingToClaimLink() {
  const claim = createClaim({ id: "claim_1", statement: "테스트 주장", claimType: "numeric" });
  let finding = createPEDDFinding(baseFindingInput({ id: "f_claim" }));
  finding = linkFindingToClaim(finding, claim.id);
  const ddCase = buildPEDDCase(buildPEEvidenceLineage({ claims: [claim] }), [finding]);
  assert(validatePEDDCase(ddCase).status === "ok", "finding → claim 연결이 정상이면 valid여야 함");
  console.log("✅ Test 9 — Finding → Claim 연결");
}

function testDanglingClaimRejected() {
  let finding = createPEDDFinding(baseFindingInput({ id: "f_dangling_claim" }));
  finding = linkFindingToClaim(finding, "claim_없음");
  const ddCase = buildPEDDCase(buildPEEvidenceLineage({}), [finding]);
  const result = validatePEDDCase(ddCase);
  assert(result.status === "invalid", "존재하지 않는 claim 참조는 invalid여야 함");
  if (result.status === "invalid") {
    assert(result.issues.some((i) => i.rule === "dangling_claim"), "dangling_claim 이슈여야 함");
  }
  console.log("✅ Test 10 — dangling claim reject");
}

// ─────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────

function testValidStatusTransition() {
  assert(isValidFindingStatusTransition("DRAFT", "IN_REVIEW"), "DRAFT → IN_REVIEW는 valid");
  const finding = createPEDDFinding(baseFindingInput({ id: "f_lifecycle_1", status: "DRAFT" }));
  const transitioned = transitionFindingStatus(finding, "IN_REVIEW");
  assert(transitioned.status === "IN_REVIEW", "transitionFindingStatus가 status를 실제로 바꿔야 함");
  console.log("✅ Test 11 — valid status transition(DRAFT → IN_REVIEW)");
}

function testInvalidStatusTransition() {
  assert(!isValidFindingStatusTransition("CLOSED", "DRAFT"), "CLOSED → DRAFT는 invalid");
  const finding = createPEDDFinding(baseFindingInput({ id: "f_lifecycle_2", status: "CLOSED" }));
  assertThrows(() => transitionFindingStatus(finding, "DRAFT"), "CLOSED → DRAFT는 throw되어야 함");
  console.log("✅ Test 12 — invalid status transition(CLOSED → DRAFT) reject");
}

function testRejectedFindingPath() {
  let finding = createPEDDFinding(baseFindingInput({ id: "f_rejected", status: "DRAFT" }));
  finding = transitionFindingStatus(finding, "IN_REVIEW");
  finding = transitionFindingStatus(finding, "REJECTED");
  assert(finding.status === "REJECTED", "DRAFT → IN_REVIEW → REJECTED 경로가 허용되어야 함");
  // REJECTED는 evidence 없어도 정상(§14) — requiresEvidenceForStatus가 false여야 함
  const ddCase = buildPEDDCase(buildPEEvidenceLineage({}), [finding]);
  assert(validatePEDDCase(ddCase).status === "ok", "REJECTED finding은 근거 없이도 valid여야 함");
  console.log("✅ Test 13 — rejected finding path(근거 없이도 valid)");
}

function testAcceptedFindingPath() {
  let finding = createPEDDFinding(baseFindingInput({ id: "f_accepted", status: "DRAFT" }));
  finding = transitionFindingStatus(finding, "IN_REVIEW");
  finding = transitionFindingStatus(finding, "CONFIRMED");
  finding = transitionFindingStatus(finding, "ACCEPTED");
  assert(finding.status === "ACCEPTED", "DRAFT → IN_REVIEW → CONFIRMED → ACCEPTED 경로가 허용되어야 함");
  console.log("✅ Test 14 — accepted finding path");
}

function testMitigatedFindingPath() {
  let finding = createPEDDFinding(baseFindingInput({ id: "f_mitigated", status: "DRAFT" }));
  finding = transitionFindingStatus(finding, "IN_REVIEW");
  finding = transitionFindingStatus(finding, "CONFIRMED");
  finding = transitionFindingStatus(finding, "MITIGATED");
  finding = transitionFindingStatus(finding, "CLOSED");
  assert(finding.status === "CLOSED", "DRAFT → IN_REVIEW → CONFIRMED → MITIGATED → CLOSED 경로가 허용되어야 함");
  console.log("✅ Test 15 — mitigated finding path");
}

// ─────────────────────────────────────────────────────────────
// Financial
// ─────────────────────────────────────────────────────────────

function testFinancialFindingWithPeriod() {
  const finding = createPEDDFinding(
    baseFindingInput({ id: "f_fin_period", category: "FINANCIAL", financialPeriodId: FY2025.id })
  );
  const ddCase = buildPEDDCase(buildPEEvidenceLineage({ periods: [FY2025] }), [finding]);
  assert(validatePEDDCase(ddCase).status === "ok", "정상 등록된 period를 참조하는 financial finding은 valid여야 함");
  console.log("✅ Test 16 — financial finding + financial period");
}

function testPeriodMismatchRejected() {
  const otherPeriod: PEFinancialPeriodIdentity = { id: "period_fy2024", fiscalYear: 2024, periodType: "ANNUAL", currency: "KRW" };
  const claim = createClaim({ id: "claim_2024", statement: "x", claimType: "numeric", financialPeriodId: otherPeriod.id });
  let finding = createPEDDFinding(baseFindingInput({ id: "f_period_mismatch", financialPeriodId: FY2025.id }));
  finding = linkFindingToClaim(finding, claim.id);
  const ddCase = buildPEDDCase(buildPEEvidenceLineage({ periods: [FY2025, otherPeriod], claims: [claim] }), [finding]);
  const result = validatePEDDCase(ddCase);
  assert(result.status === "invalid", "2025년 finding이 2024년 claim을 근거로 삼으면 invalid여야 함");
  if (result.status === "invalid") {
    assert(result.issues.some((i) => i.rule === "period_mismatch"), "period_mismatch 이슈여야 함");
  }
  console.log("✅ Test 17 — period mismatch reject");
}

function testCurrencyMismatchRejected() {
  const finding = createPEDDFinding(
    baseFindingInput({
      id: "f_currency_mismatch",
      financialPeriodId: FY2025.id,
      financialImpact: {
        metric: "EBITDA",
        amount: 1,
        currency: "USD", // FY2025 기간 통화(KRW)와 다름
        financialPeriodId: FY2025.id,
        direction: "DECREASE",
      },
    })
  );
  const ddCase = buildPEDDCase(buildPEEvidenceLineage({ periods: [FY2025] }), [finding]);
  const result = validatePEDDCase(ddCase);
  assert(result.status === "invalid", "financialImpact 통화가 기간 통화와 다르면 invalid여야 함");
  if (result.status === "invalid") {
    assert(result.issues.some((i) => i.rule === "currency_mismatch"), "currency_mismatch 이슈여야 함");
  }
  console.log("✅ Test 18 — currency mismatch reject");
}

function testFinancialImpactReference() {
  const finding = createPEDDFinding(
    baseFindingInput({
      id: "f_impact_ref",
      financialPeriodId: FY2025.id,
      financialImpact: {
        metric: "EBITDA",
        amount: 1_000_000_000,
        currency: "KRW",
        financialPeriodId: FY2025.id,
        direction: "DECREASE",
      },
    })
  );
  const ddCase = buildPEDDCase(buildPEEvidenceLineage({ periods: [FY2025] }), [finding]);
  assert(validatePEDDCase(ddCase).status === "ok", "이미 계산된 financialImpact를 참조하는 것만으로는 valid여야 함");
  assert(finding.financialImpact!.amount === 1_000_000_000, "impact 금액이 그대로 보존되어야 함(재계산 없음)");
  console.log("✅ Test 19 — financial impact reference");
}

function testNoAutomaticFinancialCalculation() {
  // COMMERCIAL finding에는 financialImpact를 아예 넣지 않았다 — 이 파일 어디에도
  // category로부터 financialImpact를 자동 생성하는 코드가 없음을 구조적으로 증명한다.
  const finding = createPEDDFinding(
    baseFindingInput({ id: "f_no_auto_calc", category: "COMMERCIAL", title: "Customer concentration" })
  );
  assert(finding.financialImpact === undefined, "COMMERCIAL finding에 financialImpact가 자동으로 생기면 안 됨");
  assert(finding.lboImpact === undefined, "COMMERCIAL finding에 lboImpact도 자동으로 생기면 안 됨");
  console.log("✅ Test 20 — no automatic financial calculation(cross-domain 자동 생성 없음)");
}

// ─────────────────────────────────────────────────────────────
// LBO
// ─────────────────────────────────────────────────────────────

function testLboImpactReference() {
  const finding = createPEDDFinding(
    baseFindingInput({
      id: "f_lbo_ref",
      lboImpact: { affectedTarget: "ENTRY_EBITDA", note: "일회성 비용 조정으로 Entry EBITDA 변동" },
    })
  );
  const ddCase = buildPEDDCase(buildPEEvidenceLineage({}), [finding]);
  assert(validatePEDDCase(ddCase).status === "ok", "유효한 LBO impact target 참조는 valid여야 함");
  assert(PE_DD_LBO_IMPACT_TARGETS.includes(finding.lboImpact!.affectedTarget), "affectedTarget이 허용된 목록에 있어야 함");
  console.log("✅ Test 21 — LBO impact reference");
}

function testInvalidLboReferenceRejected() {
  const finding: PEDDFinding = {
    ...createPEDDFinding(baseFindingInput({ id: "f_lbo_invalid" })),
    lboImpact: { affectedTarget: "NOT_A_TARGET" as never },
  };
  const ddCase = buildPEDDCase(buildPEEvidenceLineage({}), [finding]);
  const result = validatePEDDCase(ddCase);
  assert(result.status === "invalid", "정의되지 않은 LBO target은 invalid여야 함");
  if (result.status === "invalid") {
    assert(result.issues.some((i) => i.rule === "invalid_lbo_target"), "invalid_lbo_target 이슈여야 함");
  }
  console.log("✅ Test 22 — invalid LBO reference reject");
}

function testLboEngineNotModified() {
  // 이 테스트 파일도, dd-types.ts/dd-validation.ts/dd-lineage.ts도 lbo-model.ts를
  // import하지 않는다 — LBO 계산(MOIC/IRR/Entry EV 등)이 이 PR 어디에도 없음을
  // 구조적으로 증명한다. lboImpact는 target 이름(문자열 상수)만 참조할 뿐이다.
  const finding = createPEDDFinding(
    baseFindingInput({ id: "f_lbo_no_calc", lboImpact: { affectedTarget: "IRR" } })
  );
  assert(!("moic" in finding) && !("irr" in finding.lboImpact!), "Finding/LBO impact에 계산된 MOIC/IRR 값이 있으면 안 됨(참조만)");
  console.log("✅ Test 23 — LBO engine not modified(계산 없음, target 참조만)");
}

// ─────────────────────────────────────────────────────────────
// End-to-end
// ─────────────────────────────────────────────────────────────

function baseAdjustmentInput(overrides: Partial<QoEAdjustmentInput> & Pick<QoEAdjustmentInput, "adjustmentValue" | "status">): QoEAdjustmentInput {
  return {
    metric: "EBITDA",
    reportedValue: 100,
    reason: "테스트 조정",
    adjustmentType: "OTHER",
    sourceType: "MANUAL",
    ...overrides,
  };
}

function buildFinancialDdLineage(): { lineage: PEEvidenceLineage; finding: PEDDFinding } {
  const source = createEvidenceSource({
    id: "e2e_src_dd",
    sourceType: "UPLOADED_DOCUMENT",
    sourceName: "2025_실사보고서.pdf",
    sourceLocation: "17페이지",
  });
  const evidence = createEvidenceItem({
    id: "e2e_ev_dd",
    sourceId: source.id,
    locator: "17페이지",
    excerpt: "일회성 법률비용 10억원",
    confidence: 0.9,
  });
  let claim = createClaim({
    id: "e2e_claim_legal_fee",
    statement: "10억원의 일회성 법률비용이 2025년에 발생했다.",
    claimType: "numeric",
    financialPeriodId: FY2025.id,
  });
  claim = linkClaimToEvidence(claim, evidence.id);

  let fact = createFinancialFactReference({
    id: "e2e_fact_expense",
    financialPeriodId: FY2025.id,
    metric: "EBITDA",
    value: 1_000_000_000,
    currency: "KRW",
  });
  fact = linkFinancialFactToClaim(fact, claim.id);

  const adjustmentInput = baseAdjustmentInput({
    reportedValue: 10_000_000_000,
    adjustmentValue: 1_000_000_000,
    reason: "일회성 법률비용 제거",
    adjustmentType: "ONE_OFF_EXPENSE",
    status: "APPROVED",
    sourceType: "UPLOADED_DOCUMENT",
    sourceName: "2025_실사보고서.pdf",
    sourceLocation: "17페이지",
  });
  let adjustmentRef = createQoEAdjustmentReference({ id: "e2e_adj_1", financialPeriodId: FY2025.id, adjustment: adjustmentInput });
  adjustmentRef = linkAdjustmentToEvidence(adjustmentRef, evidence.id);
  adjustmentRef = linkAdjustmentToClaim(adjustmentRef, claim.id);

  const lineItems: FinancialLineItemInput[] = [{ lineItem: "EBITDA", value: 10_000_000_000, currency: "KRW", sourceType: "UPLOADED_DOCUMENT" }];
  const qoeResult = calculateAdjustedEbitda("KRW", lineItems, [adjustmentInput]);
  assert(qoeResult.adjustedEbitda.status === "ok" && qoeResult.adjustedEbitda.value === 11_000_000_000, "전제 조건: Adjusted EBITDA = 110억원");
  const qoeBuilt = createQoEResultLineageReference("e2e_qoe_1", FY2025.id, qoeResult, [adjustmentRef]);
  assert(qoeBuilt.status === "ok");
  const qoeRef = (qoeBuilt as { status: "ok"; reference: { id: string } }).reference;

  const bridgeResult = bridgeQoEToLboEntryEbitda(
    { financialPeriodId: FY2025.id, fiscalYear: FY2025.fiscalYear, periodType: FY2025.periodType },
    "KRW",
    qoeResult
  );
  assert(bridgeResult.status === "ok" && bridgeResult.lbo.entryEbitdaInEok === 110);
  const bridgeBuilt = createLboBridgeLineageReference("e2e_bridge_1", qoeRef.id, bridgeResult);
  assert(bridgeBuilt.status === "ok");
  const bridgeRef = (bridgeBuilt as { status: "ok"; reference: { id: string } }).reference;

  const lineage = buildPEEvidenceLineage({
    periods: [FY2025],
    sources: [source],
    evidence: [evidence],
    claims: [claim],
    financialFacts: [fact],
    adjustments: [adjustmentRef],
    qoeResults: [(qoeBuilt as { status: "ok"; reference: PEEvidenceLineage["qoeResults"][number] }).reference],
    lboBridges: [bridgeRef],
  });

  let finding = createPEDDFinding(
    baseFindingInput({
      id: "e2e_finding",
      category: "FINANCIAL",
      title: "일회성 법률비용 조정",
      description: "2025년 일회성 법률비용 10억원을 EBITDA에서 조정",
      severity: "MEDIUM",
      status: "CONFIRMED",
      financialPeriodId: FY2025.id,
      financialImpact: {
        metric: "EBITDA",
        amount: 1_000_000_000,
        currency: "KRW",
        financialPeriodId: FY2025.id,
        direction: "INCREASE",
        sourceAdjustmentId: adjustmentRef.id,
      },
      lboImpact: { affectedTarget: "ENTRY_EBITDA", lboBridgeLineageId: bridgeRef.id },
    })
  );
  finding = linkFindingToEvidence(finding, evidence.id);
  finding = linkFindingToClaim(finding, claim.id);

  return { lineage, finding };
}

function testFinancialDdEndToEnd() {
  const { lineage, finding } = buildFinancialDdLineage();
  const ddCase = buildPEDDCase(lineage, [finding]);
  const result = validatePEDDCase(ddCase);
  assert(result.status === "ok", `Financial DD end-to-end는 valid여야 함: ${result.status === "invalid" ? JSON.stringify(result.issues) : ""}`);

  // Finding → LBO Bridge → QoE Result → Adjustment → Evidence → Source까지 역추적
  const bridge = lineage.lboBridges.find((b) => b.id === finding.lboImpact!.lboBridgeLineageId)!;
  assert(bridge.provenance.entryEbitdaInEok === 110, "LBO Bridge까지 역추적하면 Entry EBITDA 110억원을 확인할 수 있어야 함");
  const src = lineage.sources.find((s) => s.id === "e2e_src_dd")!;
  assert(src.sourceName === "2025_실사보고서.pdf", "Finding에서 원본 Source까지 도달 가능해야 함");
  console.log("✅ Test 24 — Financial DD end-to-end(Source→Evidence→Claim→Fact→QoE Adjustment→QoE Result→LBO Bridge→Finding)");
}

function testCommercialDdEndToEnd() {
  const source = createEvidenceSource({ id: "e2e_src_customer", sourceType: "EXCEL", sourceName: "Customer analysis.xlsx" });
  const evidence = createEvidenceItem({
    id: "e2e_ev_customer",
    sourceId: source.id,
    locator: "Customer concentration sheet",
    excerpt: "Top 3 customers account for 68% of revenue.",
  });
  let claim = createClaim({ id: "e2e_claim_customer", statement: "Top 3 customers account for 68% of revenue.", claimType: "numeric" });
  claim = linkClaimToEvidence(claim, evidence.id);

  let finding = createPEDDFinding(
    baseFindingInput({
      id: "e2e_finding_commercial",
      category: "COMMERCIAL",
      title: "Customer concentration",
      description: "상위 3개 고객사가 매출의 68%를 차지",
      severity: "HIGH",
      status: "CONFIRMED",
    })
  );
  finding = linkFindingToEvidence(finding, evidence.id);
  finding = linkFindingToClaim(finding, claim.id);

  const lineage = buildPEEvidenceLineage({ sources: [source], evidence: [evidence], claims: [claim] });
  const ddCase = buildPEDDCase(lineage, [finding]);
  const result = validatePEDDCase(ddCase);
  assert(result.status === "ok", "Commercial DD는 valid여야 함(68%가 위험한지 판단하는 로직은 이 PR에 없음)");
  assert(finding.financialImpact === undefined, "Commercial finding에 financialImpact가 자동 생성되면 안 됨");
  console.log("✅ Test 25 — Commercial DD end-to-end(Source→Evidence→Claim→Commercial Finding)");
}

function testLegalDdEndToEnd() {
  const source = createEvidenceSource({ id: "e2e_src_contract", sourceType: "UPLOADED_DOCUMENT", sourceName: "Material_Contract_X.pdf" });
  const evidence = createEvidenceItem({ id: "e2e_ev_contract", sourceId: source.id, locator: "9조 3항" });
  let claim = createClaim({ id: "e2e_claim_coc", statement: "Change-of-control clause exists in material contract X.", claimType: "qualitative" });
  claim = linkClaimToEvidence(claim, evidence.id);

  // §12 예시는 status = OPEN을 쓰지만 이 저장소의 taxonomy는 OPEN이 아니라
  // DRAFT/IN_REVIEW를 쓴다(dd-types.ts 상단 표기 정정 참고) — IN_REVIEW로 매핑한다.
  let finding = createPEDDFinding(
    baseFindingInput({
      id: "e2e_finding_legal",
      category: "LEGAL",
      title: "Change-of-control clause",
      description: "핵심 계약에 지배권 변경 조항 존재",
      severity: "HIGH",
      status: "IN_REVIEW",
    })
  );
  finding = linkFindingToEvidence(finding, evidence.id);
  finding = linkFindingToClaim(finding, claim.id);

  const lineage = buildPEEvidenceLineage({ sources: [source], evidence: [evidence], claims: [claim] });
  const ddCase = buildPEDDCase(lineage, [finding]);
  const result = validatePEDDCase(ddCase);
  assert(result.status === "ok", "Legal DD는 valid여야 함");
  console.log("✅ Test 26 — Legal DD end-to-end(Source→Evidence→Claim→Legal Finding)");
}

function testOrphanFindingDetection() {
  const orphan = createPEDDFinding(baseFindingInput({ id: "f_orphan", status: "DRAFT" }));
  const supported = createPEDDFinding(baseFindingInput({ id: "f_supported", status: "DRAFT", evidenceIds: ["ev_x"] }));
  const source = createEvidenceSource({ id: "src_orphan_test", sourceType: "MANUAL", sourceName: "메모" });
  const evidence = createEvidenceItem({ id: "ev_x", sourceId: source.id });
  const ddCase = buildPEDDCase(buildPEEvidenceLineage({ sources: [source], evidence: [evidence] }), [orphan, supported]);

  const orphans = findOrphanFindings(ddCase);
  assert(orphans.length === 1 && orphans[0].id === "f_orphan", "evidence/claim이 모두 없는 finding만 orphan으로 검출되어야 함");
  console.log("✅ Test 27 — orphan finding detection");
}

function testProvenancePreservation() {
  const { lineage, finding } = buildFinancialDdLineage();
  assert(finding.financialImpact!.sourceAdjustmentId === "e2e_adj_1", "financialImpact.sourceAdjustmentId 보존");
  assert(finding.lboImpact!.lboBridgeLineageId === "e2e_bridge_1", "lboImpact.lboBridgeLineageId 보존");
  const adjustment = lineage.adjustments.find((a) => a.id === "e2e_adj_1")!;
  assert(adjustment.sourceName === "2025_실사보고서.pdf" && adjustment.sourceLocation === "17페이지", "Adjustment의 sourceName/sourceLocation 보존");
  assert(adjustment.reason === "일회성 법률비용 제거", "Adjustment reason 보존");
  const bridge = lineage.lboBridges.find((b) => b.id === "e2e_bridge_1")!;
  assert(bridge.provenance.fiscalYear === 2025 && bridge.provenance.periodType === "ANNUAL", "LBO Bridge provenance의 fiscalYear/periodType 보존");
  console.log("✅ Test 28 — provenance preservation(Finding 전체 체인)");
}

function testStatusSpecificEvidenceValidation() {
  const confirmedNoEvidence = createPEDDFinding(baseFindingInput({ id: "f_confirmed_no_ev", status: "CONFIRMED" }));
  const draftNoEvidence = createPEDDFinding(baseFindingInput({ id: "f_draft_no_ev", status: "DRAFT" }));
  const ddCase = buildPEDDCase(buildPEEvidenceLineage({}), [confirmedNoEvidence, draftNoEvidence]);

  const result = validatePEDDCase(ddCase);
  assert(result.status === "invalid", "CONFIRMED인데 근거가 없으면 invalid여야 함");
  if (result.status === "invalid") {
    assert(
      result.issues.some((i) => i.rule === "missing_evidence_for_status" && i.findingId === "f_confirmed_no_ev"),
      "missing_evidence_for_status가 CONFIRMED finding에 대해 발생해야 함"
    );
    assert(
      !result.issues.some((i) => i.rule === "missing_evidence_for_status" && i.findingId === "f_draft_no_ev"),
      "DRAFT finding은 근거 없이도 이 규칙 위반이 아니어야 함"
    );
  }

  const unsupported = findUnsupportedFindings(ddCase);
  assert(unsupported.length === 1 && unsupported[0].id === "f_confirmed_no_ev", "findUnsupportedFindings가 CONFIRMED-무근거만 찾아야 함");

  const dangling = findDanglingReferences(buildPEDDCase(buildPEEvidenceLineage({}), []));
  assert(dangling.length === 0, "참조가 없으면 findDanglingReferences는 빈 배열이어야 함");
  console.log("✅ Test 29 — status-specific evidence validation(CONFIRMED는 근거 필요, DRAFT는 불필요)");
}

function testDeterministicSameInputSameOutput() {
  const build = () => {
    const { lineage, finding } = buildFinancialDdLineage();
    return validatePEDDCase(buildPEDDCase(lineage, [finding]));
  };
  const first = build();
  const second = build();
  assert(JSON.stringify(first) === JSON.stringify(second), "동일 입력이면 항상 동일 출력이어야 한다(결정론)");
  console.log("✅ Test 30 — deterministic same-input/same-output");
}

function main() {
  console.log("\n=== DealMind PE Due Diligence Framework Core(PR-G) 테스트 ===\n");
  testAllCategoriesCreatable();
  testInvalidCategoryRejected();
  testValidFinding();
  testInvalidSeverityRejected();
  testInvalidStatusRejected();
  testMissingTitleRejected();
  testFindingToEvidenceLink();
  testDanglingEvidenceRejected();
  testFindingToClaimLink();
  testDanglingClaimRejected();
  testValidStatusTransition();
  testInvalidStatusTransition();
  testRejectedFindingPath();
  testAcceptedFindingPath();
  testMitigatedFindingPath();
  testFinancialFindingWithPeriod();
  testPeriodMismatchRejected();
  testCurrencyMismatchRejected();
  testFinancialImpactReference();
  testNoAutomaticFinancialCalculation();
  testLboImpactReference();
  testInvalidLboReferenceRejected();
  testLboEngineNotModified();
  testFinancialDdEndToEnd();
  testCommercialDdEndToEnd();
  testLegalDdEndToEnd();
  testOrphanFindingDetection();
  testProvenancePreservation();
  testStatusSpecificEvidenceValidation();
  testDeterministicSameInputSameOutput();
  console.log("\n✅ PE Due Diligence Framework Core(PR-G) 테스트 통과\n");
}

main();
