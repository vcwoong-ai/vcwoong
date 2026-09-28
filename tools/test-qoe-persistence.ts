/**
 * QoE Adjustment Persistence(PR-D.1) 검증.
 *
 * 이 레포의 다른 test:*와 동일한 관례로 라이브 DB를 쓰지 않는다(확인됨 —
 * PR-A/B/C 테스트 전부 동일). "persistence"는 여기서 (1) Prisma
 * status/adjustmentType 컬럼이 QoEAdjustmentStatus/QoEAdjustmentType과
 * 정확히 같은 값 집합을 갖는지, (2) DB row 모양을 손으로 구성한 fixture가
 * qoe-repository.ts를 거쳐 qoe.ts(PR-D, 수정하지 않음)의 계산에 정확히
 * 반영되는지를 타입·순수함수 레벨에서 검증하는 것을 의미한다 — 실제 Neon
 * DB에 쓰고 읽는 라운드트립은 이 스크립트로 하지 않는다(그런 테스트가
 * 필요하다면 별도 통합 테스트 인프라가 필요하며, 이 저장소에는 아직 없다).
 *
 * Usage: npm run test:qoe-persistence
 */
import type { MAFinancialAdjustment as MAFinancialAdjustmentRow } from "@prisma/client";
import { toQoEAdjustmentInput, toQoEAdjustmentInputs } from "../src/lib/pe/qoe-repository";
import { calculateAdjustedEbitda } from "../src/lib/pe/qoe";
import { qoeAdjustmentInputSchema } from "../src/lib/pe/qoe-validation";
import { QOE_ADJUSTMENT_STATUSES, QOE_ADJUSTMENT_TYPES } from "../src/lib/pe/qoe-types";
import type { FinancialLineItemInput } from "../src/lib/pe/financial-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function row(overrides: Partial<MAFinancialAdjustmentRow> = {}): MAFinancialAdjustmentRow {
  const now = new Date();
  return {
    id: "adj_1",
    financialPeriodId: "period_1",
    metric: "EBITDA",
    reportedValue: 100,
    adjustmentValue: 10,
    normalizedValue: 110,
    reason: "테스트 조정",
    source: "MANUAL",
    sourceName: null,
    sourceLocation: null,
    status: "APPROVED",
    adjustmentType: "OTHER",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const BASE_EBITDA_100: FinancialLineItemInput[] = [
  { lineItem: "EBITDA", value: 100, currency: "KRW", sourceType: "MANUAL" },
];

function testDraftAdjustmentPersistence() {
  const draftRow = row({ status: "DRAFT" });
  assert(draftRow.status === "DRAFT", "DRAFT 값이 Prisma 타입에 유효해야 함");
  const mapped = toQoEAdjustmentInput(draftRow);
  assert(mapped.status === "DRAFT", "매핑 후에도 DRAFT 상태가 보존되어야 함");
  console.log("✅ Test 1 — DRAFT adjustment persistence(타입/매핑 레벨)");
}

function testProposedAdjustmentPersistence() {
  const proposedRow = row({ status: "PROPOSED" });
  const mapped = toQoEAdjustmentInput(proposedRow);
  assert(mapped.status === "PROPOSED", "PROPOSED 상태가 보존되어야 함");
  console.log("✅ Test 2 — PROPOSED adjustment persistence(타입/매핑 레벨)");
}

function testApprovedAdjustmentPersistence() {
  const approvedRow = row({ status: "APPROVED" });
  const mapped = toQoEAdjustmentInput(approvedRow);
  assert(mapped.status === "APPROVED", "APPROVED 상태가 보존되어야 함");
  console.log("✅ Test 3 — APPROVED adjustment persistence(타입/매핑 레벨)");
}

function testRejectedAdjustmentPersistence() {
  const rejectedRow = row({ status: "REJECTED" });
  const mapped = toQoEAdjustmentInput(rejectedRow);
  assert(mapped.status === "REJECTED", "REJECTED 상태가 보존되어야 함");
  console.log("✅ Test 4 — REJECTED adjustment persistence(타입/매핑 레벨)");
}

function testDbRowToQoEAdjustmentInputMapping() {
  const fullRow = row({
    metric: "EBITDA",
    reportedValue: 250,
    adjustmentValue: -15,
    reason: "일회성 자산매각이익 제거",
    source: "UPLOADED_DOCUMENT",
    sourceName: "2025_실사보고서.pdf",
    sourceLocation: "17페이지",
    status: "PROPOSED",
    adjustmentType: "ONE_OFF_INCOME",
  });
  const mapped = toQoEAdjustmentInput(fullRow);
  assert(mapped.metric === "EBITDA", "metric 보존");
  assert(mapped.reportedValue === 250, "reportedValue 보존");
  assert(mapped.adjustmentValue === -15, "adjustmentValue 보존(부호 포함)");
  assert(mapped.reason === "일회성 자산매각이익 제거", "reason 보존");
  assert(mapped.sourceType === "UPLOADED_DOCUMENT", "source→sourceType 보존");
  assert(mapped.sourceName === "2025_실사보고서.pdf", "sourceName 보존");
  assert(mapped.sourceLocation === "17페이지", "sourceLocation 보존");
  assert(mapped.status === "PROPOSED", "status 보존");
  assert(mapped.adjustmentType === "ONE_OFF_INCOME", "adjustmentType 보존");
  console.log("✅ Test 5 — DB row → QoEAdjustmentInput: 모든 필드 손실 없이 매핑");
}

function testApprovedDbAdjustmentReflectedInAdjustedEbitda() {
  const rows = [row({ status: "APPROVED", adjustmentValue: 10, reportedValue: 100 })];
  const qoeInputs = toQoEAdjustmentInputs(rows);
  const result = calculateAdjustedEbitda("KRW", BASE_EBITDA_100, qoeInputs);
  assert(result.adjustedEbitda.status === "ok" && result.adjustedEbitda.value === 110, "APPROVED DB row는 Adjusted EBITDA에 반영되어야 함(100+10=110)");
  console.log("✅ Test 6 — APPROVED DB adjustment → QoE Engine → Adjusted EBITDA 반영(110)");
}

function testProposedDbAdjustmentNotReflected() {
  const rows = [row({ status: "PROPOSED", adjustmentValue: 10, reportedValue: 100 })];
  const qoeInputs = toQoEAdjustmentInputs(rows);
  const result = calculateAdjustedEbitda("KRW", BASE_EBITDA_100, qoeInputs);
  assert(result.adjustedEbitda.status === "ok" && result.adjustedEbitda.value === 100, "PROPOSED DB row는 공식 Adjusted EBITDA에 반영되면 안 됨");
  console.log("✅ Test 7 — PROPOSED DB adjustment → Adjusted EBITDA 미반영(100 그대로)");
}

function testRejectedDbAdjustmentNotReflected() {
  const rows = [row({ status: "REJECTED", adjustmentValue: 10, reportedValue: 100 })];
  const qoeInputs = toQoEAdjustmentInputs(rows);
  const result = calculateAdjustedEbitda("KRW", BASE_EBITDA_100, qoeInputs);
  assert(result.adjustedEbitda.status === "ok" && result.adjustedEbitda.value === 100, "REJECTED DB row는 공식 Adjusted EBITDA에 반영되면 안 됨");
  console.log("✅ Test 8 — REJECTED DB adjustment → Adjusted EBITDA 미반영(100 그대로)");
}

function testExistingRowMigrationCompatibility() {
  // 이 패치(2026-09-23-add-qoe-adjustment-status.sql) 적용 직후, 컬럼
  // 추가 이전부터 있던 row는 DEFAULT('APPROVED', 'OTHER')로 채워진다 —
  // 그 상태를 흉내낸 row가 매핑·계산에서 예전과 동일한 결과(계산에 포함)를
  // 내는지 확인한다(마이그레이션이 기존 계산 결과를 조용히 바꾸지 않음을 증명).
  const legacyRowAfterMigration = row({
    status: "APPROVED", // 마이그레이션 DEFAULT
    adjustmentType: "OTHER", // 마이그레이션 DEFAULT
    adjustmentValue: 8,
    reportedValue: 100,
  });
  const qoeInputs = toQoEAdjustmentInputs([legacyRowAfterMigration]);
  const result = calculateAdjustedEbitda("KRW", BASE_EBITDA_100, qoeInputs);
  assert(
    result.adjustedEbitda.status === "ok" && result.adjustedEbitda.value === 108,
    "마이그레이션 DEFAULT(APPROVED/OTHER)가 적용된 기존 row는 이전과 동일하게 계산에 포함되어야 함(100+8=108)"
  );
  console.log("✅ Test 9 — 기존 row 마이그레이션 호환성: DEFAULT(APPROVED/OTHER) 적용 후에도 이전과 동일한 Adjusted EBITDA");
}

function testInvalidStatusRejected() {
  const valid = {
    metric: "EBITDA" as const,
    reportedValue: 100,
    adjustmentValue: 10,
    reason: "테스트",
    source: "MANUAL" as const,
    status: "APPROVED" as const,
    adjustmentType: "OTHER" as const,
  };
  assert(qoeAdjustmentInputSchema.safeParse(valid).success, "정상 입력은 통과해야 함(대조군)");
  assert(
    !qoeAdjustmentInputSchema.safeParse({ ...valid, status: "APPROVED_BUT_TYPO" }).success,
    "유효하지 않은 status 문자열은 거부되어야 함"
  );
  assert(
    QOE_ADJUSTMENT_STATUSES.every((s) => qoeAdjustmentInputSchema.safeParse({ ...valid, status: s }).success),
    "정의된 4개 status(DRAFT/PROPOSED/APPROVED/REJECTED)는 전부 통과해야 함"
  );
  console.log("✅ Test 10 — 잘못된 status 거부(기존 qoe-validation.ts 스키마 재사용, 신규 검증 프레임워크 없음)");
}

function testInvalidAdjustmentTypeRejected() {
  const valid = {
    metric: "EBITDA" as const,
    reportedValue: 100,
    adjustmentValue: 10,
    reason: "테스트",
    source: "MANUAL" as const,
    status: "APPROVED" as const,
    adjustmentType: "OTHER" as const,
  };
  assert(
    !qoeAdjustmentInputSchema.safeParse({ ...valid, adjustmentType: "NOT_A_REAL_TYPE" }).success,
    "유효하지 않은 adjustmentType 문자열은 거부되어야 함"
  );
  assert(
    QOE_ADJUSTMENT_TYPES.every((t) => qoeAdjustmentInputSchema.safeParse({ ...valid, adjustmentType: t }).success),
    "정의된 10개 adjustmentType은 전부 통과해야 함"
  );
  console.log("✅ Test 11 — 잘못된 adjustmentType 거부(기존 qoe-validation.ts 스키마 재사용)");
}

function main() {
  console.log("\n=== DealMind QoE Adjustment Persistence(PR-D.1) 테스트 ===\n");
  testDraftAdjustmentPersistence();
  testProposedAdjustmentPersistence();
  testApprovedAdjustmentPersistence();
  testRejectedAdjustmentPersistence();
  testDbRowToQoEAdjustmentInputMapping();
  testApprovedDbAdjustmentReflectedInAdjustedEbitda();
  testProposedDbAdjustmentNotReflected();
  testRejectedDbAdjustmentNotReflected();
  testExistingRowMigrationCompatibility();
  testInvalidStatusRejected();
  testInvalidAdjustmentTypeRejected();
  console.log("\n✅ QoE Adjustment Persistence(PR-D.1) 테스트 통과\n");
}

main();
