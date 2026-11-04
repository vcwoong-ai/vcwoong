/**
 * 전체 흐름 E2E: 가짜 카페24 서버 + 실제 앱(next start) + 실제 브라우저.
 * 설치(서명 검증 → 권한 동의 → 토큰 → 스크립트 설치) → 고객 응답 → 대시보드 집계 → 설정 변경 → CSV → 크론.
 *
 * 실행: npm run build && npm run test:e2e
 * 브라우저 경로: CHROMIUM_PATH (기본 /opt/pw-browsers/chromium-1194/chrome-linux/chrome)
 */
import { createHmac } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync, rmSync } from "node:fs";
import assert from "node:assert/strict";
import { chromium, type Page } from "playwright-core";

const APP_PORT = 3100;
const MOCK_PORT = 3201;
const APP = `http://127.0.0.1:${APP_PORT}`;
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const MALL = "testmall";
const CLIENT_ID = "e2e-client";
const CLIENT_SECRET = "e2e-secret-value";
const OUT = process.env.E2E_OUT || "test-results";
mkdirSync(OUT, { recursive: true });

// ── 가짜 카페24 ─────────────────────────────────────
const kst = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().replace("Z", "").slice(0, 23);
const ORDERS: Record<string, number> = { "20261002-0000001": 35000, "20261002-0000002": 120000, "20261002-0000003": 18000 };
const scripttags: { script_no: number; src: string; display_location: string[] }[] = [];
const validTokens = new Set<string>();
let refreshCount = 0;
let tokenSeq = 0;

function issueToken() {
  const access = `at-${++tokenSeq}`;
  const refresh = `rt-${tokenSeq}`;
  validTokens.add(access);
  return {
    access_token: access,
    // 4분 뒤 만료 → 앱은 5분 여유를 두므로 매 호출마다 refresh 를 타게 된다 (갱신 경로 검증)
    expires_at: kst(Date.now() + 4 * 60_000),
    refresh_token: refresh,
    refresh_token_expires_at: kst(Date.now() + 14 * 86400_000),
    client_id: CLIENT_ID,
    mall_id: MALL,
    scopes: ["mall.read_application", "mall.write_application", "mall.read_order"],
  };
}

