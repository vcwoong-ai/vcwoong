/**
 * QoE → LBO Bridge(PR-E) 검증.
 *
 * 이 레포의 다른 test:*와 동일한 관례 — DB/네트워크/AI 호출 없이 순수
 * 함수만 확인한다(jest/vitest 없음, tsx로 직접 실행). QoEResult는
 * qoe.ts(PR-D, 수정하지 않음)의 `calculateAdjustedEbitda()`를 그대로
 * 호출해 만든다 — 브릿지 입력을 손으로 지어내지 않고 실제 엔진 출력을
 * 그대로 태워 end-to-end로 검증한다.
 *
 * Usage: npm run test:qoe-lbo-bridge
 */
import { calculateAdjustedEbitda } from "../src/lib/pe/qoe";
import type { QoEResult } from "../src/lib/pe/qoe";
import { bridgeQoEToLboEntryEbitda } from "../src/lib/pe/qoe-lbo-bridge";
import type {
  QoEToLboBridgePeriodIdentity,
  QoEToLboBridgeResult,
} from "../src/lib/pe/qoe-lbo-bridge";
import type { FinancialLineItemInput } from "../src/lib/pe/financial-types";
import type { QoEAdjustmentInput } from "../src/lib/pe/qoe-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const KRW_PER_EOK = 100_000_000;

function lineItem(
  overrides: Partial<FinancialLineItemInput> & Pick<FinancialLineItemInput, "lineItem" | "value">
): FinancialLineItemInput {
  return { currency: "KRW", sourceType: "MANUAL", ...overrides };
}

function adjustment(
  overrides: Partial<QoEAdjustmentInput> & Pick<QoEAdjustmentInput, "adjustmentValue" | "status">
): QoEAdjustmentInput {
  return {
    metric: "EBITDA",
    reportedValue: 0,
    reason: "테스트 조정",
    adjustmentType: "OTHER",
    sourceType: "MANUAL",
    ...overrides,
  };
}

function period(
  overrides: Partial<QoEToLboBridgePeriodIdentity> = {}
): QoEToLboBridgePeriodIdentity {
  return {
    financialPeriodId: "period_fy2025",
    fiscalYear: 2025,
    periodType: "ANNUAL",
    ...overrides,
  };
}

/** EBITDA 하나만 있는 가장 단순한 재무기간의 QoEResult를 만든다 */
function qoeResultForEbitda(
  ebitdaKrw: number,
  adjustments: QoEAdjustmentInput[] = [],
  currency = "KRW"
): QoEResult {
  return calculateAdjustedEbitda(
    currency,
    [lineItem({ lineItem: "EBITDA", value: ebitdaKrw, currency })],
    adjustments
  );
}

function expectOk(result: QoEToLboBridgeResult): Extract<QoEToLboBridgeResult, { status: "ok" }> {
  assert(result.status === "ok", `status가 ok여야 하는데 ${result.status}`);
  return result as Extract<QoEToLboBridgeResult, { status: "ok" }>;
}

function testBasicConversion() {
  const qoe = qoeResultForEbitda(10_000_000_000);
  const result = bridgeQoEToLboEntryEbitda(period(), "KRW", qoe);
  const ok = expectOk(result);
  assert(ok.lbo.entryEbitdaInEok === 100, "10,000,000,000원 → 100억원");
  console.log("✅ Test 1 — Basic conversion: 10,000,000,000 KRW → 100억원");
}

function testDecimalConversion() {
  const qoe = qoeResultForEbitda(12_550_000_000);
  const result = bridgeQoEToLboEntryEbitda(period(), "KRW", qoe);
  const ok = expectOk(result);
  assert(ok.lbo.entryEbitdaInEok === 125.5, "12,550,000,000원 → 125.5억원(정수 반올림 없음)");
  console.log("✅ Test 2 — Decimal conversion: 12,550,000,000 KRW → 125.5억원");
}

