/**
 * PE IC Synthesis + End-to-end(PR-I) 검증 — §81 [Synthesis]/[End-to-end]
 * (항목 41-50).
 *
 * §54/§82 요구대로 실제 LLM API를 호출하지 않는다 — mock JSON을 real
 * parser/real validator/real PR-D/PR-E/PR-F/PR-G/PR-H로 통과시킨다.
 *
 * Usage: npm run test:pe-synthesis
 */
import { parseFactExtractionResponse, validateFactCandidate, type PEFactValidationContext } from "../src/lib/pe/pe-fact-validation";
import { buildQoEAdjustmentCandidateFromExtraction } from "../src/lib/pe/pe-fact-extraction";
import { reconcileFacts } from "../src/lib/pe/pe-fact-reconciliation";
import type { PEFactCandidate, RawAIExtractedFact, RawAISynthesisNarrative } from "../src/lib/pe/pe-fact-types";
import { factCandidateToCustomerRevenueInput } from "../src/lib/pe/pe-fact-types";
import { buildSynthesisSkeleton, mergeAISynthesisNarrative, type SynthesisGroundingPool } from "../src/lib/pe/pe-dd-synthesis";
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
  validatePEEvidenceLineage,
} from "../src/lib/pe/evidence-lineage";
import type { PEFinancialPeriodIdentity } from "../src/lib/pe/evidence-lineage-types";
import { normalizeFinancialPeriod } from "../src/lib/pe/financial-normalization";
import { calculateAdjustedEbitda } from "../src/lib/pe/qoe";
import { bridgeQoEToLboEntryEbitda } from "../src/lib/pe/qoe-lbo-bridge";
import type { FinancialLineItemInput } from "../src/lib/pe/financial-types";
import type { QoEAdjustmentInput } from "../src/lib/pe/qoe-types";
import { calculateRevenueGrowth, calculateEbitdaMargin, calculateAdjustedEbitdaRatio, type PEDDFinancialPeriodInputs } from "../src/lib/pe/dd-financial";
import { calculateCustomerConcentration } from "../src/lib/pe/dd-commercial";
import type { PEDDCustomerRevenueInput } from "../src/lib/pe/dd-metrics-types";
import { createPEDDFinding } from "../src/lib/pe/dd-validation";
import { buildPEDDCase, validatePEDDCase } from "../src/lib/pe/dd-lineage";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function fy(fiscalYear: number, id?: string): PEFinancialPeriodIdentity {
  return { id: id ?? `period_fy${fiscalYear}`, fiscalYear, periodType: "ANNUAL", currency: "KRW" };
}

function toLineItem(f: PEFactCandidate): FinancialLineItemInput {
  return { lineItem: f.metric as FinancialLineItemInput["lineItem"], value: f.value, currency: f.currency ?? "KRW", sourceType: "UPLOADED_DOCUMENT" };
}

// ═════════════════════════════════════════════════════════════
// Synthesis(41-45)
// ═════════════════════════════════════════════════════════════

function test41_groundedSynthesis() {
  const { ctx, evidenceId } = (() => {
    const source = createEvidenceSource({ id: "s41_src", sourceType: "UPLOADED_DOCUMENT", sourceName: "IR.pdf" });
    const evidence = createEvidenceItem({ id: "s41_ev", sourceId: source.id });
    return { ctx: { evidenceById: new Map([[evidence.id, evidence]]), sourceById: new Map([[source.id, source]]) } as PEFactValidationContext, evidenceId: evidence.id };
  })();
  const fact = validateFactCandidate({ factType: "FINANCIAL", metric: "REVENUE", value: 12_000_000_000, unit: "KRW", currency: "KRW", fiscalYear: 2025, periodType: "FY2025", sourceEvidenceId: evidenceId }, "doc_41", ctx);
  const skeleton = buildSynthesisSkeleton({ facts: [fact], financialObservations: [], commercialObservations: [], findings: [], conflicts: [] });
  assert(skeleton.keyFacts.length === 1, "fact 1건 → keyFacts 1건");
  assert(skeleton.keyFacts[0].factIds.includes(fact.id) && skeleton.keyFacts[0].evidenceIds.includes(evidenceId), "skeleton item은 원본 fact/evidence ID를 그대로 참조해야 함(근거 없는 문장 없음)");
  console.log("✅ Test 41 — grounded synthesis(항상 원본 참조)");
}

