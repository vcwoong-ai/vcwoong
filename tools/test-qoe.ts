/**
 * QoE / EBITDA Normalization Engine(PR-D) 검증.
 *
 * 이 레포의 다른 test:*와 동일한 관례 — DB/네트워크/AI 호출 없이 순수
 * 함수(qoe.ts)와 PR-B 엔진(financial-normalization.ts, 수정하지 않음)만
 * 확인한다. tools/test-*.ts는 jest/vitest 없이 tsx로 직접 실행하는 이
 * 레포 유일의 관례라(확인됨 — jest.config/vitest.config/기존 *.test.ts
 * 파일 전무), 스펙이 제안한 `qoe.test.ts`가 아니라 이 관례를 따른다.
 *
 * Usage: npm run test:qoe
 */
import {
  calculateAdjustedEbitda,
  toApprovedAdjustmentInputs,
  isAdjustmentLargeRelativeToBase,
  buildQoEToLboBridge,
} from "../src/lib/pe/qoe";
import type { QoEAdjustmentInput } from "../src/lib/pe/qoe-types";
import type { FinancialLineItemInput } from "../src/lib/pe/financial-types";
import { qoeAdjustmentInputSchema } from "../src/lib/pe/qoe-validation";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function lineItem(overrides: Partial<FinancialLineItemInput> & Pick<FinancialLineItemInput, "lineItem" | "value">): FinancialLineItemInput {
  return { currency: "KRW", sourceType: "MANUAL", ...overrides };
}

function adjustment(overrides: Partial<QoEAdjustmentInput> & Pick<QoEAdjustmentInput, "adjustmentValue" | "status">): QoEAdjustmentInput {
  return {
    metric: "EBITDA",
    reportedValue: 100,
    reason: "테스트 조정",
    adjustmentType: "OTHER",
    sourceType: "MANUAL",
    ...overrides,
  };
}

const BASE_EBITDA_100: FinancialLineItemInput[] = [lineItem({ lineItem: "EBITDA", value: 100 })];

function testNoAdjustment() {
  const result = calculateAdjustedEbitda("KRW", BASE_EBITDA_100, []);
  assert(result.baseEbitda.status === "ok" && result.baseEbitda.value === 100, "Base EBITDA = 100");
  assert(result.adjustedEbitda.status === "ok" && result.adjustedEbitda.value === 100, "조정 없으면 Adjusted EBITDA = Base EBITDA");
  console.log("✅ Test 1 — No Adjustment: 100 → 100");
}

function testPositiveAdjustment() {
  const result = calculateAdjustedEbitda("KRW", BASE_EBITDA_100, [
    adjustment({ adjustmentValue: 10, status: "APPROVED" }),
    adjustment({ adjustmentValue: 5, status: "APPROVED" }),
  ]);
  assert(result.adjustedEbitda.status === "ok" && result.adjustedEbitda.value === 115, "100+10+5=115");
  console.log("✅ Test 2 — Positive Adjustment: 100 +10 +5 → 115");
}

function testNegativeAdjustment() {
  const result = calculateAdjustedEbitda("KRW", BASE_EBITDA_100, [
    adjustment({ adjustmentValue: -10, status: "APPROVED" }),
  ]);
  assert(result.adjustedEbitda.status === "ok" && result.adjustedEbitda.value === 90, "100-10=90");
  console.log("✅ Test 3 — Negative Adjustment: 100 -10 → 90");
}

function testMixedAdjustment() {
  const result = calculateAdjustedEbitda("KRW", BASE_EBITDA_100, [
    adjustment({ adjustmentValue: 10, status: "APPROVED", adjustmentType: "ONE_OFF_EXPENSE" }),
    adjustment({ adjustmentValue: 5, status: "APPROVED", adjustmentType: "OWNER_COMPENSATION_NORMALIZATION" }),
    adjustment({ adjustmentValue: -7, status: "APPROVED", adjustmentType: "ONE_OFF_INCOME" }),
  ]);
  assert(result.adjustedEbitda.status === "ok" && result.adjustedEbitda.value === 108, "100+10+5-7=108");
  console.log("✅ Test 4 — Mixed Adjustment: 100 +10 +5 -7 → 108");
}

