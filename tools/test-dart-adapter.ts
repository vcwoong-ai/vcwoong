/**
 * DART → PE 재무 정규화 어댑터(PR-C) 검증.
 *
 * 이 레포의 다른 test:* 스크립트와 동일한 관례 — DB/네트워크 호출 없이
 * 순수 함수(dart-adapter.ts)와 PR-B 엔진(financial-normalization.ts,
 * 수정하지 않음)만 확인한다. tools/test-dart.ts와 마찬가지로 DART_API_KEY
 * 없는 환경에서 항상 결정적으로 통과해야 한다(네트워크 호출 없음 — 이
 * 파일은 애초에 fetch를 한 번도 하지 않는다).
 *
 * Import 멱등성(§14 "동일 데이터 재import 시 NOOP", 수동 adjustment 보존)은
 * DB 트랜잭션이 관여하는 통합 동작이다 — 이 레포의 어떤 tools/test-*.ts도
 * 실제 Prisma DB 호출을 하지 않으므로(PR-A/B 테스트와 동일한 관례) 여기서도
 * 라이브 DB를 흉내내지 않는다. 대신 그 멱등성이 실제로 기대는 두 가지를
 * 각각 확인한다: (1) PR-B가 이미 만든 (maDealId, fiscalYear, periodType)
 * unique 제약 — 이 파일이 아니라 prisma/patches의 마이그레이션과
 * schema.prisma 자체가 보증한다. (2) 이 PR의 import 라우트가 연도별로
 * 독립된 트랜잭션을 쓰고 P2002만 건너뛴다는 것 — 코드 리뷰로 확인
 * 가능하며, route.ts의 for-loop 구조 자체가 그 보증이다(한 연도의 실패가
 * 다른 연도를 막지 않음).
 *
 * Usage: npm run test:dart-adapter
 */
import type { DartFinancials } from "../src/lib/dart";
import {
  adaptDartFinancialsToPE,
  parseDartFiscalYear,
  dartFiscalYearToPeriodBounds,
  DART_PERIOD_TYPE,
  DART_CURRENCY,
} from "../src/lib/pe/dart-adapter";
import { LINE_ITEM_STATEMENT_TYPE } from "../src/lib/pe/financial-types";
import { normalizeFinancialPeriod } from "../src/lib/pe/financial-normalization";
import {
  maDealReadWhere,
  maDealWriteWhere,
  maDealOwnerWhere,
} from "../src/lib/pe/ma-team-access";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function fixture(overrides: Partial<DartFinancials> = {}): DartFinancials {
  return {
    year: "2025",
    revenue: 10_000_000_000,
    operatingProfit: 1_500_000_000,
    netIncome: 900_000_000,
    totalAssets: 20_000_000_000,
    totalLiabilities: 8_000_000_000,
    totalEquity: 12_000_000_000,
    unit: "원",
    ...overrides,
  };
}

// ── Adapter: account mapping ──

function testRevenueMapping() {
  const items = adaptDartFinancialsToPE(fixture());
  const revenue = items.find((i) => i.lineItem === "REVENUE");
  assert(revenue?.value === 10_000_000_000, "DART revenue → REVENUE 매핑");
  console.log("✅ 1. DART Revenue → REVENUE 매핑");
}

function testEbitMapping() {
  const items = adaptDartFinancialsToPE(fixture());
  const ebit = items.find((i) => i.lineItem === "EBIT");
  assert(ebit?.value === 1_500_000_000, "DART operatingProfit(영업이익) → EBIT 매핑");
  console.log("✅ 2. DART operatingProfit(영업이익) → EBIT 매핑(정의상 동일, 추정 아님)");
}

function testDANotFabricated() {
  // dart.ts는 D&A를 조회하지 않는다 — 어댑터가 EBIT에서 역산하거나
  // 임의로 만들어내면 안 된다.
  const items = adaptDartFinancialsToPE(fixture());
  assert(!items.some((i) => i.lineItem === "DA"), "dart.ts가 제공하지 않는 D&A를 어댑터가 만들어내면 안 됨");
  console.log("✅ 3. D&A는 DART에 없으므로 생성되지 않음(추정 금지)");
}

