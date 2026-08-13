/**
 * 사이드바 활성 메뉴 판정 검증.
 *
 * 원래 버그: `/reports/new`에 있으면 "보고서"(/reports)와 "보고서 생성"
 * (/reports/new)이 동시에 활성으로 켜졌다. 단순 prefix 매칭이라
 * `/reports/new`가 `/reports/`로도 시작하기 때문. 활성 메뉴는 항상 1개여야
 * 한다는 게 이 파일의 계약이다.
 *
 * Usage: npm run test:nav-active
 */
import { isActiveHref } from "../src/components/layout/sidebar";

const HREFS = [
  "/dashboard",
  "/sourcing",
  "/deals",
  "/reports",
  "/reports/new",
  "/templates",
  "/portfolio",
  "/lp-report",
  "/upload",
  "/settings",
];

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/** 주어진 경로에서 활성으로 켜지는 메뉴들 */
function activeFor(pathname: string): string[] {
  return HREFS.filter((h) => isActiveHref(pathname, h));
}

function testNeverTwoActive() {
  const paths = [
    "/dashboard",
    "/deals",
    "/deals/abc123",
    "/reports",
    "/reports/abc123",
    "/reports/new",
    "/portfolio",
    "/portfolio/xyz",
    "/lp-report",
    "/lp-report/f1/analytics",
    "/settings",
    "/templates",
  ];
  for (const p of paths) {
    const active = activeFor(p);
    assert(
      active.length <= 1,
      `${p} 에서 활성 메뉴가 ${active.length}개: ${active.join(", ")}`
    );
  }
  console.log("✅ 어떤 경로에서도 활성 메뉴가 2개 이상 켜지지 않음");
}

function testMostSpecificWins() {
  assert(
    activeFor("/reports/new")[0] === "/reports/new",
    `/reports/new 에서 더 구체적인 메뉴가 안 잡힘: ${activeFor("/reports/new")}`
  );
  // 보고서 상세는 "보고서 생성"이 아니라 "보고서"가 켜져야 한다
  assert(
    activeFor("/reports/abc123")[0] === "/reports",
    `/reports/abc123 에서 잘못된 메뉴: ${activeFor("/reports/abc123")}`
  );
  console.log("✅ 더 구체적인 메뉴가 우선 (/reports/new vs /reports)");
}

function testDetailPagesKeepParentActive() {
  assert(activeFor("/deals/abc")[0] === "/deals", "딜 상세에서 '딜 관리' 비활성");
  assert(
    activeFor("/portfolio/abc")[0] === "/portfolio",
    "포트폴리오 상세에서 상위 메뉴 비활성"
  );
  assert(
    activeFor("/lp-report/f1/analytics")[0] === "/lp-report",
    "펀드 심화분석에서 'LP 리포팅' 비활성"
  );
  console.log("✅ 상세 페이지에서도 상위 메뉴가 활성 유지");
}

function testNoFalsePrefixMatch() {
  // /deals-archive 같은 경로가 /deals 를 켜면 안 된다 (경계는 "/" 여야 함)
  assert(
    activeFor("/deals-archive").length === 0,
    `/deals-archive 가 다른 메뉴를 활성화함: ${activeFor("/deals-archive")}`
  );
  console.log("✅ 단어 경계 없는 유사 경로(/deals-archive)는 매칭 안 됨");
}

function main() {
  console.log("\n=== DealMind 사이드바 활성 메뉴 테스트 ===\n");
  testNeverTwoActive();
  testMostSpecificWins();
  testDetailPagesKeepParentActive();
  testNoFalsePrefixMatch();
  console.log("\n✅ 사이드바 활성 메뉴 테스트 통과\n");
}

main();
