import { assertE2ETarget, assertNoExternalE2ECredentials, assertCleanE2EWorkspace, chromiumLaunchOptions } from "./helpers/e2e-environment";
/** Local-only browser checks and SSR measurements. No external requests or paid actions. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { gotoAppReady, expectNoHorizontalOverflow } from "./helpers/app-ready";

const base = process.env.BASE_URL ?? "http://localhost:3000";
assertE2ETarget(base);
assertNoExternalE2ECredentials();
assertCleanE2EWorkspace();

async function main() {
  mkdirSync("screenshots/week4", { recursive: true });
  const db = new PrismaClient();
  const password = "LocalFixture1234!";
  const user = await db.user.create({ data: { email: `a11y-${Date.now()}@example.com`, name: "키보드 검토 예시", passwordHash: await bcrypt.hash(password, 4) } });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    assert(user.email, "Synthetic accessibility user requires an email.");
    browser = await chromium.launch(chromiumLaunchOptions());
    const context = await browser.newContext();
    await context.route("**/*", route => new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort());
    const { csrfToken } = await (await context.request.get(`${base}/api/auth/csrf`)).json();
    await context.request.post(`${base}/api/auth/callback/credentials`, { form: { csrfToken, email: user.email, password, json: "true" } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    const metrics = [];
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const path of ["dashboard", "deals", "ma-deals"]) {
        await gotoAppReady(page, `${base}/${path}`, page.getByTestId("first-deal-guide").first());
        await page.keyboard.press("Tab");
        const skip = page.getByRole("link", { name: "본문으로 이동", exact: true });
        assert(await skip.evaluate(el => el === document.activeElement), "skip link is first keyboard stop");
        await page.keyboard.press("Enter");
        assert(await page.locator("main").evaluate(el => el === document.activeElement), "skip link moves focus to main");
        await expectNoHorizontalOverflow(page);
        if (path !== "dashboard") {
          const trigger = page.getByRole("button", { name: path === "deals" ? "첫 VC 딜 만들기" : "첫 PE/M&A 딜 만들기", exact: true });
          await trigger.focus();
          await page.keyboard.press("Enter");
          const dialog = page.getByRole("dialog");
          await dialog.waitFor();
          const description = await dialog.getAttribute("aria-describedby");
          assert(description && await page.locator(`[id="${description}"]`).innerText(), "dialog has actual accessible description");
          for (let i = 0; i < 8; i++) {
            await page.keyboard.press("Tab");
            assert(await dialog.evaluate(el => el.contains(document.activeElement)), "dialog traps focus");
          }
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "hidden" });
          assert(await trigger.evaluate(el => el === document.activeElement));
        }
        await page.screenshot({ path: `screenshots/week4/${path}-${width}.png`, fullPage: true });
      }
    }
    // Authenticated HTTP response timings: full SSR HTML receipt, not browser paint or production TTFB.
    for (const path of ["dashboard", "deals", "ma-deals"]) {
      await context.request.get(`${base}/${path}`);
      const samples = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        const response = await context.request.get(`${base}/${path}`);
        const html = await response.text();
        assert.equal(response.status(), 200);
        assert(html.includes("first-deal-guide"), "guidance is server-rendered without JS execution");
        samples.push(Number((performance.now() - start).toFixed(2)));
      }
      metrics.push({ path, milliseconds: samples });
    }
    assert.deepEqual(errors, []);
    writeFileSync("screenshots/week4/ssr-performance.json", JSON.stringify({ mode: "local dev warm SSR HTTP", samples: 5, metrics }, null, 2));
    console.log("PASS: 1440/390, skip-link focus, hydrated content wait, dialog description/trap/Escape/restore, no overflow/pageerror, SSR guidance", JSON.stringify(metrics));
  } finally {
    await browser?.close();
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
