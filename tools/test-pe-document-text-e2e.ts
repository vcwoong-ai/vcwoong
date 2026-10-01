/** Isolated SQLite fixtures only. No AI, storage fetch, production data or migrations. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium } from "playwright";
import { gotoAppReady } from "./helpers/app-ready";

const db = new PrismaClient();
const base = "http://localhost:3000";
const before = process.argv[2] === "before";
const dir = "screenshots/pe-document-text";
const password = "SourceFixture1234!";
const source = "FY2024 경영진 제공 자료\n매출 1,000억원 — 회계 기준 대조가 필요합니다.\n<script>window.sourceExecuted=true</script>\n" + "추가 검토 자료입니다. ".repeat(600);

async function login(email: string): Promise<string> {
  const jar = new Map<string, string>();
  const collect = (res: Response) => {
    for (const cookie of res.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const at = pair.indexOf("=");
      jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
  };
  const csrf = await fetch(`${base}/api/auth/csrf`);
  collect(csrf);
  const { csrfToken } = await csrf.json();
  const header = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  collect(await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: header() },
    body: new URLSearchParams({ csrfToken, email, password, json: "true" }),
  }));
  assert([...jar.keys()].some((k) => k.includes("session-token")), "fixture login");
  return header();
}

async function main() {
  assert.equal(process.env.DATABASE_URL, "file:./dev.db", "local DB only");
  mkdirSync(dir, { recursive: true });
  const stamp = Date.now();
  const team = await db.team.create({ data: { name: `Source fixture ${stamp}` } });
  const hash = await bcrypt.hash(password, 4);
  const users: string[] = [];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const owner = await db.user.create({ data: { email: `source-owner-${stamp}@example.com`, name: "원문 검토", passwordHash: hash, teamId: team.id } });
    users.push(owner.id);
    const peer = await db.user.create({ data: { email: `source-peer-${stamp}@example.com`, passwordHash: hash, teamId: team.id, role: "ANALYST" } });
    users.push(peer.id);
    const outsider = await db.user.create({ data: { email: `source-outside-${stamp}@example.com`, passwordHash: hash } });
    users.push(outsider.id);
    const deal = await db.mADeal.create({ data: { userId: owner.id, teamId: team.id, name: "원문 검토 예시", companyName: "한빛정밀 · 원문 조회 예시", dealType: "BUYOUT" } });
    const privateDeal = await db.mADeal.create({ data: { userId: owner.id, name: "비공개 예시", companyName: "비공개", dealType: "BUYOUT" } });
    const docData = { name: "2024 경영 자료 (예시).txt", type: "MANAGEMENT_ACCOUNTS" as const, url: "/uploads/fixture-not-a-real-file", size: Buffer.byteLength(source), mimeType: "text/plain", parsedText: source };
    const doc = await db.mADocument.create({ data: { ...docData, maDealId: deal.id } });
    const privateDoc = await db.mADocument.create({ data: { ...docData, maDealId: privateDeal.id } });
    const emptyDoc = await db.mADocument.create({ data: { ...docData, name: "아직 파싱되지 않은 자료.pdf", parsedText: null, maDealId: deal.id } });
    const ddCase = await db.pEDDCase.create({ data: { maDealId: deal.id } });
    await db.pEEvidence.create({ data: { ddCaseId: ddCase.id, documentId: doc.id, sourceType: "UPLOADED_DOCUMENT", sourceName: doc.name, sourceLocation: null, excerpt: "매출 1,000억원", confidence: 0.8 } });
    const cookie = await login(owner.email);
    const get = (path: string, auth = cookie) => fetch(`${base}${path}`, { headers: auth ? { Cookie: auth } : {} });
    const path = `/api/ma-deals/${deal.id}/documents/${doc.id}/text`;
    if (!before) {
      assert.equal((await get(path, "")).status, 401);
      const response = await get(path);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const { data } = await response.json();
      assert.equal(data.text, source.slice(0, data.end));
      assert(data.text.length <= 3000 && data.hasMore);
      assert(!("url" in data) && !("parsedText" in data));
      const next = await (await get(`${path}?offset=${data.end}`)).json();
      assert.equal(next.data.text, source.slice(data.end, next.data.end));
      const teamCookie = await login(peer.email);
      assert.equal((await get(path, teamCookie)).status, 200, "shared ANALYST read");
      const outsiderCookie = await login(outsider.email);
      const forbidden = await get(path, outsiderCookie);
      const missing = await get(`/api/ma-deals/${deal.id}/documents/nonexistent/text`, outsiderCookie);
      assert.equal(forbidden.status, 404);
      assert.equal(missing.status, 404);
      assert.equal(await forbidden.text(), await missing.text(), "same missing/forbidden bytes");
      assert.equal((await get(`/api/ma-deals/${privateDeal.id}/documents/${privateDoc.id}/text`, teamCookie)).status, 404, "same team cannot read private deal");
      assert.equal((await get(`/api/ma-deals/${deal.id}/documents/${privateDoc.id}/text`)).status, 404, "cross-deal document rejected");
      for (const offset of ["-1", "1.5", "NaN", "500001", "", "1e3"]) assert.equal((await get(`${path}?offset=${offset}`)).status, 400, `bad offset ${offset}`);
      const empty = await (await get(`/api/ma-deals/${deal.id}/documents/${emptyDoc.id}/text`)).json();
      assert.equal(empty.data.available, false);
      assert.equal(empty.data.text, "");
      const list = await (await get(`/api/ma-deals/${deal.id}/documents`)).text();
      assert(!list.includes("parsedText") && !list.includes("sourceExecuted"), "list has no document body");
      assert.equal((await fetch(`${base}${path}`, { method: "POST", headers: { Cookie: cookie } })).status, 405);
      console.log("PASS: auth, team/private/cross-deal scope, equal 404, bounds, no cache/body in list, read-only");
    }
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
    const context = await browser.newContext();
    await context.addCookies(cookie.split("; ").map((pair) => { const at = pair.indexOf("="); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: base }; }));
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await gotoAppReady(page, `${base}/ma-deals/${deal.id}`, page.getByRole("tab", { name: "데이터룸", exact: true }));
      await page.getByRole("tab", { name: "데이터룸", exact: true }).click();
      if (before) await page.getByText(doc.name, { exact: true }).click();
      else {
        await page.getByRole("button", { name: doc.name, exact: true }).click();
        const loaded = page.waitForResponse((res) => res.url().includes(`/documents/${doc.id}/text`) && res.status() === 200);
        await page.getByRole("button", { name: "파싱 텍스트 보기", exact: true }).click();
        await loaded;
        await page.getByTestId("document-source-text").waitFor();
        assert((await page.getByTestId("document-source-text").innerText()).includes("<script>"), "HTML remains visible text");
        assert.equal(await page.evaluate(() => (window as unknown as { sourceExecuted?: boolean }).sourceExecuted), undefined, "no script execution");
        await page.getByRole("button", { name: "다음 부분", exact: true }).click();
        await page.getByTestId("document-source-range").filter({ hasText: "3001" }).waitFor();
        await page.getByRole("button", { name: "이전 부분", exact: true }).click();
        await page.getByTestId("document-source-range").filter({ hasText: /^1–/ }).waitFor();
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no page overflow");
      assert(await page.getByRole("dialog").evaluate((el) => el.scrollWidth <= el.clientWidth), "no hidden horizontal overflow inside dialog");
      const bounds = await page.getByRole("dialog").boundingBox();
      assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, "dialog within viewport");
      await page.screenshot({ path: `${dir}/${before ? "before" : "after"}-${width}.png` });
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      if (!before) assert(await page.getByRole("button", { name: doc.name, exact: true }).evaluate((el) => el === document.activeElement), "focus restored to document");
    }
    if (!before) {
      await page.getByRole("button", { name: emptyDoc.name, exact: true }).click();
      assert.equal(await page.getByTestId("document-source-text").count(), 0, "no previous document text");
      await page.getByRole("button", { name: "파싱 텍스트 보기", exact: true }).click();
      await page.getByText("추출된 텍스트가 없습니다.", { exact: false }).waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.getByRole("button", { name: doc.name, exact: true }).click();
      const pattern = `**/documents/${doc.id}/text*`;
      await page.route(pattern, (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{}' }));
      await page.getByRole("button", { name: "파싱 텍스트 보기", exact: true }).click();
      await page.getByRole("alert").waitFor();
      await page.unroute(pattern);
      await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
      await page.getByTestId("document-source-text").waitFor();
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press("Tab");
        assert(await page.getByRole("dialog").evaluate((el) => el.contains(document.activeElement)), "focus trapped in dialog");
      }
      assert.deepEqual(await db.mADocument.findUnique({ where: { id: doc.id } }), doc, "read leaves stored document unchanged");
      console.log("PASS: missing parser text, no stale text, retry after failure, focus trap, no DB mutation");
    }
    assert.deepEqual(errors, []);
    console.log(`PASS: ${before ? "before" : "after"} desktop/mobile, dialog, XSS, paging, focus, no page errors`);
  } finally {
    await browser?.close();
    await db.mADeal.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.team.delete({ where: { id: team.id } });
    await db.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
