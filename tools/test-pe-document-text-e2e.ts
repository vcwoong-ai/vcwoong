import { assertE2ETarget, assertNoExternalE2ECredentials, assertCleanE2EWorkspace, chromiumLaunchOptions } from "./helpers/e2e-environment";
/** Explicit isolated PostgreSQL fixtures only. No AI, storage fetch, production data or migrations. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import pathModule from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium } from "playwright";
import { gotoAppReady } from "./helpers/app-ready";


const base = process.env.BASE_URL ?? "http://localhost:3000";
assertE2ETarget(base);
assertNoExternalE2ECredentials();
assertCleanE2EWorkspace();
assert.equal(process.env.STORAGE_MODE, "local", "Upload E2E requires isolated local storage");
assert.equal(process.env.UPLOAD_DIR, "./.e2e-uploads", "Upload E2E uses its dedicated fixture folder");
const db = new PrismaClient({ log: [] });
const before = process.argv[2] === "before";
const dir = ".e2e-artifacts/pe-document-text";
const password = "SourceFixture1234!";
let validationStage = "setup";
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
  mkdirSync(dir, { recursive: true });
  const stamp = Date.now();
  let teamId: string | undefined;
  const users: string[] = [];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const team = await db.team.create({ data: { name: `Source fixture ${stamp}` } });
    teamId = team.id;
    const hash = await bcrypt.hash(password, 4);
    const owner = await db.user.create({ data: { email: `source-owner-${stamp}@example.com`, name: "원문 검토", passwordHash: hash, teamId: team.id } });
    users.push(owner.id);
    const peer = await db.user.create({ data: { email: `source-peer-${stamp}@example.com`, passwordHash: hash, teamId: team.id, role: "ANALYST" } });
    users.push(peer.id);
    const outsider = await db.user.create({ data: { email: `source-outside-${stamp}@example.com`, passwordHash: hash } });
    users.push(outsider.id);
    assert(owner.email && peer.email && outsider.email, "Synthetic users require emails.");
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
    browser = await chromium.launch(chromiumLaunchOptions());
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.route("**/*", route => {
      const target = new URL(route.request().url());
      return target.origin === new URL(base).origin ? route.continue() : route.abort("blockedbyclient");
    });
    await context.addCookies(cookie.split("; ").map((pair) => { const at = pair.indexOf("="); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: base }; }));
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const documentsPattern = `**/api/ma-deals/${deal.id}/documents`;
      const requestsPattern = `**/api/ma-deals/${deal.id}/evidence-requests`;
      let failedDocumentsReads = 0;
      let failedRequestsReads = 0;
      if (!before) {
        await page.route(documentsPattern, route => {
          failedDocumentsReads++;
          return route.fulfill({ status: 500, contentType: "application/json", body: '{}' });
        });
        await page.route(requestsPattern, route => {
          failedRequestsReads++;
          return route.fulfill({ status: 500, contentType: "application/json", body: '{}' });
        });
      }
      await gotoAppReady(page, `${base}/ma-deals/${deal.id}`, page.getByRole("tab", { name: "데이터룸", exact: true }));
      await page.getByRole("tab", { name: "데이터룸", exact: true }).click();
      if (!before) {
        await page.getByRole("button", { name: "자료 목록 다시 조회", exact: true }).waitFor();
        await page.getByRole("button", { name: "근거 요청 다시 조회", exact: true }).waitFor();
        await page.getByRole("tab", { name: "개요", exact: true }).click();
        await page.getByRole("tab", { name: "데이터룸", exact: true }).click();
        assert.equal(failedDocumentsReads, 1, "failed document GET is not repeated on tab change");
        assert.equal(failedRequestsReads, 1, "failed evidence GET is not repeated on tab change");
        await page.unroute(documentsPattern);
        await page.unroute(requestsPattern);
        await page.getByRole("button", { name: "자료 목록 다시 조회", exact: true }).click();
        await page.getByRole("button", { name: "근거 요청 다시 조회", exact: true }).click();
        await page.getByRole("button", { name: doc.name, exact: true }).waitFor();
        console.log(`PASS: ${width}px document/evidence GET500, no automatic tab retry, explicit GET recovery`);
      }
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
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      validationStage = "financial-tab";
      await page.getByRole("tab", { name: "재무 · QoE", exact: true }).click();
      const financialPattern = `**/api/ma-deals/${deal.id}/financials`;
      let financialPosts = 0;
      page.on("request", request => {
        if (new URL(request.url()).pathname === `/api/ma-deals/${deal.id}/financials` && request.method() === "POST") financialPosts++;
      });
      await page.route(financialPattern, route => route.request().method() === "GET"
        ? route.fulfill({ status: 500, contentType: "application/json", body: '{}' })
        : route.fallback());
      await page.getByRole("button", { name: "재무 기간 추가", exact: true }).click();
      validationStage = "financial-input";
      const financialDialog = page.getByRole("dialog");
      await financialDialog.locator('input[name="fiscalYear"]').fill("2024");
      await financialDialog.locator('input[name="startDate"]').fill("2024-01-01");
      await financialDialog.locator('input[name="endDate"]').fill("2024-12-31");
      await financialDialog.locator('input[name="lineItems.0.value"]').fill("100");
      const savedResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/ma-deals/${deal.id}/financials` && response.request().method() === "POST" && response.status() === 201);
      await financialDialog.locator('button[type="submit"]').click();
      validationStage = "financial-save-response";
      await savedResponse;
      await financialDialog.waitFor({ state: "hidden" });
      await page.getByTestId("pe-financial-read-error").waitFor();
      validationStage = "financial-saved-read-error";
      assert((await page.getByTestId("pe-financial-read-error").innerText()).includes("저장"), "saved result distinguished from refresh failure");
      assert.equal(await db.mAFinancialPeriod.count({ where: { maDealId: deal.id } }), 1, "successful POST remains persisted");
      await page.unroute(financialPattern);
      const refreshedResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/ma-deals/${deal.id}/financials` && response.request().method() === "GET" && response.status() === 200);
      await page.getByTestId("pe-financial-read-error").getByRole("button").click();
      await refreshedResponse;
      await page.getByRole("tabpanel").getByText(/FY2024/).first().waitFor();
      await page.getByTestId("pe-financial-read-error").waitFor({ state: "hidden" });
      validationStage = "financial-read-recovered";
      assert.equal(financialPosts, 1, "read recovery does not repeat creation");
      assert.equal(await db.mAFinancialPeriod.count({ where: { maDealId: deal.id } }), 1, "read recovery keeps one period");
      assert((await page.getByRole("tabpanel").innerText()).includes("FY2024"), "retried read renders saved period");
      validationStage = "financial-mobile-layout";
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "financial recovery has no mobile page overflow");
      await page.screenshot({ path: `${dir}/financial-after-390.png` });
      console.log("PASS: mobile actual financial POST201, injected refresh GET500, explicit GET recovery, persisted period1 and POST1");
      validationStage = "upload-file";
      await page.getByRole("tab", { name: "데이터룸", exact: true }).click();
      const uploadName = "신규 합성 자료.txt";
      const uploadBytes = Buffer.from("격리 업로드 검증용 합성 원문입니다. ".repeat(30));
      await page.getByRole("combobox", { name: "자료 유형", exact: true }).selectOption("OTHER");
      await page.getByLabel("PE 업로드 파일", { exact: true }).setInputFiles({ name: uploadName, mimeType: "text/plain", buffer: uploadBytes });
      const documentsUrl = `/api/ma-deals/${deal.id}/documents`;
      const listPattern = `**${documentsUrl}`;
      await page.route(listPattern, route => route.request().method() === "GET"
        ? route.fulfill({ status: 500, contentType: "application/json", body: '{}' }) : route.fallback());
      const uploadResponse = page.waitForResponse(response => new URL(response.url()).pathname === documentsUrl && response.request().method() === "POST" && response.status() === 201);
      await page.getByRole("button", { name: "자료 업로드", exact: true }).click();
      const uploadData = (await (await uploadResponse).json()).data;
      validationStage = "upload-stored-read-error";
      await page.getByTestId("pe-upload-status").filter({ hasText: "목록 조회가 실패" }).waitFor();
      assert.equal(uploadData.status, "ready");
      const stored = await db.mADocument.findUniqueOrThrow({ where: { id: uploadData.id } });
      assert.equal(stored.parsedText, uploadBytes.toString());
      assert(stored.url.startsWith("private-local:"), "synthetic upload stored outside public");
      assert(!JSON.stringify(uploadData).includes("private-local:") && !("parsedText" in uploadData), "upload response hides original references/text");
      await page.unroute(listPattern);
      await page.getByRole("button", { name: "자료 목록 다시 조회", exact: true }).click();
      await page.getByRole("button", { name: uploadName, exact: true }).waitFor();
      const downloaded = await get(`${documentsUrl}/${stored.id}/download`);
      assert.equal(downloaded.status, 200);
      assert.equal(downloaded.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), uploadBytes, "protected download original bytes");
      validationStage = "upload-reconnect";
      await page.reload();
      await page.getByRole("tab", { name: "데이터룸", exact: true }).click();
      await page.getByRole("button", { name: uploadName, exact: true }).waitFor();
      await page.getByRole("button", { name: uploadName, exact: true }).click();
      await page.getByRole("button", { name: "파싱 텍스트 보기", exact: true }).click();
      await page.getByTestId("document-source-text").waitFor();
      assert.equal(await page.getByTestId("document-source-text").innerText(), uploadBytes.toString());
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      validationStage = "upload-api-idempotency";
      // Only this suite's newly uploaded synthetic TXT is changed to model an interrupted parser.
      const uploadMetadata = stored.metadata as { __peUpload: Record<string, unknown> };
      await db.mADocument.update({ where: { id: stored.id }, data: { parsedText: null,
        metadata: { __peUpload: { ...uploadMetadata.__peUpload, phase: "WARNING", token: null } } } });
      validationStage = "parse-recovery";
      const retryPath = `${documentsUrl}/${stored.id}/retry-parse`;
      const retry = (auth: string, body?: string, origin = base) => fetch(`${base}${retryPath}`, {
        method: "POST", headers: { ...(auth ? { Cookie: auth } : {}), Origin: origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body,
      });
      assert.equal((await retry("")).status, 401);
      assert.equal((await retry(await login(peer.email))).status, 404, "shared analyst cannot retry parsing");
      assert.equal((await retry(await login(outsider.email))).status, 404, "outside team cannot retry parsing");
      assert.equal((await retry(cookie, undefined, "https://untrusted.example")).status, 403);
      assert.equal((await retry(cookie, JSON.stringify({ url: "https://untrusted.example/source" }))).status, 400, "client cannot choose source reference");
      const beforeRetryList = await get(documentsUrl);
      validationStage = "parse-recovery-summary";
      const beforeRetryBody = await beforeRetryList.text();
      assert(!beforeRetryBody.includes("__peUpload") && !beforeRetryBody.includes("fingerprint") && !beforeRetryBody.includes("private-local:"), "safe parse summary only");
      assert.equal(beforeRetryList.headers.get("cache-control"), "private, no-store");
      const summary = JSON.parse(beforeRetryBody).data.documents.find((row: { id: string }) => row.id === stored.id);
      assert.equal(summary.parseRetryAllowed, true); assert.equal(summary.parseStatus, "unavailable");
      let recoveryPosts = 0;
      page.on("request", request => { if (new URL(request.url()).pathname === retryPath && request.method() === "POST") recoveryPosts++; });
      await page.reload();
      validationStage = "parse-recovery-open";
      await page.getByRole("tab", { name: "데이터룸", exact: true }).click();
      await page.getByRole("button", { name: uploadName, exact: true }).click();
      const retryPattern = `**${retryPath}`;
      validationStage = "parse-recovery-initial-query";
      await page.getByRole("button", { name: "추출 상태 조회", exact: true }).click();
      await page.getByRole("button", { name: "텍스트 추출 다시 시도", exact: true }).waitFor();
      await page.route(retryPattern, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "SYNTHETIC_PRIVATE_PARSE_DETAIL" }) }));
      validationStage = "parse-recovery-injected-post";
      await page.getByRole("button", { name: "텍스트 추출 다시 시도", exact: true }).click();
      await page.getByRole("button", { name: "추출 상태 조회", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "텍스트 추출 다시 시도", exact: true }).count(), 0, "uncertain POST cannot be replayed directly");
      assert(!(await page.locator("body").innerText()).includes("SYNTHETIC_PRIVATE_PARSE_DETAIL"), "raw recovery errors hidden");
      assert.equal((await db.mADocument.findUniqueOrThrow({ where: { id: stored.id } })).parsedText, null, "injected response calls no parser");
      await page.unroute(retryPattern);
      validationStage = "parse-recovery-query-after-error";
      await page.getByRole("button", { name: "추출 상태 조회", exact: true }).click();
      await page.getByRole("button", { name: "텍스트 추출 다시 시도", exact: true }).waitFor();
      const recoveryResponse = page.waitForResponse(response => new URL(response.url()).pathname === retryPath && response.request().method() === "POST" && response.status() === 200);
      validationStage = "parse-recovery-actual-post";
      await page.getByRole("button", { name: "텍스트 추출 다시 시도", exact: true }).click();
      const recovery = await recoveryResponse;
      validationStage = "parse-recovery-cache-header";
      assert.equal(recovery.headers()["cache-control"], "private, no-store, max-age=0");
      validationStage = "parse-recovery-nosniff-header";
      assert.equal(recovery.headers()["x-content-type-options"], "nosniff");
      validationStage = "parse-recovery-vary-header";
      assert((recovery.headers().vary ?? "").split(",").some(value => value.trim().toLowerCase() === "cookie"));
      validationStage = "parse-recovery-restored-text";
      await page.getByText("텍스트 추출을 확인했습니다.", { exact: false }).waitFor();
      await page.getByRole("button", { name: "파싱 텍스트 보기", exact: true }).click();
      await page.getByTestId("document-source-text").waitFor();
      assert.equal(await page.getByTestId("document-source-text").innerText(), uploadBytes.toString());
      const reparsed = await db.mADocument.findUniqueOrThrow({ where: { id: stored.id } });
      validationStage = "parse-recovery-stored-result";
      assert.equal(reparsed.url, stored.url); assert.equal(reparsed.parsedText, uploadBytes.toString());
      assert.equal((reparsed.metadata as { __peUpload: { parseAttempts: number } }).__peUpload.parseAttempts, 1);
      assert.equal(recoveryPosts, 2, "one injected POST and one actual explicit recovery; status query never reposts");
      assert.deepEqual(Buffer.from(await (await get(`${documentsUrl}/${stored.id}/download`)).arrayBuffer()), uploadBytes, "recovery leaves original bytes unchanged");
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "parse recovery fits mobile");
      await page.screenshot({ path: `${dir}/parse-recovery-after-390.png` });
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.getByRole("button", { name: uploadName, exact: true }).click();
      validationStage = "parse-recovery-reopen";
      assert.equal(await page.getByRole("button", { name: "텍스트 추출 다시 시도", exact: true }).count(), 0, "reopening cached summary cannot immediately resend");
      await page.getByRole("button", { name: "추출 상태 조회", exact: true }).click();
      await page.getByText("텍스트 추출을 확인했습니다.", { exact: false }).waitFor();
      assert.equal(recoveryPosts, 2, "reopening uses GET to confirm completion, never POST replay");
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      console.log("PASS: explicit PE stored-source TXT parse recovery, original bytes preserved, safe summary, auth/read-only/body/origin guards, mobile");
      validationStage = "upload-api-idempotency";
      const operationId = randomUUID();
      const postUpload = (auth: string, bytes = uploadBytes, uploadId = operationId) => {
        const body = new FormData(); body.append("file", new Blob([new Uint8Array(bytes)], { type: "text/plain" }), "API 재전송 합성 자료.txt");
        body.append("type", "OTHER"); body.append("uploadId", uploadId);
        return fetch(`${base}${documentsUrl}`, { method: "POST", headers: auth ? { Cookie: auth } : {}, body });
      };
      assert.equal((await postUpload("")).status, 401);
      const peerCookie = await login(peer.email);
      assert.equal((await postUpload(peerCookie)).status, 404, "shared ANALYST cannot upload; denied and missing share status");
      const outsidersCookie = await login(outsider.email);
      assert.equal((await postUpload(outsidersCookie)).status, 404, "other team cannot upload");
      const firstUpload = await postUpload(cookie);
      assert.equal(firstUpload.status, 201);
      const apiDocument = (await firstUpload.json()).data;
      const replay = await postUpload(cookie);
      assert.equal(replay.status, 200);
      assert.equal((await replay.json()).data.id, apiDocument.id, "same operation returns same document");
      assert.equal((await postUpload(cookie, Buffer.from("다른 합성 내용"))).status, 409, "same operation cannot replace original");
      assert.equal(await db.mADocument.count({ where: { id: apiDocument.id } }), 1);
      assert.equal((await db.mADocument.findUniqueOrThrow({ where: { id: apiDocument.id } })).parsedText, uploadBytes.toString());
      const status = await (await get(`${documentsUrl}?uploadId=${operationId}`)).json();
      assert.equal(status.data.status, "ready"); assert.equal(status.data.id, apiDocument.id);
      validationStage = "upload-api-race-and-size";
      const concurrentId = randomUUID();
      const racers = await Promise.all([postUpload(cookie, uploadBytes, concurrentId), postUpload(cookie, uploadBytes, concurrentId)]);
      assert.equal(racers.filter(response => response.status === 201).length, 1, "only one request reserves concurrent operation");
      assert(racers.every(response => [200, 201, 202].includes(response.status)), "concurrent replay is pending or complete");
      const racedStatus = await (await get(`${documentsUrl}?uploadId=${concurrentId}`)).json();
      assert.equal(racedStatus.data.status, "ready");
      assert.equal(await db.mADocument.count({ where: { id: racedStatus.data.id } }), 1);
      const documentsBeforeOversize = await db.mADocument.count({ where: { maDealId: deal.id } });
      assert.equal((await postUpload(cookie, Buffer.alloc(4 * 1024 * 1024 + 1, 65), randomUUID())).status, 413);
      assert.equal(await db.mADocument.count({ where: { maDealId: deal.id } }), documentsBeforeOversize, "oversize request creates no document");
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "upload has no mobile page overflow");
      await page.screenshot({ path: `${dir}/upload-after-390.png` });
      console.log("PASS: actual private PE upload/parse/protected download/reconnect, upload success vs GET500, API auth/read-only/mismatch/idempotent replay; synthetic fixtures only");
      validationStage = "dart-uncertainty";
      const privateMarker = "SYNTHETIC_PRIVATE_MUTATION_DETAIL";
      const dartPattern = `**/api/ma-deals/${deal.id}/dart/import`;
      let dartPosts = 0;
      await page.route(dartPattern, route => {
        dartPosts++;
        return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: privateMarker }) });
      });
      const periodsBeforeDart = await db.mAFinancialPeriod.count({ where: { maDealId: deal.id } });
      await page.getByRole("tab", { name: "DART", exact: true }).click();
      await page.getByRole("button", { name: "DART에서 가져오기", exact: true }).click();
      await page.getByTestId("pe-dart-import-error").waitFor();
      assert(!(await page.locator("body").innerText()).includes(privateMarker), "DART failure raw detail hidden");
      assert(await page.getByRole("button", { name: "DART에서 가져오기", exact: true }).isDisabled(), "uncertain import not repeated");
      const dartRead = page.waitForResponse(response => new URL(response.url()).pathname === `/api/ma-deals/${deal.id}/financials` && response.request().method() === "GET" && response.status() === 200);
      await page.getByRole("button", { name: "DART 결과 목록 조회", exact: true }).click();
      await dartRead;
      assert.equal(dartPosts, 1);
      assert.equal(await db.mAFinancialPeriod.count({ where: { maDealId: deal.id } }), periodsBeforeDart, "fault injection did not call actual provider/save");
      assert(await page.getByRole("button", { name: "DART에서 가져오기", exact: true }).isDisabled(), "read success does not prove import or unlock automatic mutation");
      validationStage = "status-uncertainty";
      const dealPattern = `**/api/ma-deals/${deal.id}`;
      let statusPatches = 0;
      page.on("request", request => { if (new URL(request.url()).pathname === `/api/ma-deals/${deal.id}` && request.method() === "PATCH") statusPatches++; });
      await page.route(dealPattern, route => route.request().method() === "PATCH"
        ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: privateMarker }) }) : route.fallback());
      await page.getByRole("button", { name: "딜 보관", exact: true }).click();
      await page.getByRole("button", { name: "딜 상태 다시 조회", exact: true }).waitFor();
      assert(!(await page.locator("body").innerText()).includes(privateMarker), "status failure raw detail hidden");
      assert.equal((await db.mADeal.findUniqueOrThrow({ where: { id: deal.id } })).status, "ACTIVE");
      await page.unroute(dealPattern);
      const statusRead = page.waitForResponse(response => new URL(response.url()).pathname === `/api/ma-deals/${deal.id}` && response.request().method() === "GET" && response.status() === 200);
      await page.getByRole("button", { name: "딜 상태 다시 조회", exact: true }).click();
      await statusRead;
      await page.getByRole("button", { name: "딜 상태 다시 조회", exact: true }).waitFor({ state: "hidden" });
      assert.equal(statusPatches, 1, "state recovery is GET only");
      validationStage = "status-confirmed";
      const statusSaved = page.waitForResponse(response => new URL(response.url()).pathname === `/api/ma-deals/${deal.id}` && response.request().method() === "PATCH" && response.status() === 200);
      await page.getByRole("button", { name: "딜 보관", exact: true }).click();
      await statusSaved;
      await page.getByRole("button", { name: "다시 활성화", exact: true }).waitFor();
      assert.equal((await db.mADeal.findUniqueOrThrow({ where: { id: deal.id } })).status, "ARCHIVED");
      assert.equal(statusPatches, 2, "one injected failure and one explicit confirmed change");
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mutation errors fit mobile viewport");
      console.log("PASS: DART injected POST500 uncertain hold/GET-only state check/provider0; status injected PATCH500/actual GET recovery/explicit actual PATCH200 ARCHIVED; raw errors hidden");
    }
    assert.deepEqual(errors, []);
    console.log(`PASS: ${before ? "before" : "after"} desktop/mobile, dialog, XSS, paging, focus, no page errors`);
  } finally {
    try {
      await browser?.close();
    } finally {
      try {
        const uploaded = users.length ? await db.mADocument.findMany({ where: { maDeal: { userId: { in: users } } }, select: { url: true } }) : [];
        const fixtureRoot = pathModule.resolve(process.cwd(), ".e2e-uploads");
        for (const row of uploaded) {
          if (!row.url.startsWith("private-local:")) continue;
          const target = pathModule.resolve(fixtureRoot, row.url.slice(14).replace(/\//g, "_"));
          assert(target.startsWith(fixtureRoot + pathModule.sep), "cleanup confined to isolated fixture folder");
          await unlink(target).catch(error => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; });
        }
        await db.$transaction(async tx => {
          if (users.length) {
            await tx.mADeal.deleteMany({ where: { userId: { in: users } } });
            await tx.user.deleteMany({ where: { id: { in: users } } });
          }
          if (teamId) await tx.team.deleteMany({ where: { id: teamId } });
        });
        if (users.length) {
          assert.equal(await db.user.count({ where: { id: { in: users } } }), 0, "fixture users cleaned");
          assert.equal(await db.mADeal.count({ where: { userId: { in: users } } }), 0, "fixture deals cleaned");
        }
        if (teamId) assert.equal(await db.team.count({ where: { id: teamId } }), 0, "fixture team cleaned");
        console.log("PASS: generated synthetic fixture users/deals/team cleanup verified");
      } finally {
        await db.$disconnect();
      }
    }
  }
}
main().catch(() => { console.error(`PE_DOCUMENT_TEXT_E2E_FAILED: stage=${validationStage}; private details withheld; verify fixture cleanup.`); process.exitCode = 1; });
