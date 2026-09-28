/**
 * PE Financials 뷰 모델(pe-financials-view-model.ts, PR #106) 검증.
 *
 * lookupCanonicalAccount()/computeFinancialDataQuality()는 새 재무 계산을
 * 하지 않는다(순수 조회/집계) — 이 파일은 그 계약을 확인한다.
 *
 * Usage: npm run test:pe-financials-view-model
 */
import {
  CANONICAL_ACCOUNT_ROWS,
  lookupCanonicalAccount,
  computeFinancialDataQuality,
  type FinancialsPeriodLike,
  type FinancialsLineItemLike,
} from "../src/lib/pe/pe-financials-view-model";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function li(overrides: Partial<FinancialsLineItemLike> & { lineItem: string; value: number }): FinancialsLineItemLike {
  return { currency: "KRW", source: "MANUAL", sourceName: null, ...overrides };
}

function period(overrides: Partial<FinancialsPeriodLike> & { id: string; fiscalYear: number }): FinancialsPeriodLike {
  return { lineItems: [], ...overrides };
}

// ── lookupCanonicalAccount ───────────────────────────────────────────

function test1_missingAccount() {
  const p = period({ id: "p1", fiscalYear: 2024, lineItems: [] });
  const result = lookupCanonicalAccount(p, "REVENUE");
  assert(result.status === "missing", "line item가 없으면 missing이어야 함(0으로 대체 금지)");
  console.log("✅ Test 1 — 계정이 없으면 missing(0 아님)");
}

function test2_okAccountWithSource() {
  const p = period({ id: "p1", fiscalYear: 2024, lineItems: [li({ lineItem: "REVENUE", value: 1000, source: "DART" })] });
  const result = lookupCanonicalAccount(p, "REVENUE");
  assert(result.status === "ok" && result.value === 1000 && result.source === "DART", "값과 출처를 그대로 반환해야 함(재계산 없음)");
  console.log("✅ Test 2 — 값+출처를 원본 그대로 반환");
}

function test3_conflictNotSilentlyResolved() {
  const p = period({
    id: "p1",
    fiscalYear: 2024,
    lineItems: [li({ lineItem: "REVENUE", value: 1000, source: "DART" }), li({ lineItem: "REVENUE", value: 1200, source: "MANUAL" })],
  });
  const result = lookupCanonicalAccount(p, "REVENUE");
  assert(result.status === "conflict" && result.values.length === 2, "같은 계정에 값이 다른 line item이 있으면 임의로 하나를 고르지 않고 conflict여야 함");
  console.log("✅ Test 3 — 값이 다른 중복 line item은 conflict(임의 선택 없음)");
}

function test3b_sameValueDifferentCurrencyIsConflict() {
  const p = period({
    id: "p1",
    fiscalYear: 2024,
    lineItems: [li({ lineItem: "REVENUE", value: 1000, currency: "KRW", source: "MANUAL" }), li({ lineItem: "REVENUE", value: 1000, currency: "USD", source: "MANUAL" })],
  });
  const result = lookupCanonicalAccount(p, "REVENUE");
  assert(result.status === "conflict", "값이 같아도 통화가 다르면 서로 다른 사실이므로 conflict여야 함(값만으로 중복 제거 금지, PR #106 최종 리뷰에서 발견)");
  console.log("✅ Test 3b — 같은 값이라도 통화가 다르면 conflict(값만으로 병합 금지)");
}

function test4_sameValueDuplicateIsNotConflict() {
  const p = period({
    id: "p1",
    fiscalYear: 2024,
    lineItems: [li({ lineItem: "REVENUE", value: 1000, source: "DART" }), li({ lineItem: "REVENUE", value: 1000, source: "MANUAL" })],
  });
  const result = lookupCanonicalAccount(p, "REVENUE");
  assert(result.status === "ok", "값이 완전히 같은 중복은 conflict가 아니어야 함(실제 모순이 아님)");
  console.log("✅ Test 4 — 값이 같은 중복 line item은 conflict 아님");
}