function test42_evidenceReferencesPreserved() {
  const skeleton = buildSynthesisSkeleton({ facts: [], financialObservations: [], commercialObservations: [], findings: [], conflicts: [] });
  const pool: SynthesisGroundingPool = { evidenceIds: new Set(["ev_42"]), claimIds: new Set(), factIds: new Set() };
  const narrative: RawAISynthesisNarrative = { section: "openQuestions", text: "Debt schedule was not provided.", evidenceIds: ["ev_42"] };
  const report = mergeAISynthesisNarrative(skeleton, [narrative], pool);
  assert(report.accepted === 1 && report.synthesis.openQuestions[0].evidenceIds.includes("ev_42"), "유효한 참조를 가진 narrative는 evidenceIds가 보존된 채 병합되어야 함");
  console.log("✅ Test 42 — evidence references preserved");
}

function test43_unsupportedClaimRejected() {
  const skeleton = buildSynthesisSkeleton({ facts: [], financialObservations: [], commercialObservations: [], findings: [], conflicts: [] });
  const pool: SynthesisGroundingPool = { evidenceIds: new Set(), claimIds: new Set(), factIds: new Set() };
  const ungrounded: RawAISynthesisNarrative = { section: "keyFacts", text: "The company has strong pricing power." }; // 근거 ID 없음
  const report = mergeAISynthesisNarrative(skeleton, [ungrounded], pool);
  assert(report.accepted === 0 && report.rejected.length === 1, "근거 ID 없는 주장은 병합되지 않고 거부되어야 함(§35, §60)");
  console.log("✅ Test 43 — unsupported claim rejected(근거 없는 주장)");
}

function test44_openQuestionGenerated() {
  const skeleton = buildSynthesisSkeleton({ facts: [], financialObservations: [], commercialObservations: [], findings: [], conflicts: [] });
  const pool: SynthesisGroundingPool = { evidenceIds: new Set(), claimIds: new Set(), factIds: new Set(["fact_missing_debt"]) };
  const narrative: RawAISynthesisNarrative = { section: "openQuestions", text: "Net Debt could not be computed — Debt/Cash line items were not found in the data room.", factIds: ["fact_missing_debt"] };
  const report = mergeAISynthesisNarrative(skeleton, [narrative], pool);
  assert(report.synthesis.openQuestions.length === 1, "gap을 openQuestion으로 표현할 수 있어야 함(§36, '추론'이 아니라 '없다'는 사실만)");
  assert(!report.synthesis.openQuestions[0].text.includes("probably"), "AI가 추측성 표현을 담아도 이 파일이 걸러내진 않지만, 최소한 grounded 여부는 검증되어야 함");
  console.log("✅ Test 44 — open question generated");
}

function test45_conflictSurfaced() {
  const skeleton = buildSynthesisSkeleton({
    facts: [],
    financialObservations: [],
    commercialObservations: [],
    findings: [],
    conflicts: [{ id: "c1", factIds: ["f1", "f2"], conflictType: "VALUE_MISMATCH", metric: "REVENUE", fiscalYear: 2025, periodType: "ANNUAL", resolutionStatus: "UNRESOLVED" }],
  });
  assert(skeleton.conflicts.length === 1 && skeleton.conflicts[0].text.includes("미해결"), "conflict는 synthesis에 그대로 드러나야 함(자동 해결 없음)");
  console.log("✅ Test 45 — conflict surfaced(UNRESOLVED 그대로)");
}

// ═════════════════════════════════════════════════════════════
// End-to-end(46-50)
// ═════════════════════════════════════════════════════════════