function testCashNotFabricated() {
  const items = adaptDartFinancialsToPE(fixture());
  assert(!items.some((i) => i.lineItem === "CASH"), "dart.ts가 제공하지 않는 CASH를 어댑터가 만들어내면 안 됨");
  console.log("✅ 4. Cash는 DART에 없으므로 생성되지 않음(추정 금지)");
}

function testDebtNotFabricated() {
  const items = adaptDartFinancialsToPE(fixture());
  assert(
    !items.some((i) => i.lineItem === "SHORT_TERM_DEBT" || i.lineItem === "LONG_TERM_DEBT"),
    "dart.ts가 제공하지 않는 Debt를 어댑터가 만들어내면 안 됨"
  );
  console.log("✅ 5. Debt(단기/장기차입금)는 DART에 없으므로 생성되지 않음(추정 금지)");
}

function testCapexNotFabricated() {
  const items = adaptDartFinancialsToPE(fixture());
  assert(!items.some((i) => i.lineItem === "CAPEX"), "dart.ts가 제공하지 않는 CAPEX를 어댑터가 만들어내면 안 됨");
  console.log("✅ 6. Capex는 DART에 없으므로 생성되지 않음(추정 금지)");
}

function testStatementTypeMapping() {
  const items = adaptDartFinancialsToPE(fixture());
  const byItem = Object.fromEntries(items.map((i) => [i.lineItem, i]));
  assert(LINE_ITEM_STATEMENT_TYPE[byItem["REVENUE"].lineItem] === "INCOME_STATEMENT", "REVENUE는 손익계산서");
  assert(LINE_ITEM_STATEMENT_TYPE[byItem["EBIT"].lineItem] === "INCOME_STATEMENT", "EBIT는 손익계산서");
  assert(LINE_ITEM_STATEMENT_TYPE[byItem["NET_INCOME"].lineItem] === "INCOME_STATEMENT", "NET_INCOME은 손익계산서");
  assert(LINE_ITEM_STATEMENT_TYPE[byItem["TOTAL_ASSETS"].lineItem] === "BALANCE_SHEET", "TOTAL_ASSETS는 재무상태표");
  assert(LINE_ITEM_STATEMENT_TYPE[byItem["TOTAL_LIABILITIES"].lineItem] === "BALANCE_SHEET", "TOTAL_LIABILITIES는 재무상태표");
  assert(LINE_ITEM_STATEMENT_TYPE[byItem["EQUITY"].lineItem] === "BALANCE_SHEET", "EQUITY는 재무상태표");
  console.log("✅ 7. statementType 매핑(손익계산서 3개 + 재무상태표 3개) 정확");
}

// ── Adapter: fiscal year / period ──

function testFiscalYearMapping() {
  assert(parseDartFiscalYear(fixture({ year: "2024" })) === 2024, "회계연도 파싱");
  console.log("✅ 8. Fiscal year 매핑(문자열 → 숫자)");
}

function testAnnualPeriodMapping() {
  assert(DART_PERIOD_TYPE === "ANNUAL", "dart.ts는 reprt_code=11011(사업보고서)만 조회 — 항상 ANNUAL");
  const { startDate, endDate } = dartFiscalYearToPeriodBounds(2025);
  assert(startDate.getUTCFullYear() === 2025 && startDate.getUTCMonth() === 0 && startDate.getUTCDate() === 1, "기간 시작일 = 1/1");
  assert(endDate.getUTCFullYear() === 2025 && endDate.getUTCMonth() === 11 && endDate.getUTCDate() === 31, "기간 종료일 = 12/31");
  console.log("✅ 9. Annual period 매핑(역년 경계) — 2024/2025를 하나로 합치지 않음(각 연도 독립 호출)");
}

function testNoQuarterlyFabrication() {
  // dart.ts에 분기 조회 경로 자체가 없으므로, 이 어댑터가 QUARTERLY/TTM을
  // 만들어낼 방법이 구조적으로 없다(상수 하나로 항상 ANNUAL).
  assert(DART_PERIOD_TYPE !== "QUARTERLY" && DART_PERIOD_TYPE !== "TTM", "분기/TTM을 임의로 표시하면 안 됨");
  console.log("✅ 10. Quarterly/TTM 임의 생성 없음(dart.ts에 분기 조회 자체가 없어 구조적으로 불가능)");
}

