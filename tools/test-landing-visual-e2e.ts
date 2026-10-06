import { assertE2ETarget, assertNoExternalE2ECredentials, assertCleanE2EWorkspace, chromiumLaunchOptions } from "./helpers/e2e-environment";
import { chromium, expect } from "playwright/test";
import { mkdirSync } from "node:fs";
import { expectNoHorizontalOverflow } from "./helpers/app-ready";

const before = process.argv.includes("before");
const base = process.env.BASE_URL ?? (before ? "http://localhost:3000" : "http://localhost:3001");
assertE2ETarget(base);
assertNoExternalE2ECredentials();
assertCleanE2EWorkspace();

const dir = "docs/design-review-landing-visual";
mkdirSync(dir, { recursive: true });

async function main() {
  const browser = await chromium.launch(chromiumLaunchOptions());
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: "reduce" });
      await context.route("**/*", route => {
        const url = new URL(route.request().url());
        // This Vercel-hosted telemetry asset does not exist in next start locally.
        // Explicit test stub only; keep application 404/console/hydration checks intact.
        if (url.hostname === "localhost" && url.pathname === "/_vercel/speed-insights/script.js") {
          return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
        }
        return url.hostname === "localhost" ? route.continue() : route.fulfill({ status: 204, body: "" });
      });
      const page = await context.newPage();
      const errors: string[] = [];
      const failedResponses: string[] = [];
      page.on("response", response => {
        if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
      });
      page.on("pageerror", e => errors.push(e.message));
      page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
      const response = await page.goto(base, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      await expect(page.locator("#hero-title")).toBeVisible();
      // The public landing has no authenticated app-ready marker. A working tab switch proves hydration.
      await page.getByRole("tab", { name: "PE/M&A · 검토 상황", exact: true }).click();
      await expect(page.getByTestId("landing-preview-pe")).toBeVisible();
      await page.getByRole("tab", { name: "VC · 투자 판단", exact: true }).click();
      await expect(page.getByTestId("landing-preview-vc")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: `${dir}/${before ? "before" : "after"}-${width}.png`, fullPage: true });
      if (!before) {
        await page.screenshot({ path: `${dir}/hero-${width}.png` });
        await page.getByTestId("evidence-storyboard").screenshot({ path: `${dir}/evidence-${width}.png` });
        await expect(page.getByTestId("evidence-storyboard")).toContainText("예시 데이터");
        const vc = page.getByRole("tab", { name: "VC · 투자 판단", exact: true });
        await vc.focus();
        await vc.press("ArrowRight");
        await expect(page.getByTestId("landing-preview-pe")).toBeVisible();
        await expect(page.getByRole("tab", { name: "PE/M&A · 검토 상황", exact: true })).toBeFocused();
        await expect(page.getByTestId("landing-preview-pe")).toContainText("차단됨");
        await expectNoHorizontalOverflow(page);
        await page.screenshot({ path: `${dir}/after-pe-${width}.png`, fullPage: true });
        await page.getByRole("tab", { name: "PE/M&A · 검토 상황", exact: true }).press("Home");
        await expect(page.getByTestId("landing-preview-vc")).toBeVisible();
        const firstDetail = page.locator("#evidence details").first();
        await firstDetail.locator("summary").press("Enter");
        await expect(firstDetail).toHaveAttribute("open", "");
        await expect(firstDetail.locator("p").last()).toBeVisible();
        await expect(page.locator('a[href="/register?track=vc"]').first()).toBeVisible();
        await expect(page.locator('a[href="/register?track=pe"]').first()).toBeVisible();
        expect(await page.locator("h1").count()).toBe(1);
        expect(await page.locator("#faq details").count()).toBe(7);
        await expectNoHorizontalOverflow(page);
        await page.locator('a[href="/register?track=pe"]').first().click();
        await expect(page).toHaveURL(`${base}/register?track=pe`);
      }
      expect(errors, `no hydration, page or console errors; responses: ${failedResponses.join(", ")}`).toEqual([]);
      await context.close();
      console.log(`PASS ${before ? "before" : "after"} ${width}px`);
    }
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
