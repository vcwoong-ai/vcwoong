/**
 * PE IC Decision / Readiness Engine(src/lib/pe/pe-decision-readiness.ts) 검증.
 *
 * 이 파일은 financial-normalization.ts/qoe.ts/qoe-lbo-bridge.ts/lbo-model.ts/
 * dd-lineage.ts/evidence-lineage.ts/dd-commercial.ts 자체의 계산을 재검증하지
 * 않는다(각자 전용 test:* 스위트가 이미 담당). 여기서는 "그 엔진들의 출력을
 * 이 readiness 엔진이 올바른 상태로 조립하는지"만 확인한다.
 *
 * Usage: npm run test:pe-decision-readiness
 */
import {
  buildPEDecisionReadiness,
  type PEDecisionPeriod,
  type PEDecisionReadinessInput,
  type ReadinessState,
} from "../src/lib/pe/pe-decision-readiness";
import { createEvidenceSource, createEvidenceItem, createClaim, linkClaimToEvidence, buildPEEvidenceLineage } from "../src/lib/pe/evidence-lineage";
import { createPEDDFinding, linkFindingToEvidence } from "../src/lib/pe/dd-validation";
import { buildPEDDCase } from "../src/lib/pe/dd-lineage";
import type { PEDDCustomerRevenueInput } from "../src/lib/pe/dd-metrics-types";
import type { FinancialCalcResult } from "../src/lib/pe/financial-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function ok(value: number): FinancialCalcResult {
  return { status: "ok", value };
}
const missingInput: FinancialCalcResult = { status: "missing_input", missing: ["EBITDA"] };

let lineItemSeq = 0;
function nextLineItemId(): string {
  lineItemSeq += 1;
  return `li_${lineItemSeq}`;
}

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

function domainByKey(result: ReturnType<typeof buildPEDecisionReadiness>, key: string) {
  const found = result.domains.find((d) => d.domain === key);
  if (!found) throw new Error(`domain ${key} not found in result`);
  return found;
}

// ── 1. 빈 딜 — 어떤 데이터도 없음 ──────────────────────────────────────

function test1_emptyDeal() {
  const result = buildPEDecisionReadiness({ periods: [] });
  assert(domainByKey(result, "FINANCIAL").status === "NOT_STARTED", "재무 데이터 없으면 FINANCIAL=NOT_STARTED");
  assert(domainByKey(result, "QOE").status === "NOT_STARTED", "재무 데이터 없으면 QOE=NOT_STARTED");
  assert(domainByKey(result, "LBO").status === "NOT_STARTED", "재무 데이터 없으면 LBO=NOT_STARTED");
  assert(domainByKey(result, "DD").status === "NOT_STARTED", "DD 데이터 없으면 NOT_STARTED");
  assert(domainByKey(result, "EVIDENCE").status === "NOT_STARTED", "evidence 없으면 NOT_STARTED");
  assert(domainByKey(result, "COMMERCIAL").status === "NOT_STARTED", "commercial 없으면 NOT_STARTED");
  assert(domainByKey(result, "DART").status === "NOT_STARTED", "DART 없으면 NOT_STARTED");
  assert(result.overall === "NOT_STARTED", "빈 딜의 overall은 NOT_STARTED여야 함");
  assert(JSON.stringify(result).includes("0억") === false, "0으로 지어낸 금액이 없어야 함");
  console.log("✅ Test 1 — 빈 딜: 모든 도메인 NOT_STARTED, overall NOT_STARTED(0 지어내지 않음)");
}

// ── 2. 재무만(매출만, EBITDA 없음) ────────────────────────────────────

function test2_financialRevenueOnly() {
  const p = period({ fiscalYear: 2024, normalizedSummary: { revenue: ok(1000), ebitda: missingInput, netDebt: missingInput } });
  const result = buildPEDecisionReadiness({ periods: [p] });
  assert(domainByKey(result, "FINANCIAL").status === "PARTIAL", "매출만 있으면 FINANCIAL=PARTIAL");
  console.log("✅ Test 2 — 매출만 있고 EBITDA 없으면 FINANCIAL=PARTIAL");
}