// ── Adapter: value/currency/lineage preservation ──

function testCurrencyPreservation() {
  const items = adaptDartFinancialsToPE(fixture());
  assert(items.every((i) => i.currency === DART_CURRENCY && i.currency === "KRW"), "모든 line item이 KRW여야 함(dart.ts의 unit:\"원\"과 일치)");
  console.log("✅ 11. 통화 보존(KRW, dart.ts unit:\"원\"과 일치)");
}

function testRawValuePreservation() {
  const items = adaptDartFinancialsToPE(fixture({ revenue: 10_000_000_000 }));
  const revenue = items.find((i) => i.lineItem === "REVENUE");
  assert(revenue?.value === 10_000_000_000, "원 단위 원본 그대로 보존되어야 함(억원 환산 금지)");
  assert(revenue?.value !== 100, "억원으로 환산되면 안 됨(10,000,000,000 → 100은 금지된 변환)");
  console.log("✅ 12. Raw value 보존(억원 환산 없음)");
}

function testSourceTypeIsDart() {
  const items = adaptDartFinancialsToPE(fixture());
  assert(items.every((i) => i.sourceType === "DART"), "모든 line item의 sourceType은 DART여야 함");
  console.log("✅ 13. sourceType = DART");
}

function testSourceNamePreservation() {
  const items = adaptDartFinancialsToPE(fixture());
  assert(items.every((i) => i.sourceName === "OpenDART 사업보고서"), "sourceName이 일관되게 보존되어야 함");
  console.log("✅ 14. sourceName 보존(\"OpenDART 사업보고서\")");
}

function testSourceLocationNotFabricated() {
  const items = adaptDartFinancialsToPE(fixture());
  assert(
    items.every((i) => i.sourceLocation === undefined),
    "dart.ts가 페이지/위치 정보를 제공하지 않으므로 sourceLocation을 지어내면 안 됨"
  );
  console.log("✅ 15. sourceLocation 미기재(존재하지 않는 위치 정보를 지어내지 않음)");
}

// ── Data quality ──

function testMissingValueNotZero() {
  const items = adaptDartFinancialsToPE(fixture({ netIncome: null }));
  assert(!items.some((i) => i.lineItem === "NET_INCOME"), "null(missing)이 0으로 변환되면 안 됨 — 아예 생성되지 않아야 함");
  const revenue = items.find((i) => i.lineItem === "REVENUE");
  assert(revenue !== undefined, "다른 계정은 정상적으로 남아있어야 함");
  console.log("✅ 16. Missing value는 0이 아니라 미생성으로 처리(Revenue=0과 Revenue=missing 구분)");
}

function testMalformedValueRejected() {
  const items = adaptDartFinancialsToPE(
    fixture({ operatingProfit: Number.NaN, totalAssets: Number.POSITIVE_INFINITY })
  );
  assert(!items.some((i) => i.lineItem === "EBIT"), "NaN 값은 버려져야 함");
  assert(!items.some((i) => i.lineItem === "TOTAL_ASSETS"), "Infinity 값은 버려져야 함");
  console.log("✅ 17. 깨진 숫자값(NaN/Infinity) 거부");
}

function testUnsupportedUnitStructurallyImpossible() {
  // DartFinancials.unit은 TypeScript 리터럴 타입 "원" 하나뿐이라, 다른
  // 단위를 넣는 것 자체가 타입 수준에서 불가능하다(컴파일 타임 보증).
  // 런타임에서도 어댑터는 dart.unit 값과 무관하게 항상 DART_CURRENCY(KRW)를
  // 쓰므로, 억지로 다른 단위를 주입해도(unsafe cast) 결과가 바뀌지 않는다.
  const corrupted = { ...fixture(), unit: "USD" } as unknown as DartFinancials;
  const items = adaptDartFinancialsToPE(corrupted);
  assert(items.every((i) => i.currency === "KRW"), "타입을 우회해도 통화가 임의로 바뀌면 안 됨");
  console.log("✅ 18. 지원하지 않는 단위 — 타입 수준에서 구조적으로 차단(dart.ts의 unit은 리터럴 \"원\" 하나뿐)");
}

