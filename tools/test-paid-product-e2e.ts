/**
 * 유료 제품 프론트엔드 E2E — 랜딩·요금·가입·대시보드·VC 목록/근거 패널·PE 목록/개요/재무/위원회 자료·반응형.
 *
 * 로컬 SQLite + 실행 중인 dev 서버(npm run dev:local) 전용. 운영 DB에는 실행하지 않는다.
 * 예시 PE 딜(tools/seed-showcase-local.ts)과 demo 계정의 시드 VC 딜을 사용하고, 임시 사용자는 끝나면 지운다.
 * 실제 결제·AI 호출은 하지 않는다(가입 후 결제 화면으로 "이동"만 확인).
 *
 * Usage: DATABASE_URL='file:./dev.db' npx tsx tools/test-paid-product-e2e.ts
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PUBLIC_PLANS, hasFeature } from "../src/lib/plans";
import { PLAN_LIMITS } from "../src/lib/quotas";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();
let pass = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  pass++;
  console.log(`✅ ${msg}`);
}

const DEMO = { email: "demo@dealmind.kr", password: "Demo1234!" };

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 90000 });
}


/** 앱 화면 이동 — 이 화면들은 백그라운드 조회가 이어져 networkidle이 30초 안에 안 올 수 있다. 문서 로드 후 각 검증이 자기 셀렉터를 기다린다. */
async function gotoApp(page: Page, url: string) {
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1200);
  return res;
}

async function noHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