/** §41 Fixture — "2024 revenue 100억원" / "2025 revenue 120억원" / "2025 EBITDA 15억원" */
function test46_financialFullFlow() {
  const source = createEvidenceSource({ id: "e46_src", sourceType: "UPLOADED_DOCUMENT", sourceName: "IR_deck.pdf", sourceLocation: "8페이지" });
  const evidence = createEvidenceItem({ id: "e46_ev", sourceId: source.id, locator: "8페이지" });
  const ctx: PEFactValidationContext = { evidenceById: new Map([[evidence.id, evidence]]), sourceById: new Map([[source.id, source]]) };

  const mockAIResponse = JSON.stringify({
    documentId: "doc_46",
    facts: [
      { factType: "FINANCIAL", metric: "REVENUE", value: 10_000_000_000, unit: "KRW", currency: "KRW", fiscalYear: 2024, periodType: "FY2024", sourceEvidenceId: "e46_ev", confidence: 0.95 },
      { factType: "FINANCIAL", metric: "REVENUE", value: 12_000_000_000, unit: "KRW", currency: "KRW", fiscalYear: 2025, periodType: "FY2025", sourceEvidenceId: "e46_ev", confidence: 0.95 },
      { factType: "FINANCIAL", metric: "EBITDA", value: 1_500_000_000, unit: "KRW", currency: "KRW", fiscalYear: 2025, periodType: "FY2025", sourceEvidenceId: "e46_ev", confidence: 0.9 },
    ],
  });

  const parsed = parseFactExtractionResponse(mockAIResponse);
  assert(parsed.status === "ok", "mock AI 응답이 파싱되어야 함");
  const candidates = parsed.status === "ok" ? parsed.extraction.facts.map((f) => validateFactCandidate(f, "doc_46", ctx)) : [];
  assert(candidates.every((c) => c.status === "VALIDATED"), "3건 모두 VALIDATED여야 함");

  const rev2024 = candidates.find((c) => c.fiscalYear === 2024)!;
  const rev2025 = candidates.find((c) => c.metric === "REVENUE" && c.fiscalYear === 2025)!;
  const ebitda2025 = candidates.find((c) => c.metric === "EBITDA")!;

  const p2024: PEDDFinancialPeriodInputs = { period: fy(2024), summary: normalizeFinancialPeriod({ periodCurrency: "KRW", lineItems: [toLineItem(rev2024)] }) };
  const p2025: PEDDFinancialPeriodInputs = { period: fy(2025), summary: normalizeFinancialPeriod({ periodCurrency: "KRW", lineItems: [toLineItem(rev2025), toLineItem(ebitda2025)] }) };

  const growth = calculateRevenueGrowth("t46_growth", p2025, p2024);
  const margin = calculateEbitdaMargin("t46_margin", fy(2025), p2025.summary.revenue, p2025.summary.ebitda, "REPORTED");
  assert(growth.status === "available" && Math.abs(growth.value! - 0.2) < 1e-9, "AI extraction → PR-H: Revenue YoY = 20%(AI가 직접 계산하지 않음)");
  assert(margin.status === "available" && Math.abs(margin.value! - 0.125) < 1e-9, "AI extraction → PR-H: EBITDA Margin = 12.5%");
  console.log("✅ Test 46 — Financial full flow(§41 fixture: YoY 20%, margin 12.5%)");
}

/**
 * §42 Fixture — Customer A~F(PR-I.1 Finding #9 재작성: 이제 손으로 만든
 * 독립 customer 배열을 쓰지 않는다 — raw AI JSON → parse → validate →
 * PEFactCandidate → factCandidateToCustomerRevenueInput() 어댑터 → PR-H
 * concentration까지 실제로 한 줄로 이어진다.
 */
function test47_commercialFullFlow() {
  const period = fy(2025, "e47_period");
  const source = createEvidenceSource({ id: "e47_src", sourceType: "EXCEL", sourceName: "Customer_analysis.xlsx" });
  const evidence = createEvidenceItem({ id: "e47_ev", sourceId: source.id, locator: "sheet: Customers" });
  const ctx: PEFactValidationContext = { evidenceById: new Map([[evidence.id, evidence]]), sourceById: new Map([[source.id, source]]) };

  const customerValues: Array<[string, number]> = [["A", 40], ["B", 20], ["C", 10], ["D", 10], ["E", 10], ["F", 10]];
  const mockAIResponse = JSON.stringify({
    documentId: "doc_47",
    facts: customerValues.map(([customerId, value]) => ({
      factType: "COMMERCIAL",
      metric: "CUSTOMER_REVENUE",
      value,
      unit: "KRW",
      currency: "KRW",
      fiscalYear: 2025,
      periodType: "FY2025",
      sourceEvidenceId: "e47_ev",
      customerId,
    })),
  });
  const parsed = parseFactExtractionResponse(mockAIResponse);
  assert(parsed.status === "ok", "mock AI 응답이 파싱되어야 함");
  const candidates = parsed.status === "ok" ? parsed.extraction.facts.map((f) => validateFactCandidate(f, "doc_47", ctx)) : [];
  assert(candidates.every((c) => c.status === "VALIDATED"), "6건 모두 VALIDATED여야 함(customerId 포함)");

  // 어댑터로만 변환한다 — concentration 계산은 일절 하지 않는다(PR-H 책임).
  const customers: PEDDCustomerRevenueInput[] = candidates
    .map((c) => factCandidateToCustomerRevenueInput(c, period.id))
    .filter((c): c is PEDDCustomerRevenueInput => c !== null);
  assert(customers.length === 6, "6건 전부 어댑터를 통과해야 함");

  const top1 = calculateCustomerConcentration("t47_1", "CUSTOMER_CONCENTRATION_TOP1", 1, period, customers, { value: 100, source: "SUM_OF_FULL_CUSTOMER_POPULATION" });
  const top3 = calculateCustomerConcentration("t47_3", "CUSTOMER_CONCENTRATION_TOP3", 3, period, customers, { value: 100, source: "SUM_OF_FULL_CUSTOMER_POPULATION" });
  const top5 = calculateCustomerConcentration("t47_5", "CUSTOMER_CONCENTRATION_TOP5", 5, period, customers, { value: 100, source: "SUM_OF_FULL_CUSTOMER_POPULATION" });
  assert(top1.value === 0.4 && top3.value === 0.7 && top5.value === 0.9, "AI extraction → validated fact → adapter → PR-H: Top1/3/5 = 40%/70%/90%(AI는 concentration을 계산하지 않음)");
  console.log("✅ Test 47 — Commercial full flow(§42 fixture: fact→adapter→PR-H로 실제 연결됨, Top1/3/5)");
}