function test5_differentPeriodNotConflated() {
  const p2023 = period({ id: "p1", fiscalYear: 2023, lineItems: [li({ lineItem: "REVENUE", value: 1000 })] });
  const p2024 = period({ id: "p2", fiscalYear: 2024, lineItems: [li({ lineItem: "REVENUE", value: 1200 })] });
  assert(lookupCanonicalAccount(p2023, "REVENUE").status === "ok", "2023 조회는 2023 기간에만 적용돼야 함");
  assert(lookupCanonicalAccount(p2024, "REVENUE").status === "ok", "2024 조회는 2024 기간에만 적용돼야 함");
  const r2023 = lookupCanonicalAccount(p2023, "REVENUE");
  if (r2023.status === "ok") assert(r2023.value === 1000, "다른 기간 값이 섞이면 안 됨");
  console.log("✅ Test 5 — 다른 기간 값은 서로 섞이지 않음(conflict 아님)");
}

function test6_differentAccountNotConflated() {
  const p = period({
    id: "p1",
    fiscalYear: 2024,
    lineItems: [li({ lineItem: "REVENUE", value: 1000 }), li({ lineItem: "EBIT", value: 200 })],
  });
  const revenue = lookupCanonicalAccount(p, "REVENUE");
  const ebit = lookupCanonicalAccount(p, "EBIT");
  assert(revenue.status === "ok" && ebit.status === "ok", "서로 다른 계정은 독립적으로 조회돼야 함");
  if (revenue.status === "ok" && ebit.status === "ok") {
    assert(revenue.value === 1000 && ebit.value === 200, "다른 계정 값이 섞이면 안 됨(conflict 아님)");
  }
  console.log("✅ Test 6 — 다른 계정은 서로 섞이지 않음(conflict 아님)");
}

// ── computeFinancialDataQuality ──────────────────────────────────────

function test7_emptyPeriodsAllZero() {
  const q = computeFinancialDataQuality([], 0);
  assert(q.periodsCount === 0 && q.accountsPresent === 0 && q.missingCount === CANONICAL_ACCOUNT_ROWS.length, "재무기간이 없으면 전부 0/전체 누락이어야 함");
  console.log("✅ Test 7 — 재무기간 없음 → 전부 0/전체 누락");
}

function test8_partialAccountsCounted() {
  const p = period({
    id: "p1",
    fiscalYear: 2024,
    lineItems: [li({ lineItem: "REVENUE", value: 1000, source: "DART" }), li({ lineItem: "EBIT", value: 200, source: "MANUAL" })],
  });
  const q = computeFinancialDataQuality([p], 0);
  assert(q.accountsPresent === 2, "실제 존재하는 계정 수만 세야 함(6개 중 2개)");
  assert(q.missingCount === CANONICAL_ACCOUNT_ROWS.length - 2, "누락 계정 수가 정확해야 함");
  assert(q.dartSourcedCount === 1 && q.manualSourcedCount === 1, "출처별 건수가 정확해야 함");
  console.log("✅ Test 8 — 부분 데이터의 계정/출처 집계가 정확함");
}

function test9_conflictsCountPassedThroughNotRecomputed() {
  const q = computeFinancialDataQuality([], 3);
  assert(q.conflictsCount === 3, "conflictsCount는 인자로 받은 값을 그대로 반영해야 함(재계산 없음)");
  console.log("✅ Test 9 — conflictsCount는 buildPEDecisionReadiness() 결과를 그대로 전달받음");
}

function test10_latestPeriodDeterminesAccountsPresent() {
  const older = period({ id: "p1", fiscalYear: 2023, lineItems: [] });
  const latest = period({
    id: "p2",
    fiscalYear: 2024,
    lineItems: [li({ lineItem: "REVENUE", value: 1 }), li({ lineItem: "EBIT", value: 1 }), li({ lineItem: "NET_INCOME", value: 1 })],
  });
  const q = computeFinancialDataQuality([latest, older], 0);
  assert(q.accountsPresent === 3, "accountsPresent는 배열의 첫 번째(최근) 기간 기준이어야 함");
  console.log("✅ Test 10 — 계정 존재 여부는 최근 기간(periods[0]) 기준");
}

function main() {
  console.log("\n=== PE Financials 뷰 모델 테스트 ===\n");
  test1_missingAccount();
  test2_okAccountWithSource();
  test3_conflictNotSilentlyResolved();
  test3b_sameValueDifferentCurrencyIsConflict();
  test4_sameValueDuplicateIsNotConflict();
  test5_differentPeriodNotConflated();
  test6_differentAccountNotConflated();
  test7_emptyPeriodsAllZero();
  test8_partialAccountsCounted();
  test9_conflictsCountPassedThroughNotRecomputed();
  test10_latestPeriodDeterminesAccountsPresent();
  console.log("\n✅ PE Financials 뷰 모델 테스트 통과\n");
}

main();
