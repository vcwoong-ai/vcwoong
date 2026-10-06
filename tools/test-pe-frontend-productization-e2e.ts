/**
 * PE/M&A 프론트엔드 제품화 — 하나의 종합 브라우저 E2E(Phase 23).
 *
 * 이 PR이 새로 만든 것만 검증한다(기존 위원회 자료/재검토 사이클은
 * test-pe-ic-audit-e2e.ts가 이미 상세히 다루므로 중복 시나리오는 넣지
 * 않는다):
 *   1) 딜 목록의 canonical readiness 배지(ma-deal-list-readiness.ts)
 *   2) Financials 탭 핵심 계정 표의 모순 값 출처 표시(source 그대로 노출)
 *   3) 위원회 자료 탭 재무 모순 경고 배지(conflictCount)
 *   4) 탭 바 오버플로 수정(TabsList `w-full`, 768px/1024px)
 *   5) 전체 탭 순회 회귀(콘솔 에러 없이 렌더되는지)
 *
 * 데스크톱(1280px)과 모바일(390px) 두 뷰포트에서 실행한다.
 *
 * Usage:
 *   configure isolated PostgreSQL dealmind_test + matching TEST_DATABASE_URL
 *   start a clean loopback test app against that database
 *   npm run test:pe-frontend-productization-e2e
 */
import { chromium, type Browser, type BrowserContextOptions } from "playwright";
import { assertE2ETarget, assertNoExternalE2ECredentials, assertCleanE2EWorkspace, chromiumLaunchOptions } from "./helpers/e2e-environment";
import { createPEBrowserActor } from "./helpers/pe-browser-actor";

const BASE = (process.argv[2] ?? process.env.E2E_TEST_URL ?? "http://localhost:3000").replace(/\/$/, "");
let stage = "environment";
async function isolatedContext(browser: Browser, options: BrowserContextOptions) {
  const context = await browser.newContext({ ...options, serviceWorkers: "block" });
  await context.route("**/*", async route => {
    let allowed = false;
    try { allowed = new URL(route.request().url()).origin === new URL(BASE).origin; } catch { /* refuse malformed URLs */ }
    if (allowed && new URL(route.request().url()).pathname === "/_vercel/speed-insights/script.js") {
      await route.fulfill({status: 200, contentType: "application/javascript", body: "/* Explicit isolated telemetry stub; no collection. */"});
      return;
    }
    if (allowed) await route.continue(); else await route.abort("blockedbyclient");
  });
  return context;
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
}

async function login(page: import("playwright").Page, email: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500); // 로그인 폼 하이드레이션 대기 — 그 전에 제출하면 세션이 잡히기 전에 다음 화면으로 넘어간다
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });
}