function testSmallEbitda() {
  const qoe = qoeResultForEbitda(50_000_000);
  const result = bridgeQoEToLboEntryEbitda(period(), "KRW", qoe);
  const ok = expectOk(result);
  assert(ok.lbo.entryEbitdaInEok === 0.5, "50,000,000원 → 0.5억원");
  console.log("✅ Test 3 — Small EBITDA: 50,000,000 KRW → 0.5억원");
}

function testNegativeEbitda() {
  const qoe = qoeResultForEbitda(-5_000_000_000);
  const result = bridgeQoEToLboEntryEbitda(period(), "KRW", qoe);
  const ok = expectOk(result);
  assert(ok.lbo.entryEbitdaInEok === -50, "-5,000,000,000원 → -50억원(부호 보존, 0으로 치환 금지)");
  console.log("✅ Test 4 — Negative EBITDA: -5,000,000,000 KRW → -50억원(부호 보존)");
}

function testZeroEbitda() {
  const qoe = qoeResultForEbitda(0);
  const result = bridgeQoEToLboEntryEbitda(period(), "KRW", qoe);
  const ok = expectOk(result);
  assert(ok.lbo.entryEbitdaInEok === 0, "0원 → 0억원(1이나 0.01로 치환 금지)");
  console.log("✅ Test 5 — Zero EBITDA: 0 → 0(치환 없음)");
}

function testMissingEbitda() {
  const qoe = calculateAdjustedEbitda("KRW", [], []); // EBITDA 계정 자체가 없음
  assert(qoe.adjustedEbitda.status === "missing_input", "전제 조건: QoE 결과가 missing_input이어야 함");
  const result = bridgeQoEToLboEntryEbitda(period(), "KRW", qoe);
  assert(result.status === "missing_input", "브릿지도 missing_input으로 실패해야 함(LBO 숫자를 지어내지 않음)");
  console.log("✅ Test 6 — Missing EBITDA: QoE missing_input → 브릿지 실패(LBO 숫자 없음)");
}

function testCurrencyMismatch() {
  // 재무기간 전체가 USD로 일관된 경우 — QoE 계산 자체는 성공(status: ok)하지만,
  // 이 브릿지는 KRW/억원 계약만 지원하므로 환산하지 않고 명시적으로 거부한다.
  const qoe = qoeResultForEbitda(1_000_000_000, [], "USD");
  assert(qoe.adjustedEbitda.status === "ok", "전제 조건: QoE 자체는 USD 내에서 일관되어 성공해야 함");
  const result = bridgeQoEToLboEntryEbitda(period(), "USD", qoe);
  assert(result.status === "unsupported_currency", "USD는 unsupported_currency여야 함(환산 없음)");
  if (result.status === "unsupported_currency") {
    assert(result.currency === "USD", "실패 결과에 실제 통화가 담겨야 함");
  }
  console.log("✅ Test 7 — Currency mismatch: USD → unsupported_currency(환산 없음)");
}

function testPeriodPreservation() {
  const qoe = qoeResultForEbitda(10_000_000_000);
  const result = bridgeQoEToLboEntryEbitda(period({ fiscalYear: 2025, periodType: "ANNUAL" }), "KRW", qoe);
  const ok = expectOk(result);
  assert(ok.provenance.fiscalPeriod === "FY2025", "기간 라벨이 FY2025여야 함");
  assert(ok.provenance.fiscalYear === 2025 && ok.provenance.periodType === "ANNUAL", "구조화된 기간 필드도 보존되어야 함");
  console.log("✅ Test 8 — Period preservation: FY2025 → LBO source period = FY2025");
}

function testProvenance() {
  const qoe = qoeResultForEbitda(10_000_000_000, [
    adjustment({ adjustmentValue: 1_000_000_000, status: "APPROVED" }),
  ]);
  const result = bridgeQoEToLboEntryEbitda(period({ financialPeriodId: "period_abc" }), "KRW", qoe);
  const ok = expectOk(result);
  assert(ok.provenance.financialPeriodId === "period_abc", "financialPeriodId 보존");
  assert(ok.provenance.baseEbitdaKrw === 10_000_000_000, "base EBITDA(원) 보존");
  assert(ok.provenance.approvedAdjustmentTotalKrw === 1_000_000_000, "승인된 조정 합계(원) 보존");
  assert(ok.provenance.adjustedEbitdaKrw === 11_000_000_000, "adjusted EBITDA(원) 보존");
  assert(ok.provenance.qoeSource === "QOE_ENGINE", "QoE 출처 표시 보존");
  assert(ok.provenance.currency === "KRW", "통화 보존");
  console.log("✅ Test 9 — Provenance: financialPeriodId/base/adjustment/adjusted EBITDA 전부 추적 가능");
}

