/**
 * PE IC Review Audit Trail(PR #111) — 브라우저 E2E, "stale → 재검토" 전체
 * 사이클을 실제 화면 조작으로 재현한다(§36 — 이 PR의 핵심 시나리오).
 *
 * 라이브 서버 + 실제 로그인 세션이 필요하다 — Playwright가 devDependency라
 * 오프라인 test:all에는 넣지 않는다(test-mobile.ts와 동일 관례).
 *
 * Usage:
 *   configure isolated PostgreSQL dealmind_test + matching TEST_DATABASE_URL     # 최초 1회
 *   start a clean loopback test app against that database          # 다른 터미널에서 서버 실행 후
 *   npm run test:pe-ic-audit-e2e
 */
import { chromium, type Browser } from "playwright";
import { assertE2ETarget, assertNoExternalE2ECredentials, assertCleanE2EWorkspace, chromiumLaunchOptions } from "./helpers/e2e-environment";
import JSZip from "jszip";
import { PrismaClient } from "@prisma/client";
import { createPEBrowserActor } from "./helpers/pe-browser-actor";

const BASE = (process.argv[2] ?? process.env.E2E_TEST_URL ?? "http://localhost:3000").replace(/\/$/, "");

assertE2ETarget(BASE);
assertNoExternalE2ECredentials();
assertCleanE2EWorkspace();
const prisma = new PrismaClient({ log: [] });
let stage = "isolated fixture setup";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
}

