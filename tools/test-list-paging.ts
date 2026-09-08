/**
 * 목록 페이지 조회 상한 로직 검증.
 *
 * 배경: 딜·보고서·딜소싱·양식 목록이 상한 없이 전부 조회하고 있었다
 * (연관 데이터까지 함께). 행이 쌓일수록 쿼리 시간과 HTML 페이로드가
 * 선형으로 늘어 60초 함수 예산을 갉아먹는 구조였다.
 *
 * "더 보기"는 ?limit을 키우는 방식이라 사용자가 값을 직접 조작할 수
 * 있다 — 여기서 상한이 뚫리면 애초에 고치려던 무제한 조회로 되돌아가므로,
 * 그 방어가 실제로 동작하는지 고정한다.
 *
 * Usage: npm run test:list-paging
 */
import { resolveListLimit, DEALS_PAGE_SIZE } from "../src/lib/list-paging";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const PAGE = 24;

function testDefaultsWhenAbsentOrInvalid() {
  assert(resolveListLimit(undefined, PAGE) === PAGE, "미지정 시 기본 페이지 크기가 아님");
  assert(resolveListLimit("", PAGE) === PAGE, "빈 문자열이 기본값으로 안 떨어짐");
  assert(resolveListLimit("abc", PAGE) === PAGE, "숫자가 아닌 값이 기본값으로 안 떨어짐");
  assert(resolveListLimit("NaN", PAGE) === PAGE, "NaN 문자열이 기본값으로 안 떨어짐");
  console.log("✅ 미지정·빈값·문자열은 기본 페이지 크기로 폴백");
}

function testNeverGoesBelowOnePage() {
  // 0이나 음수를 넣어 "아무것도 안 나오는" 화면을 만들 수 없어야 한다.
  assert(resolveListLimit("0", PAGE) === PAGE, "0이 그대로 통과됨(빈 목록이 됨)");
  assert(resolveListLimit("-50", PAGE) === PAGE, "음수가 그대로 통과됨");
  assert(resolveListLimit("5", PAGE) === PAGE, "한 페이지보다 작은 값이 그대로 통과됨");
  console.log("✅ 0·음수·한 페이지 미만은 한 페이지 크기로 올려서 처리");
}

function testClampsAbsurdlyLargeValues() {
  // 이 상한이 뚫리면 고치려던 무제한 조회가 그대로 돌아온다.
  const huge = resolveListLimit("999999", PAGE);
  assert(huge <= 300, `상한이 안 걸림: ${huge}`);
  assert(
    resolveListLimit("1e9", PAGE) <= 300,
    "지수 표기(1e9)로 상한을 우회할 수 있음"
  );
  console.log(`✅ 과도하게 큰 limit은 상한(300)으로 절단 — 무제한 조회 회귀 방지`);
}

function testNormalPagingStillWorks() {
  assert(resolveListLimit("48", PAGE) === 48, "정상적인 다음 페이지 값이 안 먹음");
  assert(resolveListLimit("72", PAGE) === 72, "정상적인 세 번째 페이지 값이 안 먹음");
  // 소수점은 버려서 prisma take에 안전한 정수로 만든다
  assert(resolveListLimit("48.9", PAGE) === 48, "소수점이 정수로 안 잘림");
  console.log("✅ 정상 범위의 limit은 그대로 통과(소수점은 내림)");
}

function testArrayParamTakesFirst() {
  // ?limit=48&limit=999 처럼 중복으로 들어오면 Next가 배열로 준다.
  assert(resolveListLimit(["48", "999999"], PAGE) === 48, "배열 파라미터의 첫 값을 안 씀");
  console.log("✅ 중복 파라미터(배열)는 첫 값만 사용");
}

function testPageSizeConstantsAreSane() {
  assert(DEALS_PAGE_SIZE > 0 && DEALS_PAGE_SIZE <= 100, "딜 페이지 크기가 비상식적");
  console.log(`✅ 페이지 크기 상수가 상식적인 범위 (딜 ${DEALS_PAGE_SIZE}개)`);
}

function main() {
  console.log("\n=== DealMind 목록 조회 상한 테스트 ===\n");
  testDefaultsWhenAbsentOrInvalid();
  testNeverGoesBelowOnePage();
  testClampsAbsurdlyLargeValues();
  testNormalPagingStillWorks();
  testArrayParamTakesFirst();
  testPageSizeConstantsAreSane();
  console.log("\n✅ 목록 조회 상한 테스트 통과\n");
}

main();
