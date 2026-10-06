/**
 * PE Production Readiness(PR #112) — 브라우저 E2E.
 *
 * 이 PR이 실제로 바꾼 것만 새로 검증한다(PR #111의 stale/재검토 전체
 * 사이클은 이미 tools/test-pe-ic-audit-e2e.ts가 검증했으므로 여기서
 * 다시 처음부터 반복하지 않는다 — 대신 그 사이클이 이번 변경 이후에도
 * 회귀 없이 동작하는지 축약된 형태로 재확인한다):
 *
 * 1. (신규) 재무 데이터에 모순(factConflict)이 있을 때, Overview/IC
 *    의사결정/위원회 자료 3개 탭 전부에서 핵심 재무 지표 카드에 경고
 *    배지가 뜨는가(§34에서 발견해 고친 gap).
 * 2. (신규) Data Room 문서 목록이 select 축소 이후에도 정상 렌더되는가.
 * 3. (회귀) 검토 완료 → 재검토 전체 사이클이 여전히 정상 동작하는가(축약).
 *
 * Usage:
 *   configure isolated PostgreSQL dealmind_test + matching TEST_DATABASE_URL
 *   start a clean loopback test app against that database          # 다른 터미널에서 서버 실행 후
 *   npm run test:pe-production-readiness-e2e
 */
import { chromium, type Browser, type BrowserContext } from "playwright";
import { createPEBrowserActor } from "./helpers/pe-browser-actor";
import { assertE2ETarget, assertNoExternalE2ECredentials, assertCleanE2EWorkspace, chromiumLaunchOptions } from "./helpers/e2e-environment";

const BASE = (process.argv[2] ?? process.env.E2E_TEST_URL ?? "http://localhost:3000").replace(/\/$/, "");
let stage = "environment";

async function restrictNetwork(context: BrowserContext) {
  const origin = new URL(BASE).origin;
  await context.route("**/*", async route => {
    let allowed = false;
    try { allowed = new URL(route.request().url()).origin === origin; } catch { /* refuse malformed URLs */ }
    if (allowed && new URL(route.request().url()).pathname === "/_vercel/speed-insights/script.js") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "/* Explicit isolated telemetry stub; no collection. */" });
      return;
    }
    if (allowed) await route.continue();
    else await route.abort("blockedbyclient");
  });
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
}

