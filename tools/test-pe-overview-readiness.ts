/**
 * PR #104 — PE Overview ↔ Decision Readiness Engine 연결 검증.
 *
 * 이 파일은 pe-decision-readiness.ts(PR #103) 자체의 판정 로직을 재검증하지
 * 않는다(tools/test-pe-decision-readiness.ts가 이미 24개 시나리오로 담당).
 * 여기서는 오직 하나만 확인한다: PE Overview가 실제로 쓰는 데이터 모양
 * (DashboardPeriod, ma-deal-dashboard.ts)을 `toPEDecisionReadinessInput()`으로
 * 옮겼을 때, 그 결과가 `buildPEDecisionReadiness()`를 직접 호출한 것과
 * 완전히 동일한지 — 즉 UI/데이터 레이어가 엔진의 판정을 조금도 재해석하지
 * 않고 그대로 전달하는지.
 *
 * Usage: npm run test:pe-overview-readiness
 */
import {
  computeQoESummary,
  computeLboEntryEbitda,
  computeDartStatus,
  computeFinancialQuality,
  toPEDecisionReadinessInput,
  type DashboardPeriod,
} from "../src/lib/pe/ma-deal-dashboard";
import { buildPEDecisionReadiness, type PEDecisionReadinessInput } from "../src/lib/pe/pe-decision-readiness";
import type { FinancialCalcResult } from "../src/lib/pe/financial-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function ok(value: number): FinancialCalcResult {
  return { status: "ok", value };
}
const missing: FinancialCalcResult = { status: "missing_input", missing: ["EBITDA"] };

function period(overrides: Partial<DashboardPeriod> & { fiscalYear: number }): DashboardPeriod {
  return {
    id: `period-${overrides.fiscalYear}-${overrides.periodType ?? "ANNUAL"}`,
    periodType: "ANNUAL",
    currency: "KRW",
    lineItems: [],
    adjustments: [],
    normalizedSummary: { revenue: missing, ebitda: missing, netDebt: missing },
    ...overrides,
  };
}

function domainOf(readiness: ReturnType<typeof buildPEDecisionReadiness>, key: string) {
  const d = readiness.domains.find((d) => d.domain === key);
  if (!d) throw new Error(`domain ${key} not found`);
  return d;
}

// ── Test 1: 어댑터는 engine 결과를 그대로 전달한다(재해석 없음) ─────────

function test1_adapterPassesThroughUnchanged() {
  const periods: DashboardPeriod[] = [
    period({
      fiscalYear: 2024,
      lineItems: [
        { id: "li-rev", lineItem: "REVENUE", value: 10_000_000_000, currency: "KRW", source: "MANUAL" },
        { id: "li-ebitda", lineItem: "EBITDA", value: 2_000_000_000, currency: "KRW", source: "MANUAL" },
      ],
      normalizedSummary: { revenue: ok(10_000_000_000), ebitda: ok(2_000_000_000), netDebt: ok(1_000_000_000) },
    }),
  ];

  // 어댑터를 거치지 않고 수작업으로 만든 동일한 모양의 입력
  const manualInput: PEDecisionReadinessInput = {
    periods: periods.map((p) => ({
      id: p.id,
      fiscalYear: p.fiscalYear,
      periodType: p.periodType,
      currency: p.currency,
      lineItems: p.lineItems.map((li) => ({ id: li.id, lineItem: li.lineItem, value: li.value, currency: li.currency, source: li.source })),
      adjustments: [],
      normalizedSummary: p.normalizedSummary,
    })),
  };

  const viaAdapter = buildPEDecisionReadiness(toPEDecisionReadinessInput(periods));
  const viaManual = buildPEDecisionReadiness(manualInput);
  assert(
    JSON.stringify(viaAdapter) === JSON.stringify(viaManual),
    "toPEDecisionReadinessInput()을 거친 결과와 직접 만든 입력을 넣은 결과가 완전히 같아야 함(어댑터가 판정을 재해석하지 않음)"
  );
  console.log("✅ Test 1 — PE Overview 데이터 레이어는 buildPEDecisionReadiness() 결과를 그대로 전달(재해석 없음)");
}

// ── Test 2: Financial 완비 → READY ──────────────────────────────────────

function test2_financialReadyReflectedInUi() {
  const periods: DashboardPeriod[] = [
    period({
      fiscalYear: 2024,
      lineItems: [
        { id: "li-rev", lineItem: "REVENUE", value: 10_000_000_000, currency: "KRW", source: "MANUAL" },
        { id: "li-ebitda", lineItem: "EBITDA", value: 2_000_000_000, currency: "KRW", source: "MANUAL" },
      ],
      normalizedSummary: { revenue: ok(10_000_000_000), ebitda: ok(2_000_000_000), netDebt: ok(0) },
    }),
  ];
  const readiness = buildPEDecisionReadiness(toPEDecisionReadinessInput(periods));
  assert(domainOf(readiness, "FINANCIAL").status === "READY", "매출·EBITDA가 모두 있으면 FINANCIAL=READY여야 함");
  console.log("✅ Test 2 — Financial 완비 → UI에 전달되는 FINANCIAL 상태는 READY");
}

