/**
 * DART 연동 순수 로직 검증 (네트워크 없음, API 키 없는 환경 기준).
 *
 * API 키가 없는 CI/로컬에서도 항상 통과해야 한다 — "키 없으면 빈 결과"가
 * 계약이므로, 이 계약이 깨지면(예외를 던지거나 undefined가 아닌 값) 이
 * 파일을 쓰는 모든 곳(에이전트 파이프라인, API 라우트)이 망가진다.
 *
 * Usage: npm run test:dart
 */
import {
  normalizeCompanyName,
  resolveDartCorpCode,
  fetchDartFinancials,
  fetchDartDisclosures,
  searchDartCompany,
  formatDartForPrompt,
} from "../src/lib/dart";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testNormalizeCompanyName() {
  assert(
    normalizeCompanyName("주식회사 테스트") === normalizeCompanyName("테스트"),
    "법인격 접두사(주식회사)가 제거되지 않음"
  );
  assert(
    normalizeCompanyName("(주)테스트") === normalizeCompanyName("테스트"),
    "(주) 접두사가 제거되지 않음"
  );
  assert(
    normalizeCompanyName("Test Inc.") === normalizeCompanyName("test"),
    "영문 법인격(Inc.)이 제거되지 않음"
  );
  assert(
    normalizeCompanyName("테스트 회사") === normalizeCompanyName("테스트회사"),
    "공백 차이가 흡수되지 않음"
  );
  console.log("✅ 회사명 정규화: 법인격 접두/접미사·공백·대소문자 흡수");
}

async function testNoApiKeyGracefulFallback() {
  // 이 테스트 환경에는 DART_API_KEY가 없다고 가정(.env.local 미로드)
  assert(!process.env.DART_API_KEY, "테스트 환경에 DART_API_KEY가 설정돼 있음 — 순수 폴백 테스트 불가");

  const corp = await resolveDartCorpCode("아무회사");
  assert(corp === undefined, "API 키 없는데 corp_code가 반환됨");

  const fin = await fetchDartFinancials("00000000", 2024);
  assert(fin === null, "API 키 없는데 재무제표가 반환됨");

  const disclosures = await fetchDartDisclosures("00000000");
  assert(Array.isArray(disclosures) && disclosures.length === 0, "API 키 없는데 공시 목록이 비어있지 않음");

  const company = await searchDartCompany("아무회사");
  assert(company.found === false, "API 키 없는데 found가 true");
  assert(company.financials.length === 0 && company.disclosures.length === 0, "API 키 없는데 데이터가 채워짐");

  console.log("✅ API 키 없을 때: 예외 없이 항상 빈 결과 (네트워크 호출 없음)");
}

function testFormatEmptyReturnsEmptyString() {
  const out = formatDartForPrompt({ found: false, financials: [], disclosures: [] });
  assert(out === "", "찾지 못했는데 프롬프트 텍스트가 생성됨");
  console.log("✅ 프롬프트 포맷: 데이터 없으면 빈 문자열 (프롬프트 오염 방지)");
}

function testFormatWithData() {
  const out = formatDartForPrompt({
    found: true,
    corpName: "테스트회사",
    financials: [
      {
        year: "2025",
        revenue: 5_000_000_000,
        operatingProfit: 500_000_000,
        netIncome: 300_000_000,
        totalAssets: 10_000_000_000,
        totalLiabilities: 4_000_000_000,
        totalEquity: 6_000_000_000,
        unit: "원",
      },
    ],
    disclosures: [
      { title: "분기보고서", date: "20250515", url: "https://dart.fss.or.kr/x" },
    ],
  });
  assert(out.includes("테스트회사"), "회사명이 포함되지 않음");
  assert(out.includes("2025년"), "사업연도가 포함되지 않음");
  assert(out.includes("50억원"), `매출 단위 변환(원→억원) 오류: ${out}`);
  assert(out.includes("분기보고서"), "공시 제목이 포함되지 않음");
  console.log("✅ 프롬프트 포맷: 재무제표(원→억원 변환)·공시 목록 포함");
}

async function main() {
  console.log("\n=== DealMind DART 연동 테스트 ===\n");
  testNormalizeCompanyName();
  await testNoApiKeyGracefulFallback();
  testFormatEmptyReturnsEmptyString();
  testFormatWithData();
  console.log("\n✅ DART 연동 테스트 통과\n");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