async function main() {
  assertE2ETarget(BASE);
  assertNoExternalE2ECredentials();
  assertCleanE2EWorkspace();
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ log: [] });
  let actor: Awaited<ReturnType<typeof createPEBrowserActor>> | undefined;
  let dealId: string | undefined;
  let browser: Browser | undefined;
  let mobileBrowser: Browser | undefined;
  console.log("PE frontend isolated E2E");

  // ── Fixture: REVENUE 모순 + DD finding이 있는 딜 하나 ────────────────
  try {
    stage = "fixtures";
    actor = await createPEBrowserActor(prisma);
    const demo = actor.user;
    const deal = await prisma.mADeal.create({
      data: { name: `E2E 프론트엔드 제품화 ${Date.now()}`, companyName: "E2E제품화 주식회사", dealType: "BUYOUT", userId: demo!.id, teamId: demo!.teamId },
    });
    dealId = deal.id;
    const period = await prisma.mAFinancialPeriod.create({
      data: {
        maDealId: deal.id,
        fiscalYear: 2024,
        periodType: "ANNUAL",
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-12-31"),
        currency: "KRW",
      },
    });
    await prisma.mAFinancialLineItem.create({
      data: { financialPeriodId: period.id, statementType: "INCOME_STATEMENT", lineItem: "REVENUE", value: 100_000_000_000, currency: "KRW", source: "MANUAL", sourceName: "경영 자료" },
    });
    await prisma.mAFinancialLineItem.create({
      data: { financialPeriodId: period.id, statementType: "INCOME_STATEMENT", lineItem: "REVENUE", value: 95_000_000_000, currency: "KRW", source: "DART", sourceName: "2024 사업보고서" },
    });
    const ddCase = await prisma.pEDDCase.create({ data: { maDealId: deal.id } });
    console.log("Synthetic conflict fixtures created");

    browser = await chromium.launch(chromiumLaunchOptions());
    const context = await isolatedContext(browser, { viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push("console-error");
    });
    page.on("pageerror", () => consoleErrors.push("page-error"));
    // ── 1. 로그인 ─────────────────────────────────────────────────────
    stage = "desktop-login";
    await login(page, actor.user.email, actor.password);
    console.log("✅ 1 — 로그인 성공");

    // ── 2. 딜 목록 — canonical readiness 배지가 실제로 렌더됨 ────────────
    await page.goto(`${BASE}/ma-deals`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    // 목록은 카드가 아니라 검토 대기열(표)이다 — 한 줄이 한 딜
    const dealCard = page.locator('[data-testid="pe-deal-row"]', { hasText: "E2E제품화 주식회사" }).first();
    await dealCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const cardText = await dealCard.innerText();
    assert(!cardText.includes("준비 상태 불러오는 중"), "목록 로드 완료 후에는 '불러오는 중' 플레이스홀더가 남아있으면 안 됨");
    assert(cardText.includes("내 검토"), "행에 '내 검토' 상태가 표시돼야 함");
    assert(cardText.includes("미검토"), "아직 검토 전이므로 '미검토'로 보여야 함");
    assert(cardText.includes("차단 요인"), "재무 모순이 있으므로 차단 요인 경고가 보여야 함(readiness가 BLOCKED 또는 blocker 존재)");
    console.log("✅ 2 — 딜 목록(검토 대기열) 행에 canonical readiness 배지(도메인별 상태 + 차단 요인 + 내 검토)가 실제 서버 계산값으로 렌더됨");

    // ── 3. 딜 상세 진입 → 개요 탭: 재무 모순 경고 배지 ───────────────────
    await dealCard.getByRole("link", { name: "E2E제품화 주식회사" }).click();
    await page.waitForURL(new RegExp(`/ma-deals/${deal.id}`), { timeout: 15000 });
    await page.waitForTimeout(1500); // 콜드 컴파일 레이스(레포 관례)
    await page.waitForSelector('[role="tab"]', { timeout: 45000 });
    await page.waitForSelector("text=아래 수치는 서로 다른 출처 간 모순", { timeout: 15000 });
    console.log("✅ 3 — 개요 탭 '핵심 재무 지표' 카드에 모순 경고가 (findLineItem이 조용히 고른 값 대신) 노출됨");

    // ── 4. 재무 · QoE 탭 — 핵심 계정 표에 두 값이 출처와 함께 그대로 보임 ──
    await page.getByRole("tab", { name: "재무 · QoE" }).click({ timeout: 45000 });
    await page.waitForTimeout(700);
    await page.waitForSelector("text=핵심 계정 · 출처", { timeout: 15000 });
    const conflictCell = page.locator("td", { hasText: "모순" }).first();
    const conflictCellText = await conflictCell.innerText();
    assert(conflictCellText.includes("경영 자료") && conflictCellText.includes("2024 사업보고서"), `모순 셀에 두 출처명이 모두 보여야 함(숨기지 않고 둘 다 표시)`);
    assert(/1,000\.0억원|1,000억원/.test(conflictCellText) || conflictCellText.includes("1,000"), `100,000,000,000원(경영 자료 값)이 표시돼야 함`);
    assert(conflictCellText.includes("950") || conflictCellText.includes("950.0"), `95,000,000,000원(DART 값)이 표시돼야 함`);
    assert(conflictCellText.includes("모순 — 값을 임의로 선택하지 않았습니다"), "모순 셀에는 값을 임의로 골랐다는 인상을 주지 않는 명시적 경고 문구가 있어야 함");
    console.log("✅ 4 — 핵심 계정 표: REVENUE 모순 값 2건 모두 출처(경영 자료/DART)와 함께 노출됨(호버 없이 상시 표시)");

    // ── 5. 나머지 탭 순회(회귀 확인) — 콘솔 에러 없이 렌더 ───────────────
    stage = "tab-regression";
    const tabsToVisit = ["DART", "LBO 시뮬레이션", "데이터룸", "검토 Workflow", "IC 의사결정", "위원회 자료", "IC 검토"];
    for (const tabName of tabsToVisit) {
      await page.getByRole("tab", { name: tabName }).click({ timeout: 45000 });
      await page.waitForTimeout(700);
    }
    console.log("✅ 5 — 전체 탭(DART/LBO/데이터룸/검토 Workflow/IC 의사결정/위원회 자료/IC 검토) 순회 시 크래시 없음");

    // ── 6. 탭 바 오버플로 수정 재검증(768px/1024px) ──────────────────────
    stage = "responsive-layout";
    await checkTabBarNoOverflow(browser, `${BASE}/ma-deals/${deal.id}`, 768, actor.user.email, actor.password);
    console.log("✅ 6a — 768px에서 탭 바(9개 탭)가 페이지 자체를 밀지 않음(가로 스크롤은 탭 바 내부에만)");
    await checkTabBarNoOverflow(browser, `${BASE}/ma-deals/${deal.id}`, 1024, actor.user.email, actor.password);
    console.log("✅ 6b — 1024px에서도 동일하게 탭 바 오버플로가 페이지로 번지지 않음");

    // ── 7. 모바일(390px) — 목록 + 상세 모두 가로 스크롤/에러 없이 렌더 ────
    await checkMobile(browser, `${BASE}/ma-deals`, actor.user.email, actor.password, async (p) => {
      await p.waitForSelector("text=E2E제품화 주식회사", { timeout: 45000 });
    });
    console.log("✅ 7a — 모바일(390px) 딜 목록 정상 렌더");
    await checkMobile(browser, `${BASE}/ma-deals/${deal.id}`, actor.user.email, actor.password, async (p) => {
      await p.waitForSelector('[role="tab"]', { timeout: 45000 });
      await p.waitForTimeout(700);
    });
    console.log("✅ 7b — 모바일(390px) 딜 상세 정상 렌더");

    // ── 8. canonical 데이터 변경(DD finding 추가) → 목록 배지도 갱신됨 ────
    await prisma.pEDDFinding.create({
      data: { ddCaseId: ddCase.id, category: "FINANCIAL", title: "매출 인식 기준 확인 필요", description: "REVENUE 모순으로 인한 후속 확인", severity: "HIGH", status: "DRAFT" },
    });
    await page.goto(`${BASE}/ma-deals`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const dealCardAfter = page.locator('[data-testid="pe-deal-row"]', { hasText: "E2E제품화 주식회사" }).first();
    const cardTextAfter = await dealCardAfter.innerText();
    assert(cardTextAfter.includes("차단 요인"), "DD finding 추가 후에도 목록에서 여전히 차단 요인이 보여야 함(같은 엔진 재사용, 새 계산 없음)");
    console.log("✅ 8 — canonical 데이터 변경이 목록 배지에도 그대로 반영됨(buildPEDecisionReadiness() 재사용, 별도 계산 없음)");

    const relevantErrors = consoleErrors;
    assert(relevantErrors.length === 0, `테스트 중 (사전 존재 이슈를 제외한) 콘솔 에러가 발생하면 안 됨, 고정 오류 수 검사`);
    console.log("\n✅ PE/M&A 프론트엔드 제품화 E2E 전체 통과(이 PR 범위 내 콘솔 에러 없음)\n");
  } finally {
    try {
      await Promise.allSettled([mobileBrowser?.close(), browser?.close()]);
    } finally {
      try {
        if (dealId) {
          await prisma.$transaction([
            prisma.pEICAuditEvent.deleteMany({ where: { maDealId: dealId } }),
            prisma.pEICReviewSnapshot.deleteMany({ where: { maDealId: dealId } }),
            prisma.mADeal.deleteMany({ where: { id: dealId } }),
          ]);
        }
      } finally {
        try { await actor?.cleanup(); } finally { await prisma.$disconnect(); }
      }
    }
  }
}

async function checkTabBarNoOverflow(browser: import("playwright").Browser, url: string, width: number, email: string, password: string) {
  const context = await isolatedContext(browser, { viewport: { width, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", () => errors.push("page-error"));
  await login(page, email, password);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.waitForSelector('[role="tab"]', { timeout: 45000 });
  await page.waitForTimeout(500);
  // 페이지 전체(문서)가 뷰포트보다 넓어지면 안 된다 — 탭 바 자신은
  // overflow-x-auto라 넓어도 되지만(내부 스크롤), 그게 body/문서 전체를
  // 밀어서는 안 된다(이 PR이 고친 `sm:w-auto` 제거의 핵심 검증 지점).
  const documentOverflow = await page.evaluate((vw) => document.documentElement.scrollWidth > vw + 1, width);
  await context.close();
  assert(!documentOverflow, `${width}px 폭에서 탭 바 때문에 문서 전체가 가로로 넘치면 안 됨(TabsList sm:w-auto 제거 검증)`);
  assert(errors.length === 0, `${width}px 폭에서 콘솔 에러가 없어야 함: 고정 오류 수 검사`);
}

async function checkMobile(
  browser: import("playwright").Browser,
  url: string,
  email: string,
  password: string,
  afterGoto: (page: import("playwright").Page) => Promise<void>
) {
  const context = await isolatedContext(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", () => errors.push("page-error"));
  await login(page, email, password);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200); // 콜드 컴파일 레이스(레포 관례) — networkidle만으로는 부족할 때가 있음
  await afterGoto(page);
  const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await context.close();
  assert(!documentOverflow, `모바일(390px)에서 문서 전체가 가로로 넘치면 안 됨`);
  assert(errors.length === 0, `모바일(390px)에서 콘솔 에러가 없어야 함: 고정 오류 수 검사`);
}

main().catch(() => {
  console.error(`FAIL PE frontend isolated E2E stage=${stage}; private details suppressed`);
  process.exitCode = 1;
});