function testApprovedAdjustment() {
  const qoe = qoeResultForEbitda(100 * KRW_PER_EOK, [
    adjustment({ adjustmentValue: 10 * KRW_PER_EOK, status: "APPROVED" }),
  ]);
  const result = bridgeQoEToLboEntryEbitda(period(), "KRW", qoe);
  const ok = expectOk(result);
  assert(ok.lbo.entryEbitdaInEok === 110, "APPROVED +10억원 반영 → 110억원");
  console.log("✅ Test 10 — Approved adjustment: 100억원 +10억원(APPROVED) → 110억원");
}

function testProposedAdjustmentNotApplied() {
  const qoe = qoeResultForEbitda(100 * KRW_PER_EOK, [
    adjustment({ adjustmentValue: 20 * KRW_PER_EOK, status: "PROPOSED" }),
  ]);
  const result = bridgeQoEToLboEntryEbitda(period(), "KRW", qoe);
  const ok = expectOk(result);
  assert(ok.lbo.entryEbitdaInEok === 100, "PROPOSED는 PR-D가 이미 걸러냄 → 100억원 그대로");
  console.log("✅ Test 11 — Proposed adjustment: 100억원 +20억원(PROPOSED) → 100억원(미반영)");
}

function testRejectedAdjustmentNotApplied() {
  const qoe = qoeResultForEbitda(100 * KRW_PER_EOK, [
    adjustment({ adjustmentValue: 20 * KRW_PER_EOK, status: "REJECTED" }),
  ]);
  const result = bridgeQoEToLboEntryEbitda(period(), "KRW", qoe);
  const ok = expectOk(result);
  assert(ok.lbo.entryEbitdaInEok === 100, "REJECTED는 PR-D가 이미 걸러냄 → 100억원 그대로");
  console.log("✅ Test 12 — Rejected adjustment: 100억원 +20억원(REJECTED) → 100억원(미반영)");
}

function testLargeNumberPrecision() {
  const rawKrw = 50_000_000_050_000; // 50조 원 + 5만원 — 정수 억원 배수가 아님
  const qoe = qoeResultForEbitda(rawKrw);
  const result = bridgeQoEToLboEntryEbitda(period(), "KRW", qoe);
  const ok = expectOk(result);
  const expected = rawKrw / KRW_PER_EOK; // 500000.0005
  assert(ok.lbo.entryEbitdaInEok === expected, `대형 숫자도 정확히 변환되어야 함: ${ok.lbo.entryEbitdaInEok} !== ${expected}`);
  // 역변환해도 원래 값과 정확히 일치해야 함(브릿지가 중간에 정밀도를 버리지 않음)
  assert(ok.lbo.entryEbitdaInEok * KRW_PER_EOK === rawKrw, "억원→원 역변환이 원래 raw KRW와 정확히 일치해야 함");
  console.log("✅ Test 13 — Large number precision: 50,000,000,050,000 KRW → 500000.0005억원(정확)");
}

function testNoHiddenRounding() {
  const qoe = qoeResultForEbitda(12_550_000_000); // 125.5억원 — 정수가 아님
  const result = bridgeQoEToLboEntryEbitda(period(), "KRW", qoe);
  const ok = expectOk(result);
  assert(ok.lbo.entryEbitdaInEok !== Math.round(ok.lbo.entryEbitdaInEok), "Math.round를 적용했다면 126이 되어 125.5와 달라야 함 — 실제로는 같지 않아야 정상(반올림 미적용 확인)");
  assert(ok.lbo.entryEbitdaInEok !== Math.floor(ok.lbo.entryEbitdaInEok), "Math.floor 미적용 확인");
  assert(ok.lbo.entryEbitdaInEok !== Math.ceil(ok.lbo.entryEbitdaInEok), "Math.ceil 미적용 확인");
  console.log("✅ Test 14 — No hidden rounding: 125.5억원이 Math.round/floor/ceil 없이 그대로 보존됨");
}

