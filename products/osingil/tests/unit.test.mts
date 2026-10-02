// 실행: npm test
import test from "node:test";
import assert from "node:assert/strict";

process.env.APP_URL = "https://osingil.example.com";
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.CAFE24_CLIENT_ID = "cid";
process.env.CAFE24_CLIENT_SECRET = "csecret";
process.env.DATABASE_URL = "pglite:memory";

const { verifyLaunchQuery, parseCafe24Time, parseOrder, isValidMallId } = await import("../src/lib/cafe24");
const { seal, unseal } = await import("../src/lib/session");
const { summarize, toCsv, kstDate } = await import("../src/lib/stats");
const { surveyInput, resolveAnswer, DEFAULT_SURVEY } = await import("../src/lib/survey");
const { kstMonthStart } = await import("../src/lib/plan");
const { widgetSource } = await import("../src/app/widget.js/widget-source");

// 카페24 공식 샘플(cafe24_app_discount_sample AppService.java)에 들어 있는 테스트 값
const SAMPLE_SECRET = "zoQxSUptApmiFLRl2ChaxB";
const SAMPLE_PLAIN = "is_multi_shop=T&lang=ko_KR&mall_id=jhbaek02&nation=KR&shop_no=1&timestamp=1622513360&user_id=jhbaek02&user_name=jhbaek02&user_type=P";
const SAMPLE_HMAC = "8%2BhYywQW5fBMpfbTlA1puAMpM91N0FYtrpzHYrdodDM%3D";

test("앱 실행 hmac: 카페24 공식 샘플 값으로 검증 통과", () => {
  const r = verifyLaunchQuery(`?${SAMPLE_PLAIN}&hmac=${SAMPLE_HMAC}`, SAMPLE_SECRET, 1622513360 + 30);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.params.get("mall_id"), "jhbaek02");
});

test("앱 실행 hmac: 값 변조·만료·누락은 거부", () => {
  const tampered = SAMPLE_PLAIN.replace("mall_id=jhbaek02", "mall_id=attacker");
  assert.equal(verifyLaunchQuery(`${tampered}&hmac=${SAMPLE_HMAC}`, SAMPLE_SECRET, 1622513360).ok, false);
  const expired = verifyLaunchQuery(`${SAMPLE_PLAIN}&hmac=${SAMPLE_HMAC}`, SAMPLE_SECRET, 1622513360 + 3600);
  assert.deepEqual(expired, { ok: false, reason: "만료된 요청" });
  assert.equal(verifyLaunchQuery(SAMPLE_PLAIN, SAMPLE_SECRET, 1622513360).ok, false);
  assert.equal(verifyLaunchQuery(`${SAMPLE_PLAIN}&hmac=${SAMPLE_HMAC}`, "wrong-secret", 1622513360).ok, false);
});

test("mall_id 형식", () => {
  assert.equal(isValidMallId("jhbaek02"), true);
  assert.equal(isValidMallId("a"), false);
  assert.equal(isValidMallId("../etc"), false);
});

test("세션 쿠키: 서명 변조와 만료를 거부", () => {
  const t = seal({ mall_id: "shop1" }, "k".repeat(32), 60);
  assert.equal(unseal<{ mall_id: string }>(t, "k".repeat(32))?.mall_id, "shop1");
  assert.equal(unseal(t, "x".repeat(32)), null);
  const [p, s] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ mall_id: "other", exp: 9999999999 })).toString("base64url");
  assert.equal(unseal(`${forged}.${s}`, "k".repeat(32)), null);
  assert.equal(unseal(`${p}.${s}x`, "k".repeat(32)), null);
  assert.equal(unseal(seal({ a: 1 }, "k".repeat(32), -1), "k".repeat(32)), null);
});

test("카페24 시각(시간대 없음)은 한국 시간으로 해석", () => {
  assert.equal(parseCafe24Time("2026-10-02T15:00:00.000", 0).toISOString(), "2026-10-02T06:00:00.000Z");
  assert.equal(parseCafe24Time("2026-10-02T15:00:00+09:00", 0).toISOString(), "2026-10-02T06:00:00.000Z");
  const fb = parseCafe24Time(undefined, 60_000).getTime() - Date.now();
  assert.ok(fb > 50_000 && fb <= 60_000);
});

