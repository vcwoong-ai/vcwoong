/**
 * PE 재무 정규화 계층(PR-B) 검증.
 *
 * 이 레포의 다른 test:* 스크립트와 동일한 관례 — DB/네트워크 호출 없이
 * 순수 함수(financial-normalization.ts)와 Zod 검증(financial-validation.ts)만
 * 확인한다. API 인가는 tools/test-ma-deal.ts와 동일하게 ma-team-access.ts의
 * where절 생성 함수를 직접 검증한다 — /api/ma-deals/[id]/financials의
 * GET/POST가 각각 maDealReadWhere/maDealWriteWhere를 그대로 호출하므로
 * (코드 확인됨) 이 함수들의 동작이 곧 라우트의 동작이다.
 *
 * `npx prisma validate` / `npx prisma generate`는 이 스크립트에 포함하지
 * 않는다 — 이 레포의 어떤 tools/test-*.ts도 CLI 서브프로세스를 실행하지
 * 않으며, 두 명령은 최종 검증 단계에서 별도로 직접 실행해 확인했다.
 *
 * Usage: npm run test:financial-normalization
 */
import {
  normalizeFinancialPeriod,
  assertSinglePeriod,
  computeAdjustmentNormalizedValue,
} from "../src/lib/pe/financial-normalization";
import type {
  FinancialLineItemInput,
  FinancialAdjustmentInput,
} from "../src/lib/pe/financial-types";
import {
  createFinancialPeriodSchema,
  financialLineItemInputSchema,
  financialAdjustmentInputSchema,
} from "../src/lib/pe/financial-validation";
import {
  maDealReadWhere,
  maDealWriteWhere,
  maDealOwnerWhere,
} from "../src/lib/pe/ma-team-access";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function item(
  overrides: Partial<FinancialLineItemInput> & Pick<FinancialLineItemInput, "lineItem" | "value">
): FinancialLineItemInput {
  return { currency: "KRW", sourceType: "MANUAL", ...overrides };
}

// buildLookup은 export되어 있지 않으므로(내부 구현), normalizeFinancialPeriod를
// 통해서만 테스트한다 — 실제 API·엔진 사용 경로와 동일하다.
function lookupOf(lineItems: FinancialLineItemInput[], currency = "KRW") {
  return normalizeFinancialPeriod({ periodCurrency: currency, lineItems });
}

function testRevenueNormalization() {
  const result = lookupOf([item({ lineItem: "REVENUE", value: 10_000_000_000 })]);
  assert(result.revenue.status === "ok" && result.revenue.value === 10_000_000_000, "Revenue 정규화");
  console.log("✅ 1. Revenue normalization");
}

function testEbitdaEqualsEbitPlusDA() {
  const result = lookupOf([
    item({ lineItem: "EBIT", value: 1_500_000_000 }),
    item({ lineItem: "DA", value: 1_000_000_000 }),
  ]);
  assert(result.ebitda.status === "ok" && result.ebitda.value === 2_500_000_000, "EBITDA = EBIT + D&A");
  console.log("✅ 2. EBITDA = EBIT + D&A");
}

function testNetDebtEqualsDebtMinusCash() {
  const result = lookupOf([
    item({ lineItem: "SHORT_TERM_DEBT", value: 300 }),
    item({ lineItem: "LONG_TERM_DEBT", value: 700 }),
    item({ lineItem: "CASH", value: 200 }),
  ]);
  assert(result.netDebt.status === "ok" && result.netDebt.value === 800, "Net Debt = Debt - Cash");
  console.log("✅ 3. Net Debt = Total Debt - Cash");
}

function testFcfEqualsOcfMinusCapex() {
  const result = lookupOf([
    item({ lineItem: "OPERATING_CASH_FLOW", value: 500 }),
    item({ lineItem: "CAPEX", value: 200 }),
  ]);
  assert(result.freeCashFlow.status === "ok" && result.freeCashFlow.value === 300, "FCF = OCF - Capex");
  console.log("✅ 4. FCF = Operating Cash Flow - Capex");
}

