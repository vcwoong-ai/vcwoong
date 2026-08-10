/**
 * 모바일 폭에서 실제로 렌더해 가로 넘침·콘솔 에러가 없는지 확인한다.
 *
 * 좁은 화면에서 레이아웃이 깨지는 건 CSS 클래스만 봐서는 놓치기 쉬워서
 * (사이드바 pl-64가 모바일에도 걸려 본문이 100px대로 눌리던 문제처럼),
 * 실제 브라우저로 폭을 재는 게 확실하다.
 *
 * Usage:
 *   npm run dev:local          # 다른 터미널에서 서버 실행 후
 *   npm run test:mobile
 *   npm run test:mobile -- https://preview-url.vercel.app
 *
 * Playwright가 devDependency라 CI(오프라인 test:all)에는 넣지 않는다.
 */
import { chromium } from "playwright";

const BASE = (process.argv[2] ?? process.env.MOBILE_TEST_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.SMOKE_EMAIL ?? "demo@axiom.kr";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "Demo1234!";
const WIDTH = 375; // iPhone SE / 일반적인 최소 폭

const PAGES = [
  "/dashboard",
  "/deals",
  "/reports",
  "/reports/new",
  "/templates",
  "/portfolio",
  "/lp-report",
  "/sourcing",
  "/upload",
  "/settings",
];

async function main() {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  // 하이드레이션 오류처럼 눈에 안 보이는 문제도 같이 잡는다.
  const consoleErrors = new Set<string>();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.add(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => consoleErrors.add(`PAGEERROR: ${e.message.slice(0, 200)}`));

  // 로그인
  await page.goto(`${BASE}/login`);
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  console.log(`대상: ${BASE}\n로그인 완료\n`);

  let problems = 0;
  for (const path of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(400);

    const result = await page.evaluate((vw) => {
      const docW = document.documentElement.scrollWidth;
      const offenders: string[] = [];
      if (docW > vw + 1) {
        document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > vw + 1) {
            const cls = (el.className || "").toString().slice(0, 60);
            offenders.push(`${el.tagName.toLowerCase()}.${cls} (right=${Math.round(r.right)})`);
          }
        });
      }
      return { docW, offenders: offenders.slice(0, 3) };
    }, WIDTH);

    if (result.docW > WIDTH + 1) {
      problems++;
      console.log(`❌ ${path} — 문서 폭 ${result.docW}px (뷰포트 ${WIDTH}px)`);
      result.offenders.forEach((o) => console.log(`     ${o}`));
    } else {
      console.log(`✅ ${path} — ${result.docW}px`);
    }
  }

  // 딜 상세 (스크린샷에서 가장 깨졌던 화면) — 카드가 router 이동이라 API로 id를 얻는다
  const dealLink = await page
    .evaluate(async () => {
      const res = await fetch("/api/deals");
      const json = await res.json();
      const id = json?.data?.[0]?.id;
      return id ? `/deals/${id}` : null;
    })
    .catch(() => null);
  if (dealLink) {
    await page.goto(`${BASE}${dealLink}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    if (w > WIDTH + 1) { problems++; console.log(`❌ ${dealLink} — ${w}px`); }
    else console.log(`✅ ${dealLink} (딜 상세) — ${w}px`);
    await page.screenshot({ path: "/tmp/mobile-deal.png", fullPage: false });
  }

  // 사이드바 드로어 동작 확인
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  const asideBefore = await page.locator("aside").boundingBox();
  await page.click('button[aria-label="메뉴 열기"]');
  await page.waitForTimeout(400);
  const asideAfter = await page.locator("aside").boundingBox();
  console.log(
    `\n사이드바: 닫힘 x=${asideBefore?.x} → 열림 x=${asideAfter?.x} ` +
      ((asideBefore?.x ?? 0) < 0 && (asideAfter?.x ?? -1) === 0 ? "✅" : "❌")
  );
  await page.screenshot({ path: "/tmp/mobile-drawer.png" });

  await browser.close();

  if (consoleErrors.size > 0) {
    console.log("\n콘솔 에러:");
    consoleErrors.forEach((e) => console.log(`  - ${e}`));
    problems += consoleErrors.size;
  }

  if (problems === 0) {
    console.log("\n✅ 가로 넘침·콘솔 에러 없음");
  } else {
    console.log(`\n❌ 문제 ${problems}건`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