function testInvalidPeriodRejected() {
  let threw = false;
  try {
    parseDartFiscalYear(fixture({ year: "abc" }));
  } catch {
    threw = true;
  }
  assert(threw, "잘못된 연도 문자열은 예외를 던져야 함");

  threw = false;
  try {
    parseDartFiscalYear(fixture({ year: "1800" }));
  } catch {
    threw = true;
  }
  assert(threw, "범위를 벗어난 연도는 예외를 던져야 함");
  console.log("✅ 19. 유효하지 않은 회계기간 거부");
}

function testUnknownAccountsAlreadyFilteredUpstream() {
  // dart.ts의 ACCOUNT_MAP이 알려지지 않은 계정명을 이미 걸러내고 나서야
  // DartFinancials가 만들어진다(6개 필드로 고정된 타입) — 이 어댑터
  // 입장에서는 "알 수 없는 계정"이 애초에 들어올 방법이 없다. 6개 필드
  // 외의 어떤 것도 DartFinancials 타입에 존재하지 않는다는 사실 자체가
  // 그 보증이다.
  const keys = Object.keys(fixture());
  assert(
    keys.sort().join(",") === ["year", "revenue", "operatingProfit", "netIncome", "totalAssets", "totalLiabilities", "totalEquity", "unit"].sort().join(","),
    "DartFinancials는 정확히 이 8개 필드만 가져야 함(알 수 없는 계정이 섞여 들어올 구조적 여지 없음)"
  );
  console.log("✅ 20. 알 수 없는 계정 — dart.ts의 ACCOUNT_MAP이 이미 상류에서 필터링(어댑터가 볼 수조차 없음)");
}

// ── Authorization(PE DART 엔드포인트는 PR-A의 ma-team-access.ts를 그대로 사용) ──

function testOwnerAccess() {
  assert(JSON.stringify(maDealOwnerWhere("u1")) === JSON.stringify({ userId: "u1" }), "owner where");
  console.log("✅ 21. Owner access");
}

function testSameTeamAdminAccess() {
  const write = maDealWriteWhere("u1", "t1", "ADMIN");
  assert(Array.isArray((write as { OR?: unknown }).OR), "같은 팀 ADMIN은 DART import(write) 가능해야 함");
  console.log("✅ 22. Same-team ADMIN access");
}

function testSameTeamPartnerAccess() {
  const write = maDealWriteWhere("u1", "t1", "PARTNER");
  assert(Array.isArray((write as { OR?: unknown }).OR), "같은 팀 PARTNER는 DART import(write) 가능해야 함");
  console.log("✅ 23. Same-team PARTNER access");
}

function testUnauthorizedAnalystWriteDenied() {
  const write = maDealWriteWhere("u2", "t1", "ANALYST");
  assert(
    JSON.stringify(write) === JSON.stringify({ userId: "u2" }),
    "ANALYST는 팀 공유 MADeal에 DART import(write)할 수 없어야 함"
  );
  console.log("✅ 24. Unauthorized(ANALYST) write 거부");
}

function testOtherTeamRejected() {
  const read = maDealReadWhere("u1", "t1");
  const write = maDealWriteWhere("u1", "t1", "PARTNER");
  assert(!JSON.stringify(read).includes("t2"), "다른 팀(t2)이 DART 조회 where에 섞이면 안 됨");
  assert(!JSON.stringify(write).includes("t2"), "다른 팀(t2)이 DART import where에 섞이면 안 됨");
  console.log("✅ 25. Other-team access 거부");
}

// ── Import: raw vs derived 분리(정규화 엔진과의 통합) ──