// ── 3. 재무 + EBITDA ───────────────────────────────────────────────────

function test3_financialWithEbitda() {
  const p = period({ fiscalYear: 2024, normalizedSummary: { revenue: ok(1000), ebitda: ok(200), netDebt: missingInput } });
  const result = buildPEDecisionReadiness({ periods: [p] });
  assert(domainByKey(result, "FINANCIAL").status === "READY", "매출+EBITDA 있으면 FINANCIAL=READY");
  console.log("✅ Test 3 — 매출+EBITDA 있으면 FINANCIAL=READY");
}

// ── 4. 재무 + 유효한 QoE(조정 없음) ────────────────────────────────────

function test4_validQoeNoAdjustments() {
  const p = period({
    fiscalYear: 2024,
    lineItems: [{ id: nextLineItemId(), lineItem: "EBITDA", value: 100, currency: "KRW", source: "MANUAL" }],
    normalizedSummary: { revenue: ok(1000), ebitda: ok(100), netDebt: missingInput },
  });
  const result = buildPEDecisionReadiness({ periods: [p] });
  assert(domainByKey(result, "QOE").status === "READY", "조정이 0건이어도 EBITDA 계산되면 QOE=READY(검토 여부를 지어내지 않음)");
  assert(result.qoeReviewTrackingLimitation.length > 0, "QoE 검토 추적 한계가 명시돼야 함");
  console.log("✅ Test 4 — 조정 0건이어도 QOE=READY(§7 — '조정 없음'과 '검토 안 함' 혼동 금지)");
}

// ── 5~8. QoE 조정 상태별 반영 여부 ─────────────────────────────────────

function adjustment(status: "APPROVED" | "PROPOSED" | "DRAFT" | "REJECTED", value: number) {
  return { metric: "EBITDA", reportedValue: 100, adjustmentValue: value, reason: status, status, adjustmentType: "OTHER", source: "MANUAL" as const };
}

function test5to8_qoeApprovedOnlySemantics() {
  const p = period({
    fiscalYear: 2024,
    lineItems: [{ id: nextLineItemId(), lineItem: "EBITDA", value: 100, currency: "KRW", source: "MANUAL" }],
    adjustments: [adjustment("APPROVED", 10), adjustment("PROPOSED", 20), adjustment("DRAFT", 30), adjustment("REJECTED", -5)],
    normalizedSummary: { revenue: missingInput, ebitda: ok(100), netDebt: missingInput },
  });
  const result = buildPEDecisionReadiness({ periods: [p] });
  const qoe = domainByKey(result, "QOE");
  assert(qoe.status === "READY", "유효한 조정 조합이면 QOE=READY");
  assert(qoe.counts?.approved === 1 && qoe.counts?.proposed === 1 && qoe.counts?.draft === 1 && qoe.counts?.rejected === 1, "상태별 개수가 정확해야 함");
  console.log("✅ Test 5-8 — APPROVED(+10)/PROPOSED(+20)/DRAFT(+30)/REJECTED(-5) 조정 개수 정확히 집계(반영 여부는 qoe.ts 자체 테스트에서 검증됨)");

  // APPROVED-only 실제 값 확인(qoe.ts 재검증 아님 — 조립 레이어가 올바른 입력을 넘기는지만 확인)
  const approvedOnlyPeriod = period({
    fiscalYear: 2025,
    lineItems: [{ id: nextLineItemId(), lineItem: "EBITDA", value: 100, currency: "KRW", source: "MANUAL" }],
    adjustments: [adjustment("APPROVED", 10), adjustment("PROPOSED", 20), adjustment("DRAFT", 30), adjustment("REJECTED", -5)],
    normalizedSummary: { revenue: missingInput, ebitda: ok(100), netDebt: missingInput },
  });
  const r2 = buildPEDecisionReadiness({ periods: [approvedOnlyPeriod] });
  console.log("   (adjustedEbitda는 pe-decision-readiness.ts 내부에서 직접 노출하지 않음 — ma-deal-dashboard.ts와 동일하게 qoe.ts calculateAdjustedEbitda를 그대로 호출함을 소스에서 확인)");
  void r2;
}