async function main() {
  if (!(process.env.DATABASE_URL ?? "").startsWith("file:")) {
    console.error("중단: 로컬 SQLite가 아닌 DB에는 실행하지 않습니다.");
    process.exit(1);
  }
  console.log(`\n=== 유료 제품 프론트엔드 E2E — 대상: ${BASE} ===\n`);

  const demoUser = await prisma.user.findUnique({ where: { email: DEMO.email }, select: { id: true } });
  const peDeal = await prisma.mADeal.findFirst({ where: { name: "예시 · 한빛정밀 인수 검토", userId: demoUser!.id }, select: { id: true } });
  if (!peDeal) throw new Error("예시 PE 딜이 없습니다 — DATABASE_URL='file:./dev.db' npx tsx tools/seed-showcase-local.ts");
  const vcDeal = await prisma.deal.findFirst({ where: { companyName: "네오비전 주식회사", userId: demoUser!.id }, select: { id: true, reports: { select: { id: true }, take: 1, orderBy: { createdAt: "desc" } } } });
  const vcReportId = vcDeal?.reports[0]?.id;
  if (!vcDeal || !vcReportId) throw new Error("네오비전 시드 딜/보고서가 없습니다");

  // 가입/로그인 속도 제한(RateLimit)은 같은 IP의 반복 실행에서 429를 낸다 — 로컬 SQLite의 제한 기록만 비운다(위에서 로컬 DB임을 확인함)
  await prisma.rateLimit.deleteMany({});

  const stamp = Date.now();
  const emptyUser = await prisma.user.create({
    data: { email: `paid-e2e-empty-${stamp}@example.com`, name: "신규 사용자", passwordHash: await bcrypt.hash("Paid1234!Test", 4) },
    select: { id: true, email: true },
  });
  const registeredEmails: string[] = [];

  const browser: Browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "/opt/pw-browsers/chromium" });
  const consoleErrors: string[] = [];
  const track = (page: Page) => {
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
    });
    page.on("pageerror", (e) => consoleErrors.push(`PAGEERROR: ${e.message.slice(0, 200)}`));
  };

  try {
    // ── 1. 랜딩 (비로그인) ─────────────────────────────────────────
    const anonCtx: BrowserContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const anon = await anonCtx.newPage();
    track(anon);
    await anon.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const landingText = await anon.innerText("body");
    assert((await anon.locator("#hero-title").innerText()).replace(/\s/g, "") === "투자의논지부터,판단의근거까지.", "랜딩 헤드라인이 논지와 근거의 연결을 명시한다");
    assert(!landingText.includes("Coming soon"), "'Coming soon' 표기가 없다");
    for (const banned of ["10분", "80%", "가장 많이 선택", "VCNote", "Skywork", "SOC 2 인증 완료"]) {
      assert(!landingText.includes(banned), `랜딩에 검증되지 않은 주장/경쟁사 지목이 없다: ${banned}`);
    }
    assert((await anon.locator('[data-testid="landing-product-preview"]').innerText()).includes("예시 데이터"), "제품 미리보기에 '예시 데이터'가 항상 표시된다");
    assert(await anon.locator('[data-testid="landing-preview-vc"]').isVisible(), "미리보기 기본은 VC 화면");
    await anon.getByRole("tab", { name: /PE\/M&A/ }).click();
    assert(await anon.locator('[data-testid="landing-preview-pe"]').isVisible(), "미리보기 탭 전환으로 PE 화면이 보인다");
    assert((await anon.locator('a[href="/register?track=pe"]').count()) >= 1 && (await anon.locator('a[href="/register?track=vc"]').count()) >= 1, "두 트랙 모두 실제 가입 링크로 연결된다");
    for (const plan of PUBLIC_PLANS.slice(0, 3)) {
      const priceText = plan.price === 0 ? "₩0" : `₩${plan.price.toLocaleString()}`;
      assert(landingText.includes(priceText) && landingText.includes(plan.name), `랜딩 가격표가 lib/plans의 ${plan.name} ${priceText}와 같다`);
    }
    assert((await anon.locator("#faq details").count()) === 7, "FAQ 7개 항목(접기/펼치기)");
    assert(!(await anon.locator("body").innerText()).includes("10명까지"), "근거 없는 팀 인원 한도 문구가 없다");

    // ── 2. 요금 페이지: 표가 실제 한도·권한과 같은 정의에서 나온다 ────
    await anon.goto(`${BASE}/pricing`, { waitUntil: "networkidle" });
    const table = anon.locator('[data-testid="pricing-compare"] table');
    const headers = await table.locator("thead th").allInnerTexts();
    assert(PUBLIC_PLANS.every((p) => headers.includes(p.name)), "업무 비교표의 열이 6개 플랜과 같다");
    const reportsRow = table.locator("tbody tr", { hasText: "월 보고서 생성" });
    const reportCells = await reportsRow.locator("td").allInnerTexts();
    assert(PUBLIC_PLANS.every((p, i) => reportCells[i].trim() === String(PLAN_LIMITS[p.key].reports)), "월 보고서 한도 행이 PLAN_LIMITS와 같다");
    const teamRow = table.locator("tbody tr", { hasText: "팀 협업" });
    const teamCells = await teamRow.locator("td").allInnerTexts();
    assert(PUBLIC_PLANS.every((p, i) => teamCells[i].includes(hasFeature(p.key, "teamCollaboration") ? "포함" : "미포함")), "팀 협업 행이 hasFeature와 같다(색이 아니라 텍스트로도 구분)");
    assert(!(await anon.locator("body").innerText()).includes("가장 많이 선택"), "요금 화면에 근거 없는 인기 표시가 없다");

    // ── 3. 가입: 요금제 경로 안내 + 이동만(결제 없음) ────────────────
    await anon.goto(`${BASE}/register?plan=evil`, { waitUntil: "networkidle" });
    assert((await anon.locator('[data-testid="register-plan-note"]').count()) === 0, "알 수 없는 plan 값은 무시된다");
    await anon.goto(`${BASE}/register?plan=solo`, { waitUntil: "networkidle" });
    await anon.waitForTimeout(1200);
    assert((await anon.locator('[data-testid="register-plan-note"]').innerText()).includes("가입만으로 결제되지 않습니다"), "플랜 안내에 '가입만으로 결제되지 않는다'가 명시된다");
    const regEmail = `paid-e2e-reg-${stamp}@example.com`;
    registeredEmails.push(regEmail);
    await anon.fill("#name", "요금제 가입자");
    await anon.fill("#email", regEmail);
    await anon.fill("#password", "Paid1234!Test");
    await anon.fill("#confirmPassword", "Paid1234!Test");
    await anon.click('button[type="submit"]');
    await anon.waitForURL(/\/settings/, { timeout: 90000 });
    const settingsUrl = new URL(anon.url());
    assert(settingsUrl.searchParams.get("plan") === "solo" && settingsUrl.hash === "#subscription" && !settingsUrl.searchParams.has("payment"), "가입 후 구독 영역으로 이동하고 결제 성공 파라미터는 없다(결제가 일어나지 않음)");
    await anonCtx.close();

    // ── 4. 신규(빈) 계정 — 온보딩 + 다른 사용자 데이터가 보이지 않는다 ──
    const emptyCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const empty = await emptyCtx.newPage();
    track(empty);
    await login(empty, emptyUser.email, "Paid1234!Test");
    await empty.waitForSelector('[data-testid="dashboard-onboarding"]', { timeout: 60000 });
    const onboarding = await empty.locator('[data-testid="dashboard-onboarding"]').innerText();
    assert(onboarding.includes("첫 VC 딜 만들기") && onboarding.includes("첫 PE/M&A 딜 만들기"), "딜이 없으면 빈 대시보드 대신 VC/PE 첫 행동을 안내한다");
    const emptyDash = await empty.innerText("body");
    assert(!emptyDash.includes("네오비전") && !emptyDash.includes("한빛정밀"), "신규 사용자의 대시보드에 다른 계정의 딜이 나타나지 않는다");
    await gotoApp(empty, `${BASE}/ma-deals`);
    assert((await empty.locator('[data-testid="pe-deal-row"]').count()) === 0, "신규 사용자의 PE 목록은 비어 있다");
    const forbidden = await gotoApp(empty, `${BASE}/ma-deals/${peDeal.id}`);
    await empty.waitForFunction(() => /찾을 수 없|404/.test(document.body.innerText), undefined, { timeout: 20000 }).catch(() => undefined);
    const forbiddenText = await empty.innerText("body");
    assert(forbidden?.status() === 404 || /찾을 수 없|404/.test(forbiddenText), "남의 PE 딜 URL은 열리지 않는다(404)");
    assert(!forbiddenText.includes("한빛정밀"), "남의 PE 딜 이름이 새지 않는다");
    // 남의 보고서 URL — 404 페이지가 뜨므로 networkidle 대신 문서 로드 후 잠시 기다린다
    const otherReport = await empty.goto(`${BASE}/reports/${vcReportId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await empty.waitForFunction(() => /찾을 수 없|404/.test(document.body.innerText), undefined, { timeout: 20000 }).catch(() => undefined);
    assert(otherReport?.status() === 404 || /찾을 수 없|404/.test(await empty.innerText("body")), "남의 VC 보고서 URL은 열리지 않는다(404)");
    assert(!(await empty.innerText("body")).includes("네오비전"), "남의 VC 보고서 URL도 내용이 새지 않는다");
    await emptyCtx.close();

    // ── 5. demo 계정 ────────────────────────────────────────────────
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    track(page);
    await login(page, DEMO.email, DEMO.password);

    // 5a. 대시보드 검토 대기열
    await page.waitForSelector('[data-testid="dashboard-review-queue"]', { timeout: 60000 });
    const vcQueueText = await page.locator('[data-testid="dashboard-vc-queue"]').innerText();
    assert(vcQueueText.includes("네오비전") && vcQueueText.includes("수치 상충"), "대시보드 VC 대기열이 상충이 있는 딜을 먼저 보여준다");
    const firstVcRow = await page.locator('[data-testid="dashboard-vc-row"]').first().innerText();
    assert(firstVcRow.includes("네오비전"), "VC 대기열 첫 줄은 가장 검토가 급한 딜(상충)");
    const peQueueText = await page.locator('[data-testid="dashboard-pe-queue"]').innerText();
    assert(peQueueText.includes("한빛정밀") && peQueueText.includes("차단 요인"), "대시보드 PE 대기열이 차단된 딜과 차단 요인 수를 보여준다");
    assert(!peQueueText.includes("BLOCKED") && !/cmu[a-z0-9]{15,}/.test(peQueueText), "PE 대기열에 영문 상태 코드·내부 id가 없다");
    assert((await page.innerText("body")).includes("VC — 투자 판단 검토") && (await page.innerText("body")).includes("PE/M&A — 검증 준비 상태"), "VC와 PE는 서로 다른 판단 체계로 나란히 표기된다(점수를 합치지 않음)");

    // 5b. VC 목록
    await gotoApp(page, `${BASE}/deals`);
    await page.waitForSelector('[data-testid="vc-deal-row"]', { timeout: 60000 });
    await page.waitForSelector('[data-testid="vc-row-next-action"]', { timeout: 60000 });
    const rows = page.locator('[data-testid="vc-deal-row"]');
    assert((await rows.count()) >= 2, "VC 목록이 표(검토 대기열)로 보인다");
    assert((await rows.first().innerText()).includes("네오비전"), "'검토 필요 순' 첫 줄은 상충이 있는 딜");
    assert((await rows.first().locator('[data-testid="vc-row-attention"]').innerText()).includes("수치 상충"), "첫 줄에 수치 상충 건수가 텍스트로 보인다(색만으로 구분하지 않음)");
    const noReportRow = rows.filter({ hasText: "보고서 없음" }).first();
    assert((await noReportRow.innerText()).includes("보고서를 생성하면 투자 판단이"), "보고서가 없는 딜은 판단을 지어내지 않고 다음 행동을 안내한다");
    // 권고가 '준비됨'이 아닌 딜에 상정 준비를 안내하지 않는다
    const healthRow = rows.filter({ hasText: "헬스케어AI" }).first();
    assert(!(await healthRow.innerText()).includes("상정 준비"), "근거가 부족한 딜에 'IC 상정 준비'를 안내하지 않는다");
    await page.getByRole("button", { name: "최근 수정 순" }).click();
    assert((await page.getByRole("button", { name: "최근 수정 순" }).getAttribute("aria-pressed")) === "true", "정렬 전환이 상태로 표시된다");
    await page.getByRole("button", { name: "카드" }).click();
    assert((await page.locator(".grid a, .grid button", { hasText: "상세 보기" }).count()) > 0, "카드 보기도 그대로 동작(보조 뷰)");
    await page.getByRole("button", { name: "검토 대기열" }).click();

    // 5c. 근거 패널
    await gotoApp(page, `${BASE}/reports/${vcReportId}`);
    await page.waitForSelector('[data-testid="vc-contradictions"]', { timeout: 60000 });
    const opener = page.locator('[data-testid="vc-contradictions"] [data-testid="vc-open-evidence"]').first();
    await opener.focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="vc-evidence-panel"]', { timeout: 10000 });
    const panel = page.locator('[data-testid="vc-evidence-panel"]');
    const panelText = await panel.innerText();
    assert(panelText.includes("95억원") && panelText.includes("110억원"), "근거 패널에 상충하는 두 값이 나란히 보인다");
    assert(panelText.includes("IR_Deck_2024.pdf") && panelText.includes("재무제표_감사보고서.pdf"), "각 값의 문서명이 보인다");
    assert(panelText.includes("원문 발췌") && panelText.includes("네오비전 IR."), "원문 발췌가 실제로 보인다(저장된 것만)");
    assert(panelText.includes("어느 값이 맞는지는 시스템이 고르지 않습니다"), "시스템이 값을 고르지 않는다는 점이 명시된다");
    await page.getByRole("tab", { name: /110억원/ }).click();
    assert((await panel.locator('[data-testid="vc-evidence-entry"]').innerText()).includes("재무제표_감사보고서.pdf"), "다른 값을 선택하면 그 값의 문서가 보인다");
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => !!document.activeElement?.closest('[data-testid="vc-evidence-panel"]'));
    assert(inside, "Tab 키를 눌러도 초점이 패널 안에 머문다(모달)");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    assert((await page.locator('[data-testid="vc-evidence-panel"]').count()) === 0, "Esc로 패널이 닫힌다");
    assert((await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "vc-open-evidence", "닫으면 패널을 연 버튼으로 초점이 돌아온다");

    // 5d. PE 목록 → 탭 URL
    await gotoApp(page, `${BASE}/ma-deals`);
    await page.waitForSelector('[data-testid="pe-deal-row"]', { timeout: 60000 });
    const peRows = page.locator('[data-testid="pe-deal-row"]');
    assert((await peRows.first().getAttribute("data-deal-id")) !== null, "PE 목록이 표로 보인다");
    const exampleRow = peRows.filter({ hasText: "한빛정밀" }).first();
    const exampleText = await exampleRow.innerText();
    assert(exampleText.includes("차단 요인") && exampleText.includes("매출액 값 불일치"), "차단된 예시 딜이 목록에서 차단 요인과 다음 행동을 바로 보여준다");
    assert(!exampleText.includes("REVENUE"), "계정 코드가 한국어로 표시된다");
    const firstBlockedIdx = await peRows.evaluateAll((els) => els.findIndex((e) => e.textContent?.includes("차단 요인")));
    const firstReadyIdx = await peRows.evaluateAll((els) => els.findIndex((e) => !e.textContent?.includes("차단 요인")));
    assert(firstBlockedIdx === 0 && firstReadyIdx > firstBlockedIdx, "'검토 필요 순'에서 차단된 딜이 앞에 온다");
    await exampleRow.getByRole("link", { name: /해당 탭 열기/ }).click();
    await page.waitForURL(new RegExp(`/ma-deals/${peDeal.id}\\?tab=financials`), { timeout: 60000 });
    await page.waitForSelector('[role="tab"]', { timeout: 60000 });
    assert((await page.getByRole("tab", { name: "재무 · QoE" }).getAttribute("aria-selected")) === "true", "다음 행동 링크가 해당 탭(재무 · QoE)을 바로 연다");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[role="tab"]', { timeout: 60000 });
    assert((await page.getByRole("tab", { name: "재무 · QoE" }).getAttribute("aria-selected")) === "true", "새로고침 후에도 같은 탭이 유지된다");
    await page.getByRole("tab", { name: "LBO 시뮬레이션" }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("tab") === "lbo", undefined, { timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(1200); // 라우터가 URL을 되돌리지 않고 유지하는지까지 확인
    assert(new URL(page.url()).searchParams.get("tab") === "lbo", "탭을 바꾸면 URL이 함께 바뀌고 유지된다");
    await gotoApp(page, `${BASE}/ma-deals/${peDeal.id}?tab=%3Cscript%3E`);
    await page.waitForSelector('[role="tab"]', { timeout: 60000 });
    assert((await page.getByRole("tab", { name: "개요" }).getAttribute("aria-selected")) === "true", "알 수 없는 tab 값은 개요로 안전하게 처리된다");

    // 5e. PE 개요 — 상태 패널이 먼저
    const status = page.locator('[data-testid="pe-status-panel"]');
    await status.waitFor({ timeout: 30000 });
    const statusText = await status.innerText();
    assert(statusText.includes("매출액 값 불일치") && statusText.includes("1,200억원") && statusText.includes("1,180억원"), "개요 첫 블록에 충돌하는 두 값이 억원 단위로 보인다");
    assert(!/cmu[a-z0-9]{15,}/.test(statusText) && !statusText.includes("120000000000") && !statusText.includes("BLOCKED"), "내부 id·원 단위 정수·영문 상태 코드가 화면에 없다");
    const topOfPanel = await status.evaluate((el) => el.getBoundingClientRect().top);
    assert(topOfPanel < 420, `차단 요인이 첫 화면에 있다(패널 상단 y=${Math.round(topOfPanel)}px)`);
    assert((await page.locator('[data-testid="pe-status-next"]').innerText()).includes("차단 요인 해소"), "다음 행동이 명시된다");
    await page.locator('[data-testid="pe-status-next-open"]').click();
    assert((await page.getByRole("tab", { name: "재무 · QoE" }).getAttribute("aria-selected")) === "true", "다음 행동 버튼이 해당 탭으로 이동시킨다");

    // 5f. 재무 탭 — 충돌 값
    const conflicts = page.locator('[data-testid="pe-fact-conflicts"]');
    await conflicts.waitFor({ timeout: 30000 });
    const conflictText = await conflicts.innerText();
    assert(conflictText.includes("1,200억원") && conflictText.includes("수기 입력") && conflictText.includes("1,180억원") && conflictText.includes("DART"), "충돌 값이 억원 단위와 출처(수기 입력/DART)와 함께 상시 보인다");
    assert(!(await page.innerText("body")).includes("Financial conflict detected"), "영문 경고 문구가 없다");

    // 5g. 위원회 자료
    await page.getByRole("tab", { name: "위원회 자료" }).click();
    await page.locator('[data-testid="pe-pack-header"]').waitFor({ timeout: 30000 });
    const packText = await page.locator('[data-testid="pe-pack-header"]').innerText();
    assert(packText.includes("투자심의위원회 자료") && packText.includes("한빛정밀"), "위원회 자료 머리에 딜명과 문서 성격이 있다");
    assert(packText.includes("검토 완료") && packText.includes("투자 승인이 아닙니다"), "'검토 완료'와 '투자 승인'이 구분된다는 안내가 있다");
    assert(packText.includes("현재 데이터") && packText.includes("검토 이력"), "과거 검토와 현재 데이터를 구분해서 본다는 안내가 있다");
    const packBody = await page.innerText("body");
    for (const en of ["Investment Thesis", "Key Investment Drivers", "Thesis Breakers / Key Risks", "PE IC Committee Pack"]) {
      assert(!packBody.includes(en), `위원회 자료에 영문 섹션 제목이 없다: ${en}`);
    }
    assert((await page.locator('a[href$="/committee-pack/print"]').count()) === 1 && (await page.locator('a[href*="format=docx"]').count()) === 1 && (await page.locator('a[href*="format=pptx"]').count()) === 1, "인쇄/DOCX/PPTX 내보내기 링크가 있다");
    await ctx.close();

    // ── 6. 반응형: 5개 너비 × 주요 화면, 페이지 자체 가로 스크롤 없음 ──
    const widths = [390, 430, 768, 1024, 1440];
    const screens: Array<[string, string, string]> = [
      ["랜딩", "/", ""],
      ["요금", "/pricing", ""],
      ["가입", "/register?track=pe", ""],
      ["대시보드", "/dashboard", "auth"],
      ["VC 목록", "/deals", "auth"],
      ["VC 결정 화면", `/reports/${vcReportId}`, "auth"],
      ["PE 목록", "/ma-deals", "auth"],
      ["PE 개요", `/ma-deals/${peDeal.id}`, "auth"],
      ["PE 재무", `/ma-deals/${peDeal.id}?tab=financials`, "auth"],
      ["PE LBO", `/ma-deals/${peDeal.id}?tab=lbo`, "auth"],
      ["PE 위원회 자료", `/ma-deals/${peDeal.id}?tab=committee-pack`, "auth"],
    ];
    for (const w of widths) {
      const c = await browser.newContext({ viewport: { width: w, height: 900 } });
      const p = await c.newPage();
      track(p);
      let loggedIn = false;
      for (const [name, path, auth] of screens) {
        if (auth && !loggedIn) {
          await login(p, DEMO.email, DEMO.password);
          loggedIn = true;
        }
        await gotoApp(p, `${BASE}${path}`);
        await p.waitForTimeout(1500);
        assert(await noHorizontalOverflow(p), `${w}px · ${name}: 페이지 자체 가로 스크롤 없음`);
      }
      await c.close();
    }
    // 접근성 기본: 랜딩·요금의 이미지 대체텍스트/제목 위계
    const a11yCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const a11y = await a11yCtx.newPage();
    for (const path of ["/", "/pricing"]) {
      await gotoApp(a11y, `${BASE}${path}`);
      assert((await a11y.locator("h1").count()) === 1, `${path}: h1이 하나`);
      assert((await a11y.locator("img:not([alt])").count()) === 0, `${path}: alt 없는 이미지가 없다`);
    }
    await a11yCtx.close();

    // ERR_TUNNEL_CONNECTION_FAILED: 샌드박스가 외부(Vercel Speed Insights 스크립트) 접속을 막아서 나는 환경 문제 — 다른 E2E도 같은 이유로 제외한다
    // CLIENT_FETCH_ERROR(Failed to fetch /api/auth/session): 테스트가 다음 화면으로 빠르게 이동하면서 진행 중이던 세션 조회가 취소될 때 next-auth가 남기는 로그다
    const unexpected = consoleErrors.filter((e) => !/hydrat|favicon|ERR_TUNNEL_CONNECTION_FAILED|CLIENT_FETCH_ERROR|Failed to load resource.*(401|404)/i.test(e));
    assert(unexpected.length === 0, `콘솔 에러 없음(실제: ${JSON.stringify(unexpected.slice(0, 3))})`);
    console.log(`\n${pass}개 통과`);
  } finally {
    await browser.close();
    await prisma.user.deleteMany({ where: { id: emptyUser.id } });
    if (registeredEmails.length) await prisma.user.deleteMany({ where: { email: { in: registeredEmails } } });
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error(`\n❌ 실패: ${e instanceof Error ? e.stack ?? e.message : e}`);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