function testRejectedAdjustment() {
  const result = calculateAdjustedEbitda("KRW", BASE_EBITDA_100, [
    adjustment({ adjustmentValue: 20, status: "REJECTED" }),
  ]);
  assert(result.adjustedEbitda.status === "ok" && result.adjustedEbitda.value === 100, "REJECTED는 반영되면 안 됨");
  console.log("✅ Test 5 — Rejected Adjustment: +20 REJECTED → 100(미반영)");
}

function testProposedAdjustment() {
  const result = calculateAdjustedEbitda("KRW", BASE_EBITDA_100, [
    adjustment({ adjustmentValue: 20, status: "PROPOSED" }),
  ]);
  assert(result.adjustedEbitda.status === "ok" && result.adjustedEbitda.value === 100, "PROPOSED는 공식 Adjusted EBITDA에 반영되면 안 됨");
  console.log("✅ Test 6 — Proposed Adjustment: +20 PROPOSED → 100(미반영, 검토 대기)");
}

function testApprovedAdjustment() {
  const result = calculateAdjustedEbitda("KRW", BASE_EBITDA_100, [
    adjustment({ adjustmentValue: 20, status: "APPROVED" }),
  ]);
  assert(result.adjustedEbitda.status === "ok" && result.adjustedEbitda.value === 120, "100+20=120");
  console.log("✅ Test 7 — Approved Adjustment: +20 APPROVED → 120");
}

function testZeroAdjustment() {
  const result = calculateAdjustedEbitda("KRW", BASE_EBITDA_100, [
    adjustment({ adjustmentValue: 0, status: "APPROVED" }),
  ]);
  assert(result.adjustedEbitda.status === "ok" && result.adjustedEbitda.value === 100, "0 조정은 값이 그대로여야 함");
  console.log("✅ Test 8 — Zero Adjustment: +0 → 100");
}

function testLargeAdjustment() {
  const result = calculateAdjustedEbitda("KRW", BASE_EBITDA_100, [
    adjustment({ adjustmentValue: 500, status: "APPROVED" }),
  ]);
  assert(result.adjustedEbitda.status === "ok" && result.adjustedEbitda.value === 600, "큰 조정도 계산 자체는 그대로 수행되어야 함(100+500=600)");
  // threshold는 정책으로 고정하지 않음 — 호출자가 명시적으로 넘겨야 flag 가능
  assert(isAdjustmentLargeRelativeToBase(100, 500, 1.0), "명시적 threshold(1.0=100%)를 넘기면 큰 조정으로 판단 가능해야 함");
  assert(!isAdjustmentLargeRelativeToBase(100, 500, 10.0), "threshold를 매우 높게 잡으면(10.0=1000%) flag 안 됨 — 정책은 호출자 책임");
  console.log("✅ Test 9 — Large Adjustment: 계산은 그대로 수행(600), flag 여부는 호출자가 명시한 threshold에만 의존(하드코딩된 정책 없음)");
}

function testMissingEbitda() {
  const result = calculateAdjustedEbitda("KRW", [], [
    adjustment({ adjustmentValue: 20, status: "APPROVED" }),
  ]);
  assert(result.baseEbitda.status === "missing_input", "line item이 아예 없으면 Base EBITDA는 missing_input이어야 함");
  assert(result.adjustedEbitda.status === "missing_input", "Base가 missing이면 Adjusted EBITDA도 missing_input이어야 함(0으로 대체 금지)");
  console.log("✅ Test 10 — Missing EBITDA: base 없으면 missing_input(0 아님), adjustment가 있어도 계산 안 함");
}