// ── Test 3: QoE 미준비(EBITDA 계정 없음) → missing information 노출 ────

function test3_qoeNotReadyShowsMissingInformation() {
  const periods: DashboardPeriod[] = [
    period({
      fiscalYear: 2024,
      lineItems: [{ id: "li-rev", lineItem: "REVENUE", value: 10_000_000_000, currency: "KRW", source: "MANUAL" }],
      normalizedSummary: { revenue: ok(10_000_000_000), ebitda: missing, netDebt: missing },
    }),
  ];
  const readiness = buildPEDecisionReadiness(toPEDecisionReadinessInput(periods));
  assert(domainOf(readiness, "QOE").status === "MISSING", "EBITDA 계정이 없으면 QOE=MISSING이어야 함(READY로 둔갑 금지)");
  assert(
    readiness.missingInformation.some((m) => m.code === "QOE_EBITDA_MISSING"),
    "QOE_EBITDA_MISSING이 missingInformation에 노출돼야 함"
  );
  console.log("✅ Test 3 — QoE 미준비(EBITDA 없음) → QOE=MISSING 및 missing information 노출");
}

// ── Test 4: LBO blocked → blocking information 노출 ─────────────────────

function test4_lboBlockedShowsBlockingInformation() {
  const periods: DashboardPeriod[] = [
    period({
      fiscalYear: 2024,
      currency: "KRW",
      // EBITDA 계정 통화가 기간 통화(KRW)와 달라 QoE가 BLOCKED → LBO도 연쇄 BLOCKED
      lineItems: [{ id: "li-ebitda", lineItem: "EBITDA", value: 2_000_000_000, currency: "USD", source: "MANUAL" }],
      normalizedSummary: { revenue: ok(10_000_000_000), ebitda: { status: "currency_mismatch", detail: "EBITDA 계정 통화(USD)가 기간 통화(KRW)와 다릅니다" }, netDebt: missing },
    }),
  ];
  const readiness = buildPEDecisionReadiness(toPEDecisionReadinessInput(periods));
  assert(domainOf(readiness, "QOE").status === "BLOCKED", "EBITDA 통화 불일치면 QOE=BLOCKED여야 함");
  assert(domainOf(readiness, "LBO").status === "BLOCKED", "상위 QoE가 BLOCKED면 LBO도 연쇄적으로 BLOCKED여야 함");
  assert(readiness.blockers.length > 0, "blockers 목록이 비어있지 않아야 함(UI가 표시할 차단 요인)");
  console.log("✅ Test 4 — LBO BLOCKED(QoE 연쇄) → blockers에 차단 요인 노출");
}

// ── Test 5/6: DD·Evidence 미연동 → 임의로 완료 상태를 만들지 않는다 ────

function test5_ddNotStartedNeverFabricatedAsComplete() {
  const periods: DashboardPeriod[] = [
    period({
      fiscalYear: 2024,
      lineItems: [
        { id: "li-rev", lineItem: "REVENUE", value: 1, currency: "KRW", source: "MANUAL" },
        { id: "li-ebitda", lineItem: "EBITDA", value: 1, currency: "KRW", source: "MANUAL" },
      ],
      normalizedSummary: { revenue: ok(1), ebitda: ok(1), netDebt: ok(0) },
    }),
  ];
  // ddCase를 전달하지 않음(toPEDecisionReadinessInput은 지금 실제 딜에 DD 데이터를
  // 만들 방법이 없으므로 항상 undefined로 둔다 — page.tsx가 훗날 파이프라인이
  // 생기면 채워 넣을 자리).
  const readiness = buildPEDecisionReadiness(toPEDecisionReadinessInput(periods));
  const dd = domainOf(readiness, "DD");
  assert(dd.status === "NOT_STARTED", "DD 데이터가 없으면 NOT_STARTED여야 함");
  assert(!dd.reason.includes("완료") && !dd.reason.includes("이슈 없음"), "DD 미연동 사유가 '완료/이슈 없음'으로 둔갑하면 안 됨");
  console.log("✅ Test 5 — DD 미연동 → NOT_STARTED, '완료'로 둔갑하지 않음");
}

function test6_evidenceNotStartedNeverFabricatedAsVerified() {
  const periods: DashboardPeriod[] = [
    period({
      fiscalYear: 2024,
      lineItems: [{ id: "li-rev", lineItem: "REVENUE", value: 1, currency: "KRW", source: "MANUAL" }],
      normalizedSummary: { revenue: ok(1), ebitda: missing, netDebt: missing },
    }),
  ];
  const readiness = buildPEDecisionReadiness(toPEDecisionReadinessInput(periods));
  const evidence = domainOf(readiness, "EVIDENCE");
  assert(evidence.status === "NOT_STARTED", "evidence lineage가 없으면 NOT_STARTED여야 함");
  assert(!evidence.reason.includes("검증됨") && !evidence.reason.includes("확인됨"), "evidence 미연동 사유가 '검증됨'으로 둔갑하면 안 됨");
  console.log("✅ Test 6 — Evidence 미연동 → NOT_STARTED, '검증됨'으로 둔갑하지 않음");
}