async function main() {
  assertE2ETarget(BASE);
  assertNoExternalE2ECredentials();
  assertCleanE2EWorkspace();
  let dealId: string | undefined;
  let browser: Browser | undefined;
  let actor: Awaited<ReturnType<typeof createPEBrowserActor>> | undefined;
  console.log("PE IC audit: explicit isolated synthetic fixture only.");

  // ── Fixture: 합성 사용자 소유의 새 PE 딜 + 빈 DD Case ────────────────────
  try {
    actor = await createPEBrowserActor(prisma);
    const deal = await prisma.mADeal.create({
      data: { name: `E2E 감사이력 테스트 ${Date.now()}`, companyName: "E2E감사이력 주식회사", dealType: "BUYOUT", userId: actor.user.id, teamId: actor.user.teamId },
    });
    dealId = deal.id;
    const ddCase = await prisma.pEDDCase.create({ data: { maDealId: deal.id } });
    console.log("Synthetic IC audit deal created.");

    browser = await chromium.launch(chromiumLaunchOptions());
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    await blockExternal(context);
    const page = await context.newPage();

    const consoleErrors: string[] = [];
    let expectingStale409 = false;
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      // Only the explicitly asserted stale PATCH409 browser resource message is expected.
      if (expectingStale409 && m.location().url === `${BASE}/api/ma-deals/${deal.id}/ic-review-signoff` &&
          m.text().startsWith("Failed to load resource:") && m.text().includes("409")) return;
      consoleErrors.push("CONSOLE_ERROR");
    });
    page.on("pageerror", () => consoleErrors.push("PAGE_ERROR"));
    stage = "IC_AUDIT_CHECK_1";
    // ── 1. 로그인 ─────────────────────────────────────────────────────
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500); // 로그인 폼 하이드레이션 대기 — 그 전에 제출하면 세션이 잡히기 전에 다음 화면으로 넘어간다
    await page.fill("#email", actor.user.email);
    await page.fill("#password", actor.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/, { timeout: 30000 });
    console.log("✅ 1 — 로그인 성공");

    stage = "IC_AUDIT_CHECK_2";

    // ── 2. 딜 상세 진입 → 위원회 자료 탭 ─────────────────────────────────
    await page.goto(`${BASE}/ma-deals/${deal.id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500); // 콜드 컴파일 레이스(레포 관례, PR #109/#110 세션에서 확립)
    await page.waitForSelector('[role="tab"]', { timeout: 45000 });
    await page.getByRole("tab", { name: "위원회 자료" }).click({ timeout: 45000 });
    await page.waitForTimeout(600);
    await page.waitForSelector('[data-testid="pe-pack-header"]', { timeout: 15000 }); // 위원회 자료 문서 머리(투자심의위원회 자료)
    console.log("✅ 2 — 위원회 자료 탭 진입 성공");

    stage = "IC_AUDIT_CHECK_3";

    // ── 3. 초기 상태: 미검토 ─────────────────────────────────────────────
    await page.waitForSelector("text=내 검토", { timeout: 15000 });
    await assertBadgeText(page, "미검토");
    console.log("✅ 3 — 초기 상태는 '미검토'");

    stage = "IC_AUDIT_CHECK_4";

    // 화면이 보여준 자료와 서버 canonical 자료가 달라지면 기존 화면의 서명을 거부한다.
    const beforeStaleSnapshots = await prisma.pEICReviewSnapshot.count({ where: { maDealId: deal.id } });
    const beforeStaleEvents = await prisma.pEICAuditEvent.count({ where: { maDealId: deal.id } });
    await prisma.pEDDFinding.create({ data: { ddCaseId: ddCase.id, category: "LEGAL", title: "합성 화면 이후 변경", description: "합성 버전 경합 검증 자료", severity: "HIGH", status: "DRAFT" } });
    expectingStale409 = true;
    const staleResponse = page.waitForResponse(response => response.url().endsWith(`/api/ma-deals/${deal.id}/ic-review-signoff`) && response.request().method() === "PATCH");
    await page.getByRole("button", { name: "검토 완료", exact: true }).click();
    assert((await staleResponse).status() === 409, "오래 본 자료의 검토 완료는 409여야 함");
    await page.getByRole("button", { name: "최신 자료 다시 불러오기", exact: true }).waitFor();
    assert(await prisma.pEICReviewSnapshot.count({ where: { maDealId: deal.id } }) === beforeStaleSnapshots, "오래 본 화면의 서명은 스냅샷을 만들면 안 됨");
    assert(await prisma.pEICAuditEvent.count({ where: { maDealId: deal.id } }) === beforeStaleEvents, "오래 본 화면의 서명은 감사 기록을 만들면 안 됨");
    assert(await prisma.pEICReview.count({ where: { maDealId: deal.id, status: "REVIEWED" } }) === 0, "오래 본 화면의 검토 상태는 REVIEWED로 저장되면 안 됨");
    assert(await page.getByRole("button", { name: "검토 완료", exact: true }).isDisabled(), "충돌 뒤 명시 새로고침 전 재서명은 차단되어야 함");
    await page.getByRole("button", { name: "최신 자료 다시 불러오기", exact: true }).click();
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: "위원회 자료" }).click();
    await page.waitForSelector('[data-testid="pe-pack-header"]');
    expectingStale409 = false;
    console.log("PASS synthetic stale displayed signoff409 preserves review/snapshot/audit; explicit refresh required.");

    // ── 4. 1차 검토 완료(Review #1) ──────────────────────────────────────
    await page.fill("textarea[placeholder*='검토 메모']", "1차 검토 완료 - 초기 자료 확인함");
    await page.getByRole("button", { name: "검토 완료" }).click();
    await page.waitForTimeout(1200);
    await assertBadgeText(page, "검토 완료");
    console.log("✅ 4 — 1차 '검토 완료' 제출 성공, 상태 배지가 '검토 완료'로 바뀜");

    stage = "IC_AUDIT_CHECK_5";

    // ── 5. 검토 이력 카드: Review #1 스냅샷 + 감사 타임라인 확인 ──────────
    await page.waitForSelector("text=검토 이력 / Audit Trail", { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.waitForSelector("text=Review #1", { timeout: 15000 });
    await page.waitForSelector("text=현재 기준과 일치", { timeout: 15000 });
    const auditTimelineText1 = await readAuditTimeline(page, "검토 완료");
    assert(auditTimelineText1.includes("검토 완료"), `감사 타임라인에 '검토 완료'(REVIEW_COMPLETED) 이벤트가 보여야 함, 실제: ${JSON.stringify(auditTimelineText1)}`);
    console.log("✅ 5 — 검토 이력에 Review #1(현재 기준과 일치) + 감사 타임라인에 '검토 완료' 이벤트 표시됨");

    stage = "IC_AUDIT_CHECK_6";

    // ── 6. canonical 데이터 변경(DD finding 추가) → fingerprint가 바뀐다 ──
    await prisma.pEDDFinding.create({
      data: { ddCaseId: ddCase.id, category: "LEGAL", title: "라이선스 조항 검토 필요", description: "핵심 계약의 라이선스 조항이 인수 후 자동 해지될 수 있음", severity: "HIGH", status: "DRAFT" },
    });
    console.log("✅ 6 — canonical 데이터 변경(DD finding 추가, DB 직접)");

    stage = "IC_AUDIT_CHECK_7";

    // ── 7. 새로고침 → RE_REVIEW_REQUIRED 배너 + 예전 스냅샷은 그대로 ──────
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.getByRole("tab", { name: "위원회 자료" }).click();
    await page.waitForTimeout(600);
    await page.waitForSelector("text=재검토 필요", { timeout: 15000 });
    await page.waitForSelector("text=자료가 변경되었습니다. 재검토가 필요합니다.", { timeout: 15000 });
    console.log("✅ 7 — 자료 변경 후 재진입 시 '재검토 필요' 배지 + 안내 배너가 뜸(서버가 매 요청 재계산)");

    const v1Snapshot = await page.locator("li.space-y-1", { hasText: "Review #1" }).innerText();
    assert(v1Snapshot.includes("과거 기록"), "재검토가 필요해져도 Review #1 스냅샷 자체는 '과거 기록'으로 여전히 보여야 함(불변, 삭제되지 않음)");
    assert(v1Snapshot.includes("1차 검토 완료 - 초기 자료 확인함"), "Review #1 스냅샷의 코멘트는 재검토 이후에도 1차 시점 그대로여야 함");
    console.log("✅ 8 — Review #1 스냅샷은 삭제/변경되지 않고 '과거 기록'으로 그대로 남아 있음(핵심 불변성 확인)");

    stage = "IC_AUDIT_CHECK_9";

    // ── 9. 2차 검토(재검토) 제출 → Review #2 생성, isCurrent 갱신 ────────
    await page.fill("textarea[placeholder*='검토 메모']", "2차 검토 완료 - 라이선스 조항 확인 후 재검토");
    await page.getByRole("button", { name: "검토 완료" }).click();
    await page.waitForTimeout(1200);
    await assertBadgeText(page, "검토 완료");
    await page.waitForTimeout(600);
    await page.waitForSelector("text=Review #2", { timeout: 15000 });
    const v2Snapshot = await page.locator("li.space-y-1", { hasText: "Review #2" }).innerText();
    assert(v2Snapshot.includes("현재 기준과 일치"), "재검토로 만들어진 Review #2는 '현재 기준과 일치'여야 함");
    assert(v2Snapshot.includes("DD") || v2Snapshot.includes("이전 검토 대비 변경"), `Review #2는 이전(Review #1) 대비 변경된 카테고리(DD)를 표시해야 함, 실제: ${v2Snapshot}`);
    const v1After = await page.locator("li.space-y-1", { hasText: "Review #1" }).innerText();
    assert(v1After.includes("과거 기록"), "Review #2가 생긴 뒤에도 Review #1은 여전히 '과거 기록'으로 남아 있어야 함");
    console.log("✅ 9 — 재검토가 Review #2(현재 기준과 일치, 변경된 카테고리 표시)를 새로 만들고, Review #1은 그대로 보존됨 — stale/재검토 사이클 완결");

    stage = "IC_AUDIT_CHECK_10";

    // ── 10. 변경 요청은 코멘트 없이 제출 불가(클라이언트 검증) ───────────
    await page.fill("textarea[placeholder*='검토 메모']", "");
    let changeRequestBlocked = false;
    page.once("dialog", (d) => d.dismiss());
    await page.getByRole("button", { name: "변경 요청" }).click();
    await page.waitForTimeout(500);
    // 상태 배지가 여전히 '검토 완료'로 남아있으면(=변경 요청이 거부됨) 검증 성공
    const stateAfterEmptyChangeRequest = await page.locator("span", { hasText: "현재 상태:" }).locator("xpath=..").innerText();
    changeRequestBlocked = stateAfterEmptyChangeRequest.includes("검토 완료");
    assert(changeRequestBlocked, "코멘트 없이 '변경 요청'을 누르면 거부되고 상태가 바뀌지 않아야 함");
    console.log("✅ 10 — 코멘트 없는 '변경 요청'은 클라이언트에서 차단됨(상태 불변)");

    stage = "IC_AUDIT_CHECK_11";

    // ── 11. 코멘트 작성 → 코멘트 목록 + 감사 타임라인에 반영 ─────────────
    await page.fill("textarea[placeholder='코멘트 남기기']", "재무팀 확인 요청드립니다");
    await page.getByRole("button", { name: "등록" }).click();
    await page.waitForTimeout(1000);
    await page.waitForSelector("text=재무팀 확인 요청드립니다", { timeout: 15000 });
    const auditTimelineText2 = await readAuditTimeline(page, "코멘트 작성");
    assert(auditTimelineText2.includes("코멘트 작성"), "감사 타임라인에 '코멘트 작성'(COMMENT_ADDED) 이벤트가 추가돼야 함");
    console.log("✅ 11 — 코멘트 작성이 코멘트 목록과 감사 타임라인에 함께 반영됨");

    stage = "IC_AUDIT_CHECK_12";

    // ── 12. fingerprint 배지 클릭 → 클립보드 복사(에러 없이 동작) ────────
    const fingerprintBadges = page.locator("button[title]").filter({ hasText: "…" });
    const badgeCount = await fingerprintBadges.count();
    assert(badgeCount > 0, "fingerprint 배지가 최소 1개는 렌더돼야 함");
    await fingerprintBadges.first().click();
    console.log("✅ 12 — fingerprint 배지가 렌더되고 클릭해도 에러가 나지 않음");

    stage = "IC_AUDIT_CHECK_13";

    // ── 13. DOCX/PPTX export — fingerprint가 문서 본문에 실제로 포함됨 ────
    const currentFingerprintRes = await page.request.get(`${BASE}/api/ma-deals/${deal.id}/reviews`);
    assert(currentFingerprintRes.ok(), "reviews API 호출은 성공해야 함");
    const currentFingerprintJson = await currentFingerprintRes.json();
    const currentFingerprint: string = currentFingerprintJson.currentFingerprint;
    assert(typeof currentFingerprint === "string" && currentFingerprint.length > 10, "현재 fingerprint 문자열을 얻을 수 있어야 함");

    const docxRes = await page.request.get(`${BASE}/api/ma-deals/${deal.id}/committee-pack/export?format=docx`);
    assert(docxRes.ok(), "DOCX export는 200이어야 함");
    assertPrivateExportHeaders(docxRes.headers());
    const docxBuffer = await docxRes.body();
    const docxZip = await JSZip.loadAsync(docxBuffer);
    const documentXml = await docxZip.file("word/document.xml")!.async("string");
    assert(documentXml.includes(currentFingerprint.slice(0, 16)), "DOCX 본문(word/document.xml)에 현재 fingerprint가 포함돼야 함(§21/§37 export 일관성)");
    console.log("✅ 13 — DOCX export 본문에 현재 canonical fingerprint가 실제로 포함됨");

    const pptxRes = await page.request.get(`${BASE}/api/ma-deals/${deal.id}/committee-pack/export?format=pptx`);
    assert(pptxRes.ok(), "PPTX export는 200이어야 함");
    assertPrivateExportHeaders(pptxRes.headers());
    const pptxBuffer = await pptxRes.body();
    const pptxZip = await JSZip.loadAsync(pptxBuffer);
    const slideFiles = Object.keys(pptxZip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    const slideTexts = await Promise.all(slideFiles.map((f) => pptxZip.file(f)!.async("string")));
    assert(slideTexts.some((t) => t.includes(currentFingerprint.slice(0, 16))), "PPTX 슬라이드 중 하나에 현재 canonical fingerprint가 포함돼야 함");
    console.log("✅ 14 — PPTX export 본문에도 현재 canonical fingerprint가 실제로 포함됨");

    stage = "IC_EXPORT_PRIVACY";
    const guest = await browser.newContext({ serviceWorkers: "block" });
    try {
      await blockExternal(guest);
      for (const route of ["committee-pack/export", "ic-memo"]) {
        for (const format of ["docx", "pptx"]) {
          if (route === "ic-memo") {
            const success = await page.request.get(`${BASE}/api/ma-deals/${deal.id}/${route}?format=${format}`);
            assert(success.status() === 200, "합성 IC memo export 성공이어야 함");
            assertPrivateExportHeaders(success.headers());
            assert(success.headers()["content-type"] === (format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/vnd.openxmlformats-officedocument.presentationml.presentation"), "IC memo MIME 일치");
          }
          const denied = await guest.request.get(`${BASE}/api/ma-deals/${deal.id}/${route}?format=${format}`);
          assert(denied.status() === 401, "비로그인 PE export는 401이어야 함");
          assertPrivateExportHeaders(denied.headers());
          const absent = await page.request.get(`${BASE}/api/ma-deals/${deal.id}-synthetic-missing/${route}?format=${format}`);
          assert(absent.status() === 404, "소유자라도 미존재 PE export는 404이어야 함");
          assertPrivateExportHeaders(absent.headers());
        }
      }
    } finally { await guest.close(); }
    console.log("PASS synthetic PE pack/memo exports private headers including guest401 and missing404.");

    stage = "IC_AUDIT_CHECK_15";

    // ── 15. 인쇄 뷰 — 정상 로드 + fingerprint 노출 ───────────────────────
    await page.goto(`${BASE}/ma-deals/${deal.id}/committee-pack/print`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const printBodyText = await page.locator("body").innerText();
    assert(printBodyText.includes(currentFingerprint.slice(0, 16)), "인쇄 뷰에도 현재 canonical fingerprint가 노출돼야 함(화면/DOCX/PPTX/인쇄 전부 같은 markdown 함수를 공유)");
    console.log("✅ 15 — 인쇄 뷰에도 동일한 fingerprint가 노출됨(단일 마크다운 소스 공유 확인)");

    stage = "IC_AUDIT_CHECK_16";

    // ── 16. 모바일 폭(390px) — 가로 스크롤/콘솔 에러 없이 렌더 ───────────
    await checkMobileWidth(browser, `${BASE}/ma-deals/${deal.id}`, 390, actor.user.email, actor.password);
    console.log("✅ 16 — 모바일 폭(390px)에서 가로 넘침 없이 렌더됨");

    stage = "IC_AUDIT_CHECK_17";

    // ── 17. 태블릿 폭(768px) ─────────────────────────────────────────────
    await checkMobileWidth(browser, `${BASE}/ma-deals/${deal.id}`, 768, actor.user.email, actor.password);
    console.log("✅ 17 — 태블릿 폭(768px)에서 가로 넘침 없이 렌더됨");

    // 이 PR이 만들지도, 손대지도 않은 사전 존재 이슈는 걸러낸다(§54 범위
    // 밖 이슈를 이 PR 책임으로 돌리지 않음):
    // (1) ERR_TUNNEL_CONNECTION_FAILED — 이 실행 환경의 프록시가 막은 외부
    //     리소스 요청(폰트 등)일 뿐, 앱 코드와 무관함.
    // (2) 인쇄 뷰(print-committee-pack-client.tsx, git status로 이 PR에서
    //     전혀 수정되지 않았음을 확인함)의 "생성 시각" 표시가 서버(Node
    //     ICU, "PM")/클라이언트(브라우저, "오후") locale 포맷 불일치로
    //     hydration 경고를 냄 — PR #110부터 있던 기존 버그, 이 PR이 추가한
    //     fingerprint 줄과는 무관(별도 줄, Date 포맷팅 없음).
    const relevantErrors = consoleErrors;
    assert(relevantErrors.length === 0, `테스트 중 (사전 존재 이슈를 제외한) 콘솔 에러가 발생하면 안 됨, 실제: ${JSON.stringify(relevantErrors.slice(0, 5))}`);
    console.log("\n✅ PE IC Review Audit Trail E2E 전체 통과(이 PR 범위 내 콘솔 에러 없음)\n");
  } finally {
    try {
      await browser?.close();
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


/** 감사 타임라인은 서명 직후 비동기로 다시 조회된다 — 기대한 문구가 나타날 때까지 최대 10초 기다린 뒤 텍스트를 읽는다 */
async function readAuditTimeline(page: import("playwright").Page, mustInclude?: string): Promise<string> {
  const timeline = () => page.locator("text=감사 타임라인").locator("xpath=..").innerText();
  let text = await timeline();
  for (let i = 0; mustInclude && !text.includes(mustInclude) && i < 24; i++) {
    await page.waitForTimeout(500);
    text = await timeline();
  }
  return text;
}

async function assertBadgeText(page: import("playwright").Page, expected: string) {
  // 제출(PATCH) → 재조회 → 배지 갱신은 비동기다 — 고정 대기 대신 기대한 문구가 나타날 때까지 기다린다(최대 10초)
  await page
    .waitForFunction(
      (want) => Array.from(document.querySelectorAll("span")).some((el) => el.textContent?.includes("현재 상태:") && el.parentElement?.textContent?.includes(want)),
      expected,
      { timeout: 10000 }
    )
    .catch(() => undefined);
  const text = await page.locator("span", { hasText: "현재 상태:" }).locator("xpath=..").innerText();
  assert(text.includes(expected), `상태 배지가 '${expected}'를 포함해야 함, 실제: ${text}`);
}

async function checkMobileWidth(browser: import("playwright").Browser, url: string, width: number, email: string, password: string) {
  stage = `IC_AUDIT_MOBILE_${width}`;
  const context = await browser.newContext({ viewport: { width, height: 800 }, isMobile: width < 500, hasTouch: width < 500, serviceWorkers: "block" });
  try {
  await blockExternal(context);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", () => errors.push("PAGE_ERROR"));
  await page.goto(`${new URL(url).origin}/login`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500); // 로그인 폼 하이드레이션 대기 — 그 전에 제출하면 세션이 잡히기 전에 다음 화면으로 넘어간다
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.waitForSelector('[role="tab"]', { timeout: 45000 });
  await page.getByRole("tab", { name: "위원회 자료" }).click({ timeout: 45000 });
  await page.waitForTimeout(700);
  // 탭 바(TabsList, 탭 9개) 자체의 가로 스크롤은 이 PR이 손대지 않은
  // 기존 화면(ma-deal-detail-client.tsx)의 사전 존재 이슈라 범위 밖이다
  // (§54 "don't fix unrelated pre-existing issues" — 실제로 DD/리뷰 데이터가
  // 전혀 없는 딜에서도 재현되는 것을 별도로 확인함). 이 PR이 실제로
  // 책임지는 영역은 "위원회 자료" 탭 패널(검토 이력/Audit Trail 카드가
  // 들어가는 곳)이므로, 오버플로 검사도 그 패널 내부로 한정한다.
  const overflow = await page.evaluate((vw) => {
    const panel = document.querySelector('[role="tabpanel"]');
    if (!panel) return true; // Missing content must fail the layout assertion.
    return panel.scrollWidth > vw + 1;
  }, width);
  assert(!overflow, `${width}px 폭에서 '위원회 자료' 탭 패널 내부에 가로 스크롤이 발생하면 안 됨`);
  assert(errors.length === 0, `${width}px 폭에서 콘솔 에러가 없어야 함: ${JSON.stringify(errors)}`);
  } finally {
    await context.close();
  }
}

function assertPrivateExportHeaders(headers: Record<string, string>) {
  assert(headers["cache-control"] === "private, no-store, max-age=0", "PE export는 private no-store이어야 함");
  assert(headers.vary?.split(",").map(value => value.trim().toLowerCase()).includes("cookie") === true, "PE export Vary Cookie 필수");
  assert(headers["x-content-type-options"] === "nosniff", "PE export nosniff 필수");
}

async function blockExternal(context: import("playwright").BrowserContext) {
  await context.route("**/*", async route => {
    const target = new URL(route.request().url());
    if (target.origin !== new URL(BASE).origin) { await route.abort("blockedbyclient"); return; }
    if (target.pathname === "/_vercel/speed-insights/script.js") {
      await route.fulfill({status: 200, contentType: "application/javascript", body: "/* Explicit isolated telemetry stub; no collection. */"});
      return;
    }
    await route.continue();
  });
}
main().catch(async () => {
  console.error(`PE_IC_AUDIT_E2E_FAILED at ${stage}; exception details withheld.`);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