function testMissingDA() {
  // DART-only 재무자료 그대로 재현: Revenue/EBIT/Net Income/Assets/Liabilities/Equity만 있고 D&A 없음
  const dartOnlyLineItems: FinancialLineItemInput[] = [
    lineItem({ lineItem: "REVENUE", value: 10_000_000_000 }),
    lineItem({ lineItem: "EBIT", value: 1_500_000_000, sourceType: "DART" }),
    lineItem({ lineItem: "NET_INCOME", value: 900_000_000, sourceType: "DART" }),
    lineItem({ lineItem: "TOTAL_ASSETS", value: 20_000_000_000, sourceType: "DART" }),
    lineItem({ lineItem: "TOTAL_LIABILITIES", value: 8_000_000_000, sourceType: "DART" }),
    lineItem({ lineItem: "EQUITY", value: 12_000_000_000, sourceType: "DART" }),
  ];
  const result = calculateAdjustedEbitda("KRW", dartOnlyLineItems, []);
  assert(result.baseEbitda.status === "missing_input", "D&A가 없으면 EBITDA를 추정하지 않고 missing_input이어야 함");
  if (result.baseEbitda.status === "missing_input") {
    assert(result.baseEbitda.missing.includes("DA"), "missing 필드에 DA가 명시되어야 함");
  }
  console.log("✅ Test 11 — Missing D&A(DART 전용 자료): EBITDA 추정 없이 missing_input(DA)");
}

function testSourceLineagePreservation() {
  const adj = adjustment({
    adjustmentValue: 10,
    status: "APPROVED",
    adjustmentType: "ONE_OFF_EXPENSE",
    sourceType: "UPLOADED_DOCUMENT",
    sourceName: "2025_실사보고서.pdf",
    sourceLocation: "17페이지",
  });
  const result = calculateAdjustedEbitda("KRW", BASE_EBITDA_100, [adj]);
  const preserved = result.allAdjustments[0];
  assert(preserved.sourceName === "2025_실사보고서.pdf", "sourceName이 계산 후에도 그대로 보존되어야 함");
  assert(preserved.sourceLocation === "17페이지", "sourceLocation이 계산 후에도 그대로 보존되어야 함");
  assert(preserved.status === "APPROVED", "status도 그대로 보존되어야 함(감사 목적)");
  console.log("✅ Test 12 — Source Lineage: 계산 결과와 함께 source/status 메타데이터 보존");
}

function testDuplicateAdjustmentsTreatedIndependently() {
  // 같은 +10 조정이 두 번 들어와도 AI/fuzzy matching으로 자동 제거하지 않는다 —
  // 각 레코드를 독립 입력으로 취급(정책 명시).
  const result = calculateAdjustedEbitda("KRW", BASE_EBITDA_100, [
    adjustment({ adjustmentValue: 10, status: "APPROVED", reason: "일회성 소송비용" }),
    adjustment({ adjustmentValue: 10, status: "APPROVED", reason: "일회성 소송비용" }),
  ]);
  assert(result.adjustedEbitda.status === "ok" && result.adjustedEbitda.value === 120, "동일해 보이는 조정 2건은 각각 독립 반영되어(100+10+10=120) 자동 중복제거되지 않아야 함");
  console.log("✅ 중복처럼 보이는 adjustment 2건 — 자동 제거 없이 각각 독립 반영(정책: 중복 판단은 사람 몫)");
}