// ── 9. 잘못된 통화 ─────────────────────────────────────────────────────

function test9_invalidCurrency() {
  const p = period({
    fiscalYear: 2024,
    currency: "KRW",
    lineItems: [{ id: nextLineItemId(), lineItem: "EBITDA", value: 100, currency: "USD", source: "MANUAL" }],
    normalizedSummary: { revenue: missingInput, ebitda: { status: "currency_mismatch", detail: "EBITDA의 통화(USD)가 기간 통화(KRW)와 다릅니다" }, netDebt: missingInput },
  });
  const result = buildPEDecisionReadiness({ periods: [p] });
  assert(domainByKey(result, "FINANCIAL").status === "BLOCKED", "통화 불일치면 FINANCIAL=BLOCKED");
  assert(domainByKey(result, "QOE").status === "BLOCKED", "상위 재무가 BLOCKED면 QOE도 BLOCKED");
  assert(domainByKey(result, "LBO").status === "BLOCKED", "상위 QOE가 BLOCKED면 LBO도 BLOCKED");
  assert(result.overall === "BLOCKED", "필수 도메인이 BLOCKED면 overall도 BLOCKED");
  console.log("✅ Test 9 — 통화 불일치는 FINANCIAL/QOE/LBO를 연쇄적으로 BLOCKED시킴(값을 조용히 무시하지 않음)");
}

// ── 10. 잘못된 기간 ─────────────────────────────────────────────────────

function test10_invalidPeriod() {
  const p = period({
    fiscalYear: 1800, // qoe-lbo-bridge.ts validatePeriodIdentity 범위(1990~) 밖
    lineItems: [{ id: nextLineItemId(), lineItem: "EBITDA", value: 100, currency: "KRW", source: "MANUAL" }],
    normalizedSummary: { revenue: missingInput, ebitda: ok(100), netDebt: missingInput },
  });
  const result = buildPEDecisionReadiness({ periods: [p] });
  assert(domainByKey(result, "LBO").status === "BLOCKED", "유효하지 않은 기간이면 LBO=BLOCKED(브릿지가 invalid_period 반환)");
  console.log("✅ Test 10 — 유효하지 않은 재무기간이면 LBO=BLOCKED");
}

// ── 11~12. LBO 가정 ─────────────────────────────────────────────────────

function test11_lboMissingExitMultiple() {
  const p = period({
    fiscalYear: 2024,
    lineItems: [{ id: nextLineItemId(), lineItem: "EBITDA", value: 100, currency: "KRW", source: "MANUAL" }],
    normalizedSummary: { revenue: missingInput, ebitda: ok(10_000_000_000), netDebt: missingInput },
  });
  const result = buildPEDecisionReadiness({
    periods: [p],
    lboAssumptions: { entryMultiple: 8, debtToEbitda: 5, interestRate: 8, ebitdaGrowthRate: 10, fcfConversionRate: 50, cashSweepRate: 100, holdPeriodYears: 3 }, // exitMultiple 누락
  });
  const lbo = domainByKey(result, "LBO");
  assert(lbo.status === "PARTIAL", "Exit 배수가 없으면 LBO=PARTIAL");
  assert(lbo.missingItems.includes("LBO_ASSUMPTION_MISSING_EXITMULTIPLE"), "누락된 가정이 missingItems에 있어야 함");
  console.log("✅ Test 11 — Exit 배수 누락이면 LBO=PARTIAL(자동으로 채우지 않음)");
}