// ── Test 7: Sparse deal → 숫자 fabrication 없음 ─────────────────────────

function test7_sparseDealNoFabrication() {
  const periods: DashboardPeriod[] = [period({ fiscalYear: 2024 })]; // 재무 계정 전혀 없음
  const readiness = buildPEDecisionReadiness(toPEDecisionReadinessInput(periods));
  assert(readiness.overall !== "READY", "빈 재무기간만 있는 sparse deal은 절대 READY가 아니어야 함");
  assert(readiness.missingInformation.length > 0, "missing information이 실제 부재를 나열해야 함");
  const serialized = JSON.stringify(readiness);
  for (const forbidden of ["BUY", "PASS", "moic", "irr", "매력도 점수", "투자 점수"]) {
    assert(!serialized.includes(forbidden), `readiness 출력에 금지 표현/필드 "${forbidden}"가 없어야 함`);
  }
  console.log("✅ Test 7 — Sparse deal: overall≠READY, 숫자/투자판단 fabrication 없음");
}

// ── Test 8: 기존 PR #102 Overview 데이터(QoE/LBO/DART 표시)는 계속 정상 ──

function test8_existingOverviewDataStillWorks() {
  const p2023 = period({
    fiscalYear: 2023,
    lineItems: [{ id: "li-rev-23", lineItem: "REVENUE", value: 1_000_000_000, currency: "KRW", source: "DART" }],
    normalizedSummary: { revenue: ok(1_000_000_000), ebitda: ok(200_000_000), netDebt: ok(300_000_000) },
  });
  const p2024 = period({
    fiscalYear: 2024,
    lineItems: [
      { id: "li-rev-24", lineItem: "REVENUE", value: 1_500_000_000, currency: "KRW", source: "DART" },
      { id: "li-ebitda-24", lineItem: "EBITDA", value: 300_000_000, currency: "KRW", source: "MANUAL" },
    ],
    adjustments: [
      { metric: "EBITDA", reportedValue: 300_000_000, adjustmentValue: 50_000_000, reason: "일회성 비용 제거", status: "APPROVED", adjustmentType: "ONE_OFF_EXPENSE", source: "MANUAL" },
    ],
    normalizedSummary: { revenue: ok(1_500_000_000), ebitda: ok(300_000_000), netDebt: ok(300_000_000) },
  });
  const periods = [p2024, p2023];

  // PR #102가 이미 쓰던 QoE/LBO/DART/재무품질 계산은 그대로 동작해야 함(회귀 없음)
  const qoeSummary = computeQoESummary(p2024);
  assert(qoeSummary.adjustedEbitda.status === "ok" && qoeSummary.adjustedEbitda.value === 350_000_000, "기존 QoE 요약 계산이 그대로 동작해야 함");
  const lboEntryEbitda = computeLboEntryEbitda(p2024, qoeSummary);
  assert(lboEntryEbitda.status === "ok", "기존 LBO Entry EBITDA 브릿지가 그대로 동작해야 함");
  const dartStatus = computeDartStatus(periods);
  assert(dartStatus.imported === true, "기존 DART 상태 계산이 그대로 동작해야 함");
  const financialQuality = computeFinancialQuality(periods);
  assert(financialQuality.revenueGrowth.status === "ok", "기존 재무 품질(성장률) 계산이 그대로 동작해야 함");

  // 그리고 같은 입력에서 Decision Readiness도 함께 계산 가능해야 함(충돌 없음)
  const readiness = buildPEDecisionReadiness(toPEDecisionReadinessInput(periods));
  assert(domainOf(readiness, "FINANCIAL").status === "READY", "완비된 데이터면 FINANCIAL=READY");
  assert(domainOf(readiness, "QOE").status === "READY", "완비된 데이터면 QOE=READY");
  console.log("✅ Test 8 — 기존 PR #102 Overview 데이터(QoE/LBO/DART/재무품질) 정상 동작 + Decision Readiness 병행 계산 무충돌");
}

function main() {
  console.log("\n=== PE Overview ↔ Decision Readiness Engine 연결 테스트 ===\n");
  test1_adapterPassesThroughUnchanged();
  test2_financialReadyReflectedInUi();
  test3_qoeNotReadyShowsMissingInformation();
  test4_lboBlockedShowsBlockingInformation();
  test5_ddNotStartedNeverFabricatedAsComplete();
  test6_evidenceNotStartedNeverFabricatedAsVerified();
  test7_sparseDealNoFabrication();
  test8_existingOverviewDataStillWorks();
  // Test 9(VC regression)은 이 파일이 아니라 `npm run test:all` 전체 회귀로
  // 확인한다 — 이 PR은 VC 관련 파일을 하나도 건드리지 않았으므로 별도의
  // VC 전용 테스트를 새로 만들 필요가 없다(회귀 위험 자체가 구조적으로 없음).
  console.log("\n✅ PE Overview ↔ Decision Readiness Engine 연결 테스트 통과\n");
}

main();