let lastRefresh = "";
function body(req: IncomingMessage): Promise<string> {
  return new Promise((r) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => r(b));
  });
}
function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const mock = createServer(async (req, res) => {
  const url = new URL(req.url || "/", MOCK);
  const path = url.pathname;
  if (path === "/shop/order/order_result.html") {
    const orderId = url.searchParams.get("o") || "";
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>주문완료</title></head>
<body style="font-family:sans-serif;padding:24px"><h1>주문이 완료되었습니다</h1><p>주문번호 ${orderId}</p>
<script>var EC_FRONT_EXTERNAL_SCRIPT_VARIABLE_DATA = { order_id: ${JSON.stringify(orderId)}, payed_amount: "1" };</script>
<script src="${APP}/widget.js?mall=${MALL}"></script></body></html>`);
    return;
  }
  const prefix = `/${MALL}`;
  if (!path.startsWith(prefix)) return json(res, 404, {});
  const p = path.slice(prefix.length);

  if (p === "/api/v2/oauth/authorize") {
    assert.equal(url.searchParams.get("client_id"), CLIENT_ID);
    assert.equal(url.searchParams.get("redirect_uri"), `${APP}/api/cafe24/callback`);
    assert.ok(url.searchParams.get("scope")!.includes("mall.read_order"));
    const back = new URL(url.searchParams.get("redirect_uri")!);
    back.searchParams.set("code", "auth-code-1");
    back.searchParams.set("state", url.searchParams.get("state")!);
    res.writeHead(302, { Location: back.toString() });
    return res.end();
  }
  if (p === "/api/v2/oauth/token" && req.method === "POST") {
    const expected = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`;
    if (req.headers.authorization !== expected) return json(res, 401, { error: "invalid_client" });
    const form = new URLSearchParams(await body(req));
    if (form.get("grant_type") === "authorization_code") {
      if (form.get("code") !== "auth-code-1") return json(res, 400, { error: "invalid_grant" });
      return json(res, 200, issueToken());
    }
    if (form.get("grant_type") === "refresh_token") {
      if (form.get("refresh_token") === lastRefresh) return json(res, 400, { error: "invalid_grant", error_description: "used" });
      lastRefresh = form.get("refresh_token") || "";
      refreshCount++;
      return json(res, 200, issueToken());
    }
    return json(res, 400, { error: "unsupported_grant_type" });
  }
  const auth = (req.headers.authorization || "").replace("Bearer ", "");
  if (!validTokens.has(auth)) return json(res, 401, { error: { message: "invalid token" } });

  if (p === "/api/v2/admin/scripttags" && req.method === "GET") return json(res, 200, { scripttags });
  if (p === "/api/v2/admin/scripttags" && req.method === "POST") {
    const b = JSON.parse(await body(req));
    const tag = { script_no: scripttags.length + 1, src: b.request.src, display_location: b.request.display_location };
    scripttags.push(tag);
    return json(res, 201, { scripttag: tag });
  }
  if (p.startsWith("/api/v2/admin/scripttags/") && req.method === "DELETE") {
    const no = Number(p.split("/").pop());
    const i = scripttags.findIndex((s) => s.script_no === no);
    if (i >= 0) scripttags.splice(i, 1);
    return json(res, 200, { scripttag: { script_no: no } });
  }
  if (p === "/api/v2/admin/orders/count") return json(res, 200, { count: 10 });
  if (p.startsWith("/api/v2/admin/orders/")) {
    const id = decodeURIComponent(p.split("/").pop() || "");
    if (!(id in ORDERS)) return json(res, 404, { error: { message: "not found" } });
    return json(res, 200, { order: { order_id: id, order_date: kst(Date.now() - 60_000), actual_order_amount: { payment_amount: `${ORDERS[id]}.00` } } });
  }
  json(res, 404, {});
});