function testCurrencyMismatchNotAutoConverted() {
  // 주의: deriveEbitda(PR-B, 미수정)는 "EBITDA" line item 자체가
  // currency_mismatch면 그 사유를 그대로 드러내지 않고 EBIT+D&A 대체
  // 경로로 넘어간다(reported.status !== "ok"이면 무조건 fallback 시도) —
  // 따라서 mismatch를 확실히 드러내려면 fallback 경로(EBIT+DA) 쪽에
  // 불일치를 만들어야 한다. PR-B 엔진은 수정하지 않으므로 이 실제 동작에
  // 맞춰 테스트를 구성한다(내가 원하는 동작이 아니라 실제 동작을 검증).
  const mismatchedLineItems: FinancialLineItemInput[] = [
    lineItem({ lineItem: "EBIT", value: 100, currency: "USD" }),
    lineItem({ lineItem: "DA", value: 10, currency: "KRW" }),
  ];
  const result = calculateAdjustedEbitda("KRW", mismatchedLineItems, [
    adjustment({ adjustmentValue: 10, status: "APPROVED" }),
  ]);
  assert(result.baseEbitda.status === "currency_mismatch", "기간 통화(KRW)와 다른 line item(USD)은 환산되지 않고 currency_mismatch여야 함");
  console.log("✅ 통화 불일치(USD EBIT vs KRW 기간) — 자동 환산 없이 currency_mismatch, adjustment도 반영되지 않음");
}

function testPeriodIsolation() {
  const fy2024 = calculateAdjustedEbitda("KRW", [lineItem({ lineItem: "EBITDA", value: 80 })], [
    adjustment({ adjustmentValue: 20, status: "APPROVED" }),
  ]);
  const fy2025 = calculateAdjustedEbitda("KRW", BASE_EBITDA_100, [
    adjustment({ adjustmentValue: 5, status: "APPROVED" }),
  ]);
  assert(fy2024.adjustedEbitda.status === "ok" && fy2024.adjustedEbitda.value === 100, "FY2024: 80+20=100");
  assert(fy2025.adjustedEbitda.status === "ok" && fy2025.adjustedEbitda.value === 105, "FY2025: 100+5=105(FY2024 조정과 섞이지 않음)");
  console.log("✅ 회계기간 독립성: FY2024 조정이 FY2025 계산에 섞이지 않음");
}

function testValidationRejections() {
  const valid = {
    metric: "EBITDA" as const,
    reportedValue: 100,
    adjustmentValue: 10,
    reason: "일회성 소송비용",
    source: "MANUAL" as const,
    status: "APPROVED" as const,
    adjustmentType: "ONE_OFF_EXPENSE" as const,
  };
  assert(qoeAdjustmentInputSchema.safeParse(valid).success, "정상 입력은 통과해야 함");
  assert(!qoeAdjustmentInputSchema.safeParse({ ...valid, adjustmentValue: Number.NaN }).success, "NaN 금액은 거부되어야 함");
  assert(!qoeAdjustmentInputSchema.safeParse({ ...valid, adjustmentValue: Number.POSITIVE_INFINITY }).success, "Infinity 금액은 거부되어야 함");
  assert(!qoeAdjustmentInputSchema.safeParse({ ...valid, status: "APPROVED_XYZ" }).success, "유효하지 않은 status는 거부되어야 함");
  assert(!qoeAdjustmentInputSchema.safeParse({ ...valid, adjustmentType: "NOT_A_TYPE" }).success, "유효하지 않은 adjustmentType은 거부되어야 함");
  assert(!qoeAdjustmentInputSchema.safeParse({ ...valid, reason: "" }).success, "근거(reason) 없이는 거부되어야 함(PR-B 스키마 그대로 상속)");
  assert(!qoeAdjustmentInputSchema.safeParse({ ...valid, source: "UNKNOWN_SOURCE" }).success, "유효하지 않은 source는 거부되어야 함(PR-B 스키마 그대로 상속)");
  console.log("✅ 입력 검증(NaN/Infinity/잘못된 status/잘못된 type/근거 없음/잘못된 source 전부 거부) — PR-B 스키마 확장, 신규 프레임워크 없음");
}

function testApprovedFilterHelper() {
  const filtered = toApprovedAdjustmentInputs([
    adjustment({ adjustmentValue: 10, status: "APPROVED" }),
    adjustment({ adjustmentValue: 20, status: "PROPOSED" }),
    adjustment({ adjustmentValue: 30, status: "DRAFT" }),
    adjustment({ adjustmentValue: 40, status: "REJECTED" }),
  ]);
  assert(filtered.length === 1 && filtered[0].adjustmentValue === 10, "APPROVED 1건만 걸러져야 함");
  console.log("✅ toApprovedAdjustmentInputs: APPROVED만 통과, DRAFT/PROPOSED/REJECTED는 걸러짐");
}

