/**
 * PE Evidence Lineage Core(PR-F) 검증.
 *
 * 이 레포의 다른 test:*와 동일한 관례 — DB/네트워크/AI 호출 없이 순수
 * 함수만 확인한다(jest/vitest 없음, tsx로 직접 실행). QoEResult/
 * QoEToLboBridgeResult는 각각 qoe.ts/qoe-lbo-bridge.ts(PR-D/PR-E, 둘 다
 * 수정하지 않음)를 그대로 호출해서 만든다 — lineage 입력을 손으로
 * 지어내지 않고 실제 엔진 출력을 그대로 태워 end-to-end로 검증한다.
 *
 * Usage: npm run test:evidence-lineage
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
  linkFinancialFactToEvidence,
  linkAdjustmentToEvidence,
  linkAdjustmentToClaim,
  buildPEEvidenceLineage,
  validatePEEvidenceLineage,
  findUnsupportedClaims,
  detectCycle,
} from "../src/lib/pe/evidence-lineage";
import type { PEFinancialPeriodIdentity } from "../src/lib/pe/evidence-lineage-types";

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

// ─────────────────────────────────────────────────────────────
// Source
// ─────────────────────────────────────────────────────────────

function testCreateDartSource() {
  const source = createEvidenceSource({
    id: "src_dart_1",
    sourceType: "DART",
    sourceName: "OpenDART 사업보고서",
  });
  assert(source.sourceType === "DART" && source.sourceLocation === undefined, "DART source: sourceLocation은 없는 게 정상");
  console.log("✅ Test 1 — DART source 생성(sourceLocation 없음이 정상)");
}

function testCreateUploadedPdfSource() {
  const source = createEvidenceSource({
    id: "src_pdf_1",
    sourceType: "UPLOADED_DOCUMENT",
    sourceName: "2025_실사보고서.pdf",
    sourceLocation: "42페이지",
  });
  assert(source.sourceLocation === "42페이지", "업로드 PDF source: 위치가 있으면 보존되어야 함");
  console.log("✅ Test 2 — Uploaded PDF source 생성(sourceLocation 있음)");
}

function testSourceLocationUndefinedAllowed() {
  const source = createEvidenceSource({ id: "src_2", sourceType: "MANUAL", sourceName: "심사역 메모" });
  assert(!("sourceLocation" in source) || source.sourceLocation === undefined, "sourceLocation 없음은 정상 상태여야 함(추정 금지)");
  console.log("✅ Test 3 — sourceLocation undefined 허용");
}

function testInvalidSourceRejected() {
  assertThrows(() => createEvidenceSource({ id: "", sourceType: "MANUAL", sourceName: "x" }), "빈 id는 reject되어야 함");
  assertThrows(() => createEvidenceSource({ id: "src_x", sourceType: "MANUAL", sourceName: "" }), "빈 sourceName은 reject되어야 함");
  console.log("✅ Test 4 — invalid source rejected(빈 id/sourceName)");
}

// ─────────────────────────────────────────────────────────────
// Evidence
// ─────────────────────────────────────────────────────────────

function testEvidenceLinkedToSource() {
  const source = createEvidenceSource({ id: "src_3", sourceType: "UPLOADED_DOCUMENT", sourceName: "IR.pdf" });
  const evidence = createEvidenceItem({ id: "ev_1", sourceId: source.id, excerpt: "2025년 매출 1,000억원" });
  const lineage = buildPEEvidenceLineage({ sources: [source], evidence: [evidence] });
  const result = validatePEEvidenceLineage(lineage);
  assert(result.status === "ok", "source와 정상 연결된 evidence는 valid해야 함");
  console.log("✅ Test 5 — Evidence가 Source와 정상 연결됨");
}

function testDanglingSourceRejected() {
  const evidence = createEvidenceItem({ id: "ev_2", sourceId: "src_없음" });
  const lineage = buildPEEvidenceLineage({ evidence: [evidence] });
  const result = validatePEEvidenceLineage(lineage);
  assert(result.status === "invalid", "존재하지 않는 source 참조는 invalid여야 함");
  if (result.status === "invalid") {
    assert(result.issues.some((i) => i.rule === "dangling_source"), "dangling_source 이슈가 있어야 함");
  }
  console.log("✅ Test 6 — 존재하지 않는 Source 참조 reject");
}

function testEvidenceIdentityDuplicate() {
  const source = createEvidenceSource({ id: "src_4", sourceType: "MANUAL", sourceName: "메모" });
  const evidenceA = createEvidenceItem({ id: "dup_1", sourceId: source.id });
  const evidenceB = createEvidenceItem({ id: "dup_1", sourceId: source.id }); // 같은 id 재사용
  const lineage = buildPEEvidenceLineage({ sources: [source], evidence: [evidenceA, evidenceB] });
  const result = validatePEEvidenceLineage(lineage);
  assert(result.status === "invalid", "동일 evidence id 중복은 invalid여야 함");
  if (result.status === "invalid") {
    assert(result.issues.some((i) => i.rule === "duplicate_id"), "duplicate_id 이슈여야 함");
  }
  console.log("✅ Test 7 — Evidence identity 중복 처리(duplicate_id)");
}

function testConfidenceBoundsAllowed() {
  createEvidenceItem({ id: "ev_conf_0", sourceId: "src_x", confidence: 0 });
  createEvidenceItem({ id: "ev_conf_1", sourceId: "src_x", confidence: 1 });
  console.log("✅ Test 8 — confidence 0 / 1 허용");
}

function testConfidenceOutOfRangeRejected() {
  assertThrows(() => createEvidenceItem({ id: "ev_neg", sourceId: "src_x", confidence: -0.01 }), "confidence < 0은 reject되어야 함");
  assertThrows(() => createEvidenceItem({ id: "ev_over", sourceId: "src_x", confidence: 1.01 }), "confidence > 1은 reject되어야 함");
  console.log("✅ Test 9 — confidence <0 / >1 reject");
}

// ─────────────────────────────────────────────────────────────
// Claim
// ─────────────────────────────────────────────────────────────

function testClaimLinkedToEvidence() {
  const source = createEvidenceSource({ id: "src_5", sourceType: "UPLOADED_DOCUMENT", sourceName: "IR.pdf" });
  const evidence = createEvidenceItem({ id: "ev_3", sourceId: source.id });
  let claim = createClaim({ id: "claim_1", statement: "2025년 매출은 1,000억원이다.", claimType: "numeric" });
  claim = linkClaimToEvidence(claim, evidence.id);
  const lineage = buildPEEvidenceLineage({ sources: [source], evidence: [evidence], claims: [claim] });
  const result = validatePEEvidenceLineage(lineage);
  assert(result.status === "ok", "claim → evidence 연결이 정상이면 valid여야 함");
  assert(claim.evidenceIds.includes(evidence.id), "claim이 evidence를 참조해야 함");
  console.log("✅ Test 10 — Claim → Evidence 연결");
}

function testEvidenceLessClaimAllowed() {
  const claim = createClaim({ id: "claim_2", statement: "일회성 법률비용이 발생했다.", claimType: "qualitative" });
  const lineage = buildPEEvidenceLineage({ claims: [claim] });
  const result = validatePEEvidenceLineage(lineage);
  assert(result.status === "ok", "evidence 없는 claim 자체는 reject 대상이 아님(evidence.ts unverified 선례)");
  const unsupported = findUnsupportedClaims(lineage);
  assert(unsupported.length === 1 && unsupported[0].id === "claim_2", "findUnsupportedClaims로 별도 추적은 가능해야 함");
  console.log("✅ Test 11 — evidence 없는 claim 처리(reject 아님, 별도 추적 가능)");
}

function testDanglingEvidenceOnClaimRejected() {
  const claim = createClaim({ id: "claim_3", statement: "x", claimType: "numeric", evidenceIds: ["ev_없음"] });
  const lineage = buildPEEvidenceLineage({ claims: [claim] });
  const result = validatePEEvidenceLineage(lineage);
  assert(result.status === "invalid", "존재하지 않는 evidence 참조는 invalid여야 함");
  if (result.status === "invalid") {
    assert(result.issues.some((i) => i.rule === "dangling_evidence"), "dangling_evidence 이슈여야 함");
  }
  console.log("✅ Test 12 — 존재하지 않는 Evidence 참조 reject");
}

// ─────────────────────────────────────────────────────────────
// Financial Fact
// ─────────────────────────────────────────────────────────────

function testFinancialFactLinkedToPeriod() {
  const fact = createFinancialFactReference({
    id: "fact_revenue",
    financialPeriodId: FY2025.id,
    metric: "REVENUE",
    value: 100_000_000_000,
    currency: "KRW",
  });
  const lineage = buildPEEvidenceLineage({ periods: [FY2025], financialFacts: [fact] });
  const result = validatePEEvidenceLineage(lineage);
  assert(result.status === "ok", "정상 기간에 연결된 fact는 valid여야 함");
  console.log("✅ Test 13 — Financial Fact ↔ Financial Period 연결");
}

function testRevenueFactLineage() {
  const source = createEvidenceSource({ id: "src_6", sourceType: "DART", sourceName: "OpenDART 사업보고서" });
  const evidence = createEvidenceItem({ id: "ev_4", sourceId: source.id });
  let claim = createClaim({ id: "claim_revenue", statement: "2025년 매출은 1,000억원이다.", claimType: "numeric", financialPeriodId: FY2025.id });
  claim = linkClaimToEvidence(claim, evidence.id);
  let fact = createFinancialFactReference({
    id: "fact_revenue_2",
    financialPeriodId: FY2025.id,
    metric: "REVENUE",
    value: 100_000_000_000,
    currency: "KRW",
  });
  fact = linkFinancialFactToClaim(fact, claim.id);
  const lineage = buildPEEvidenceLineage({ periods: [FY2025], sources: [source], evidence: [evidence], claims: [claim], financialFacts: [fact] });
  assert(validatePEEvidenceLineage(lineage).status === "ok", "Revenue fact lineage(source→evidence→claim→fact)는 valid여야 함");
  console.log("✅ Test 14 — Revenue fact lineage");
}

function testEbitFactLineage() {
  const fact = createFinancialFactReference({
    id: "fact_ebit",
    financialPeriodId: FY2025.id,
    metric: "EBIT",
    value: 8_000_000_000,
    currency: "KRW",
  });
  const lineage = buildPEEvidenceLineage({ periods: [FY2025], financialFacts: [fact] });
  assert(validatePEEvidenceLineage(lineage).status === "ok", "EBIT fact lineage는 valid여야 함");
  console.log("✅ Test 15 — EBIT fact lineage");
}

function testFactPeriodMismatchRejected() {
  const otherPeriod: PEFinancialPeriodIdentity = { id: "period_fy2025_q1", fiscalYear: 2025, periodType: "QUARTERLY", currency: "KRW" };
  let claim = createClaim({ id: "claim_mismatch", statement: "x", claimType: "numeric", financialPeriodId: otherPeriod.id });
  let fact = createFinancialFactReference({
    id: "fact_mismatch",
    financialPeriodId: FY2025.id, // ANNUAL
    metric: "REVENUE",
    value: 1,
    currency: "KRW",
  });
  fact = linkFinancialFactToClaim(fact, claim.id);
  const lineage = buildPEEvidenceLineage({ periods: [FY2025, otherPeriod], claims: [claim], financialFacts: [fact] });
  const result = validatePEEvidenceLineage(lineage);
  assert(result.status === "invalid", "2025 ANNUAL fact가 2025 QUARTERLY claim을 근거로 삼으면 invalid여야 함(같은 fiscalYear라도 period가 다름)");
  if (result.status === "invalid") {
    assert(result.issues.some((i) => i.rule === "period_mismatch"), "period_mismatch 이슈여야 함");
  }
  console.log("✅ Test 16 — Period mismatch reject(2025 annual ≠ 2025 quarterly)");
}

function testCurrencyMismatchRejected() {
  const fact = createFinancialFactReference({
    id: "fact_usd",
    financialPeriodId: FY2025.id, // KRW 기간
    metric: "REVENUE",
    value: 1,
    currency: "USD", // 기간 통화와 다름
  });
  const lineage = buildPEEvidenceLineage({ periods: [FY2025], financialFacts: [fact] });
  const result = validatePEEvidenceLineage(lineage);
  assert(result.status === "invalid", "기간 통화와 다른 fact는 invalid여야 함(자동 환산 없음)");
  if (result.status === "invalid") {
    assert(result.issues.some((i) => i.rule === "currency_mismatch"), "currency_mismatch 이슈여야 함");
  }
  console.log("✅ Test 17 — Currency mismatch reject(FX 자동 환산 없음)");
}

// ─────────────────────────────────────────────────────────────
// QoE
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

function testAdjustmentToEvidenceAndClaim() {
  const source = createEvidenceSource({ id: "src_7", sourceType: "UPLOADED_DOCUMENT", sourceName: "실사보고서.pdf" });
  const evidence = createEvidenceItem({ id: "ev_5", sourceId: source.id });
  let claim = createClaim({ id: "claim_adj", statement: "일회성 법률비용 10억원", claimType: "numeric", financialPeriodId: FY2025.id });
  claim = linkClaimToEvidence(claim, evidence.id);

  let adjustment = createQoEAdjustmentReference({
    id: "adj_1",
    financialPeriodId: FY2025.id,
    adjustment: baseAdjustmentInput({ adjustmentValue: 1_000_000_000, status: "APPROVED" }),
  });
  adjustment = linkAdjustmentToEvidence(adjustment, evidence.id);
  adjustment = linkAdjustmentToClaim(adjustment, claim.id);

  assert(adjustment.normalizedValue === 100 + 1_000_000_000, "normalizedValue = reportedValue + adjustmentValue(computeAdjustmentNormalizedValue 재사용)");

  const lineage = buildPEEvidenceLineage({
    periods: [FY2025],
    sources: [source],
    evidence: [evidence],
    claims: [claim],
    adjustments: [adjustment],
  });
  assert(validatePEEvidenceLineage(lineage).status === "ok", "adjustment → evidence/claim 연결이 정상이면 valid여야 함");
  console.log("✅ Test 18 — Adjustment → Evidence, Adjustment → Claim");
}

function testApprovedAdjustmentLineage() {
  const lineItems: FinancialLineItemInput[] = [{ lineItem: "EBITDA", value: 100, currency: "KRW", sourceType: "MANUAL" }];
  const approvedInput = baseAdjustmentInput({ adjustmentValue: 10, status: "APPROVED" });
  const qoeResult = calculateAdjustedEbitda("KRW", lineItems, [approvedInput]);
  const approvedRef = createQoEAdjustmentReference({ id: "adj_approved", financialPeriodId: FY2025.id, adjustment: approvedInput });

  const built = createQoEResultLineageReference("qoe_1", FY2025.id, qoeResult, [approvedRef]);
  assert(built.status === "ok", "APPROVED adjustment 1건 → QoE Result lineage 생성 성공해야 함");
  if (built.status === "ok") {
    assert(built.reference.approvedAdjustmentIds.length === 1 && built.reference.approvedAdjustmentIds[0] === "adj_approved", "APPROVED adjustment id가 lineage에 포함되어야 함");
    assert(built.reference.adjustedEbitdaKrw === 110, "Adjusted EBITDA = 100+10 = 110(재계산 아님, QoEResult 값 그대로)");
  }
  console.log("✅ Test 19 — APPROVED adjustment lineage(반영됨)");
}

function testProposedAdjustmentLineage() {
  const lineItems: FinancialLineItemInput[] = [{ lineItem: "EBITDA", value: 100, currency: "KRW", sourceType: "MANUAL" }];
  const proposedInput = baseAdjustmentInput({ adjustmentValue: 20, status: "PROPOSED" });
  const qoeResult = calculateAdjustedEbitda("KRW", lineItems, [proposedInput]); // qoe.ts가 이미 PROPOSED를 걸러냄
  const proposedRef = createQoEAdjustmentReference({ id: "adj_proposed", financialPeriodId: FY2025.id, adjustment: proposedInput });

  const built = createQoEResultLineageReference("qoe_2", FY2025.id, qoeResult, [proposedRef]);
  assert(built.status === "ok", "PROPOSED adjustment가 있어도 lineage 생성 자체는 성공해야 함(존재는 가능)");
  if (built.status === "ok") {
    assert(built.reference.approvedAdjustmentIds.length === 0, "PROPOSED는 approvedAdjustmentIds에 포함되면 안 됨");
    assert(built.reference.adjustedEbitdaKrw === 100, "PROPOSED는 Adjusted EBITDA에 미반영(qoe.ts APPROVED-only 계약)");
  }
  console.log("✅ Test 20 — PROPOSED adjustment lineage(존재는 가능, 계산 미반영)");
}

function testRejectedAdjustmentLineage() {
  const lineItems: FinancialLineItemInput[] = [{ lineItem: "EBITDA", value: 100, currency: "KRW", sourceType: "MANUAL" }];
  const rejectedInput = baseAdjustmentInput({ adjustmentValue: 20, status: "REJECTED" });
  const qoeResult = calculateAdjustedEbitda("KRW", lineItems, [rejectedInput]);
  const rejectedRef = createQoEAdjustmentReference({ id: "adj_rejected", financialPeriodId: FY2025.id, adjustment: rejectedInput });

  const built = createQoEResultLineageReference("qoe_3", FY2025.id, qoeResult, [rejectedRef]);
  assert(built.status === "ok", "REJECTED adjustment가 있어도 lineage 생성 자체는 성공해야 함");
  if (built.status === "ok") {
    assert(built.reference.approvedAdjustmentIds.length === 0, "REJECTED는 approvedAdjustmentIds에 포함되면 안 됨");
    assert(built.reference.adjustedEbitdaKrw === 100, "REJECTED는 Adjusted EBITDA에 미반영");
  }

  // lineage 그래프 레벨에서도 REJECTED adjustment 자체는 노드로 존재할 수 있다.
  const lineage = buildPEEvidenceLineage({ periods: [FY2025], adjustments: [rejectedRef], qoeResults: [built.status === "ok" ? built.reference : { id: "qoe_3", financialPeriodId: FY2025.id, baseEbitdaKrw: 100, approvedAdjustmentIds: [], adjustedEbitdaKrw: 100 }] });
  assert(validatePEEvidenceLineage(lineage).status === "ok", "REJECTED adjustment가 그래프에 존재하는 것 자체는 valid여야 함");
  console.log("✅ Test 21 — REJECTED adjustment lineage(존재는 가능, 계산 미반영)");
}

function testAdjustmentPeriodMismatchRejected() {
  const otherPeriod: PEFinancialPeriodIdentity = { id: "period_fy2024", fiscalYear: 2024, periodType: "ANNUAL", currency: "KRW" };
  let claim = createClaim({ id: "claim_2024", statement: "x", claimType: "numeric", financialPeriodId: otherPeriod.id });
  let adjustment = createQoEAdjustmentReference({
    id: "adj_mismatch",
    financialPeriodId: FY2025.id, // 2025
    adjustment: baseAdjustmentInput({ adjustmentValue: 10, status: "APPROVED" }),
  });
  adjustment = linkAdjustmentToClaim(adjustment, claim.id); // 근거는 2024년 claim
  const lineage = buildPEEvidenceLineage({ periods: [FY2025, otherPeriod], claims: [claim], adjustments: [adjustment] });
  const result = validatePEEvidenceLineage(lineage);
  assert(result.status === "invalid", "2025년 adjustment가 2024년 claim을 근거로 삼으면 invalid여야 함");
  if (result.status === "invalid") {
    assert(result.issues.some((i) => i.rule === "period_mismatch"), "period_mismatch 이슈여야 함");
  }
  console.log("✅ Test 22 — Adjustment period mismatch reject");
}

// ─────────────────────────────────────────────────────────────
// 추가 §10 규칙(순환, DART sourceLocation 계약, non_approved_in_result 등)
// ─────────────────────────────────────────────────────────────

function testCycleDetected() {
  const cyclicGraph = new Map<string, string[]>([
    ["a", ["b"]],
    ["b", ["c"]],
    ["c", ["a"]],
  ]);
  const cycle = detectCycle(cyclicGraph);
  assert(cycle !== null && cycle.includes("a") && cycle.includes("b") && cycle.includes("c"), "a→b→c→a 순환이 탐지되어야 함");

  const acyclicGraph = new Map<string, string[]>([
    ["a", ["b"]],
    ["b", ["c"]],
    ["c", []],
  ]);
  assert(detectCycle(acyclicGraph) === null, "순환이 없으면 null이어야 함");
  console.log("✅ Test 23 — Lineage cycle 탐지(순환 있음/없음 모두)");
}

function testDartEvidenceContractPreserved() {
  // §13 — DART source는 sourceLocation이 없는 게 정상이고, page/account
  // location을 추측해서 채우지 않는다(dart-adapter.ts의 실제 계약).
  const dartSource = createEvidenceSource({ id: "src_dart_2", sourceType: "DART", sourceName: "OpenDART 사업보고서" });
  const dartEvidence = createEvidenceItem({ id: "ev_dart_1", sourceId: dartSource.id });
  assert(dartSource.sourceLocation === undefined, "DART source의 sourceLocation은 undefined여야 함(추측 금지)");
  assert(dartEvidence.locator === undefined, "DART evidence의 locator도 추측해서 채우면 안 됨");
  const lineage = buildPEEvidenceLineage({ sources: [dartSource], evidence: [dartEvidence] });
  assert(validatePEEvidenceLineage(lineage).status === "ok", "sourceLocation 없는 DART evidence도 valid해야 함");
  console.log("✅ Test 24 — DART evidence 계약 보존(sourceLocation 추측 없음)");
}

function testNonApprovedAdjustmentInResultRejected() {
  // qoeResult 자체는 정상(REJECTED가 애초에 필터링됨)이지만, lineage 그래프를
  // 손으로 잘못 구성해 REJECTED adjustment의 id를 approvedAdjustmentIds에
  // 억지로 넣은 경우를 검증한다(빌더 함수를 거치지 않은 손상된 그래프 방어).
  const rejectedRef = createQoEAdjustmentReference({
    id: "adj_bad",
    financialPeriodId: FY2025.id,
    adjustment: baseAdjustmentInput({ adjustmentValue: 10, status: "REJECTED" }),
  });
  const malformedQoeResult = { id: "qoe_bad", financialPeriodId: FY2025.id, baseEbitdaKrw: 100, approvedAdjustmentIds: ["adj_bad"], adjustedEbitdaKrw: 100 };
  const lineage = buildPEEvidenceLineage({ periods: [FY2025], adjustments: [rejectedRef], qoeResults: [malformedQoeResult] });
  const result = validatePEEvidenceLineage(lineage);
  assert(result.status === "invalid", "REJECTED adjustment가 approvedAdjustmentIds에 있으면 invalid여야 함");
  if (result.status === "invalid") {
    assert(result.issues.some((i) => i.rule === "non_approved_in_result"), "non_approved_in_result 이슈여야 함");
  }
  console.log("✅ Test 25 — approvedAdjustmentIds에 비-APPROVED가 섞이면 reject");
}

// ─────────────────────────────────────────────────────────────
// End-to-end: DART/Financial Source → Financial Fact → Evidence → Claim
// → QoE Adjustment → Approved QoE Result → QoE → LBO Bridge → Entry EBITDA
// ─────────────────────────────────────────────────────────────

function testEndToEndLineage() {
  // 1) Source: DART 사업보고서
  const dartSource = createEvidenceSource({ id: "e2e_src_dart", sourceType: "DART", sourceName: "OpenDART 사업보고서" });
  // 2) Source: 실사 중 확보한 업로드 문서(일회성 비용 근거)
  const dueDiligenceSource = createEvidenceSource({
    id: "e2e_src_dd",
    sourceType: "UPLOADED_DOCUMENT",
    sourceName: "2025_실사보고서.pdf",
    sourceLocation: "17페이지",
  });

  // 3) Evidence
  const dartEvidence = createEvidenceItem({ id: "e2e_ev_dart", sourceId: dartSource.id, confidence: 1 });
  const ddEvidence = createEvidenceItem({
    id: "e2e_ev_dd",
    sourceId: dueDiligenceSource.id,
    locator: "17페이지",
    excerpt: "2025년 일회성 소송 합의금 10억원 지급",
    confidence: 0.9,
  });

  // 4) Claim
  let revenueClaim = createClaim({
    id: "e2e_claim_revenue",
    statement: "2025년 EBITDA는 100억원이다.",
    claimType: "numeric",
    financialPeriodId: FY2025.id,
  });
  revenueClaim = linkClaimToEvidence(revenueClaim, dartEvidence.id);

  let adjustmentClaim = createClaim({
    id: "e2e_claim_adjustment",
    statement: "일회성 소송 합의금 10억원은 EBITDA 조정 대상이다.",
    claimType: "numeric",
    financialPeriodId: FY2025.id,
  });
  adjustmentClaim = linkClaimToEvidence(adjustmentClaim, ddEvidence.id);

  // 5) Financial Fact — EBITDA 10,000,000,000원(100억원)
  let ebitdaFact = createFinancialFactReference({
    id: "e2e_fact_ebitda",
    financialPeriodId: FY2025.id,
    metric: "EBITDA",
    value: 10_000_000_000,
    currency: "KRW",
  });
  ebitdaFact = linkFinancialFactToClaim(ebitdaFact, revenueClaim.id);
  ebitdaFact = linkFinancialFactToEvidence(ebitdaFact, dartEvidence.id);

  // 6) QoE Adjustment — +10억원(APPROVED), 소송 합의금 근거
  const adjustmentInput = baseAdjustmentInput({
    reportedValue: 10_000_000_000,
    adjustmentValue: 1_000_000_000,
    reason: "일회성 소송 합의금 제거",
    adjustmentType: "ONE_OFF_EXPENSE",
    status: "APPROVED",
    sourceType: "UPLOADED_DOCUMENT",
    sourceName: "2025_실사보고서.pdf",
    sourceLocation: "17페이지",
  });
  let adjustmentRef = createQoEAdjustmentReference({
    id: "e2e_adj_1",
    financialPeriodId: FY2025.id,
    adjustment: adjustmentInput,
  });
  adjustmentRef = linkAdjustmentToEvidence(adjustmentRef, ddEvidence.id);
  adjustmentRef = linkAdjustmentToClaim(adjustmentRef, adjustmentClaim.id);

  // 7) QoE Result — qoe.ts(PR-D, 수정하지 않음)를 실제로 호출
  const lineItems: FinancialLineItemInput[] = [{ lineItem: "EBITDA", value: 10_000_000_000, currency: "KRW", sourceType: "DART" }];
  const qoeResult = calculateAdjustedEbitda("KRW", lineItems, [adjustmentInput]);
  assert(qoeResult.adjustedEbitda.status === "ok" && qoeResult.adjustedEbitda.value === 11_000_000_000, "전제 조건: Adjusted EBITDA = 110억원");

  const qoeLineageBuilt = createQoEResultLineageReference("e2e_qoe_1", FY2025.id, qoeResult, [adjustmentRef]);
  assert(qoeLineageBuilt.status === "ok", "QoE Result lineage 생성 성공해야 함");
  const qoeLineageRef = qoeLineageBuilt.status === "ok" ? qoeLineageBuilt.reference : null;
  assert(qoeLineageRef !== null);

  // 8) LBO Bridge — qoe-lbo-bridge.ts(PR-E, 수정하지 않음)를 실제로 호출
  const bridgeResult = bridgeQoEToLboEntryEbitda(
    { financialPeriodId: FY2025.id, fiscalYear: FY2025.fiscalYear, periodType: FY2025.periodType },
    "KRW",
    qoeResult
  );
  assert(bridgeResult.status === "ok" && bridgeResult.lbo.entryEbitdaInEok === 110, "전제 조건: LBO Entry EBITDA = 110억원");

  const bridgeLineageBuilt = createLboBridgeLineageReference("e2e_bridge_1", qoeLineageRef!.id, bridgeResult);
  assert(bridgeLineageBuilt.status === "ok", "LBO Bridge lineage 생성 성공해야 함");
  const bridgeLineageRef = bridgeLineageBuilt.status === "ok" ? bridgeLineageBuilt.reference : null;
  assert(bridgeLineageRef !== null);

  // 9) 전체 그래프 조립 + 검증
  const lineage = buildPEEvidenceLineage({
    periods: [FY2025],
    sources: [dartSource, dueDiligenceSource],
    evidence: [dartEvidence, ddEvidence],
    claims: [revenueClaim, adjustmentClaim],
    financialFacts: [ebitdaFact],
    adjustments: [adjustmentRef],
    qoeResults: [qoeLineageRef!],
    lboBridges: [bridgeLineageRef!],
  });
  const validation = validatePEEvidenceLineage(lineage);
  assert(validation.status === "ok", `end-to-end lineage는 valid여야 함: ${validation.status === "invalid" ? JSON.stringify(validation.issues) : ""}`);

  // 10) "어떤 LBO entry EBITDA가 어떤 source/evidence까지 연결되는가"를 programmatically 확인
  //     LBO → QoE Result → Adjustment(APPROVED) → Evidence → Source
  const bridge = lineage.lboBridges.find((b) => b.id === "e2e_bridge_1")!;
  const qr = lineage.qoeResults.find((q) => q.id === bridge.qoeResultLineageId)!;
  assert(qr.approvedAdjustmentIds.length === 1, "QoE Result가 정확히 1건의 APPROVED adjustment를 참조해야 함");
  const adj = lineage.adjustments.find((a) => a.id === qr.approvedAdjustmentIds[0])!;
  assert(adj.evidenceIds.includes(ddEvidence.id), "Adjustment가 실사보고서 evidence를 참조해야 함");
  const ev = lineage.evidence.find((e) => e.id === adj.evidenceIds[0])!;
  assert(ev.sourceId === dueDiligenceSource.id, "Evidence가 실사보고서 source를 참조해야 함");
  const src = lineage.sources.find((s) => s.id === ev.sourceId)!;
  assert(src.sourceName === "2025_실사보고서.pdf" && src.sourceLocation === "17페이지", "Source까지 도달해 원본 문서명·위치를 확인할 수 있어야 함");

  console.log("✅ Test 26 — End-to-end: Source→Evidence→Claim→Fact/Adjustment→QoE Result→LBO Bridge→Entry EBITDA(110억원)까지 전부 추적됨");
}

function testProvenancePreservedThroughout() {
  // §17 — 중간 단계에서 정보가 사라지지 않는지 각 필드를 명시적으로 확인
  const source = createEvidenceSource({
    id: "prov_src",
    sourceType: "UPLOADED_DOCUMENT",
    sourceName: "실사자료.pdf",
    sourceLocation: "5페이지",
  });
  const evidence = createEvidenceItem({ id: "prov_ev", sourceId: source.id, excerpt: "근거 발췌" });
  let claim = createClaim({ id: "prov_claim", statement: "근거 주장", claimType: "numeric", financialPeriodId: FY2025.id });
  claim = linkClaimToEvidence(claim, evidence.id);

  const adjustmentInput = baseAdjustmentInput({
    reportedValue: 100,
    adjustmentValue: 10,
    reason: "보존 확인용 사유",
    adjustmentType: "RESTRUCTURING",
    status: "APPROVED",
    sourceType: "UPLOADED_DOCUMENT",
    sourceName: "실사자료.pdf",
    sourceLocation: "5페이지",
  });
  let adjustmentRef = createQoEAdjustmentReference({ id: "prov_adj", financialPeriodId: FY2025.id, adjustment: adjustmentInput });
  adjustmentRef = linkAdjustmentToEvidence(adjustmentRef, evidence.id);
  adjustmentRef = linkAdjustmentToClaim(adjustmentRef, claim.id);

  const qoeResult = calculateAdjustedEbitda("KRW", [{ lineItem: "EBITDA", value: 100, currency: "KRW", sourceType: "MANUAL" }], [adjustmentInput]);
  const qoeBuilt = createQoEResultLineageReference("prov_qoe", FY2025.id, qoeResult, [adjustmentRef]);
  assert(qoeBuilt.status === "ok");
  const bridgeResult = bridgeQoEToLboEntryEbitda(
    { financialPeriodId: FY2025.id, fiscalYear: FY2025.fiscalYear, periodType: FY2025.periodType },
    "KRW",
    qoeResult
  );
  const bridgeBuilt = createLboBridgeLineageReference("prov_bridge", (qoeBuilt as { status: "ok"; reference: { id: string } }).reference.id, bridgeResult);
  assert(bridgeBuilt.status === "ok");
  const bridgeRef = (bridgeBuilt as { status: "ok"; reference: { provenance: { financialPeriodId: string; fiscalYear: number; periodType: string; currency: string; adjustedEbitdaKrw: number } } }).reference;

  assert(source.id === "prov_src" && evidence.sourceId === source.id, "source ID 보존");
  assert(evidence.id === "prov_ev" && adjustmentRef.evidenceIds.includes(evidence.id), "evidence ID 보존");
  assert(claim.id === "prov_claim" && adjustmentRef.claimIds.includes(claim.id), "claim ID 보존");
  assert(bridgeRef.provenance.financialPeriodId === FY2025.id, "financialPeriodId 보존");
  assert(bridgeRef.provenance.fiscalYear === FY2025.fiscalYear, "fiscalYear 보존");
  assert(bridgeRef.provenance.periodType === FY2025.periodType, "periodType 보존");
  assert(bridgeRef.provenance.currency === "KRW", "currency 보존");
  assert(adjustmentRef.id === "prov_adj", "adjustment ID 보존");
  assert(adjustmentRef.adjustmentType === "RESTRUCTURING", "adjustmentType 보존");
  assert(adjustmentRef.status === "APPROVED", "adjustment status 보존");
  assert(adjustmentRef.sourceName === "실사자료.pdf", "sourceName 보존");
  assert(adjustmentRef.sourceLocation === "5페이지", "sourceLocation 보존");
  assert(adjustmentRef.reason === "보존 확인용 사유", "reason 보존");
  console.log("✅ Test 27 — Provenance 전체 보존(source/evidence/claim/기간/adjustment 필드 전부)");
}

function main() {
  console.log("\n=== DealMind PE Evidence Lineage Core(PR-F) 테스트 ===\n");
  testCreateDartSource();
  testCreateUploadedPdfSource();
  testSourceLocationUndefinedAllowed();
  testInvalidSourceRejected();
  testEvidenceLinkedToSource();
  testDanglingSourceRejected();
  testEvidenceIdentityDuplicate();
  testConfidenceBoundsAllowed();
  testConfidenceOutOfRangeRejected();
  testClaimLinkedToEvidence();
  testEvidenceLessClaimAllowed();
  testDanglingEvidenceOnClaimRejected();
  testFinancialFactLinkedToPeriod();
  testRevenueFactLineage();
  testEbitFactLineage();
  testFactPeriodMismatchRejected();
  testCurrencyMismatchRejected();
  testAdjustmentToEvidenceAndClaim();
  testApprovedAdjustmentLineage();
  testProposedAdjustmentLineage();
  testRejectedAdjustmentLineage();
  testAdjustmentPeriodMismatchRejected();
  testCycleDetected();
  testDartEvidenceContractPreserved();
  testNonApprovedAdjustmentInResultRejected();
  testEndToEndLineage();
  testProvenancePreservedThroughout();
  console.log("\n✅ PE Evidence Lineage Core(PR-F) 테스트 통과\n");
}

main();
