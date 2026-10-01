/** Real authenticated deal tab; synthetic fixtures in this worktree's copied SQLite only. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium, type Page } from "playwright";
import { gotoAppReady } from "./helpers/app-ready";
import {
  EOK,
  OUR_FUND,
  initialExitInputs,
  parseExitInputs,
} from "../src/lib/exit-simulation-input";
import { simulateCapTable, exitWaterfall } from "../src/lib/exit-waterfall";

const base = process.env.BASE_URL ?? "http://localhost:3002";
async function main() {
  assert.equal(process.env.DATABASE_URL, "file:./dev.db");
  assert.equal(
    resolve("."),
    resolve("D:/Dealmind-exit-simulation"),
    "fixture DB must be isolated from the user's server",
  );
  assert.equal(base, "http://localhost:3002");
  const db = new PrismaClient();
  const stamp = Date.now();
  const email = `exit-simulation-${stamp}@example.com`;
  const password = "LocalExitFixture2026!";
  const ip = `2001:db8:3::${stamp.toString(16).slice(-4)}`;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let ownerId: string | undefined;
  try {
    const owner = await db.user.create({
      data: {
        email,
        name: "회수 검토 예시",
        passwordHash: await bcrypt.hash(password, 4),
        role: "ANALYST",
      },
    });
    ownerId = owner.id;
    const deal = await db.deal.create({
      data: {
        userId: owner.id,
        name: "회수 시뮬레이션 검토",
        companyName: "검토용 예시 기업",
        sector: "IT",
        investAmount: 10,
        valuation: 50,
      },
    });
    const missing = await db.deal.create({
      data: {
        userId: owner.id,
        name: "초기값 없는 검토",
        companyName: "미입력 예시 기업",
        sector: "IT",
      },
    });
    const originalDeal = await db.deal.findUniqueOrThrow({
      where: { id: deal.id },
    });
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    });
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": ip },
    });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/_vercel/"))
        return route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: "/* telemetry stub: fixture review only */",
        });
      return url.origin === base ? route.continue() : route.abort();
    });
    const { csrfToken } = await (
      await context.request.get(`${base}/api/auth/csrf`)
    ).json();
    await context.request.post(`${base}/api/auth/callback/credentials`, {
      form: { csrfToken, email, password, json: "true" },
    });
    assert.equal(
      (await (await context.request.get(`${base}/api/auth/session`)).json())
        .user.id,
      owner.id,
    );
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    const failures: string[] = [];
    page.on("response", (r) => {
      if (r.status() >= 400 && !r.url().includes("/_vercel/"))
        failures.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
    const writes: string[] = [];
    page.on("request", (r) => {
      if (
        !["GET", "HEAD"].includes(r.method()) &&
        new URL(r.url()).pathname.startsWith("/api/")
      )
        writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
    });
    mkdirSync("screenshots/exit-simulation", { recursive: true });
    async function open(id: string) {
      await gotoAppReady(
        page,
        `${base}/deals/${id}`,
        page.getByRole("tab", { name: "회수 시뮬레이션", exact: true }),
      );
      await page
        .getByRole("tab", { name: "회수 시뮬레이션", exact: true })
        .click();
      await page
        .getByLabel("보통주 주식수 (창업자 등)", { exact: true })
        .waitFor();
    }
    async function fits(p: Page) {
      const overflow = await p.evaluate(() => {
        const root = document.querySelector(
          'section[aria-label="회수 시뮬레이션"]',
        )!;
        return {
          document: document.documentElement.scrollWidth > window.innerWidth,
          elements: [
            ...root.querySelectorAll("table, input, select, .recharts-wrapper"),
          ]
            .filter(
              (e) =>
                e.getBoundingClientRect().right > window.innerWidth + 1 ||
                e.getBoundingClientRect().left < -1,
            )
            .map((e) => e.tagName),
        };
      });
      assert.deepEqual(
        overflow,
        { document: false, elements: [] },
        "no document or simulation overflow",
      );
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await open(deal.id);
      assert.equal(
        await page.getByLabel("프리머니 (억원)", { exact: true }).inputValue(),
        "40",
      );
      assert.equal(
        await page
          .getByLabel("우리 펀드 투자금 (억원)", { exact: true })
          .inputValue(),
        "10",
      );
      assert.equal(
        await page
          .getByLabel("청산우선권 배수 (배)", { exact: true })
          .inputValue(),
        "",
      );
      assert.equal(
        await page.getByLabel("참가 여부", { exact: true }).inputValue(),
        "",
      );
      await fits(page);
      await page
        .getByLabel("보통주 주식수 (창업자 등)", { exact: true })
        .fill("10000000");
      await page.getByLabel("청산우선권 배수 (배)", { exact: true }).fill("1");
      await page.getByLabel("참가 여부", { exact: true }).selectOption("non");
      await page
        .getByLabel("리픽싱 방식", { exact: true })
        .selectOption("none");
      await page
        .getByLabel("청산 순위", { exact: true })
        .selectOption("stacked");
      await page.getByLabel("엑싯 금액 (억원)", { exact: true }).fill("30");
      await page
        .getByRole("button", { name: "시뮬레이션 계산", exact: true })
        .click();
      assert.equal(
        await page.getByTestId("우리 펀드 회수액").innerText(),
        "10억원",
      );
      assert.equal(
        await page.getByTestId("우리 펀드 MOIC").innerText(),
        "1.00x",
      );
      assert.match(
        await page.getByTestId("단순 연복리 IRR").innerText(),
        /미계산/,
      );
      assert.ok(
        await page.getByText("우선권 행사", { exact: true }).isVisible(),
      );
      assert.ok(await page.getByText(/주당 가격 400원/).isVisible());
      assert.ok(
        await page.getByRole("cell", { name: "20%", exact: true }).isVisible(),
      );
      await page.getByLabel("회수 시점 (년, 선택)", { exact: true }).fill("5");
      assert.ok(
        await page
          .getByRole("status")
          .filter({ hasText: "입력이 변경" })
          .isVisible(),
      );
      await page.getByLabel("엑싯 금액 (억원)", { exact: true }).fill("100");
      await page
        .getByRole("button", { name: "시뮬레이션 계산", exact: true })
        .click();
      assert.equal(
        await page.getByTestId("우리 펀드 회수액").innerText(),
        "20억원",
      );
      assert.equal(
        await page.getByTestId("우리 펀드 MOIC").innerText(),
        "2.00x",
      );
      assert.equal(
        await page.getByTestId("단순 연복리 IRR").innerText(),
        "14.87%",
      );
      assert.ok(
        await page.getByText("보통주 전환", { exact: true }).isVisible(),
      );
      await page
        .getByRole("img", { name: /우리 펀드 회수액 곡선/ })
        .scrollIntoViewIfNeeded();
      await page.locator(".recharts-line-curve").waitFor();
      await fits(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `screenshots/exit-simulation/after-${width}.png`,
        fullPage: true,
      });
      await page.getByRole("tab", { name: /^문서/ }).click();
      await page
        .getByRole("tab", { name: "회수 시뮬레이션", exact: true })
        .click();
      assert.equal(
        await page.getByLabel("엑싯 금액 (억원)", { exact: true }).inputValue(),
        "100",
        "tab switch retains unsaved scenario",
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator('[data-app-ready="true"]').waitFor();
      await page
        .getByRole("tab", { name: "회수 시뮬레이션", exact: true })
        .click();
      assert.equal(
        await page.getByLabel("엑싯 금액 (억원)", { exact: true }).inputValue(),
        "",
        "refresh clears unsaved scenario",
      );
    }
    await open(deal.id);
    await page
      .getByLabel("보통주 주식수 (창업자 등)", { exact: true })
      .fill("10000000");
    await page.getByLabel("청산우선권 배수 (배)", { exact: true }).fill("1");
    await page
      .getByLabel("참가 여부", { exact: true })
      .selectOption("participating");
    await page
      .getByLabel("참가 상한 (배, 빈칸·0은 상한 없음)", { exact: true })
      .fill("3");
    await page.getByLabel("리픽싱 방식", { exact: true }).selectOption("full");
    await page
      .getByLabel("리픽싱 하한 (최초 전환가 대비 %)", { exact: true })
      .fill("70");
    await page.getByLabel("청산 순위", { exact: true }).selectOption("pari");
    await page.getByLabel("엑싯 금액 (억원)", { exact: true }).fill("100");
    await page
      .getByRole("button", { name: "공동투자자 추가", exact: true })
      .click();
    await page.getByLabel("공동투자자 이름", { exact: true }).fill("우리 펀드");
    await page.getByLabel("공동투자금 (억원)", { exact: true }).fill("2");
    await page
      .getByRole("button", { name: "시뮬레이션 계산", exact: true })
      .click();
    const simulationPanel = page.getByRole("region", {
      name: "회수 시뮬레이션",
      exact: true,
    });
    assert.match(
      await simulationPanel.getByRole("alert").innerText(),
      /공동투자자 이름/,
    );
    await page.getByLabel("공동투자자 이름", { exact: true }).fill("공동 펀드");
    await page.getByLabel("이전 SAFE 포함", { exact: true }).check();
    await page.getByLabel("SAFE 투자금 (억원)", { exact: true }).fill("2");
    await page
      .getByRole("button", { name: "시뮬레이션 계산", exact: true })
      .click();
    assert.ok(
      await page
        .getByText(
          "이전 SAFE: 밸류캡과 할인율이 모두 없으면 다음 라운드 가격으로 그대로 전환됩니다.",
          { exact: true },
        )
        .isVisible(),
    );
    await page
      .getByLabel("SAFE 밸류캡 (억원, 빈칸·0은 없음)", { exact: true })
      .fill("20");
    await page
      .getByLabel("SAFE 할인율 (%, 빈칸·0은 없음)", { exact: true })
      .fill("20");
    await page.getByLabel("후속 라운드 포함", { exact: true }).check();
    const follow = page.getByRole("group", {
      name: "후속 라운드 가정 및 우선주 조건",
      exact: true,
    });
    await follow.getByLabel("후속 프리머니 (억원)", { exact: true }).fill("20");
    await follow.getByLabel("후속 투자금 (억원)", { exact: true }).fill("10");
    await follow.getByLabel("청산우선권 배수 (배)", { exact: true }).fill("1");
    await follow.getByLabel("참가 여부", { exact: true }).selectOption("non");
    await follow
      .getByLabel("리픽싱 방식", { exact: true })
      .selectOption("none");
    await page
      .getByRole("button", { name: "시뮬레이션 계산", exact: true })
      .click();
    assert.equal(await simulationPanel.getByRole("alert").count(), 0);
    const expected = parseExitInputs({
      ...initialExitInputs(10, 50),
      common: "10000000",
      exit: "100",
      seniority: "pari",
      coInvestors: [{ name: "공동 펀드", amount: "2" }],
      terms: {
        multiple: "1",
        participation: "participating",
        cap: "3",
        antiDilution: "full",
        floor: "70",
      },
      safeEnabled: true,
      safeAmount: "2",
      safeCap: "20",
      safeDiscount: "20",
      followEnabled: true,
      followPre: "20",
      followInvestment: "10",
      followTerms: {
        multiple: "1",
        participation: "non",
        cap: "",
        antiDilution: "none",
        floor: "",
      },
    });
    const stages = simulateCapTable(expected.scenario).stages;
    const payment = exitWaterfall(
      stages.at(-1)!,
      expected.exit,
      expected.seniority,
    ).holders.find((h) => h.holder === OUR_FUND)!;
    assert.equal(
      await page.getByTestId("우리 펀드 회수액").innerText(),
      `${(payment.payout / EOK).toLocaleString("ko-KR", { maximumFractionDigits: 4 })}억원`,
      "same canonical snapshot and inputs for complex scenario",
    );
    assert.equal(
      await page.getByTestId("우리 펀드 MOIC").innerText(),
      `${payment.multiple!.toFixed(2)}x`,
    );
    assert.ok(
      await page
        .getByRole("heading", { name: "후속 라운드", exact: true })
        .isVisible(),
    );
    assert.ok(
      await page
        .getByText(/리픽싱 .*원 → .*원/)
        .first()
        .isVisible(),
    );
    await fits(page);
    await page.screenshot({
      path: "screenshots/exit-simulation/advanced-390.png",
      fullPage: true,
    });
    await open(missing.id);
    assert.equal(
      await page.getByLabel("프리머니 (억원)", { exact: true }).inputValue(),
      "",
    );
    assert.equal(
      await page
        .getByLabel("우리 펀드 투자금 (억원)", { exact: true })
        .inputValue(),
      "",
    );
    assert.deepEqual(
      await db.deal.findUnique({ where: { id: deal.id } }),
      originalDeal,
      "simulation does not persist or change deal",
    );
    assert.deepEqual(writes, [], "no API writes from simulation");
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(failures, []);
    writeFileSync(
      "screenshots/exit-simulation/result.json",
      JSON.stringify(
        {
          passed: true,
          viewport: [1440, 390],
          tests: [
            "authenticated actual deal tab",
            "known/missing initial values",
            "400 KRW and 20%",
            "30eok→10 preference / 100eok→20 conversion",
            "2x / 14.87% 5yr IRR",
            "curve rendered",
            "dirty input",
            "tab retain / refresh reset",
            "no overflow",
            "no API write / no deal change",
            "no browser errors",
            "duplicate holder rejected / co-investor / SAFE warnings / follow-on / participation cap / refix controls",
          ],
          telemetry: "stubbed; production telemetry not verified",
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS: actual authenticated exit tab, hand examples, IRR, chart, initial/refresh/tab state, 1440/390 no overflow, no writes or browser errors",
    );
  } finally {
    await browser?.close();
    if (ownerId) {
      await db.deal.deleteMany({ where: { userId: ownerId } });
      await db.user.delete({ where: { id: ownerId } });
    }
    await db.rateLimit.deleteMany({ where: { key: `login:${ip}` } });
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
