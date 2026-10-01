import { expect, type Locator, type Page } from "playwright/test";

/** Wait for a hydrated app and the route's actual content, never an arbitrary sleep. */
export async function gotoAppReady(page: Page, url: string, content: Locator) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator('[data-app-ready="true"]').waitFor({ timeout: 60000 });
  await content.waitFor({ state: "visible", timeout: 60000 });
  return response;
}

export async function expectNoHorizontalOverflow(page: Page) {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits, "viewport must fit without hiding overflow").toBe(true);
}