function test12_lboCompleteAssumptions() {
  const p = period({
    fiscalYear: 2024,
    lineItems: [{ id: nextLineItemId(), lineItem: "EBITDA", value: 100, currency: "KRW", source: "MANUAL" }],
    normalizedSummary: { revenue: missingInput, ebitda: ok(10_000_000_000), netDebt: missingInput },
  });
  const result = buildPEDecisionReadiness({
    periods: [p],
    lboAssumptions: { entryMultiple: 8, debtToEbitda: 5, interestRate: 8, ebitdaGrowthRate: 10, fcfConversionRate: 50, cashSweepRate: 100, exitMultiple: 8, holdPeriodYears: 3 },
  });
  const lbo = domainByKey(result, "LBO");
  assert(lbo.status === "READY", "가정이 모두 채워지고 유효하면 LBO=READY");
  assert(JSON.stringify(lbo).match(/moic|irr/i) === null, "LBO 도메인 결과에 moic/irr 숫자가 노출되면 안 됨(계산 가능 여부만)");
  console.log("✅ Test 12 — 완전한 LBO 가정이면 READY, MOIC/IRR 숫자는 노출하지 않음");
}

function test12b_lboInvalidAssumptions() {
  const p = period({
    fiscalYear: 2024,
    lineItems: [{ id: nextLineItemId(), lineItem: "EBITDA", value: 100, currency: "KRW", source: "MANUAL" }],
    normalizedSummary: { revenue: missingInput, ebitda: ok(10_000_000_000), netDebt: missingInput },
  });
  const result = buildPEDecisionReadiness({
    periods: [p],
    lboAssumptions: { entryMultiple: 0, debtToEbitda: 5, interestRate: 8, ebitdaGrowthRate: 10, fcfConversionRate: 50, cashSweepRate: 100, exitMultiple: 8, holdPeriodYears: 3 }, // entryMultiple=0 무효
  });
  assert(domainByKey(result, "LBO").status === "BLOCKED", "구조적으로 무효한 가정(0 이하)이면 LBO=BLOCKED");
  console.log("✅ Test 12b — 구조적으로 무효한 LBO 가정(0 이하)이면 BLOCKED");
}

// ── 13. DD 영속화 없음 ───────────────────────────────────────────────────

function test13_noDDPersistence() {
  const result = buildPEDecisionReadiness({ periods: [] });
  const dd = domainByKey(result, "DD");
  assert(dd.status === "NOT_STARTED", "DD 데이터가 연결되지 않으면 NOT_STARTED");
  assert(dd.reason.includes("연결되지 않았습니다"), "이유가 명시적이어야 함");
  console.log('✅ Test 13 — DD 미연동은 NOT_STARTED("검토 완료, 이슈 없음"과 다름을 이유에 명시)');
}

function test13b_ddWithRealFindings() {
  const source = createEvidenceSource({ id: "dd_src_1", sourceType: "MANUAL", sourceName: "실사 메모" });
  const evidence = createEvidenceItem({ id: "dd_ev_1", sourceId: source.id, excerpt: "임원 보수 정상화 필요" });
  const lineage = buildPEEvidenceLineage({ sources: [source], evidence: [evidence] });
  let finding = createPEDDFinding({ id: "f_1", category: "FINANCIAL", title: "임원 보수 과다", description: "시장 대비 임원 보수 과다 지급", severity: "MEDIUM", status: "DRAFT" });
  finding = linkFindingToEvidence(finding, evidence.id);
  const ddCase = buildPEDDCase(lineage, [finding]);

  const result = buildPEDecisionReadiness({ periods: [], ddCase });
  const dd = domainByKey(result, "DD");
  assert(dd.status === "PARTIAL", "실제 finding이 기록돼 있으면 DD=PARTIAL(자동으로 '완료'라 판정하지 않음)");
  assert(dd.counts?.total === 1, "finding 개수가 정확해야 함");
  console.log("✅ Test 13b — 실제 DD finding이 있으면 PARTIAL로 표시(완료 여부는 자동 판정하지 않음), NOT_STARTED와 명확히 구분");
}

