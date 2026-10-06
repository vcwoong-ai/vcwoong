/** Actual NextAuth/register HTTP + browser regression. Isolated test targets only. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium } from "playwright";
import { gotoAppReady } from "./helpers/app-ready";
import { assertE2ETarget, assertNoExternalE2ECredentials, assertCleanE2EWorkspace, chromiumLaunchOptions } from "./helpers/e2e-environment";

const base = process.env.BASE_URL ?? "http://localhost:3000";
async function main() {
  assertE2ETarget(base);
  assertNoExternalE2ECredentials();
  assertCleanE2EWorkspace();
  const db = new PrismaClient();
  const stamp = Date.now();
  const suffix = stamp.toString(16).slice(-4);
  const ip = `2001:db8:1::${suffix}`;
  const uiIp = `2001:db8:2::${suffix}`;
  const password = "LocalLogin2026!";
  const legacyEmail = `Login.Legacy.${stamp}@Example.com`;
  const collision = `Login.Collision.${stamp}@Example.com`;
  const fresh = `Login.New.${stamp}@Example.com`;
  const race = `Login.Race.${stamp}@Example.com`;
  const uiEmail = `Login.Signup.${stamp}@Example.com`;
  const emails = [legacyEmail, collision, collision.toLowerCase(), fresh.toLowerCase(), race.toLowerCase(), uiEmail.toLowerCase()];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const hash = await bcrypt.hash(password, 4);
    const legacy = await db.user.create({ data: { email: legacyEmail, name: "로그인 검토 예시", passwordHash: hash, role: "ANALYST" } });
    const original = await db.user.findUniqueOrThrow({ where: { id: legacy.id } });
    for (const email of [collision, collision.toLowerCase()]) await db.user.create({ data: { email, passwordHash: hash } });
    browser = await chromium.launch(chromiumLaunchOptions());
    const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip } });
    await context.route("**/*", route => new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort());
    async function login(email: string, secret: string, id?: string) {
      const isolated = await browser!.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip } });
      try {
        const { csrfToken } = await (await isolated.request.get(`${base}/api/auth/csrf`)).json();
        const response = await isolated.request.post(`${base}/api/auth/callback/credentials`, { form: { csrfToken, email, password: secret, json: "true" } });
        const result = await response.json();
        const session = await (await isolated.request.get(`${base}/api/auth/session`)).json();
        if (id) {
          assert.equal(session.user?.id, id, "same account identity");
          assert.equal(session.user.role, "ANALYST", "no role escalation");
        } else assert.equal(session.user, undefined, "rejected login must not issue authenticated session");
        return new URL(result.url).searchParams.get("error");
      } finally { await isolated.close(); }
    }
    for (const spelling of [legacyEmail, legacyEmail.toLowerCase(), legacyEmail.toUpperCase(), ` ${legacyEmail} `]) await login(spelling, password, legacy.id);
    const wrong = await login(legacyEmail, "WrongPassword123!");
    assert.equal(await login(`missing-${stamp}@example.com`, password), wrong, "same missing/wrong response");
    for (const spelling of [collision, collision.toLowerCase(), collision.toUpperCase()]) assert.equal(await login(spelling, password), wrong, "ambiguous identity rejected uniformly");
    const register = (email: string) => context.request.post(`${base}/api/auth/register`, { data: { name: "테스트 가입", email, password } });
    for (const spelling of [legacyEmail.toLowerCase(), legacyEmail.toUpperCase()]) assert.equal((await register(spelling)).status(), 409, "legacy duplicate blocked");
    assert.equal((await register(` ${fresh} `)).status(), 201);
    const newUser = await db.user.findUniqueOrThrow({ where: { email: fresh.toLowerCase() } });
    assert.equal(newUser.subscriptionPlan, "FREE");
    assert.equal(newUser.billingKey, null);
    const statuses = await Promise.all([register(race), register(race.toUpperCase())]);
    assert.deepEqual(statuses.map(r => r.status()).sort(), [201, 409], "concurrent signup has one winner and one duplicate");
    await login(fresh.toUpperCase(), password, newUser.id);
    assert.deepEqual(await db.user.findUnique({ where: { id: legacy.id } }), original, "legacy account data unchanged");

    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    mkdirSync("screenshots/login-email", { recursive: true });
    for (const width of [1440, 390]) {
      await context.clearCookies();
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${base}/login`, { waitUntil: "networkidle" });
      await page.locator("#email").fill(legacyEmail.toLowerCase());
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: "로그인", exact: true }).click();
      await page.waitForURL(`${base}/dashboard`);
      await gotoAppReady(page, `${base}/dashboard`, page.getByTestId("first-deal-guide").first());
      assert((await page.innerText("body")).includes("로그인 검토 예시"));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await page.screenshot({ path: `screenshots/login-email/success-${width}.png`, fullPage: true });
    }
    const signup = await browser.newContext({ viewport: { width: 390, height: 1000 }, extraHTTPHeaders: { "x-forwarded-for": uiIp } });
    await signup.route("**/*", route => new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort());
    const form = await signup.newPage();
    await form.goto(`${base}/register?track=pe`, { waitUntil: "networkidle" });
    await form.locator("#name").fill("가입 검토 예시");
    await form.locator("#email").fill(uiEmail);
    await form.locator("#password").fill(password);
    await form.locator("#confirmPassword").fill(password);
    await form.getByRole("button", { name: "무료로 시작하기", exact: true }).click();
    await form.waitForURL(`${base}/ma-deals`);
    await form.getByTestId("first-deal-guide").waitFor();
    assert(await db.user.findUnique({ where: { email: uiEmail.toLowerCase() } }));
    assert.deepEqual(errors, []);
    writeFileSync("screenshots/login-email/result.json", JSON.stringify({ passed: true, tests: ["legacy case variants", "wrong/missing/ambiguous rejected", "legacy duplicate", "new normalized signup", "concurrent 201/409", "same id/role/data", "desktop/mobile browser login", "PE signup auto-login"] }, null, 2));
    console.log("PASS: legacy/new/collision/concurrency/password/identity + actual desktop/mobile login and PE signup auto-login");
  } finally {
    await browser?.close();
    await db.user.deleteMany({ where: { email: { in: emails } } });
    await db.rateLimit.deleteMany({ where: { key: { in: [`login:${ip}`, `register:${ip}`, `login:${uiIp}`, `register:${uiIp}`] } } });
    await db.$disconnect();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