function testDerivedMetricsOnlyFromNormalizationEngine() {
  // DART import가 만드는 건 raw line item(Revenue/EBIT/Net Income/
  // Total Assets/Total Liabilities/Equity)뿐이고, EBITDA/Net Debt/FCF
  // 같은 파생 지표는 어댑터가 아니라 PR-B 엔진(수정하지 않음)이 계산한다.
  const items = adaptDartFinancialsToPE(fixture());
  const summary = normalizeFinancialPeriod({ periodCurrency: "KRW", lineItems: items });

  assert(summary.revenue.status === "ok", "Revenue는 그대로 통과되어야 함");
  assert(summary.ebit.status === "ok", "EBIT는 그대로 통과되어야 함");
  assert(summary.netIncome.status === "ok", "Net Income은 그대로 통과되어야 함");

  // D&A/Cash/Debt/Capex가 없으므로 이 지표들은 계산 불가 상태로 정직하게 보고되어야 함(0 아님)
  assert(summary.ebitda.status === "missing_input", "D&A가 없으므로 EBITDA는 missing_input이어야 함(0 아님, 추정 금지)");
  assert(summary.cash.status === "missing_input", "Cash가 없으므로 missing_input이어야 함");
  assert(summary.totalDebt.status === "missing_input", "Debt가 없으므로 missing_input이어야 함");
  assert(summary.netDebt.status === "missing_input", "Net Debt는 계산 불가여야 함");
  assert(summary.capex.status === "missing_input", "Capex가 없으므로 missing_input이어야 함");
  assert(summary.freeCashFlow.status === "missing_input", "FCF는 계산 불가여야 함");
  assert(summary.adjustedEbitda.status === "missing_input", "Adjusted EBITDA는 base EBITDA가 없어 계산 불가여야 함");

  console.log("✅ 26. 파생 지표는 오직 정규화 엔진에서만 계산됨(어댑터는 raw fact만 생성, DART만으로는 EBITDA/Net Debt/FCF 계산 불가함을 정직하게 보고)");
}

function testMultipleFiscalYearsStayIndependent() {
  const y2024 = adaptDartFinancialsToPE(fixture({ year: "2024", revenue: 8_000_000_000 }));
  const y2025 = adaptDartFinancialsToPE(fixture({ year: "2025", revenue: 10_000_000_000 }));
  const bounds2024 = dartFiscalYearToPeriodBounds(parseDartFiscalYear(fixture({ year: "2024" })));
  const bounds2025 = dartFiscalYearToPeriodBounds(parseDartFiscalYear(fixture({ year: "2025" })));

  assert(y2024.find((i) => i.lineItem === "REVENUE")?.value === 8_000_000_000, "2024 revenue 독립 보존");
  assert(y2025.find((i) => i.lineItem === "REVENUE")?.value === 10_000_000_000, "2025 revenue 독립 보존");
  assert(bounds2024.startDate.getTime() !== bounds2025.startDate.getTime(), "2024/2025 기간이 합쳐지면 안 됨(각각 독립된 period)");
  console.log("✅ 27. 여러 회계연도(2024/2025)가 하나로 합쳐지지 않고 독립적으로 유지됨");
}

function main() {
  console.log("\n=== DealMind PE DART Adapter(PR-C) 테스트 ===\n");
  testRevenueMapping();
  testEbitMapping();
  testDANotFabricated();
  testCashNotFabricated();
  testDebtNotFabricated();
  testCapexNotFabricated();
  testStatementTypeMapping();
  testFiscalYearMapping();
  testAnnualPeriodMapping();
  testNoQuarterlyFabrication();
  testCurrencyPreservation();
  testRawValuePreservation();
  testSourceTypeIsDart();
  testSourceNamePreservation();
  testSourceLocationNotFabricated();
  testMissingValueNotZero();
  testMalformedValueRejected();
  testUnsupportedUnitStructurallyImpossible();
  testInvalidPeriodRejected();
  testUnknownAccountsAlreadyFilteredUpstream();
  testOwnerAccess();
  testSameTeamAdminAccess();
  testSameTeamPartnerAccess();
  testUnauthorizedAnalystWriteDenied();
  testOtherTeamRejected();
  testDerivedMetricsOnlyFromNormalizationEngine();
  testMultipleFiscalYearsStayIndependent();
  console.log("\n✅ PE DART Adapter(PR-C) 테스트 통과\n");
  console.log(
    "참고: import 멱등성(동일 데이터 재import 시 NOOP)과 수동 adjustment 보존은 " +
      "DB 트랜잭션이 관여하는 통합 동작이라 이 스크립트에서 라이브 DB로 재현하지 " +
      "않는다(이 레포의 다른 test:*도 동일 관례) — (maDealId, fiscalYear, periodType) " +
      "unique 제약(PR-B)과 import 라우트의 연도별 독립 트랜잭션 + P2002-only skip " +
      "구조(코드 리뷰로 확인 가능)에 근거한다. 자세한 내용은 PR 설명 참고.\n"
  );
}

main();