function testAdjustedEbitda() {
  const lineItems = [item({ lineItem: "EBITDA", value: 2_500_000_000 })];
  const adjustments: FinancialAdjustmentInput[] = [
    {
      metric: "EBITDA",
      reportedValue: 2_500_000_000,
      adjustmentValue: 500_000_000,
      reason: "일회성 소송비용 제거",
      sourceType: "MANUAL",
    },
  ];
  const result = normalizeFinancialPeriod({ periodCurrency: "KRW", lineItems, adjustments });
  assert(
    result.adjustedEbitda.status === "ok" && result.adjustedEbitda.value === 3_000_000_000,
    "Adjusted EBITDA = Reported + Adjustment"
  );
  console.log("✅ 5. Adjusted EBITDA(단일 조정)");
}

function testMultipleAdjustments() {
  const lineItems = [item({ lineItem: "EBITDA", value: 1_000 })];
  const adjustments: FinancialAdjustmentInput[] = [
    { metric: "EBITDA", reportedValue: 1_000, adjustmentValue: 100, reason: "일회성 비용 제거", sourceType: "MANUAL" },
    { metric: "EBITDA", reportedValue: 1_000, adjustmentValue: -50, reason: "일회성 수익 제거", sourceType: "MANUAL" },
    { metric: "EBITDA", reportedValue: 1_000, adjustmentValue: 30, reason: "오너 보수 정상화", sourceType: "MANUAL" },
  ];
  const result = normalizeFinancialPeriod({ periodCurrency: "KRW", lineItems, adjustments });
  assert(
    result.adjustedEbitda.status === "ok" && result.adjustedEbitda.value === 1_080,
    "여러 조정이 모두 합산되어야 함(1000+100-50+30=1080)"
  );
  console.log("✅ 6. Multiple adjustments 합산");
}

function testMissingInputRejection() {
  // EBITDA도 없고 EBIT/DA 중 DA만 없음 → missing_input, 0으로 치환되면 안 됨
  const result = lookupOf([item({ lineItem: "EBIT", value: 100 })]);
  assert(result.ebitda.status === "missing_input", "DA가 없으면 EBITDA는 missing_input이어야 함(0 아님)");
  if (result.ebitda.status === "missing_input") {
    assert(result.ebitda.missing.includes("DA"), "missing 필드에 DA가 명시되어야 함");
  }
  console.log("✅ 7. 필요한 입력 없으면 missing_input(0으로 조용히 대체하지 않음)");
}

function testNullHandling() {
  // line item 자체가 배열에 없는 경우(undefined) — 0으로 취급되면 안 됨
  const result = lookupOf([]);
  assert(result.revenue.status === "missing_input", "값이 아예 없으면 missing_input이어야 함(0 아님)");
  console.log("✅ 8. Null/undefined 입력은 0이 아니라 missing_input으로 처리");
}

function testCurrencyMismatchRejection() {
  const result = lookupOf(
    [item({ lineItem: "REVENUE", value: 100, currency: "USD" })],
    "KRW"
  );
  assert(result.revenue.status === "currency_mismatch", "기간 통화(KRW)와 다른 line item(USD)은 currency_mismatch여야 함");
  console.log("✅ 9. 통화 불일치 거부(자동 합산하지 않음)");
}

function testPeriodMismatchRejection() {
  const result = assertSinglePeriod([
    { financialPeriodId: "p2025-annual" },
    { financialPeriodId: "p2025-q1" },
  ]);
  assert(result.status === "period_mismatch", "서로 다른 재무기간이 섞이면 period_mismatch여야 함");
  const sameResult = assertSinglePeriod([
    { financialPeriodId: "p2025-annual" },
    { financialPeriodId: "p2025-annual" },
  ]);
  assert(sameResult.status === "ok", "같은 재무기간끼리는 ok여야 함");
  console.log("✅ 10. 다른 회계기간(예: 2025 Q1 vs 2025 Annual) 혼합 거부");
}

function testSourceLineagePreservation() {
  const parsedItem = financialLineItemInputSchema.parse({
    statementType: "INCOME_STATEMENT",
    lineItem: "REVENUE",
    value: 100,
    currency: "KRW",
    source: "UPLOADED_DOCUMENT",
    sourceName: "2025_사업보고서.pdf",
    sourceLocation: "23페이지",
  });
  assert(parsedItem.sourceName === "2025_사업보고서.pdf", "sourceName이 보존되어야 함");
  assert(parsedItem.sourceLocation === "23페이지", "sourceLocation이 보존되어야 함");

  const parsedAdjustment = financialAdjustmentInputSchema.parse({
    metric: "EBITDA",
    reportedValue: 1000,
    adjustmentValue: 50,
    reason: "일회성 비용 제거",
    source: "EXCEL",
    sourceName: "2025_Financials.xlsx",
    sourceLocation: 'sheet "손익계산서"!B14',
  });
  assert(
    parsedAdjustment.sourceLocation === 'sheet "손익계산서"!B14',
    "조정 항목의 sourceLocation도 보존되어야 함"
  );
  assert(
    computeAdjustmentNormalizedValue(parsedAdjustment.reportedValue, parsedAdjustment.adjustmentValue) === 1050,
    "normalizedValue = reportedValue + adjustmentValue"
  );
  console.log("✅ 11. Source lineage(sourceType/sourceName/sourceLocation) 보존");
}