function testNoLboEngineMutation() {
  const qoe = qoeResultForEbitda(10_000_000_000);
  const result = bridgeQoEToLboEntryEbitda(period(), "KRW", qoe);
  const ok = expectOk(result);
  const keys = Object.keys(ok.lbo);
  assert(keys.length === 1 && keys[0] === "entryEbitdaInEok", "브릿지 출력은 entryEbitdaInEok 하나만 가져야 함(MOIC/IRR/EV 등 LBO 계산 결과를 포함하지 않음)");
  assert(!("moic" in ok) && !("irr" in ok) && !("entryEv" in ok), "브릿지 결과 최상위에도 LBO 계산 필드가 없어야 함");
  console.log("✅ Test 15 — No LBO engine mutation: 브릿지는 LBO 입력만 준비하고 MOIC/IRR을 계산하지 않음");
}

// ─────────────────────────────────────────────────────────────
// 아래는 §13 실패 계약의 나머지 두 상태(invalid_qoe_result/invalid_period)를
// 위한 보충 테스트 — 스펙의 15개 필수 테스트에는 없지만, 이 브릿지가 직접
// 정의한 상태이므로 도달 가능성을 실제로 검증해 둔다.
// ─────────────────────────────────────────────────────────────

function testInvalidQoeResultCurrencyMismatch() {
  // EBIT(USD, 기간통화와 불일치) + DA(KRW)만 제공 — direct EBITDA 없음.
  // qoe.ts/financial-normalization.ts(PR-B, 수정하지 않음)의 실제 동작:
  // deriveEbitda가 direct EBITDA를 못 찾아 EBIT+DA fallback으로 가고,
  // combine()이 EBIT의 currency_mismatch를 그대로 전파한다.
  const qoe = calculateAdjustedEbitda(
    "KRW",
    [
      lineItem({ lineItem: "EBIT", value: 100, currency: "USD" }),
      lineItem({ lineItem: "DA", value: 10, currency: "KRW" }),
    ],
    []
  );
  assert(qoe.adjustedEbitda.status === "currency_mismatch", "전제 조건: QoE 결과가 currency_mismatch여야 함");
  const result = bridgeQoEToLboEntryEbitda(period(), "KRW", qoe);
  assert(result.status === "invalid_qoe_result", "QoE 내부 currency_mismatch는 invalid_qoe_result로 구분되어야 함(missing_input과 다름)");
  console.log("✅ Test 16(보충) — QoE 내부 currency_mismatch → invalid_qoe_result(missing_input과 구분됨)");
}

function testInvalidPeriod() {
  const qoe = qoeResultForEbitda(10_000_000_000);
  const result = bridgeQoEToLboEntryEbitda(period({ financialPeriodId: "" }), "KRW", qoe);
  assert(result.status === "invalid_period", "빈 financialPeriodId는 invalid_period여야 함");
  console.log("✅ Test 17(보충) — 빈 financialPeriodId → invalid_period");
}

function main() {
  console.log("\n=== DealMind QoE → LBO Bridge(PR-E) 테스트 ===\n");
  testBasicConversion();
  testDecimalConversion();
  testSmallEbitda();
  testNegativeEbitda();
  testZeroEbitda();
  testMissingEbitda();
  testCurrencyMismatch();
  testPeriodPreservation();
  testProvenance();
  testApprovedAdjustment();
  testProposedAdjustmentNotApplied();
  testRejectedAdjustmentNotApplied();
  testLargeNumberPrecision();
  testNoHiddenRounding();
  testNoLboEngineMutation();
  testInvalidQoeResultCurrencyMismatch();
  testInvalidPeriod();
  console.log("\n✅ QoE → LBO Bridge(PR-E) 테스트 통과\n");
}

main();