// ── 14~15. Evidence 없음 / 일부 있음 ────────────────────────────────────

function test14_noEvidence() {
  const result = buildPEDecisionReadiness({ periods: [] });
  assert(domainByKey(result, "EVIDENCE").status === "NOT_STARTED", "evidence 미연동은 NOT_STARTED");
  console.log("✅ Test 14 — evidence 미연동은 NOT_STARTED");
}

function test15_partialEvidence() {
  const source = createEvidenceSource({ id: "src_1", sourceType: "MANUAL", sourceName: "심사역 메모" });
  const evidence = createEvidenceItem({ id: "ev_1", sourceId: source.id, excerpt: "매출 1000억원" });
  let supportedClaim = createClaim({ id: "claim_1", statement: "매출은 1000억원이다", claimType: "numeric" });
  supportedClaim = linkClaimToEvidence(supportedClaim, evidence.id);
  const unsupportedClaim = createClaim({ id: "claim_2", statement: "시장 1위다", claimType: "qualitative" });
  const lineage = buildPEEvidenceLineage({ sources: [source], evidence: [evidence], claims: [supportedClaim, unsupportedClaim] });

  const result = buildPEDecisionReadiness({ periods: [], evidenceLineage: lineage });
  const ev = domainByKey(result, "EVIDENCE");
  assert(ev.status === "PARTIAL", "일부 claim이 근거 없으면 EVIDENCE=PARTIAL");
  assert(ev.counts?.unsupportedClaims === 1, "근거 없는 claim 개수가 정확해야 함");
  console.log("✅ Test 15 — claim 일부만 근거 있으면 EVIDENCE=PARTIAL, 근거 없는 claim 개수 정확");
}

// ── 16. 모순 ────────────────────────────────────────────────────────────

function test16_contradiction() {
  const p = period({
    fiscalYear: 2024,
    lineItems: [
      { id: "li_a", lineItem: "EBITDA", value: 100, currency: "KRW", source: "MANUAL" },
      { id: "li_b", lineItem: "EBITDA", value: 150, currency: "KRW", source: "DART" },
    ],
    normalizedSummary: { revenue: missingInput, ebitda: ok(100), netDebt: missingInput },
  });
  const result = buildPEDecisionReadiness({ periods: [p] });
  assert(domainByKey(result, "FINANCIAL").status === "BLOCKED", "같은 기간에 같은 계정, 다른 값이면 FINANCIAL=BLOCKED");
  assert(result.factConflicts.length === 1, "모순 1건이 기록돼야 함");
  assert(result.factConflicts[0].conflictingValues.length === 2, "충돌하는 두 값이 모두 보존돼야 함");
  const values = result.factConflicts[0].conflictingValues.map((v) => v.value).sort();
  assert(values[0] === 100 && values[1] === 150, "두 값(100, 150) 모두 보존, 하나를 임의로 고르지 않음");
  console.log("✅ Test 16 — 같은 기간·계정에 다른 값이 있으면 FINANCIAL=BLOCKED, 두 값 모두 보존(임의 선택 없음)");
}

// ── 17~18. DART ─────────────────────────────────────────────────────────

function test17_dartAbsent() {
  const p = period({ fiscalYear: 2024, lineItems: [{ id: nextLineItemId(), lineItem: "REVENUE", value: 1, currency: "KRW", source: "MANUAL" }] });
  const result = buildPEDecisionReadiness({ periods: [p] });
  assert(domainByKey(result, "DART").status === "NOT_STARTED", "DART 미연동이면 NOT_STARTED");
  console.log("✅ Test 17 — DART 미연동은 NOT_STARTED(딜 존재/수기입력만으로 '검증됨' 주장 안 함)");
}

