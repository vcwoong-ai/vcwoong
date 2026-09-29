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
 *   npm run db:setup:local
 *   npm run dev:local          # 다른 터미널에서 서버 실행 후
 *   npm run test:pe-production-readiness-e2e
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE = (process.argv[2] ?? process.env.E2E_TEST_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.SMOKE_EMAIL ?? "demo@dealmind.kr";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "Demo1234!";

const prisma = new PrismaClient();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
}

async function main() {
  console.log(`\n=== PE Production Readiness E2E(PR #112) — 대상: ${BASE} ===\n`);

  const demo = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true, teamId: true } });
  assert(!!demo, `${EMAIL} 유저를 찾을 수 없음 — npm run db:setup:local을 먼저 실행하세요`);

  // ── Fixture: 서로 다른 값의 REVENUE 2건 → factConflict가 실제로 발생하는 딜 ──
  const deal = await prisma.mADeal.create({
    data: { name: `E2E 재무모순 테스트 ${Date.now()}`, companyName: "E2E재무모순 주식회사", dealType: "BUYOUT", userId: demo!.id, teamId: demo!.teamId },
  });
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
    data: { maDealId: deal.id, name: "대용량 실사자료.pdf", type: "DD_MATERIAL", url: "https://example.com/doc.pdf", size: 1024, mimeType: "application/pdf", parsedText: "x".repeat(50_000) },
  });
  console.log(`딜 생성(재무 모순 + 대용량 문서 1건): ${deal.id}\n`);

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => consoleErrors.push(`PAGEERROR: ${e.message.slice(0, 200)}`));

  try {
    await page.goto(`${BASE}/login`);
    await page.fill("#email", EMAIL);
    await page.fill("#password", PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/, { timeout: 30000 });
    console.log("✅ 1 — 로그인 성공");

    await page.goto(`${BASE}/ma-deals/${deal.id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.waitForSelector('[role="tab"]', { timeout: 45000 });

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
    await page.waitForSelector("text=PE IC Committee Pack", { timeout: 15000 });
    await page.waitForSelector("text=핵심 재무 지표", { timeout: 15000 });
    await page.waitForSelector("text=모순", { timeout: 15000 });
    const badgeText = await page.locator("text=BLOCKED").first().isVisible().catch(() => false);
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

    // ── 7. 회귀 축약: 검토 완료 → 재검토 사이클이 여전히 동작하는가 ──────
    await page.getByRole("tab", { name: "위원회 자료" }).click({ timeout: 45000 });
    await page.waitForTimeout(1000);
    await page.waitForSelector("text=내 검토", { timeout: 15000 });
    await page.fill("textarea[placeholder*='검토 메모']", "PR#112 회귀 확인용 검토");
    await page.getByRole("button", { name: "검토 완료" }).click();
    await page.waitForTimeout(1200);
    const stateText = await page.locator("span", { hasText: "현재 상태:" }).locator("xpath=..").innerText();
    assert(stateText.includes("검토 완료"), "검토 완료 제출 후 상태 배지가 '검토 완료'여야 함(PR#111 기능 회귀 없음)");
    await page.waitForSelector("text=검토 이력 / Audit Trail", { timeout: 15000 });
    await page.waitForSelector("text=Review #1", { timeout: 15000 });
    console.log("✅ 7 — 검토 완료 → 스냅샷 생성까지 PR#111의 핵심 사이클이 이번 변경 이후에도 회귀 없이 동작함");

    // ── 8. 모바일 폭(390px) — 새로 추가된 경고 배지가 있어도 오버플로 없음 ──
    await browser.close();
    const mobileBrowser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
    const mobileContext = await mobileBrowser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${BASE}/login`);
    await mobilePage.fill("#email", EMAIL);
    await mobilePage.fill("#password", PASSWORD);
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
      return panel ? panel.scrollWidth > vw + 1 : false;
    }, 390);
    assert(!overflow, "390px 폭에서 재무 모순 경고 배지가 추가돼도 위원회 자료 탭 패널에 가로 넘침이 없어야 함");
    await mobileContext.close();
    await mobileBrowser.close();
    console.log("✅ 8 — 모바일 폭(390px)에서 새 경고 배지 포함해도 가로 넘침 없음");

    const relevantErrors = consoleErrors.filter(
      (e) =>
        !e.includes("ERR_TUNNEL_CONNECTION_FAILED") &&
        !e.includes("Text content did not match") &&
        !e.includes("Text content does not match server-rendered HTML") &&
        !e.includes("error while hydrating this Suspense boundary")
    );
    assert(relevantErrors.length === 0, `테스트 중 (사전 존재 이슈를 제외한) 콘솔 에러가 발생하면 안 됨, 실제: ${JSON.stringify(relevantErrors.slice(0, 5))}`);
    console.log("\n✅ PE Production Readiness E2E 전체 통과\n");
  } finally {
    await browser.close().catch(() => {});
    await prisma.pEICAuditEvent.deleteMany({ where: { maDealId: deal.id } });
    await prisma.pEICReviewSnapshot.deleteMany({ where: { maDealId: deal.id } });
    await prisma.mADeal.delete({ where: { id: deal.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error("\n❌ 실패:", error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