/** §43 Fixture — "2025 one-off litigation expense 3억원" */
function test48_qoeFullFlow() {
  const aiCandidateJson = { reportedValue: 1_500_000_000, adjustmentValue: 300_000_000, reason: "2025 one-off litigation expense", suggestedStatus: "PROPOSED" as const, sourceEvidenceId: "e48_ev" };
  const builtAdjustment = buildQoEAdjustmentCandidateFromExtraction(aiCandidateJson, "UPLOADED_DOCUMENT");
  assert(builtAdjustment.status === "ok", "정상 reason은 빌더를 통과해야 함");
  const aiAdjustment = builtAdjustment.status === "ok" ? builtAdjustment.input : (null as never);
  assert(aiAdjustment.status === "PROPOSED", "AI candidate는 PROPOSED로 생성되어야 함");

  const excludedResult = calculateAdjustedEbitda("KRW", [{ lineItem: "EBITDA", value: 1_500_000_000, currency: "KRW", sourceType: "UPLOADED_DOCUMENT" }], [aiAdjustment]);
  assert(excludedResult.adjustedEbitda.status === "ok" && excludedResult.adjustedEbitda.value === 1_500_000_000, "PROPOSED → Adjusted EBITDA 미반영");

  const humanApproved: QoEAdjustmentInput = { ...aiAdjustment, status: "APPROVED" }; // 사람이 검토 후 직접 승인(AI 빌더를 다시 거치지 않음)
  const includedResult = calculateAdjustedEbitda("KRW", [{ lineItem: "EBITDA", value: 1_500_000_000, currency: "KRW", sourceType: "UPLOADED_DOCUMENT" }], [humanApproved]);
  assert(includedResult.adjustedEbitda.status === "ok" && includedResult.adjustedEbitda.value === 1_800_000_000, "사람이 APPROVED로 바꾼 뒤에만 반영");
  console.log("✅ Test 48 — QoE full flow(§43 fixture: PROPOSED excluded → APPROVED included)");
}

/** §64/§49 — DART + document conflict */
function test49_dartAndDocumentConflict() {
  const dartSource = createEvidenceSource({ id: "e49_src_dart", sourceType: "DART", sourceName: "OpenDART 사업보고서" });
  const dartEvidence = createEvidenceItem({ id: "e49_ev_dart", sourceId: dartSource.id });
  const pdfSource = createEvidenceSource({ id: "e49_src_pdf", sourceType: "UPLOADED_DOCUMENT", sourceName: "Management_deck.pdf", sourceLocation: "5페이지" });
  const pdfEvidence = createEvidenceItem({ id: "e49_ev_pdf", sourceId: pdfSource.id, locator: "5페이지" });
  const ctx: PEFactValidationContext = {
    evidenceById: new Map([[dartEvidence.id, dartEvidence], [pdfEvidence.id, pdfEvidence]]),
    sourceById: new Map([[dartSource.id, dartSource], [pdfSource.id, pdfSource]]),
  };

  const dartFact = validateFactCandidate({ factType: "FINANCIAL", metric: "REVENUE", value: 12_000_000_000, unit: "KRW", currency: "KRW", fiscalYear: 2025, periodType: "FY2025", sourceEvidenceId: dartEvidence.id }, "doc_49", ctx);
  const pdfFact = validateFactCandidate({ factType: "FINANCIAL", metric: "REVENUE", value: 12_500_000_000, unit: "KRW", currency: "KRW", fiscalYear: 2025, periodType: "FY2025", sourceEvidenceId: pdfEvidence.id }, "doc_49", ctx);
  assert(dartFact.status === "VALIDATED" && pdfFact.status === "VALIDATED");

  const { facts, conflicts } = reconcileFacts([dartFact, pdfFact]);
  assert(facts.length === 2, "DART와 문서 두 source 모두 보존되어야 함(AI가 DART를 override하지 않음, §63/§64)");
  assert(conflicts.length === 1 && conflicts[0].resolutionStatus === "UNRESOLVED", "값이 다르면 conflict로 남고 AI가 자동 해결하지 않아야 함");
  console.log("✅ Test 49 — DART + document conflict(둘 다 보존, UNRESOLVED)");
}