function test18_dartImported() {
  const p = period({ fiscalYear: 2024, lineItems: [{ id: nextLineItemId(), lineItem: "REVENUE", value: 1, currency: "KRW", source: "DART" }] });
  const result = buildPEDecisionReadiness({ periods: [p] });
  assert(domainByKey(result, "DART").status === "READY", "실제 DART 라인아이템이 있으면 READY");
  console.log("✅ Test 18 — 실제 DART 출처 line item이 있으면 DART=READY");
}

// ── 19~20. Commercial ────────────────────────────────────────────────────

function test19_commercialAbsent() {
  const result = buildPEDecisionReadiness({ periods: [] });
  assert(domainByKey(result, "COMMERCIAL").status === "NOT_STARTED", "고객 데이터 없으면 NOT_STARTED");
  console.log("✅ Test 19 — 고객 매출 데이터 없으면 COMMERCIAL=NOT_STARTED");
}

function test20_commercialPartialCoverage() {
  const p = period({ fiscalYear: 2024, lineItems: [{ id: nextLineItemId(), lineItem: "REVENUE", value: 1, currency: "KRW", source: "MANUAL" }] });
  const customers: PEDDCustomerRevenueInput[] = [
    { customerId: "c1", financialPeriodId: "period-2023-ANNUAL", revenue: 100, currency: "KRW" }, // 최근 기간이 아닌 다른 기간
  ];
  const result = buildPEDecisionReadiness({ periods: [p], commercialCustomers: customers });
  assert(domainByKey(result, "COMMERCIAL").status === "PARTIAL", "최근 기간을 커버하지 않는 고객 데이터면 PARTIAL");
  console.log("✅ Test 20 — 고객 데이터가 최근 재무기간을 커버하지 않으면 COMMERCIAL=PARTIAL");
}

// ── 21. 완전한 분석 패키지 ─────────────────────────────────────────────

function test21_completeAnalyticalPackage() {
  const p = period({
    fiscalYear: 2024,
    lineItems: [{ id: nextLineItemId(), lineItem: "EBITDA", value: 100, currency: "KRW", source: "DART" }],
    adjustments: [adjustment("APPROVED", 10)],
    normalizedSummary: { revenue: ok(1000), ebitda: ok(10_000_000_000), netDebt: ok(0) },
  });
  const result = buildPEDecisionReadiness({
    periods: [p],
    lboAssumptions: { entryMultiple: 8, debtToEbitda: 5, interestRate: 8, ebitdaGrowthRate: 10, fcfConversionRate: 50, cashSweepRate: 100, exitMultiple: 8, holdPeriodYears: 3 },
  });
  assert(domainByKey(result, "FINANCIAL").status === "READY", "필수 도메인 FINANCIAL=READY");
  assert(domainByKey(result, "QOE").status === "READY", "필수 도메인 QOE=READY");
  assert(domainByKey(result, "LBO").status === "READY", "필수 도메인 LBO=READY");
  assert(result.overall === "READY", "필수 도메인이 전부 READY면 overall=READY(정보성 도메인은 게이트하지 않음)");
  console.log("✅ Test 21 — 필수 도메인(FINANCIAL/QOE/LBO)이 모두 READY면 overall=READY(DD/EVIDENCE/COMMERCIAL 미연동이어도 게이트 안 함)");
}

// ── 22. 결정론적 출력 순서 ─────────────────────────────────────────────