async function main() {
  assertE2ETarget(BASE);
  assertNoExternalE2ECredentials();
  assertCleanE2EWorkspace();
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ log: [] });
  let actor: Awaited<ReturnType<typeof createPEBrowserActor>> | undefined;
  let dealId: string | undefined;
  let browser: Browser | undefined;
  let mobileBrowser: Browser | undefined;
  console.log("PE Production Readiness isolated E2E");

  try {
    stage = "fixtures";
    actor = await createPEBrowserActor(prisma);

    // ── Fixture: 서로 다른 값의 REVENUE 2건 → factConflict가 실제로 발생하는 딜 ──
    const deal = await prisma.mADeal.create({
      data: { name: `E2E 재무모순 테스트 ${Date.now()}`, companyName: "E2E재무모순 주식회사", dealType: "BUYOUT", userId: actor.user.id, teamId: actor.user.teamId },
    });
    dealId = deal.id;
    const period = await prisma.mAFinancialPeriod.create({
      data: { maDealId: deal.id, fiscalYear: 2025, periodType: "ANNUAL", startDate: new Date("2025-01-01"), endDate: new Date("2025-12-31"), currency: "KRW" },
    });
    await prisma.mAFinancialLineItem.create({
      data: { financialPeriodId: period.id, statementType: "INCOME_STATEMENT", lineItem: "REVENUE", value: 1_000_000_000, currency: "KRW", source: "DART" },
    });
    await prisma.mAFinancialLineItem.create({
      data: { financialPeriodId: period.id, statementType: "INCOME_STATEMENT", lineItem: "REVENUE", value: 1_200_000_000, currency: "KRW", source: "MANUAL" },
    });
    // Data Room select 축소 검증용 문서 1건(parsedText를 일부러 크게 채운다).
    await prisma.mADocument.create({
      data: { maDealId: deal.id, name: "대용량 실사자료.pdf", type: "DD_MATERIAL", url: "private-local:synthetic-document", size: 1024, mimeType: "application/pdf", parsedText: "x".repeat(50_000) },
    });
    console.log("Synthetic conflict/document fixtures created");

    browser = await chromium.launch(chromiumLaunchOptions());
    const desktopContext = await browser.newContext({ serviceWorkers: "block" });
    await restrictNetwork(desktopContext);
    const page = await desktopContext.newPage();
    stage = "desktop-login";
    let consoleErrorCount = 0;
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrorCount++;
    });
    page.on("pageerror", () => { consoleErrorCount++; });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500); // 로그인 폼 하이드레이션 대기 — 그 전에 제출하면 세션이 잡히기 전에 다음 화면으로 넘어간다
    await page.fill("#email", actor.user.email);
    await page.fill("#password", actor.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/, { timeout: 30000 });
    console.log("✅ 1 — 로그인 성공");

    await page.goto(`${BASE}/ma-deals/${deal.id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.waitForSelector('[role="tab"]', { timeout: 45000 });

    stage = "conflict-and-documents";
    // ── 2. Overview 탭 — 핵심 재무 지표 카드에 모순 경고가 떠야 함 ────────
    await page.waitForSelector("text=핵심 재무 지표", { timeout: 15000 });
    await page.waitForSelector("text=모순", { timeout: 15000 });
    console.log("✅ 2 — Overview 탭의 '핵심 재무 지표' 카드에 데이터 모순 경고가 표시됨");

    // ── 3. IC 의사결정 탭 ──────────────────────────────────────────────
    await page.getByRole("tab", { name: "IC 의사결정" }).click({ timeout: 45000 });
    await page.waitForTimeout(1000);
    await page.waitForSelector("text=핵심 재무 지표", { timeout: 15000 });
    await page.waitForSelector("text=모순", { timeout: 15000 });
    console.log("✅ 3 — IC 의사결정 탭의 '핵심 재무 지표' 카드에도 동일한 경고가 표시됨");

    // ── 4. 위원회 자료 탭 ──────────────────────────────────────────────
    await page.getByRole("tab", { name: "위원회 자료" }).click({ timeout: 45000 });
    await page.waitForTimeout(1000);
    await page.waitForSelector('[data-testid="pe-pack-header"]', { timeout: 15000 }); // 위원회 자료 문서 머리(투자심의위원회 자료)
    await page.waitForSelector("text=핵심 재무 지표", { timeout: 15000 });
    await page.waitForSelector("text=모순", { timeout: 15000 });
    // 상태는 화면에서 한국어("차단됨")로 표시된다 — 영문 코드(BLOCKED) 노출 여부가 아니라 차단 상태 표시 자체를 확인한다
    const badgeText = (await page.locator('[data-testid="pe-pack-state"]').innerText().catch(() => "")).includes("차단");
    assert(badgeText, "위원회 자료 탭 상단 Decision Readiness 배지도 BLOCKED여야 함(재무 모순이 있으므로)");
    console.log("✅ 4 — 위원회 자료 탭의 '핵심 재무 지표' 카드에도 경고가 표시되고, 상단 Decision Readiness도 BLOCKED로 일관됨(§37 UI 상태 일관성)");

    // ── 5. Data Room 탭 — parsedText가 없어도(select 축소) 문서 목록이 정상 렌더 ──
    await page.getByRole("tab", { name: "데이터룸" }).click({ timeout: 45000 });
    await page.waitForTimeout(1000);
    await page.waitForSelector("text=대용량 실사자료.pdf", { timeout: 15000 });
    console.log("✅ 5 — Data Room 문서 목록이 parsedText 없이도(select 축소 이후) 정상 렌더됨");

    // API 응답 자체에 parsedText가 안 실리는지 직접 확인(성능 회귀 검증).
    const docsRes = await page.request.get(`${BASE}/api/ma-deals/${deal.id}/documents`);
    assert(docsRes.ok(), "documents API는 200이어야 함");
    const docsJson = await docsRes.json();
    assert(
      docsJson.data.documents.every((d: Record<string, unknown>) => !("parsedText" in d)),
      "documents API 응답에는 parsedText 필드 자체가 없어야 함(불필요한 대용량 컬럼 미전송, §29)"
    );
    console.log("✅ 6 — documents API 응답에 parsedText가 전혀 실리지 않음(select 축소가 실제로 적용됨)");

    stage = "review-regression";
    // ── 7. 회귀 축약: 검토 완료 → 재검토 사이클이 여전히 동작하는가 ──────
    await page.getByRole("tab", { name: "위원회 자료" }).click({ timeout: 45000 });
    await page.waitForTimeout(1000);
    await page.waitForSelector("text=내 검토", { timeout: 15000 });
    await page.fill("textarea[placeholder*='검토 메모']", "PR#112 회귀 확인용 검토");
    await page.getByRole("button", { name: "검토 완료" }).click();
    await page.waitForTimeout(1200);
    // 제출 → 재조회 → 배지 갱신은 비동기 — 기대한 문구가 나타날 때까지 최대 10초 기다린다
    await page
      .waitForFunction(
        () => Array.from(document.querySelectorAll("span")).some((el) => el.textContent?.includes("현재 상태:") && el.parentElement?.textContent?.includes("검토 완료")),
        undefined,
        { timeout: 10000 }
      )
      .catch(() => undefined);
    const stateText = await page.locator("span", { hasText: "현재 상태:" }).locator("xpath=..").innerText();
    assert(stateText.includes("검토 완료"), "검토 완료 제출 후 상태 배지가 '검토 완료'여야 함(PR#111 기능 회귀 없음)");
    await page.waitForSelector("text=검토 이력 / Audit Trail", { timeout: 15000 });
    await page.waitForSelector("text=Review #1", { timeout: 15000 });
    console.log("✅ 7 — 검토 완료 → 스냅샷 생성까지 PR#111의 핵심 사이클이 이번 변경 이후에도 회귀 없이 동작함");

    stage = "mobile-regression";
    // ── 8. 모바일 폭(390px) — 새로 추가된 경고 배지가 있어도 오버플로 없음 ──
    await browser.close();
    mobileBrowser = await chromium.launch(chromiumLaunchOptions());
    const mobileContext = await mobileBrowser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await restrictNetwork(mobileContext);
    const mobilePage = await mobileContext.newPage();
    mobilePage.on("console", message => { if (message.type() === "error") consoleErrorCount++; });
    mobilePage.on("pageerror", () => { consoleErrorCount++; });
    await mobilePage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await mobilePage.waitForTimeout(1500); // 로그인 폼 하이드레이션 대기 — 그 전에 제출하면 세션이 잡히기 전에 다음 화면으로 넘어간다
    await mobilePage.fill("#email", actor.user.email);
    await mobilePage.fill("#password", actor.password);
    await mobilePage.click('button[type="submit"]');
    await mobilePage.waitForURL(/dashboard/, { timeout: 30000 });
    await mobilePage.goto(`${BASE}/ma-deals/${deal.id}`, { waitUntil: "networkidle" });
    await mobilePage.waitForTimeout(1500);
    await mobilePage.waitForSelector('[role="tab"]', { timeout: 45000 });
    await mobilePage.getByRole("tab", { name: "위원회 자료" }).click({ timeout: 45000 });
    await mobilePage.waitForTimeout(1000);
    await mobilePage.waitForSelector("text=모순", { timeout: 15000 });
    const overflow = await mobilePage.evaluate((vw) => {
      const panel = document.querySelector('[role="tabpanel"]');
      return panel ? panel.scrollWidth > vw + 1 : true; // Missing panel fails.
    }, 390);
    assert(!overflow, "390px 폭에서 재무 모순 경고 배지가 추가돼도 위원회 자료 탭 패널에 가로 넘침이 없어야 함");
    await mobileContext.close();
    await mobileBrowser.close();
    console.log("✅ 8 — 모바일 폭(390px)에서 새 경고 배지 포함해도 가로 넘침 없음");

    assert(consoleErrorCount === 0, "테스트 중 콘솔 오류가 발생하면 안 됨");
    console.log("\n✅ PE Production Readiness E2E 전체 통과\n");
  } finally {
    try {
      await Promise.allSettled([mobileBrowser?.close(), browser?.close()]);
    } finally {
      try {
        if (dealId) {
          await prisma.$transaction([
            prisma.pEICAuditEvent.deleteMany({ where: { maDealId: dealId } }),
            prisma.pEICReviewSnapshot.deleteMany({ where: { maDealId: dealId } }),
            prisma.mADeal.deleteMany({ where: { id: dealId } }),
          ]);
        }
      } finally {
        try {
          await actor?.cleanup();
        } finally {
          await prisma.$disconnect();
        }
      }
    }
  }
}

main().catch(() => {
  console.error(`PE readiness E2E failed at fixed stage: ${stage}`);
  process.exitCode = 1;
});
