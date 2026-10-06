import { assertE2ETarget, assertNoExternalE2ECredentials, assertCleanE2EWorkspace, chromiumLaunchOptions } from "./helpers/e2e-environment";
/** Local SQLite only; no AI/payment calls. Exercises empty states and real create dialogs. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { gotoAppReady } from "./helpers/app-ready";


const base = process.env.BASE_URL ?? "http://localhost:3000";
assertE2ETarget(base);
assertNoExternalE2ECredentials();
assertCleanE2EWorkspace();
const db = new PrismaClient();
const before = process.argv.includes("before");
const dir = "screenshots/week3-onboarding";
async function main() {
  mkdirSync(dir, { recursive: true });
  const stamp = Date.now();
  const email = `onboarding-${stamp}@example.com`;
  const password = "LocalFixture1234!";
  const user = await db.user.create({ data: { email, name: "첫 검토 예시", passwordHash: await bcrypt.hash(password, 4) } });
  const browser = await chromium.launch(chromiumLaunchOptions());
  const signupEmails: string[] = [];
  try {
    if (!before) {
      for (const track of ["vc", "pe"]) {
        const signup = await browser.newContext({ viewport: { width: 390, height: 1000 } });
        await signup.route("**/*", route => new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort());
        const form = await signup.newPage();
        await form.goto(`${base}/register?track=${track}`, { waitUntil: "networkidle" });
        const signupEmail = `onboarding-signup-${track}-${stamp}@example.com`;
        signupEmails.push(signupEmail);
        await form.locator("#name").fill("가입 예시");
        await form.locator("#email").fill(signupEmail);
        await form.locator("#password").fill(password);
        await form.locator("#confirmPassword").fill(password);
        await form.getByRole("button", { name: "무료로 시작하기", exact: true }).click();
        await form.waitForURL(`${base}/${track === "pe" ? "ma-deals" : "dashboard"}`);
        await form.getByTestId("first-deal-guide").first().waitFor();
        const registered = await db.user.findUniqueOrThrow({ where: { email: signupEmail } });
        assert.equal(registered.subscriptionPlan, "FREE");
        assert.equal(registered.billingKey, null);
        assert.equal(await db.deal.count({ where: { userId: registered.id } }), 0);
        assert.equal(await db.mADeal.count({ where: { userId: registered.id } }), 0);
        await signup.close();
      }
      console.log("PASS: real VC/PE registration routes to guidance; FREE without billing or auto-created deals");
    }
    const context = await browser.newContext();
    await context.route("**/*", route => new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort());
    const csrf = await context.request.get(`${base}/api/auth/csrf`);
    const { csrfToken } = await csrf.json();
    await context.request.post(`${base}/api/auth/callback/credentials`, { form: { csrfToken, email, password, json: "true" } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const path of ["dashboard", "deals", "ma-deals"]) {
        if (before) await page.goto(`${base}/${path}`, { waitUntil: "networkidle" });
        else await gotoAppReady(page, `${base}/${path}`, page.getByTestId("first-deal-guide").first());
        if (!before) {
          assert(await page.getByTestId("first-deal-guide").count() > 0);
          assert(await page.getByText("딜을 만든 뒤에도 자료 입력과 검토가 필요합니다.", { exact: true }).count() > 0);
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} ${width} no overflow`);
        await page.screenshot({ path: `${dir}/${before ? "before" : "after"}-${path}-${width}.png`, fullPage: true });
      }
    }
    if (!before) {
      for (const [path, button, company] of [
        ["deals", "첫 VC 딜 만들기", "VC 예시 기업"],
        ["ma-deals", "첫 PE/M&A 딜 만들기", "PE 예시 기업"],
      ]) {
        await gotoAppReady(page, `${base}/${path}`, page.getByTestId("first-deal-guide").first());
        const trigger = page.getByRole("button", { name: button, exact: true });
        await trigger.focus();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        assert(await dialog.evaluate(el => el.getBoundingClientRect().width <= window.innerWidth), "mobile dialog fits");
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        assert(await trigger.evaluate(el => el === document.activeElement), "focus restored");
        await trigger.click();
        await dialog.locator("#companyName").fill(company);
        await dialog.locator("#name").fill(`${company} 검토`);
        await dialog.getByRole("combobox").first().click();
        await page.getByRole("option").first().click();
        await dialog.getByRole("button", { name: "딜 등록", exact: true }).click();
        await page.waitForURL(new RegExp(`/${path}/[^/]+$`));
      }
      assert.equal(await db.deal.count({ where: { userId: user.id } }), 1);
      assert.equal(await db.mADeal.count({ where: { userId: user.id } }), 1);
      assert.equal(await db.report.count({ where: { deal: { userId: user.id } } }), 0, "creation is not report generation");
      console.log("PASS: VC/PE empty workspace, real first-deal creation, keyboard/Escape/focus, 1440/390 no overflow; no report auto-generated");
    }
    assert.deepEqual(errors, [], "no page runtime errors");
    console.log(before ? "PASS: baseline screenshots" : "PASS: no page runtime errors");
  } finally {
    await browser.close();
    await db.mADeal.deleteMany({ where: { userId: user.id } });
    await db.deal.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.user.deleteMany({ where: { email: { in: signupEmails } } });
    await db.$disconnect();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