test("주문 응답 해석: 결제금액 필드 여러 형태", () => {
  assert.deepEqual(parseOrder({ order: { payment_amount: "35000.00", order_date: "2026-10-01T10:00:00+09:00" } }).amount, 35000);
  assert.equal(parseOrder({ order: { actual_order_amount: { payment_amount: "12000.00" } } }).amount, 12000);
  assert.equal(parseOrder({ order: { initial_order_amount: { payment_amount: "9900" } } }).amount, 9900);
  assert.deepEqual(parseOrder({}), { found: false, amount: null, orderedAt: null });
  assert.equal(parseOrder({ order: {} }).found, true);
});

test("집계: 채널별 비중·매출·객단가", () => {
  const now = new Date("2026-10-02T03:00:00Z");
  const rows = [
    { answer_label: "인스타그램", other_text: null, amount: 30000, created_at: "2026-10-02T01:00:00Z" },
    { answer_label: "인스타그램", other_text: null, amount: 50000, created_at: "2026-10-01T01:00:00Z" },
    { answer_label: "지인 추천", other_text: null, amount: 100000, created_at: "2026-10-01T02:00:00Z" },
    { answer_label: "기타", other_text: "라디오", amount: null, created_at: "2026-09-30T01:00:00Z" },
    { answer_label: "기타", other_text: " 라디오 ", amount: 10000, created_at: "2026-09-30T02:00:00Z" },
  ];
  const s = summarize(rows, 7, now);
  assert.equal(s.total, 5);
  assert.equal(s.revenue, 190000);
  assert.deepEqual(s.channels.map((c) => [c.label, c.count, c.revenue, c.avgOrder]), [
    ["인스타그램", 2, 80000, 40000],
    ["기타", 2, 10000, 10000],
    ["지인 추천", 1, 100000, 100000],
  ]);
  assert.equal(s.channels[0].share, 0.4);
  assert.equal(s.daily.length, 7);
  assert.equal(s.daily[6].date, "2026-10-02");
  assert.equal(s.daily[6].count, 1);
  assert.equal(s.daily[5].count, 2);
  assert.deepEqual(s.otherTexts, [{ text: "라디오", count: 2 }]);
});

test("KST 날짜·월 경계", () => {
  assert.equal(kstDate(new Date("2026-09-30T15:30:00Z")), "2026-10-01");
  assert.equal(kstMonthStart(new Date("2026-09-30T15:30:00Z")).toISOString(), "2026-09-30T15:00:00.000Z");
});

test("CSV: BOM, 따옴표 이스케이프, KST 시각", () => {
  const csv = toCsv([{ created_at: "2026-10-01T15:00:00Z", order_id: "20261002-0000001", answer_label: "기타", other_text: 'TV "광고", 라디오', amount: 1000, verified: true }]);
  assert.ok(csv.startsWith("﻿응답일시"));
  assert.ok(csv.includes('2026-10-02 00:00:00,20261002-0000001,기타,"TV ""광고"", 라디오",1000,Y'));
});

test("설문 입력 검증", () => {
  assert.equal(surveyInput.safeParse(DEFAULT_SURVEY).success, true);
  assert.equal(surveyInput.safeParse({ ...DEFAULT_SURVEY, options: [{ id: "a", label: "A" }] }).success, false);
  assert.equal(surveyInput.safeParse({ ...DEFAULT_SURVEY, options: [{ id: "a", label: "A" }, { id: "a", label: "B" }] }).success, false);
  assert.equal(surveyInput.safeParse({ ...DEFAULT_SURVEY, options: [{ id: "other", label: "A" }, { id: "b", label: "B" }] }).success, false);
  assert.equal(resolveAnswer(DEFAULT_SURVEY, "instagram"), "인스타그램");
  assert.equal(resolveAnswer(DEFAULT_SURVEY, "other"), "기타");
  assert.equal(resolveAnswer({ ...DEFAULT_SURVEY, allow_other: false }, "other"), null);
  assert.equal(resolveAnswer(DEFAULT_SURVEY, "nope"), null);
});

test("위젯 스크립트는 문법 오류 없이 파싱된다", () => {
  assert.doesNotThrow(() => new Function(widgetSource("https://osingil.example.com")));
});