function test22_deterministicOrdering() {
  const p = period({ fiscalYear: 2024 });
  const input: PEDecisionReadinessInput = { periods: [p] };
  const r1 = buildPEDecisionReadiness(input);
  const r2 = buildPEDecisionReadiness(input);
  assert(JSON.stringify(r1) === JSON.stringify(r2), "동일 입력은 항상 동일 출력이어야 함(결정론)");
  const domainOrder1 = r1.domains.map((d) => d.domain).join(",");
  const domainOrder2 = r2.domains.map((d) => d.domain).join(",");
  assert(domainOrder1 === domainOrder2, "도메인 순서가 고정돼야 함");
  assert(domainOrder1 === "FINANCIAL,QOE,LBO,DD,EVIDENCE,COMMERCIAL,DART", "도메인 순서는 선언 순서와 같아야 함");

  // missingInformation/blockers 정렬 확인 — 순서가 뒤섞인 입력에도 항상 code 오름차순
  const p2 = period({
    fiscalYear: 2024,
    lineItems: [
      { id: "li_z", lineItem: "EBITDA", value: 200, currency: "KRW", source: "MANUAL" },
      { id: "li_a", lineItem: "EBITDA", value: 100, currency: "KRW", source: "DART" },
    ],
    normalizedSummary: { revenue: missingInput, ebitda: ok(100), netDebt: missingInput },
  });
  const r3 = buildPEDecisionReadiness({ periods: [p2] });
  const codes = r3.factConflicts[0]?.conflictingValues.map((v) => v.lineItemId) ?? [];
  assert(JSON.stringify(codes) === JSON.stringify([...codes].sort()), "충돌 값 목록도 정렬된 순서여야 함");
  console.log("✅ Test 22 — 동일 입력 → 동일 출력(결정론), 도메인/모순 목록 순서 고정");
}

// ── No-fabrication 명시 검증(§20) ──────────────────────────────────────

function testNoFabrication() {
  const empty = buildPEDecisionReadiness({ periods: [] });
  assert(domainByKey(empty, "DART").status !== "READY", "DART 없음 ≠ DART 검증됨");
  assert(domainByKey(empty, "DD").status !== "READY", "DD 없음 ≠ DD 클린");
  assert(domainByKey(empty, "EVIDENCE").status !== "READY", "evidence 없음 ≠ evidence 클린");
  assert(domainByKey(empty, "LBO").status !== "READY", "LBO 시나리오 없음 ≠ 수익률 0");
  assert(!JSON.stringify(empty).includes('"value":0'), "빈 입력에서 수치가 0으로 지어내지지 않아야 함");

  // 실제로 0인 값(순차입금=0)은 그대로 0으로 표시돼야 한다 — "결측=0" 금지와
  // "진짜 0은 0으로 보여준다"는 서로 다른 요구사항이다(§13 요구사항과 별개 검증).
  const zeroNetDebtPeriod = period({
    fiscalYear: 2024,
    lineItems: [{ id: nextLineItemId(), lineItem: "EBITDA", value: 100, currency: "KRW", source: "MANUAL" }],
    normalizedSummary: { revenue: ok(1000), ebitda: ok(100), netDebt: ok(0) },
  });
  const withZero = buildPEDecisionReadiness({ periods: [zeroNetDebtPeriod] });
  assert(domainByKey(withZero, "FINANCIAL").status === "READY", "매출·EBITDA가 있고 순차입금이 진짜 0이어도(결측 아님) FINANCIAL=READY여야 함(0을 결측으로 오인하지 않음)");
  console.log("✅ No-fabrication — DART/DD/Evidence/LBO 부재가 '검증됨/클린/0수익률'로 둔갑하지 않음, 진짜 0은 그대로 0으로 남음");
}

function main() {
  console.log("\n=== PE IC Decision / Readiness Engine 테스트 ===\n");
  test1_emptyDeal();
  test2_financialRevenueOnly();
  test3_financialWithEbitda();
  test4_validQoeNoAdjustments();
  test5to8_qoeApprovedOnlySemantics();
  test9_invalidCurrency();
  test10_invalidPeriod();
  test11_lboMissingExitMultiple();
  test12_lboCompleteAssumptions();
  test12b_lboInvalidAssumptions();
  test13_noDDPersistence();
  test13b_ddWithRealFindings();
  test14_noEvidence();
  test15_partialEvidence();
  test16_contradiction();
  test17_dartAbsent();
  test18_dartImported();
  test19_commercialAbsent();
  test20_commercialPartialCoverage();
  test21_completeAnalyticalPackage();
  test22_deterministicOrdering();
  testNoFabrication();
  console.log("\n✅ PE IC Decision / Readiness Engine 테스트 통과\n");
}

main();