/** §52/§65 — 전체 lineage: Source→Evidence→Claim→Financial Fact→QoE Adjustment
 * →QoE Result→LBO Bridge→Observation→DD Finding→IC Synthesis */
function test50_fullPeIcSynthesis() {
  const period = fy(2025, "e50_period");
  const source = createEvidenceSource({ id: "e50_src", sourceType: "UPLOADED_DOCUMENT", sourceName: "2025_실사보고서.pdf", sourceLocation: "17페이지" });
  const evidence = createEvidenceItem({ id: "e50_ev", sourceId: source.id, locator: "17페이지", excerpt: "일회성 소송비용 3억원" });
  const evidenceCtx: PEFactValidationContext = { evidenceById: new Map([[evidence.id, evidence]]), sourceById: new Map([[source.id, source]]) };

  const ebitdaFactRaw: RawAIExtractedFact = { factType: "FINANCIAL", metric: "EBITDA", value: 1_500_000_000, unit: "KRW", currency: "KRW", fiscalYear: 2025, periodType: "FY2025", sourceEvidenceId: evidence.id };
  const ebitdaFact = validateFactCandidate(ebitdaFactRaw, "doc_50", evidenceCtx);
  assert(ebitdaFact.status === "VALIDATED");

  let claim = createClaim({ id: "e50_claim", statement: "일회성 소송비용 3억원이 2025년에 발생했다.", claimType: "numeric", financialPeriodId: period.id });
  claim = linkClaimToEvidence(claim, evidence.id);

  let fact = createFinancialFactReference({ id: "e50_fact", financialPeriodId: period.id, metric: "EBITDA", value: ebitdaFact.value, currency: "KRW" });
  fact = linkFinancialFactToClaim(fact, claim.id);

  const builtQoeCandidate = buildQoEAdjustmentCandidateFromExtraction(
    { reportedValue: 1_500_000_000, adjustmentValue: 300_000_000, reason: "일회성 소송비용", suggestedStatus: "APPROVED", suggestedType: "ONE_OFF_EXPENSE", sourceEvidenceId: evidence.id, sourceLocation: "17페이지" },
    "UPLOADED_DOCUMENT"
  );
  assert(builtQoeCandidate.status === "ok", "정상 reason은 빌더를 통과해야 함");
  const aiQoeCandidate = builtQoeCandidate.status === "ok" ? builtQoeCandidate.input : (null as never);
  assert(aiQoeCandidate.status === "PROPOSED", "AI candidate는 PROPOSED로 강등되어야 함");
  const humanApprovedInput: QoEAdjustmentInput = { ...aiQoeCandidate, status: "APPROVED" }; // 사람의 최종 승인

  let adjustmentRef = createQoEAdjustmentReference({ id: "e50_adj", financialPeriodId: period.id, adjustment: humanApprovedInput });
  adjustmentRef = linkAdjustmentToEvidence(adjustmentRef, evidence.id);
  adjustmentRef = linkAdjustmentToClaim(adjustmentRef, claim.id);

  const qoeResult = calculateAdjustedEbitda("KRW", [{ lineItem: "EBITDA", value: 1_500_000_000, currency: "KRW", sourceType: "UPLOADED_DOCUMENT" }], [humanApprovedInput]);
  const qoeBuilt = createQoEResultLineageReference("e50_qoe", period.id, qoeResult, [adjustmentRef]);
  assert(qoeBuilt.status === "ok");
  const qoeRef = qoeBuilt.status === "ok" ? qoeBuilt.reference : null;
  assert(qoeRef !== null);

  const bridgeResult = bridgeQoEToLboEntryEbitda({ financialPeriodId: period.id, fiscalYear: period.fiscalYear, periodType: period.periodType }, "KRW", qoeResult);
  assert(bridgeResult.status === "ok" && bridgeResult.lbo.entryEbitdaInEok === 18);
  const bridgeBuilt = createLboBridgeLineageReference("e50_bridge", qoeRef!.id, bridgeResult);
  assert(bridgeBuilt.status === "ok");
  const bridgeRef = bridgeBuilt.status === "ok" ? bridgeBuilt.reference : null;
  assert(bridgeRef !== null);

  const observation = calculateAdjustedEbitdaRatio("e50_observation", period, qoeResult);
  assert(observation.status === "available" && Math.abs(observation.value! - 0.2) < 1e-9);

  let finding = createPEDDFinding({
    id: "e50_finding",
    category: "FINANCIAL",
    subCategory: "MATERIAL_QOE_ADJUSTMENT",
    title: "Material QoE adjustment",
    description: `QoE adjustment ratio ${(observation.value! * 100).toFixed(1)}%`,
    severity: "MEDIUM",
    status: "CONFIRMED",
    financialPeriodId: period.id,
    financialImpact: { metric: "EBITDA", amount: 300_000_000, currency: "KRW", financialPeriodId: period.id, direction: "INCREASE", sourceAdjustmentId: adjustmentRef.id },
    lboImpact: { affectedTarget: "ENTRY_EBITDA", lboBridgeLineageId: bridgeRef!.id },
  });
  finding = { ...finding, evidenceIds: [evidence.id], claimIds: [claim.id] };

  const lineage = buildPEEvidenceLineage({
    periods: [period],
    sources: [source],
    evidence: [evidence],
    claims: [claim],
    financialFacts: [fact],
    adjustments: [adjustmentRef],
    qoeResults: [qoeRef!],
    lboBridges: [bridgeRef!],
  });
  const ddCase = buildPEDDCase(lineage, [finding]);
  const ddResult = validatePEDDCase(ddCase);
  assert(ddResult.status === "ok", `전체 lineage가 valid해야 함: ${ddResult.status === "invalid" ? JSON.stringify(ddResult.issues) : ""}`);

  const skeleton = buildSynthesisSkeleton({
    facts: [ebitdaFact],
    financialObservations: [observation],
    commercialObservations: [],
    findings: [finding],
    conflicts: [],
  });
  const pool: SynthesisGroundingPool = {
    evidenceIds: new Set([evidence.id]),
    claimIds: new Set([claim.id]),
    factIds: new Set([ebitdaFact.id]),
  };
  const narrative: RawAISynthesisNarrative = {
    section: "keyFacts",
    text: "Reported EBITDA for FY2025 was KRW 1.5bn, adjusted to KRW 1.8bn after a KRW 300m one-off litigation expense adjustment.",
    factIds: [ebitdaFact.id],
    evidenceIds: [evidence.id],
  };
  const merged = mergeAISynthesisNarrative(skeleton, [narrative], pool);
  assert(merged.accepted === 1, "grounded narrative는 최종 synthesis에 병합되어야 함");
  assert(merged.synthesis.findings.length === 1 && merged.synthesis.findings[0].evidenceIds.includes(evidence.id), "Finding까지 evidence 참조가 살아있어야 함");
  assert(validatePEEvidenceLineage(lineage).status === "ok", "PR-F lineage 자체도 독립적으로 valid해야 함");

  console.log("✅ Test 50 — Full PE IC synthesis(Source→Evidence→Claim→Fact→QoE Adjustment→QoE Result→LBO Bridge→Observation→Finding→IC Synthesis 전부 추적됨)");
}

function main() {
  console.log("\n=== DealMind PE IC Synthesis & End-to-end(PR-I) 테스트 ===\n");
  test41_groundedSynthesis();
  test42_evidenceReferencesPreserved();
  test43_unsupportedClaimRejected();
  test44_openQuestionGenerated();
  test45_conflictSurfaced();
  test46_financialFullFlow();
  test47_commercialFullFlow();
  test48_qoeFullFlow();
  test49_dartAndDocumentConflict();
  test50_fullPeIcSynthesis();
  console.log("\n✅ PE IC Synthesis & End-to-end(PR-I) 테스트 통과(10/10)\n");
}

main();