function testNegativeEbitda() {
  const result = lookupOf([item({ lineItem: "EBITDA", value: -500 })]);
  assert(result.ebitda.status === "ok" && result.ebitda.value === -500, "음수 EBITDA도 유효한 값으로 계산되어야 함");
  console.log("✅ 12. 음수 EBITDA 정상 처리");
}

function testNegativeFcf() {
  const result = lookupOf([
    item({ lineItem: "OPERATING_CASH_FLOW", value: 100 }),
    item({ lineItem: "CAPEX", value: 400 }),
  ]);
  assert(result.freeCashFlow.status === "ok" && result.freeCashFlow.value === -300, "음수 FCF도 유효한 값으로 계산되어야 함");
  console.log("✅ 13. 음수 FCF 정상 처리");
}

function testZeroDebt() {
  const result = lookupOf([
    item({ lineItem: "SHORT_TERM_DEBT", value: 0 }),
    item({ lineItem: "LONG_TERM_DEBT", value: 0 }),
    item({ lineItem: "CASH", value: 200 }),
  ]);
  assert(result.totalDebt.status === "ok" && result.totalDebt.value === 0, "0인 부채도 missing이 아니라 유효값(0)이어야 함");
  assert(result.netDebt.status === "ok" && result.netDebt.value === -200, "Net Debt = 0 - 200 = -200");
  console.log("✅ 14. 부채 0 정상 처리(missing_input 아님)");
}

function testZeroCash() {
  const result = lookupOf([
    item({ lineItem: "SHORT_TERM_DEBT", value: 100 }),
    item({ lineItem: "LONG_TERM_DEBT", value: 0 }),
    item({ lineItem: "CASH", value: 0 }),
  ]);
  assert(result.cash.status === "ok" && result.cash.value === 0, "0인 현금도 missing이 아니라 유효값(0)이어야 함");
  assert(result.netDebt.status === "ok" && result.netDebt.value === 100, "Net Debt = 100 - 0 = 100");
  console.log("✅ 15. 현금 0 정상 처리(missing_input 아님)");
}

// ── Authorization(financials API는 ma-team-access.ts를 그대로 사용) ──

function testOwnerAccess() {
  assert(
    JSON.stringify(maDealOwnerWhere("u1")) === JSON.stringify({ userId: "u1" }),
    "owner where"
  );
  assert(
    JSON.stringify(maDealReadWhere("u1", null)) === JSON.stringify({ userId: "u1" }),
    "owner read"
  );
  console.log("✅ 16. Owner access");
}

function testSameTeamAdminAccess() {
  const write = maDealWriteWhere("u1", "t1", "ADMIN");
  assert(Array.isArray((write as { OR?: unknown }).OR), "같은 팀 ADMIN은 write 가능해야 함");
  console.log("✅ 17. Same-team ADMIN access");
}

function testSameTeamPartnerAccess() {
  const write = maDealWriteWhere("u1", "t1", "PARTNER");
  assert(Array.isArray((write as { OR?: unknown }).OR), "같은 팀 PARTNER는 write 가능해야 함");
  console.log("✅ 18. Same-team PARTNER access");
}

function testAnalystWriteDenied() {
  const write = maDealWriteWhere("u2", "t1", "ANALYST");
  assert(
    JSON.stringify(write) === JSON.stringify({ userId: "u2" }),
    "ANALYST는 팀 공유분에 재무 데이터를 쓸 수 없고 본인 소유로만 제한되어야 함"
  );
  console.log("✅ 19. ANALYST write 거부");
}

function testOtherTeamAccessDenied() {
  const read = maDealReadWhere("u1", "t1");
  assert(!JSON.stringify(read).includes("t2"), "다른 팀(t2)이 read where에 섞이면 안 됨");
  const write = maDealWriteWhere("u1", "t1", "PARTNER");
  assert(!JSON.stringify(write).includes("t2"), "다른 팀(t2)이 write where에 섞이면 안 됨");
  console.log("✅ 20. 다른 팀 접근 거부");
}