// ── 앱 실행 ────────────────────────────────────────
function startApp(): Promise<ChildProcess> {
  rmSync(".data/e2e", { recursive: true, force: true });
  mkdirSync(".data", { recursive: true });
  const child = spawn("npx", ["next", "start", "-p", String(APP_PORT), "-H", "127.0.0.1"], {
    env: {
      ...process.env,
      APP_URL: APP,
      CAFE24_CLIENT_ID: CLIENT_ID,
      CAFE24_CLIENT_SECRET: CLIENT_SECRET,
      DATABASE_URL: "pglite:./.data/e2e",
      SESSION_SECRET: "e2e-session-secret-0123456789abcdef",
      CRON_SECRET: "cron-e2e",
      BILLING_MODE: "off",
      CAFE24_API_ORIGIN_TEMPLATE: `${MOCK}/{mall_id}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // 종료 시 next 하위 프로세스까지 함께 정리
  });
  child.stderr?.on("data", (d) => process.stderr.write(`[app] ${d}`));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("app start timeout")), 60_000);
    child.stdout?.on("data", (d) => {
      if (String(d).includes("Ready")) {
        clearTimeout(t);
        resolve(child);
      }
    });
  });
}

function launchUrl(secret = CLIENT_SECRET) {
  const ts = Math.floor(Date.now() / 1000);
  const plain = `is_multi_shop=F&lang=ko_KR&mall_id=${MALL}&nation=KR&shop_no=1&timestamp=${ts}&user_id=${MALL}&user_name=${encodeURIComponent("테스트몰")}&user_type=P`;
  const hmac = createHmac("sha256", secret).update(plain).digest("base64");
  return `${APP}/api/cafe24/launch?${plain}&hmac=${encodeURIComponent(hmac)}`;
}

async function answer(page: Page, orderId: string, label: string, otherText?: string) {
  await page.goto(`${MOCK}/shop/order/order_result.html?o=${orderId}`);
  const btn = page.locator("[data-osingil] .opt", { hasText: label }).first();
  await btn.waitFor({ timeout: 10_000 });
  await btn.click();
  if (otherText) {
    await page.locator("[data-osingil] .other input").fill(otherText);
    await page.locator("[data-osingil] .send").click();
  }
  await page.locator("[data-osingil] .done").waitFor();
  await page.waitForTimeout(400);
}

const results: string[] = [];
const pass = (m: string) => {
  results.push(`PASS ${m}`);
  console.log(`✅ ${m}`);
};

await new Promise<void>((r) => mock.listen(MOCK_PORT, "127.0.0.1", r));
const app = await startApp();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const pageErrors: string[] = [];

try {
  // 1. 서명이 틀린 실행 요청은 거부
  const bad = await fetch(launchUrl("wrong"), { redirect: "manual" });
  assert.equal(bad.status, 401);
  pass("잘못된 hmac 실행 요청 거부 (401)");

  // 2. 설치: 실행 → 권한 동의 → 콜백 → 대시보드
  const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const ap = await admin.newPage();
  ap.on("pageerror", (e) => pageErrors.push(`dashboard: ${e.message}`));
  await ap.goto(launchUrl());
  await ap.waitForURL(/\/dashboard\?installed=1/);
  await ap.getByText("설치가 끝났습니다").waitFor();
  assert.equal(await ap.getByText("주문 완료 화면에 설치됨").count(), 1);
  pass("설치 흐름: 서명 검증 → 권한 동의 → 토큰 발급 → 대시보드");

  assert.equal(scripttags.length, 1);
  assert.equal(scripttags[0].src, `${APP}/widget.js?mall=${MALL}`);
  assert.deepEqual(scripttags[0].display_location, ["ORDER_ORDERRESULT"]);
  pass("주문완료 화면에 스크립트 태그 1개 등록");

  // 3. 고객 응답 (모바일 화면)
  const shopper = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const sp = await shopper.newPage();
  sp.on("pageerror", (e) => pageErrors.push(`shop: ${e.message}`));
  await sp.goto(`${MOCK}/shop/order/order_result.html?o=20261002-0000001`);
  await sp.locator("[data-osingil] .opt").first().waitFor();
  await sp.waitForTimeout(400);
  await sp.screenshot({ path: `${OUT}/widget-mobile.png` });
  await answer(sp, "20261002-0000001", "인스타그램");
  await answer(sp, "20261002-0000002", "인스타그램");
  await answer(sp, "20261002-0000003", "기타", "라디오 광고");
  pass("고객 응답 3건 (보기 선택 2, 기타 직접입력 1)");

  // 같은 주문 다시 열면 설문이 뜨지 않음
  await sp.goto(`${MOCK}/shop/order/order_result.html?o=20261002-0000001`);
  await sp.waitForTimeout(1500);
  assert.equal(await sp.locator("[data-osingil]").count(), 0);
  pass("응답한 주문은 다시 묻지 않음");

  // 없는 주문번호는 저장 거부
  const fake = await fetch(`${APP}/api/public/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mall: MALL, order_id: "20261002-9999999", answer_id: "instagram" }),
  });
  assert.equal(fake.status, 404);
  const dup = await fetch(`${APP}/api/public/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mall: MALL, order_id: "20261002-0000001", answer_id: "youtube" }),
  });
  assert.equal((await dup.json()).duplicate, true);
  pass("카페24에 없는 주문 거부, 중복 응답 무시");

  // 4. 대시보드 집계 (결제금액은 화면값 1원이 아니라 카페24 주문 금액)
  await ap.goto(`${APP}/dashboard`);
  const kpiText = await ap.locator(".kpis").innerText();
  assert.match(kpiText, /인스타그램/);
  assert.match(kpiText, /3건/);
  assert.match(kpiText, /30\.0%/); // 응답 3 / 주문 10
  assert.match(kpiText, /17만원/); // 35,000 + 120,000 + 18,000 = 173,000
  const table = await ap.locator("table").first().innerText();
  assert.match(table, /인스타그램[\s\S]*66\.7%[\s\S]*16만원[\s\S]*8만원/);
  assert.match(await ap.locator(".others").innerText(), /라디오 광고/);
  await ap.screenshot({ path: `${OUT}/dashboard-1440.png`, fullPage: true });
  pass("대시보드: 1위 채널·응답률 30%·주문 확인 금액 17만원·채널별 객단가");

  assert.ok(refreshCount >= 1, "refresh token 경로가 한 번도 실행되지 않음");
  pass(`토큰 자동 갱신 동작 (${refreshCount}회)`);

  // 5. 설문 설정 변경
  await ap.fill("#q", "어디서 저희를 처음 보셨어요?");
  await ap.getByRole("button", { name: "+ 보기 추가" }).click();
  await ap.locator(".opt-row input").last().fill("당근마켓");
  await ap.getByRole("button", { name: "저장" }).click();
  await ap.getByText("저장했습니다").waitFor();
  const pub = await (await fetch(`${APP}/api/public/survey?mall=${MALL}`)).json();
  assert.equal(pub.question, "어디서 저희를 처음 보셨어요?");
  assert.ok(pub.options.some((o: { label: string }) => o.label === "당근마켓"));
  pass("설문 질문·보기 수정이 쇼핑몰 위젯에 반영");

  // 6. CSV
  const cookies = await admin.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const csvBytes = Buffer.from(await (await fetch(`${APP}/api/export`, { headers: { cookie: cookieHeader } })).arrayBuffer());
  assert.deepEqual([...csvBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // 엑셀 한글용 UTF-8 BOM
  const csv = csvBytes.toString("utf8");
  assert.match(csv, /20261002-0000002,인스타그램,,120000,Y/);
  assert.equal((await fetch(`${APP}/api/export`)).status, 401);
  pass("CSV 내보내기 (로그인 없으면 401)");

  // 7. 재실행 시 바로 대시보드
  const ap2 = await admin.newPage();
  await ap2.goto(launchUrl());
  await ap2.waitForURL(`${APP}/dashboard`);
  pass("설치된 쇼핑몰은 재실행 시 권한 동의 없이 대시보드로");

  // 8. 스크립트 재설치는 중복을 만들지 않음
  await ap.goto(`${APP}/dashboard`);
  await ap.getByRole("button", { name: "설문 스크립트 다시 설치" }).first().click();
  await ap.getByText("다시 설치했습니다").first().waitFor();
  assert.equal(scripttags.length, 1);
  pass("스크립트 재설치 시 기존 태그 교체 (중복 없음)");

  // 9. 크론 인증
  assert.equal((await fetch(`${APP}/api/cron/refresh`)).status, 401);
  const cron = await fetch(`${APP}/api/cron/refresh`, { headers: { authorization: "Bearer cron-e2e" } });
  assert.equal(cron.status, 200);
  pass("토큰 갱신 크론 (비밀값 없으면 401)");

  // 10. 모바일 대시보드 가로 스크롤 없음
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mob.addCookies(cookies);
  const mp = await mob.newPage();
  await mp.goto(`${APP}/dashboard`);
  const sw = await mp.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(sw <= 390, `mobile scrollWidth ${sw}`);
  await mp.screenshot({ path: `${OUT}/dashboard-390.png`, fullPage: true });
  const lp = await mob.newPage();
  await lp.goto(APP);
  assert.ok((await lp.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  await lp.screenshot({ path: `${OUT}/landing-390.png`, fullPage: true });
  const ld = await admin.newPage();
  await ld.goto(APP);
  await ld.screenshot({ path: `${OUT}/landing-1440.png`, fullPage: true });
  pass("모바일 390px 대시보드·랜딩 가로 스크롤 없음");

  assert.deepEqual(pageErrors, []);
  pass("브라우저 스크립트 오류 0건");
  console.log(`\nE2E ${results.length}건 통과`);
} finally {
  await browser.close();
  try {
    process.kill(-app.pid!, "SIGTERM");
  } catch {
    app.kill("SIGTERM");
  }
  mock.close();
}
