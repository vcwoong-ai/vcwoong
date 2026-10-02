/** Local-only read-only site walkthrough; isolated synthetic fixture, no AI/billing submissions. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { chromium, type Page } from "playwright";
import { createPaidProductFixture } from "./helpers/paid-product-fixture";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const target = new URL(base);
assert(target.hostname === "localhost" && ["3000", "3001", "3003"].includes(target.port) && target.protocol === "http:", "local review only");
const dir = "screenshots/site-review";
const db = new PrismaClient();
const rows: Array<Record<string, unknown>> = [];
async function inspect(page: Page, path: string, name: string, width: number) {
  const errors: string[] = [];
  const listener = (error: Error) => errors.push(error.message);
  page.on("pageerror", listener);
  const response = await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const body = await page.locator("body").innerText();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const failed = response?.status() !== 200 || overflow || errors.length > 0 || body.includes("An error occurred in the Server Components render");
  rows.push({ name, width, status: response?.status(), path, finalPath: new URL(page.url()).pathname, overflow, errors, failed });
  await page.screenshot({ path: `${dir}/${name}-${width}.png`, fullPage: true });
  page.off("pageerror", listener);
  console.log(`${failed ? "FAIL" : "PASS"} ${width} ${name}`);
}

async function main() {
  assert.equal(process.env.DATABASE_URL, "file:./dev.db");
  mkdirSync(dir, { recursive: true });
  let fixture: Awaited<ReturnType<typeof createPaidProductFixture>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const testIp = `2001:db8:4::${Date.now().toString(16).slice(-4)}`;
  try {
    fixture = await createPaidProductFixture(db);
    await db.reportSection.updateMany({ where: { reportId: fixture.report.id, sectionKey: "FINANCIAL_STATUS" }, data: { content: "예시 자료의 연도별 기재값입니다.\n\n| 항목 | 2022 | 2023 | 2024 |\n| --- | --- | --- | --- |\n| 매출 (억원) | 60 | 80 | 110 |\n| 영업이익 (억원) | -20 | 미확인 | -12 |" } });
    const ownerId = fixture.owner.id;
    await db.reportSection.updateMany({ where: { reportId: fixture.report.id, sectionKey: "COMPANY_OVERVIEW" }, data: { content: "합성 상대기간 예시입니다.\n\n| 항목 | FY-1 | FY |\n| --- | --- | --- |\n| 임직원 (명) | 20 | 23 |\n\n| 항목 | FY-1 | FY |\n| --- | --- | --- |\n| 매출 | 10 | 12 |" } });
    const fund = await db.fund.create({ data: { userId: ownerId, name: "순회 검토 펀드 (예시)", vintageYear: 2024, fundSize: 300, paidIn: 150 } });
    const company = await db.portfolioCompany.create({ data: { userId: ownerId, fundId: fund.id, companyName: "사후관리 기업 (예시)", sector: "IT", investedAt: new Date("2024-01-01"), investAmount: 30, ownershipPercent: 10, entryValuation: 300, currentValuation: 350 } });
    await db.companyKPI.create({ data: { companyId: company.id, period: "2025Q1", metric: "매출", value: 20, unit: "억원" } });
    await db.inboundDeal.create({ data: { userId: ownerId, companyName: "인바운드 기업 (예시)", summary: "순회 검토용 합성 자료" } });
    const lp = await db.lpReport.create({ data: { fundId: fund.id, period: "2025Q1", title: "분기 보고 (예시)", content: "# 분기 운용 보고\n합성 검토 데이터이며 실제 운용 실적이 아닙니다.", status: "DRAFT" } });
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce", extraHTTPHeaders: { "x-forwarded-for": testIp } });
      await context.route("**/*", route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.hostname !== "localhost") return route.fulfill({ status: 204, body: "" });
        if (url.pathname === "/_vercel/speed-insights/script.js") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
        if (url.pathname.startsWith("/api/dart/") || !["GET", "HEAD"].includes(request.method())) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      for (const [path, name] of [["/", "home"], ["/pricing", "pricing"], ["/login", "login"], ["/register", "register"], ["/forgot-password", "forgot"], ["/reset-password", "reset"], ["/irr-calculator", "irr"]]) await inspect(page, path, name, width);
      const csrf = await (await context.request.get(`${base}/api/auth/csrf`)).json();
      await context.request.post(`${base}/api/auth/callback/credentials`, { form: { csrfToken: csrf.csrfToken, email: fixture.owner.email, password: fixture.password, json: "true" } });
      const session = await (await context.request.get(`${base}/api/auth/session`)).json();
      assert.equal(session.user?.id, ownerId, "real NextAuth owner session");
      const routes = [
        ["/dashboard", "dashboard"], ["/sourcing", "sourcing"], ["/deals", "deals"], [`/deals/${fixture.vcDeal.id}`, "deal-detail"],
        ["/deals/compare", "deal-compare"], ["/reports", "reports"], ["/reports/new", "report-new"], [`/reports/${fixture.report.id}`, "report"], [`/reports/${fixture.report.id}/print`, "report-print"],
        ["/ma-deals", "pe-list"], [`/ma-deals/${fixture.peDeal.id}`, "pe-overview"], [`/ma-deals/${fixture.peDeal.id}/committee-pack/print`, "pe-print"],
        ["/templates", "templates"], ["/portfolio", "portfolio"], [`/portfolio/${company.id}`, "portfolio-detail"],
        ["/lp-report", "lp"], [`/lp-report/${fund.id}/analytics`, "fund-analytics"], [`/lp-report/${lp.id}/print`, "lp-print"],
        ["/upload", "upload"], ["/settings", "settings"], ["/admin/usage-cost", "admin-denied"],
      ];
      for (const [path, name] of routes) await inspect(page, path, name, width);
      await page.goto(`${base}/reports/${fixture.report.id}`, { waitUntil: "networkidle" });
      assert.equal(await page.getByRole("navigation", { name: "보고서 목차" }).count(), 1);
      assert.equal(await page.locator("figure").filter({ hasText: "매출 (억원)" }).count(), 1);
      const relativeChart = page.locator("figure").filter({ hasText: "임직원 (명)" });
      assert.equal(await relativeChart.count(), 1);
      assert(await relativeChart.innerText().then(text => text.includes("FY의 기준연도를 추정하지 않았습니다")));
      await relativeChart.screenshot({ path: `${dir}/relative-period-chart-${width}.png` });
      const explanation = page.getByText("일부 표는 원본으로 확인하세요 · 그래프 표시 기준", { exact: true }).first();
      await explanation.focus();
      await page.keyboard.press("Enter");
      assert(await page.getByText(/보고서를 다시 생성할 필요는 없습니다/).first().isVisible());
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `${dir}/report-chart-eligibility-${width}.png`, fullPage: true });
      await page.getByText(/^수치·출처 비교표/).click();
      await page.getByRole("table", { name: "보고서 수치와 원문 출처 비교" }).waitFor({ state: "visible" });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `${dir}/report-evidence-table-${width}.png`, fullPage: true });
      await page.goto(`${base}/ma-deals/${fixture.peDeal.id}`, { waitUntil: "networkidle" });
      for (const tab of ["ic-review", "ic-decision", "ic-review-workflow", "committee-pack", "data-room", "financials", "lbo"]) {
        await page.locator(`button[role=tab][aria-controls$="-${tab}"]`).click();
        const panel = page.locator('[role="tabpanel"][data-state="active"]');
        await panel.waitFor({ state: "visible" });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        rows.push({ name: `pe-${tab}`, width, overflow, failed: overflow });
        await page.screenshot({ path: `${dir}/pe-${tab}-${width}.png`, fullPage: true });
      }
      if (width === 390) {
        await page.goto(`${base}/dashboard`, { waitUntil: "networkidle" });
        const button = page.getByRole("button", { name: "메뉴 열기", exact: true });
        rows.push({ name: "closed-mobile-nav-hidden", width, failed: await page.getByRole("navigation", { name: "주 메뉴", exact: true }).count() !== 0 });
        await button.click();
        const dialog = page.getByRole("dialog", { name: "워크스페이스 메뉴", exact: true });
        await dialog.waitFor({ state: "visible" });
        for (let i = 0; i < 16; i++) {
          await page.keyboard.press("Tab");
          assert(await dialog.evaluate(element => element.contains(document.activeElement)), "mobile menu keeps focus inside");
        }
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        const closed = !(await page.getByRole("button", { name: "메뉴 닫기", exact: true }).isVisible());
        rows.push({ name: "mobile-menu-escape", width, failed: !closed });
        rows.push({ name: "mobile-menu-focus-return", width, failed: !(await button.evaluate(element => element === document.activeElement)) });
        await button.click();
        await dialog.getByRole("link", { name: "PE/M&A 딜", exact: true }).click();
        await page.waitForURL(`${base}/ma-deals`);
        await dialog.waitFor({ state: "hidden" });
        rows.push({ name: "mobile-menu-navigation", width, failed: new URL(page.url()).pathname !== "/ma-deals" });
        await button.click();
        await page.setViewportSize({ width: 1440, height: 1000 });
        await dialog.waitFor({ state: "hidden" });
        rows.push({ name: "mobile-menu-desktop-resize", width, failed: await dialog.count() > 0 });
      }
      await context.close();
    }
    writeFileSync(`${dir}/result.json`, JSON.stringify(rows, null, 2));
    assert.equal(rows.filter(row => row.failed).length, 0, `site failures: ${JSON.stringify(rows.filter(row => row.failed))}`);
    console.log(`PASS: ${rows.length} route/tab/keyboard checks`);
  } finally {
    await browser?.close();
    if (fixture) {
      await db.portfolioCompany.deleteMany({ where: { userId: fixture.owner.id } });
      await db.fund.deleteMany({ where: { userId: fixture.owner.id } });
      await fixture.cleanup();
    }
    await db.rateLimit.deleteMany({ where: { key: { in: [`login:${testIp}`] } } });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