// ── Zod 검증: 거부되어야 하는 입력들 ──

function baseValidPeriod() {
  return {
    fiscalYear: 2025,
    periodType: "ANNUAL" as const,
    startDate: "2025-01-01",
    endDate: "2025-12-31",
    currency: "KRW",
    lineItems: [
      {
        statementType: "INCOME_STATEMENT" as const,
        lineItem: "REVENUE" as const,
        value: 100,
        currency: "KRW",
        source: "MANUAL" as const,
      },
    ],
  };
}

function testValidationRejections() {
  assert(
    !createFinancialPeriodSchema.safeParse({ ...baseValidPeriod(), fiscalYear: 1800 }).success,
    "유효하지 않은 연도는 거부되어야 함"
  );
  assert(
    !createFinancialPeriodSchema.safeParse({
      ...baseValidPeriod(),
      startDate: "2025-12-31",
      endDate: "2025-01-01",
    }).success,
    "종료일이 시작일보다 빠르면 거부되어야 함"
  );
  assert(
    !createFinancialPeriodSchema.safeParse({ ...baseValidPeriod(), periodType: "MONTHLY" }).success,
    "지원하지 않는 periodType은 거부되어야 함"
  );
  assert(
    !createFinancialPeriodSchema.safeParse({
      ...baseValidPeriod(),
      lineItems: [{ ...baseValidPeriod().lineItems[0], currency: "USD" }],
    }).success,
    "line item 통화가 기간 통화와 다르면 거부되어야 함"
  );
  assert(
    !financialLineItemInputSchema.safeParse({
      statementType: "INCOME_STATEMENT",
      lineItem: "REVENUE",
      value: Number.NaN,
      currency: "KRW",
      source: "MANUAL",
    }).success,
    "NaN 값은 거부되어야 함"
  );
  assert(
    !financialLineItemInputSchema.safeParse({
      statementType: "INCOME_STATEMENT",
      lineItem: "REVENUE",
      value: Number.POSITIVE_INFINITY,
      currency: "KRW",
      source: "MANUAL",
    }).success,
    "Infinity 값은 거부되어야 함"
  );
  assert(
    !financialLineItemInputSchema.safeParse({
      statementType: "NOT_A_STATEMENT",
      lineItem: "REVENUE",
      value: 100,
      currency: "KRW",
      source: "MANUAL",
    }).success,
    "유효하지 않은 statementType은 거부되어야 함"
  );
  assert(
    !financialLineItemInputSchema.safeParse({
      statementType: "INCOME_STATEMENT",
      lineItem: "NOT_A_LINE_ITEM",
      value: 100,
      currency: "KRW",
      source: "MANUAL",
    }).success,
    "유효하지 않은 lineItem은 거부되어야 함"
  );
  assert(
    !financialLineItemInputSchema.safeParse({
      statementType: "BALANCE_SHEET",
      lineItem: "REVENUE", // REVENUE는 INCOME_STATEMENT 소속
      value: 100,
      currency: "KRW",
      source: "MANUAL",
    }).success,
    "statementType과 lineItem이 서로 안 맞으면 거부되어야 함"
  );
  console.log("✅ 21. 잘못된 입력(연도/기간/통화/NaN/Infinity/statementType/lineItem 불일치) 전부 거부");
}

function main() {
  console.log("\n=== DealMind PE 재무 정규화(PR-B) 테스트 ===\n");
  testRevenueNormalization();
  testEbitdaEqualsEbitPlusDA();
  testNetDebtEqualsDebtMinusCash();
  testFcfEqualsOcfMinusCapex();
  testAdjustedEbitda();
  testMultipleAdjustments();
  testMissingInputRejection();
  testNullHandling();
  testCurrencyMismatchRejection();
  testPeriodMismatchRejection();
  testSourceLineagePreservation();
  testNegativeEbitda();
  testNegativeFcf();
  testZeroDebt();
  testZeroCash();
  testOwnerAccess();
  testSameTeamAdminAccess();
  testSameTeamPartnerAccess();
  testAnalystWriteDenied();
  testOtherTeamAccessDenied();
  testValidationRejections();
  console.log("\n✅ PE 재무 정규화(PR-B) 테스트 통과\n");
}

main();
