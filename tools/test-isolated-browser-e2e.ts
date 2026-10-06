/** Real browser login + small local uploads/downloads/export. Dedicated test DB only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { Document as WordDocument, Packer, Paragraph, HeadingLevel } from "docx";
import JSZip from "jszip";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { assertE2ETarget, assertNoExternalE2ECredentials, assertCleanE2EWorkspace, chromiumLaunchOptions } from "./helpers/e2e-environment";
import { reportReviewVersion } from "../src/lib/report-review-version";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
let stage = "preflight";
function assertExportPrivacy(response: import("playwright").APIResponse) {
  assert.equal(response.headers()["cache-control"], "private, no-store, max-age=0");
  assert(response.headers()["vary"]?.split(",").some(value => value.trim().toLowerCase() === "cookie"));
  assert.equal(response.headers()["x-content-type-options"], "nosniff");
}

async function main() {
  assertE2ETarget(base);
  assertNoExternalE2ECredentials();
  assertCleanE2EWorkspace();
  assert(existsSync(path.join(process.cwd(), "postcss.config.mjs")), "browser validation requires the PostCSS configuration");
  assert.equal(process.env.STORAGE_MODE, "local");
  assert.equal(process.env.UPLOAD_DIR, "./.e2e-uploads");
  const { uploadFile, deleteStoredFile, safeStorageKey } = await import("../src/lib/storage");
  const db = new PrismaClient({ log: [] });
  const prefix = `e2e-browser-${randomUUID()}`;
  const password = randomUUID() + "aA1!";
  const userIds: string[] = [];
  const vcIds: string[] = [];
  const peIds: string[] = [];
  const storedFiles: string[] = [];
  let teamId: string | undefined;
  let browser: Browser | undefined;
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  const externalRequests: string[] = [];
  const fixtureIps: string[] = [];
  const registeredEmail = `${prefix}-registered@example.com`;
  const fixtureName = `${prefix}.txt`;
  const fixtureBytes = Buffer.from(`Synthetic investment due diligence document ${prefix}. Revenue is a fixture; this contains no customer data.`, "utf8");
  async function newContext() {
    // Dedicated loopback fixture headers keep repeated test runs out of each other's registration limits.
    const fixtureIp = `2001:db8:7:${prefix.slice(-4)}::${contexts.length + 1}`;
    fixtureIps.push(fixtureIp);
    const context = await browser!.newContext({ serviceWorkers: "block", acceptDownloads: true, viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": fixtureIp } });
    contexts.push(context);
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin === base) return route.continue();
      // No third-party browser calls, including analytics, fonts, and providers.
      externalRequests.push(url.hostname);
      return route.abort();
    });
    return context;
  }
  function observe(page: Page) { page.on("pageerror", error => errors.push(error.name)); }
  async function assertCompiledStyles(page: Page) {
    const styles = await page.evaluate(() => ({ margin: getComputedStyle(document.body).margin, boxSizing: getComputedStyle(document.body).boxSizing }));
    assert.equal(styles.margin, "0px", "compiled stylesheet resets body margin");
    assert.equal(styles.boxSizing, "border-box", "compiled stylesheet applies border-box sizing");
  }
  async function assertMobileFits(page: Page, message: string) {
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    if (!fits) {
      // Only the explicitly guarded disposable fixture browser reaches this helper.
      // Geometry excludes text, IDs, links, input values and all session information.
      const geometry = await page.evaluate(() => Array.from(document.querySelectorAll("*")).map(element => {
        const rect = element.getBoundingClientRect(); return { tag: element.tagName, class: typeof element.className === "string" ? element.className.slice(0, 180) : "", width: Math.round(rect.width), left: Math.round(rect.left), right: Math.round(rect.right) };
      }).filter(rect => rect.width > 0 && (rect.right > window.innerWidth + 1 || rect.left < -1)).slice(0, 24));
      const artifactDir = path.resolve(process.cwd(), ".e2e-artifacts"); await mkdir(artifactDir, { recursive: true });
      await page.screenshot({ path: path.join(artifactDir, "mobile-overflow.png"), fullPage: true });
      console.error(JSON.stringify({ diagnostic: "SYNTHETIC_MOBILE_OVERFLOW", geometry, screenshot: ".e2e-artifacts/mobile-overflow.png" }));
    }
    assert(fits, message);
  }
  async function login(context: BrowserContext, email: string, id: string) {
    stage = "browser login/dashboard";
    const page = await context.newPage();
    observe(page);
    await page.goto(`${base}/login`, { waitUntil: "networkidle" });
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForURL(`${base}/dashboard`, { timeout: 60000 });
    await page.locator('[data-app-ready="true"]').waitFor({ timeout: 60000 });
    await assertCompiledStyles(page);
    const session = await (await context.request.get(`${base}/api/auth/session`)).json();
    assert.equal(session.user?.id, id, "browser login uses the seeded identity");
    return page;
  }
  async function downloadedBytes(page: Page, link: string, button = false) {
    const pending = page.waitForEvent("download");
    if (button) await page.getByRole("button", { name: link, exact: true }).click();
    else await page.locator(link).click();
    const download = await pending;
    assert.equal(await download.failure(), null);
    const stream = await download.createReadStream();
    assert(stream);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  try {
    const team = await db.team.create({ data: { name: prefix } });
    teamId = team.id;
    const passwordHash = await bcrypt.hash(password, 4);
    const actors = {} as Record<"owner" | "analyst" | "partner" | "outsider", { id: string; email: string }>;
    for (const kind of ["owner", "analyst", "partner", "outsider"] as const) {
      const user = await db.user.create({ data: {
        email: `${prefix}-${kind}@example.com`, name: `${prefix}-${kind}`, passwordHash,
        teamId: kind === "outsider" ? null : team.id, role: kind === "partner" ? "PARTNER" : "ANALYST",
        subscriptionPlan: "FULL", subscriptionStatus: "ACTIVE",
      } });
      userIds.push(user.id);
      actors[kind] = { id: user.id, email: user.email! };
    }
    const owner = actors.owner;
    await db.team.update({ where: { id: team.id }, data: { ownerUserId: owner.id } });
    const vc = await db.deal.create({ data: { name: prefix, companyName: prefix, sector: "GENERAL", userId: owner.id, teamId: team.id } });
    vcIds.push(vc.id);
    const peFile = await uploadFile(fixtureBytes, `${prefix}/pe.txt`, "text/plain");
    storedFiles.push(peFile);
    const pe = await db.mADeal.create({ data: {
      name: prefix, companyName: prefix, dealType: "BUYOUT", userId: owner.id, teamId: team.id,
      documents: { create: { name: fixtureName, type: "DD_MATERIAL", url: peFile, size: fixtureBytes.length, mimeType: "text/plain" } },
    } });
    peIds.push(pe.id);
    const peDocument = await db.mADocument.findFirstOrThrow({ where: { maDealId: pe.id } });
    browser = await chromium.launch(chromiumLaunchOptions());
    stage = "mobile registration and automatic login";
    const registeredContext = await newContext();
    const registeredPage = await registeredContext.newPage();
    observe(registeredPage);
    await registeredPage.setViewportSize({ width: 390, height: 844 });
    await registeredPage.goto(`${base}/register?track=vc`, { waitUntil: "networkidle" });
    await registeredPage.locator("#name").fill("합성 검증 사용자");
    await registeredPage.locator("#email").fill(registeredEmail);
    await registeredPage.locator("#password").fill(password);
    await registeredPage.locator("#confirmPassword").fill(password);
    await registeredPage.getByRole("button", { name: "무료로 시작하기", exact: true }).click();
    await registeredPage.waitForURL(`${base}/dashboard`, { timeout: 60000 });
    await registeredPage.locator('[data-app-ready="true"]').waitFor({ timeout: 60000 });
    await assertCompiledStyles(registeredPage);
    const registered = await db.user.findUniqueOrThrow({ where: { email: registeredEmail } });
    userIds.push(registered.id);
    assert.equal(registered.subscriptionPlan, "FREE");
    const registeredSession = await (await registeredContext.request.get(`${base}/api/auth/session`)).json();
    assert.equal(registeredSession.user?.id, registered.id);
    await registeredPage.reload({ waitUntil: "networkidle" });
    await registeredPage.locator('[data-app-ready="true"]').waitFor();
    assert.equal(new URL(registeredPage.url()).pathname, "/dashboard", "mobile reload keeps login");
    await assertMobileFits(registeredPage, "mobile dashboard fits viewport");
    await mkdir(path.join(process.cwd(), ".e2e-artifacts"), { recursive: true });
    await registeredPage.screenshot({ path: path.join(process.cwd(), ".e2e-artifacts/mobile-onboarding.png"), fullPage: true });
    stage = "mobile keyboard first-deal CTA and required sector validation";
    const firstDealButton = registeredPage.getByRole("button", { name: "첫 VC 딜 만들기", exact: true });
    await firstDealButton.focus(); await registeredPage.keyboard.press("Enter");
    const firstDealDialog = registeredPage.getByRole("dialog"); await firstDealDialog.waitFor();
    await assertMobileFits(registeredPage, "mobile onboarding dialog fits viewport");
    const mobileDealName = `${prefix}-mobile-first`;
    await firstDealDialog.locator("#companyName").fill(mobileDealName); await firstDealDialog.locator("#name").fill(mobileDealName);
    await firstDealDialog.getByRole("button", { name: "딜 등록", exact: true }).click();
    const sector = firstDealDialog.getByRole("combobox"); await firstDealDialog.locator('[role="combobox"][aria-invalid="true"]').waitFor(); assert.equal(await sector.getAttribute("aria-invalid"), "true");
    assert(await sector.evaluate(element => element === document.activeElement), "invalid sector receives keyboard focus");
    await sector.click(); await registeredPage.getByRole("option", { name: "📁 일반", exact: true }).click();
    const mobileCreateResponse = registeredPage.waitForResponse(response => response.url() === `${base}/api/deals` && response.request().method() === "POST");
    await firstDealDialog.getByRole("button", { name: "딜 등록", exact: true }).click();
    const createdMobile = await mobileCreateResponse; assert.equal(createdMobile.status(), 201); const mobileDeal = (await createdMobile.json()).data; vcIds.push(mobileDeal.id);
    await registeredPage.waitForURL(`${base}/deals/${mobileDeal.id}`); await registeredPage.locator('[data-app-ready="true"]').waitFor();
    assert.equal((await db.deal.findUniqueOrThrow({ where: { id: mobileDeal.id } })).userId, registered.id);
    stage = "mobile invalid upload has visible rejection and no request or document";
    let mobileUploadRequests = 0; registeredPage.on("request", request => { if (request.url() === `${base}/api/upload` && request.method() === "POST") mobileUploadRequests++; });
    await registeredPage.locator('input[type="file"]').setInputFiles({ name: `${prefix}.exe`, mimeType: "application/x-msdownload", buffer: Buffer.from("Synthetic rejected file") });
    await registeredPage.getByRole("alert").filter({ hasText: "지원하지 않는 파일 형식" }).waitFor();
    assert.equal(mobileUploadRequests, 0); assert.equal(await db.document.count({ where: { dealId: mobileDeal.id } }), 0);
    const mobileUploadResponse = registeredPage.waitForResponse(response => response.url() === `${base}/api/upload` && response.request().method() === "POST");
    await registeredPage.locator('input[type="file"]').setInputFiles({ name: fixtureName, mimeType: "text/plain", buffer: fixtureBytes });
    const mobileUploaded = await mobileUploadResponse; assert.equal(mobileUploaded.status(), 201); const mobileDocument = (await mobileUploaded.json()).data;
    storedFiles.push((await db.document.findUniqueOrThrow({ where: { id: mobileDocument.id } })).url);
    await registeredPage.locator(`a[href="/api/documents/${mobileDocument.id}/download"]`).waitFor();
    stage = "mobile score read failure and GET-only recovery (injected response)";
    const scoreReadUrl = `${base}/api/deals/${mobileDeal.id}/score`;
    await registeredPage.route(scoreReadUrl, route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Synthetic unavailable" }) }));
    await registeredPage.reload({ waitUntil: "networkidle" });
    await registeredPage.getByRole("tab", { name: "투자 매력도", exact: true }).click();
    await registeredPage.getByRole("alert").filter({ hasText: "점수를 불러오지 못했습니다" }).waitFor();
    await registeredPage.unroute(scoreReadUrl);
    const scoreRetry = registeredPage.waitForResponse(response => response.url() === scoreReadUrl && response.request().method() === "GET");
    await registeredPage.getByRole("button", { name: "점수 다시 조회", exact: true }).click();
    assert.equal((await scoreRetry).status(), 200);
    await registeredPage.getByRole("button", { name: "점수 다시 조회", exact: true }).waitFor({ state: "detached" });
    await registeredPage.getByRole("tab", { name: /^문서/ }).click();
    stage = "detail template GET error recovery and explicit sector failure (injected responses)";
    const templateReadUrl = `${base}/api/templates`;
    await registeredPage.route(templateReadUrl, route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Synthetic unavailable" }) }));
    await registeredPage.reload({ waitUntil: "networkidle" });
    await registeredPage.getByTestId("detail-template-error").waitFor();
    await registeredPage.unroute(templateReadUrl);
    const detailTemplateRetry = registeredPage.waitForResponse(response => response.url() === templateReadUrl && response.request().method() === "GET");
    await registeredPage.getByTestId("detail-template-error").getByRole("button", { name: "양식 목록 다시 조회", exact: true }).click();
    assert.equal((await detailTemplateRetry).status(), 200);
    await registeredPage.getByTestId("detail-template-error").waitFor({ state: "detached" });
    const sectorUrl = `${base}/api/deals/${mobileDeal.id}/detect-sector`;
    let sectorAttempts = 0;
    await registeredPage.route(sectorUrl, route => { sectorAttempts++; return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Synthetic unavailable" }) }); });
    await registeredPage.getByRole("button", { name: "섹터 감지", exact: true }).click();
    await registeredPage.getByTestId("detail-sector-error").waitFor();
    assert.equal(sectorAttempts, 1);
    await registeredPage.route(templateReadUrl, route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Synthetic unavailable" }) }));
    stage = "mobile missing AI service produces visible 503 without report or quota admission";
    await registeredPage.getByRole("button", { name: "AI 보고서 생성", exact: true }).first().click();
    const generationDialog = registeredPage.getByRole("dialog");
    await generationDialog.getByRole("button", { name: "자동 감지", exact: true }).click();
    await generationDialog.getByTestId("wizard-sector-error").waitFor();
    assert.equal(sectorAttempts, 2);
    await registeredPage.unroute(sectorUrl);
    await generationDialog.getByRole("button", { name: "다음", exact: true }).click();
    await generationDialog.getByTestId("wizard-template-error").waitFor();
    await registeredPage.unroute(templateReadUrl);
    const wizardTemplateRetry = registeredPage.waitForResponse(response => response.url() === templateReadUrl && response.request().method() === "GET");
    await generationDialog.getByTestId("wizard-template-error").getByRole("button", { name: "양식 목록 다시 조회", exact: true }).click();
    assert.equal((await wizardTemplateRetry).status(), 200);
    await generationDialog.getByTestId("wizard-template-error").waitFor({ state: "detached" });
    stage = "wizard malformed create response stays uncertain without polling or duplicate POST (injected response)";
    const createReportUrl = `${base}/api/deals/${mobileDeal.id}/reports`;
    let createAttempts = 0, uncertainStatusReads = 0;
    registeredPage.on("request", request => { if (request.url().startsWith(`${base}/api/reports/`) && request.url().endsWith("/status")) uncertainStatusReads++; });
    await registeredPage.route(createReportUrl, route => {
      createAttempts++;
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ data: { id: "../unsafe?token=SYNTHETIC_PRIVATE_DETAIL" } }) });
    });
    await generationDialog.getByRole("button", { name: "생성 시작", exact: true }).click();
    await generationDialog.getByTestId("wizard-generation-error").waitFor();
    assert.equal(createAttempts, 1); assert.equal(uncertainStatusReads, 0);
    assert(!(await generationDialog.innerText()).includes("SYNTHETIC_PRIVATE_DETAIL"));
    assert.equal(await generationDialog.getByRole("button", { name: "생성 시작", exact: true }).count(), 0);
    await generationDialog.getByRole("button", { name: "딜 보고서 목록 확인", exact: true }).waitFor();
    assert.equal(await db.report.count({ where: { dealId: mobileDeal.id } }), 0);
    await registeredPage.unroute(createReportUrl);
    await registeredPage.keyboard.press("Escape"); await generationDialog.waitFor({ state: "detached" });
    await registeredPage.getByRole("button", { name: "AI 보고서 생성", exact: true }).first().click();
    await generationDialog.getByRole("button", { name: "다음", exact: true }).click();
    stage = "mobile missing AI service produces fixed 503 guidance without report or quota admission";
    const unavailableResponse = registeredPage.waitForResponse(response => response.url() === `${base}/api/deals/${mobileDeal.id}/reports` && response.request().method() === "POST");
    await generationDialog.getByRole("button", { name: "생성 시작", exact: true }).click();
    const unavailable = await unavailableResponse; assert.equal(unavailable.status(), 503); const unavailableMessage = (await unavailable.json()).error; assert.equal(typeof unavailableMessage, "string");
    await generationDialog.getByText(unavailableMessage, { exact: true }).waitFor();
    assert.equal(await db.report.count({ where: { dealId: mobileDeal.id } }), 0); assert.equal(await db.reportQuotaAdmission.count({ where: { userId: registered.id } }), 0);
    await registeredPage.keyboard.press("Escape"); await generationDialog.waitFor({ state: "detached" });
    stage = "mobile same-page deal deletion removes refreshed card";
    await registeredPage.goto(`${base}/deals`, { waitUntil: "networkidle" });
    stage = "mobile Kanban keyboard stage update and injected rejection";
    await registeredPage.getByRole("button", { name: "단계별 칸반", exact: true }).click();
    let stageSelect = registeredPage.getByRole("combobox", { name: `${mobileDealName} 검토 단계`, exact: true });
    await stageSelect.focus();
    assert(await stageSelect.evaluate(element => element === document.activeElement));
    const keyboardStageResponse = registeredPage.waitForResponse(response => response.url() === `${base}/api/deals/${mobileDeal.id}` && response.request().method() === "PATCH");
    await registeredPage.keyboard.press("ArrowDown"); await registeredPage.keyboard.press("Enter");
    assert.equal((await keyboardStageResponse).status(), 200);
    assert.equal((await db.deal.findUniqueOrThrow({ where: { id: mobileDeal.id } })).stage, "DEEP_DIVE");
    await registeredPage.getByRole("status").filter({ hasText: "검토 단계를 저장했습니다" }).waitFor();
    const stageUrl = `${base}/api/deals/${mobileDeal.id}`;
    await registeredPage.route(stageUrl, route => route.request().method() === "PATCH"
      ? route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Synthetic rejection" }) }) : route.continue());
    stageSelect = registeredPage.getByRole("combobox", { name: `${mobileDealName} 검토 단계`, exact: true });
    await stageSelect.selectOption("IC_PREP");
    await registeredPage.getByRole("alert").filter({ hasText: "단계 변경 결과를 확인하지 못했습니다" }).waitFor();
    assert.equal(await stageSelect.inputValue(), "DEEP_DIVE");
    assert.equal((await db.deal.findUniqueOrThrow({ where: { id: mobileDeal.id } })).stage, "DEEP_DIVE");
    await registeredPage.unroute(stageUrl);
    await assertMobileFits(registeredPage, "mobile Kanban uses internal horizontal scrolling");
    stage = "mobile same-page deal deletion removes refreshed card";
    await registeredPage.getByRole("button", { name: "카드", exact: true }).click();
    await registeredPage.locator(`a[href="/deals/${mobileDeal.id}"]`).first().waitFor();
    await registeredPage.getByRole("button", { name: "딜 삭제", exact: true }).click();
    const deletion = registeredPage.waitForResponse(response => response.url() === `${base}/api/deals/${mobileDeal.id}` && response.request().method() === "DELETE");
    await registeredPage.getByRole("alertdialog").getByRole("button", { name: "영구 삭제", exact: true }).click(); assert.equal((await deletion).status(), 200);
    await registeredPage.locator(`a[href="/deals/${mobileDeal.id}"]`).waitFor({ state: "detached" }); assert.equal(new URL(registeredPage.url()).pathname, "/deals");
    assert.equal(await db.deal.count({ where: { id: mobileDeal.id } }), 0);
    await registeredPage.goto(`${base}/dashboard`, { waitUntil: "networkidle" }); await registeredPage.locator('[data-app-ready="true"]').waitFor();
    stage = "mobile menu Escape restores keyboard focus";
    const menuTrigger = registeredPage.getByRole("button", { name: "메뉴 열기", exact: true }); await menuTrigger.focus(); await registeredPage.keyboard.press("Enter");
    await registeredPage.getByRole("dialog").waitFor(); await registeredPage.keyboard.press("Escape"); await registeredPage.getByRole("dialog").waitFor({ state: "detached" });
    assert(await menuTrigger.evaluate(element => element === document.activeElement));
    await registeredPage.getByRole("button", { name: "메뉴 열기", exact: true }).click();
    const mobileMenu = registeredPage.getByRole("dialog");
    await mobileMenu.getByRole("link", { name: "설정", exact: true }).click();
    await registeredPage.waitForURL(`${base}/settings`);
    await registeredPage.locator('[data-app-ready="true"]').waitFor();
    assert.equal(await registeredPage.getByRole("dialog").count(), 0, "mobile menu closes after navigation");
    await assertMobileFits(registeredPage, "mobile settings fits viewport");
    assert((await registeredPage.innerText("body")).includes("유료 구독 준비 중"), "unready billing is clearly held");
    const ownerContext = await newContext();
    const ownerPage = await login(ownerContext, owner.email, owner.id);
    assert((await ownerPage.innerText("body")).includes(prefix), "dashboard renders the owned synthetic deal");
    stage = "VC local upload/download";
    await ownerPage.goto(`${base}/deals/${vc.id}`, { waitUntil: "networkidle" });
    await ownerPage.locator('[data-app-ready="true"]').waitFor();
    const uploadResponse = ownerPage.waitForResponse(response => response.url() === `${base}/api/upload` && response.request().method() === "POST");
    await ownerPage.locator('input[type="file"]').setInputFiles({ name: fixtureName, mimeType: "text/plain", buffer: fixtureBytes });
    const uploaded = await uploadResponse;
    assert.equal(uploaded.status(), 201, "small local VC upload succeeds through the actual UI");
    const vcDocument = (await uploaded.json()).data;
    const persisted = await db.document.findUniqueOrThrow({ where: { id: vcDocument.id } });
    storedFiles.push(persisted.url);
    assert.equal(persisted.parsedText, fixtureBytes.toString(), "uploaded text was parsed and persisted");
    assert(!JSON.stringify(vcDocument).includes("private-local:"), "API never returns storage references");
    const vcDownload = `/api/documents/${vcDocument.id}/download`;
    await ownerPage.locator(`a[href="${vcDownload}"]`).waitFor({ timeout: 30000 });
    assert.deepEqual(await downloadedBytes(ownerPage, `a[href="${vcDownload}"]`), fixtureBytes, "browser link downloads the original VC upload");

    const templateBytes = await Packer.toBuffer(new WordDocument({ sections: [{ children: [
      new Paragraph({ text: "1. 투자개요", heading: HeadingLevel.HEADING_1 }),
      new Paragraph("Synthetic investment overview content for this template only."),
      new Paragraph({ text: "2. 재무현황", heading: HeadingLevel.HEADING_1 }),
      new Paragraph("Synthetic financial information for this template only."),
    ] }] }));
    const templateName = `${prefix}-template`;
    stage = "template local upload/parse/download";
    await ownerPage.goto(`${base}/templates`, { waitUntil: "networkidle" });
    await ownerPage.locator('[data-app-ready="true"]').waitFor();
    await ownerPage.locator('input[type="file"]').setInputFiles({ name: `${templateName}.docx`, mimeType: DOCX, buffer: templateBytes });
    await ownerPage.locator("#template-name").fill(templateName);
    const templateResponse = ownerPage.waitForResponse(response => response.url() === `${base}/api/templates` && response.request().method() === "POST");
    await ownerPage.getByRole("button", { name: "양식 업로드 및 분석", exact: true }).click();
    const templateUploaded = await templateResponse;
    assert.equal(templateUploaded.status(), 201, "small local template uploads through UI");
    const template = (await templateUploaded.json()).data;
    const started = Date.now();
    let savedTemplate = await db.template.findUniqueOrThrow({ where: { id: template.id } });
    storedFiles.push(savedTemplate.fileUrl);
    while (savedTemplate.status === "ANALYZING" && Date.now() - started < 30000) {
      await new Promise(resolve => setTimeout(resolve, 100));
      savedTemplate = await db.template.findUniqueOrThrow({ where: { id: template.id } });
    }
    assert.equal(savedTemplate.status, "READY", "template parsing and keyword mapping finish without AI");
    const templateDownload = `/api/templates/${template.id}/download`;
    await ownerPage.locator(`a[href="${templateDownload}"]`).waitFor();
    assert.deepEqual(await downloadedBytes(ownerPage, `a[href="${templateDownload}"]`), templateBytes);

    const report = await db.report.create({ data: {
      dealId: vc.id, templateId: template.id, title: prefix, agentType: "GENERAL", status: "FINAL",
      sections: { create: [
        { sectionKey: "INVESTMENT_OVERVIEW", title: "투자개요", content: `Synthetic export marker ${prefix}`, order: 0, status: "APPROVED" },
        { sectionKey: "FINANCIAL_STATUS", title: "재무현황", content: "Synthetic revenue 100; no real investment data.", order: 1, status: "APPROVED" },
      ] },
    } });
    stage = "template-based DOCX export";
    const exportResponse = await ownerContext.request.post(`${base}/api/reports/${report.id}/export/docx`);
    assertExportPrivacy(exportResponse);
    assert.equal(exportResponse.status(), 200, "authenticated template-based DOCX export succeeds");
    assert.match(exportResponse.headers()["x-export-mode"], /^reconstructed:/);
    const exportedZip = await JSZip.loadAsync(await exportResponse.body());
    const exportedXml = await exportedZip.file("word/document.xml")!.async("text");
    assert(exportedXml.includes(prefix), "export contains synthetic report content");
    const peDownload = `/api/ma-deals/${pe.id}/documents/${peDocument.id}/download`;
    assert.deepEqual(await (await ownerContext.request.get(`${base}${peDownload}`)).body(), fixtureBytes);

    stage = "VC and LP actual private export response matrix";
    const fund = await db.fund.create({ data: { name: `${prefix}-fund`, vintageYear: 2026, fundSize: 1, userId: owner.id, teamId: team.id } });
    const lp = await db.lpReport.create({ data: { fundId: fund.id, period: "2026-Q3", title: "합성 LP 보고서", content: `# 합성 검증\n${prefix}`, status: "FINAL" } });
    for (const endpoint of [`/api/reports/${report.id}/export/docx`, `/api/reports/${report.id}/export/pptx`, `/api/lp-report/${lp.id}/export?format=docx`, `/api/lp-report/${lp.id}/export?format=pptx`]) {
      const response = await ownerContext.request.post(`${base}${endpoint}`);
      assert.equal(response.status(), 200); assertExportPrivacy(response);
      assert((await response.body()).length > 100, "actual document bytes are returned");
    }
    const guestExport = await newContext();
    for (const endpoint of [`/api/reports/${report.id}/export/docx`, `/api/reports/${report.id}/export/pptx`, `/api/lp-report/${lp.id}/export?format=docx`, `/api/lp-report/${lp.id}/export?format=pptx`]) {
      const response = await guestExport.request.post(`${base}${endpoint}`);
      assert.equal(response.status(), 401); assertExportPrivacy(response);
    }
    for (const endpoint of ["/api/reports/synthetic-missing/export/docx", "/api/reports/synthetic-missing/export/pptx", "/api/lp-report/synthetic-missing/export?format=docx", "/api/lp-report/synthetic-missing/export?format=pptx"]) {
      const response = await ownerContext.request.post(`${base}${endpoint}`);
      assert.equal(response.status(), 404); assertExportPrivacy(response);
    }
    console.log("PASS actual VC/LP DOCX/PPTX private response headers, guest401 and missing404");
    const anon = await newContext();
    stage = "browser session authorization matrix";
    for (const path of [vcDownload, templateDownload, peDownload]) assert.equal((await anon.request.get(`${base}${path}`)).status(), 401);
    for (const kind of ["analyst", "partner", "outsider"] as const) {
      const context = await newContext();
      const page = await login(context, actors[kind].email, actors[kind].id);
      stage = `${kind} browser session authorization`;
      for (const path of [vcDownload, templateDownload, peDownload]) {
        // Template local upload is shared with the owner's team by the real endpoint.
        const response = await context.request.get(`${base}${path}`);
        assert.equal(response.status(), kind === "outsider" ? 404 : 200, `${kind} browser-session download scope`);
        if (kind !== "outsider") assert.equal(response.headers()["cache-control"], "private, no-store");
      }
      const exported = await context.request.post(`${base}/api/reports/${report.id}/export/docx`);
      assertExportPrivacy(exported);
      const lpExport = await context.request.post(`${base}/api/lp-report/${lp.id}/export?format=docx`);
      assert.equal(lpExport.status(), kind === "outsider" ? 404 : 200); assertExportPrivacy(lpExport);
      assert.equal(exported.status(), kind === "outsider" ? 404 : 200, `${kind} browser-session report export scope`);
      if (kind === "analyst") {
        await page.goto(`${base}/deals/${vc.id}`, { waitUntil: "networkidle" });
        assert.equal(await page.locator('input[type="file"]').count(), 0, "read-only shared-deal UI has no uploader");
      }
    }
    stage = "report editing and reviewed-body approval through UI";
    await ownerPage.setViewportSize({ width: 390, height: 844 });
    const questionsReadUrl = `${base}/api/reports/${report.id}/ic-questions`;
    await ownerPage.route(questionsReadUrl, route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Synthetic unavailable" }) }));
    await ownerPage.goto(`${base}/reports/${report.id}`, { waitUntil: "networkidle" });
    stage = "mobile IC question read failure and GET-only recovery (injected response)";
    await ownerPage.getByRole("alert").filter({ hasText: "IC 질문을 불러오지 못했습니다" }).waitFor();
    await ownerPage.unroute(questionsReadUrl);
    const questionRetry = ownerPage.waitForResponse(response => response.url() === questionsReadUrl && response.request().method() === "GET");
    await ownerPage.getByRole("button", { name: "IC 질문 다시 조회", exact: true }).click();
    assert.equal((await questionRetry).status(), 200);
    await ownerPage.getByRole("button", { name: "IC 질문 다시 조회", exact: true }).waitFor({ state: "detached" });
    stage = "report UI open edit";
    await ownerPage.getByRole("button", { name: "편집", exact: true }).first().click();
    let reviewedContent = `Synthetic edited browser report marker ${prefix}`;
    await ownerPage.locator("textarea").fill(reviewedContent);
    stage = "stale editor preserves user draft and newer saved body";
    const originalSection = await db.reportSection.findFirstOrThrow({ where: { reportId: report.id }, orderBy: { order: "asc" } });
    const missingVersion = await ownerContext.request.patch(`${base}/api/reports/${report.id}/sections`, {
      data: { sectionId: originalSection.id, content: "Synthetic missing-version attempt" },
    });
    assert.equal(missingVersion.status(), 400);
    assert.equal((await db.reportSection.findUniqueOrThrow({ where: { id: originalSection.id } })).content, originalSection.content);
    const otherContent = `Synthetic concurrent saved body ${prefix}`;
    const competingSave = await ownerContext.request.patch(`${base}/api/reports/${report.id}/sections`, {
      data: { sectionId: originalSection.id, content: otherContent, expectedReviewVersion: await reportReviewVersion([originalSection]) },
    });
    assert.equal(competingSave.status(), 200);
    const staleResponse = ownerPage.waitForResponse(response => response.url() === `${base}/api/reports/${report.id}/sections` && response.request().method() === "PATCH");
    await ownerPage.getByRole("button", { name: "저장", exact: true }).click();
    assert.equal((await staleResponse).status(), 409);
    assert.equal(await ownerPage.locator("textarea").inputValue(), reviewedContent, "conflict preserves local draft");
    assert.equal((await db.reportSection.findUniqueOrThrow({ where: { id: originalSection.id } })).content, otherContent, "stale edit cannot overwrite newer body");
    // The draft was checked above; explicitly reload to review the current body before saving.
    await ownerPage.reload({ waitUntil: "networkidle" });
    await ownerPage.getByRole("button", { name: "편집", exact: true }).first().click();
    await ownerPage.locator("textarea").fill(reviewedContent);
    stage = "report UI save edit";
    const savedResponse = ownerPage.waitForResponse(response => response.url() === `${base}/api/reports/${report.id}/sections` && response.request().method() === "PATCH");
    await ownerPage.getByRole("button", { name: "저장", exact: true }).click();
    assert.equal((await savedResponse).status(), 200);
    await ownerPage.getByText(reviewedContent, { exact: false }).first().waitFor();
    stage = "mocked regeneration output with real local save and parent finalize synchronization";
    const regenUrl = `${base}/api/reports/${report.id}/sections/regenerate`;
    const regeneratedContent = `Synthetic regenerated browser report marker ${prefix}`;
    let regenerated = false;
    await ownerPage.route(regenUrl, async route => {
      const current = await db.reportSection.findUniqueOrThrow({ where: { id: originalSection.id } });
      const changed = await ownerContext.request.patch(`${base}/api/reports/${report.id}/sections`, {
        data: { sectionId: current.id, content: regeneratedContent, expectedReviewVersion: await reportReviewVersion([current]) },
      });
      assert.equal(changed.status(), 200);
      const section = (await changed.json()).data;
      regenerated = true;
      // Explicit mock at the AI boundary; the database edit and subsequent approvals are real.
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { section, quality: { score: 80 } } }) });
    });
    await ownerPage.locator('button[title="이 섹션만 AI 재생성"]').first().click();
    await ownerPage.getByRole("alertdialog").getByRole("button", { name: "재생성", exact: true }).click();
    await ownerPage.getByText(regeneratedContent, { exact: false }).first().waitFor();
    assert.equal(regenerated, true);
    await ownerPage.unroute(regenUrl);
    reviewedContent = regeneratedContent;
    stage = "report UI approval controls";
    await ownerPage.getByRole("button", { name: "전체 승인", exact: true }).waitFor();
    const approvalResponse = ownerPage.waitForResponse(response => response.url() === `${base}/api/reports/${report.id}` && response.request().method() === "PATCH");
    await ownerPage.getByRole("button", { name: "전체 승인", exact: true }).click();
    assert.equal((await approvalResponse).status(), 200, "browser computes the exact reviewed content version");
    stage = "report UI finalize";
    const finalResponse = ownerPage.waitForResponse(response => response.url() === `${base}/api/reports/${report.id}` && response.request().method() === "PATCH");
    const finalNavigation = ownerPage.waitForEvent("framenavigated", { predicate: frame => frame === ownerPage.mainFrame() });
    await ownerPage.getByRole("button", { name: "보고서 완성", exact: true }).click();
    assert.equal((await finalResponse).status(), 200);
    await finalNavigation;
    await ownerPage.waitForLoadState("domcontentloaded");
    await ownerPage.locator('[data-app-ready="true"]').waitFor();
    assert.equal((await db.report.findUniqueOrThrow({ where: { id: report.id } })).status, "FINAL");
    stage = "report UI reload edited content";
    await ownerPage.reload({ waitUntil: "domcontentloaded" });
    await ownerPage.locator('[data-app-ready="true"]').waitFor();
    stage = "report UI persisted edited content";
    await ownerPage.getByText(reviewedContent, { exact: false }).first().waitFor();
    assert((await ownerPage.innerText("body")).includes(reviewedContent), "edited report survives a real browser reload");
    await assertMobileFits(ownerPage, "mobile report fits viewport");
    await ownerPage.screenshot({ path: path.join(process.cwd(), ".e2e-artifacts/mobile-report.png"), fullPage: true });
    stage = "mobile report actual UI DOCX and PPTX downloads";
    const uiDocx = await JSZip.loadAsync(await downloadedBytes(ownerPage, "DOCX", true));
    assert((await uiDocx.file("word/document.xml")!.async("text")).includes(prefix));
    const uiPptx = await JSZip.loadAsync(await downloadedBytes(ownerPage, "PPTX", true));
    const slideXml = await Promise.all(Object.values(uiPptx.files).filter(file => /^ppt\/slides\/slide\d+\.xml$/.test(file.name)).map(file => file.async("text")));
    assert(slideXml.join("").includes(prefix), "UI PPTX contains seeded, edited synthetic report content");
    stage = "comparison read failure and GET-only recovery (injected response)";
    const comparisonRoute = "**/api/deals/score/compare?*";
    await ownerPage.route(comparisonRoute, route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Synthetic unavailable" }) }));
    await ownerPage.goto(`${base}/deals/compare?ids=${vc.id}`, { waitUntil: "networkidle" });
    await ownerPage.getByRole("alert").filter({ hasText: "비교 데이터를 불러오지 못했습니다" }).waitFor();
    await ownerPage.unroute(comparisonRoute);
    const comparisonRetry = ownerPage.waitForResponse(response => response.url().includes("/api/deals/score/compare?") && response.request().method() === "GET");
    await ownerPage.getByRole("button", { name: "비교 다시 조회", exact: true }).click();
    assert.equal((await comparisonRetry).status(), 200);
    await ownerPage.getByRole("button", { name: "비교 다시 조회", exact: true }).waitFor({ state: "detached" });
    await ownerPage.setViewportSize({ width: 1280, height: 900 });
    stage = "team invitation consent through mobile settings";
    await ownerPage.goto(`${base}/settings`, { waitUntil: "networkidle" });
    await ownerPage.locator("#invite-email").fill(registeredEmail);
    const invitationResponse = ownerPage.waitForResponse(response => response.url() === `${base}/api/team/members` && response.request().method() === "POST");
    await ownerPage.getByRole("button", { name: "초대", exact: true }).click();
    assert.equal((await invitationResponse).status(), 201);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: registered.id } })).teamId, null, "invitation does not silently join recipient");
    await registeredPage.reload({ waitUntil: "networkidle" });
    await registeredPage.getByRole("button", { name: "수락", exact: true }).click();
    await registeredPage.getByRole("button", { name: "수락", exact: true }).waitFor({ state: "detached" });
    const joined = await db.user.findUniqueOrThrow({ where: { id: registered.id } });
    assert.equal(joined.teamId, team.id);
    assert.equal(joined.teamRole, "ANALYST");
    assert.equal(joined.subscriptionPlan, "FREE", "team acceptance preserves personal billing plan");
    stage = "team ownership transfer through settings confirmation";
    await ownerPage.reload({ waitUntil: "networkidle" });
    await ownerPage.locator("#team-successor").selectOption(actors.partner.id);
    await ownerPage.getByRole("button", { name: "소유권 이전", exact: true }).click();
    await ownerPage.getByRole("alertdialog").getByRole("button", { name: "소유권 이전", exact: true }).click();
    await ownerPage.locator("#team-successor").waitFor({ state: "detached" });
    assert.equal((await db.team.findUniqueOrThrow({ where: { id: team.id } })).ownerUserId, actors.partner.id);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).role, "ANALYST", "ownership transfer preserves account role");
    assert.deepEqual(errors, [], "browser pages have no unhandled JavaScript errors");
    console.log(`Isolated browser mobile first-deal/sector validation/upload rejection/missing-AI hold/deletion/keyboard/report edit-reload-DOCX-PPTX, signup/session, team consent and local download matrix passed; external requests blocked: ${externalRequests.length}. Actual AI generation quality is unverified.`);
  } finally {
    try {
      await Promise.allSettled([...contexts.map(context => context.close()), browser?.close()]);
    } finally {
    try {
      // Discover any local upload created before a failed response assertion as well.
      const registeredForCleanup = await db.user.findUnique({ where: { email: registeredEmail }, select: { id: true } });
      if (registeredForCleanup && !userIds.includes(registeredForCleanup.id)) userIds.push(registeredForCleanup.id);
      const docs = await db.document.findMany({ where: { dealId: { in: vcIds } }, select: { url: true } });
      const templates = await db.template.findMany({ where: { userId: { in: userIds } }, select: { fileUrl: true } });
      const refs = new Set([...storedFiles, ...docs.map(doc => doc.url), ...templates.map(template => template.fileUrl)]);
      for (const ref of refs) assert(ref.startsWith("private-local:"), "synthetic fixture cleanup must be local only");
      const localFixturePath = (ref: string) => path.join(path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./.private-uploads"), safeStorageKey(ref.slice(14)).replace(/\//g, "_"));
      // The UI deletion already removes its upload; cleanup must verify absence without deleting it twice.
      const removals = await Promise.allSettled([...refs].filter(ref => existsSync(localFixturePath(ref))).map(ref => deleteStoredFile(ref)));
      if (teamId) await db.team.update({ where: { id: teamId }, data: { ownerUserId: null } });
      await db.$transaction([
        db.deal.deleteMany({ where: { id: { in: vcIds } } }), db.mADeal.deleteMany({ where: { id: { in: peIds } } }),
        db.template.deleteMany({ where: { userId: { in: userIds } } }), db.user.deleteMany({ where: { id: { in: userIds } } }),
        db.team.deleteMany({ where: { id: { in: teamId ? [teamId] : [] } } }),
        db.rateLimit.deleteMany({ where: { key: { in: [...fixtureIps.flatMap(ip => [`register:${ip}`, `login:${ip}`]), ...userIds.map(id => `report-gen:${id}`)] } } }),
      ]);
      assert(removals.every(result => result.status === "fulfilled" && result.value), "synthetic fixture cleanup must succeed");
      assert([...refs].every(ref => !existsSync(localFixturePath(ref))), "all synthetic fixture files must be absent after cleanup");
    } finally { await db.$disconnect(); }
    }
  }
}
main().catch(error => { console.error(`Browser regression stage: ${stage}`); console.error(error instanceof assert.AssertionError ? error.message : `Isolated browser regression failed (${error instanceof Error && error.name === "TimeoutError" ? "timeout" : "runtime"}); no credentials logged.`); process.exitCode = 1; });