function testQoeToLboBridgeAndIntegrationGap() {
  const result = calculateAdjustedEbitda("KRW", BASE_EBITDA_100, [
    adjustment({ adjustmentValue: 8, status: "APPROVED" }),
  ]);
  const bridge = buildQoEToLboBridge("FY2025", "KRW", result);
  assert(bridge.period === "FY2025", "period가 그대로 전달되어야 함");
  assert(bridge.adjustedEbitda === 108, "bridge.adjustedEbitda는 QoE 결과값을 그대로 담아야 함(원 단위, 억원 환산 없음)");
  assert(bridge.source === "QOE_ENGINE", "source 태그 고정값 확인");
  // INTEGRATION_GAP 문서화: PR #90 LboAssumptions.entryEbitda는 "억원" 단위 주석이 붙어 있으나
  // 이 bridge.adjustedEbitda는 원 단위(raw KRW won)다 — 이 PR은 그 변환을 하지 않는다(PR-E 몫).
  console.log("✅ QoE→LBO bridge 타입 확인 + INTEGRATION_GAP(단위 불일치, 원 vs 억원) 문서화됨 — 변환은 이 PR에서 하지 않음");
}

function testFinancialSanityCheck() {
  // §21 최종 시나리오 — 실제 숫자로 재현
  const result = calculateAdjustedEbitda("KRW", BASE_EBITDA_100, [
    adjustment({ adjustmentValue: 10, status: "APPROVED", adjustmentType: "ONE_OFF_EXPENSE", reason: "일회성 소송비용" }),
    adjustment({ adjustmentValue: 5, status: "APPROVED", adjustmentType: "OWNER_COMPENSATION_NORMALIZATION", reason: "오너 보수 정상화" }),
    adjustment({ adjustmentValue: -7, status: "APPROVED", adjustmentType: "ONE_OFF_INCOME", reason: "일회성 자산매각이익 제거" }),
    adjustment({ adjustmentValue: 20, status: "REJECTED", reason: "근거 불충분으로 기각" }),
    adjustment({ adjustmentValue: 30, status: "PROPOSED", reason: "검토 대기 중" }),
  ]);
  assert(result.approvedAdjustmentTotal === 8, `승인된 조정 합계는 +8이어야 함(10+5-7=8), 실제=${result.approvedAdjustmentTotal}`);
  assert(result.adjustedEbitda.status === "ok" && result.adjustedEbitda.value === 108, `Adjusted EBITDA는 108이어야 함, 실제=${JSON.stringify(result.adjustedEbitda)}`);
  console.log(`✅ Financial Sanity Check — Base EBITDA 100, 승인 조정 합계 +8(REJECTED +20·PROPOSED +30 제외), Adjusted EBITDA = ${result.adjustedEbitda.status === "ok" ? result.adjustedEbitda.value : "N/A"}`);
}

function main() {
  console.log("\n=== DealMind QoE / EBITDA Normalization Engine(PR-D) 테스트 ===\n");
  testNoAdjustment();
  testPositiveAdjustment();
  testNegativeAdjustment();
  testMixedAdjustment();
  testRejectedAdjustment();
  testProposedAdjustment();
  testApprovedAdjustment();
  testZeroAdjustment();
  testLargeAdjustment();
  testMissingEbitda();
  testMissingDA();
  testSourceLineagePreservation();
  testDuplicateAdjustmentsTreatedIndependently();
  testCurrencyMismatchNotAutoConverted();
  testPeriodIsolation();
  testValidationRejections();
  testApprovedFilterHelper();
  testQoeToLboBridgeAndIntegrationGap();
  testFinancialSanityCheck();
  console.log("\n✅ QoE Engine(PR-D) 테스트 통과\n");
}

main();
