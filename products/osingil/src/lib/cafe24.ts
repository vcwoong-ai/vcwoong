/**
 * 카페24 연동. 형식은 카페24 공식 샘플(github.com/cafe24-app/cafe24_app_discount_sample)과 같다.
 * - 앱 실행 검증: 쿼리스트링에서 hmac 을 뺀 원문을 Client Secret 으로 HMAC-SHA256 → base64, ±1시간 timestamp
 * - 토큰: POST {mall}.cafe24api.com/api/v2/oauth/token, Basic(client_id:client_secret), form-urlencoded
 * - 스크립트 설치: POST /api/v2/admin/scripttags { shop_no, request: { src, display_location } }
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { one, query } from "./db";

// ── 앱 실행(launch) 요청 검증 ─────────────────────────────

export function verifyLaunchQuery(rawQuery: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): { ok: true; params: URLSearchParams } | { ok: false; reason: string } {
  const q = rawQuery.replace(/^\?/, "");
  const parts = q.split("&").filter(Boolean);
  const hmacPart = parts.find((p) => p.startsWith("hmac="));
  if (!hmacPart) return { ok: false, reason: "hmac 없음" };
  const plain = parts.filter((p) => !p.startsWith("hmac=")).join("&");
  const received = decodeURIComponent(hmacPart.slice("hmac=".length));
  const expected = createHmac("sha256", secret).update(plain, "utf8").digest("base64");
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "hmac 불일치" };
  const params = new URLSearchParams(q);
  const ts = Number(params.get("timestamp"));
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) >= 3600) return { ok: false, reason: "만료된 요청" };
  if (!isValidMallId(params.get("mall_id") || "")) return { ok: false, reason: "mall_id 형식 오류" };
  return { ok: true, params };
}

export function isValidMallId(id: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{1,39}$/i.test(id);
}

// ── OAuth ─────────────────────────────────────────────

export function apiOrigin(mallId: string): string {
  return env.cafe24ApiOriginTemplate.replace("{mall_id}", mallId);
}

export function redirectUri(): string {
  return `${env.appUrl}/api/cafe24/callback`;
}

export function authorizeUrl(mallId: string, state: string): string {
  const u = new URL(`${apiOrigin(mallId)}/api/v2/oauth/authorize`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", env.clientId);
  u.searchParams.set("state", state);
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("scope", env.scopes);
  return u.toString();
}

interface TokenResponse {
  access_token: string;
  expires_at?: string;
  refresh_token: string;
  refresh_token_expires_at?: string;
  scopes?: string[];
}

/** 카페24는 만료 시각을 시간대 없이 한국 시간으로 준다 ("2026-10-02T15:00:00.000"). 실패하면 보수적 기본값. */
export function parseCafe24Time(value: string | undefined, fallbackMs: number): Date {
  if (value) {
    const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
    const d = new Date(hasZone ? value : `${value}+09:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(Date.now() + fallbackMs);
}

async function tokenRequest(mallId: string, body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${apiOrigin(mallId)}/api/v2/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Cafe24Error(`토큰 발급 실패 (${res.status}): ${json.error_description || json.error || "응답 없음"}`, res.status);
  }
  return json;
}

async function saveToken(mallId: string, t: TokenResponse) {
  const accessExp = parseCafe24Time(t.expires_at, 110 * 60 * 1000);
  const refreshExp = parseCafe24Time(t.refresh_token_expires_at, 13 * 24 * 3600 * 1000);
  await query(
    `INSERT INTO malls (mall_id, access_token, access_expires_at, refresh_token, refresh_expires_at, scopes)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (mall_id) DO UPDATE SET access_token = $2, access_expires_at = $3, refresh_token = $4,
       refresh_expires_at = $5, scopes = $6, updated_at = now()`,
    [mallId, t.access_token, accessExp.toISOString(), t.refresh_token, refreshExp.toISOString(), (t.scopes || []).join(",")]
  );
}

export async function exchangeCode(mallId: string, code: string) {
  const t = await tokenRequest(mallId, { grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  await saveToken(mallId, t);
}

interface MallTokenRow {
  access_token: string;
  access_expires_at: Date | string;
  refresh_token: string;
  refresh_expires_at: Date | string;
}

export async function hasValidInstall(mallId: string): Promise<boolean> {
  const row = await one<MallTokenRow>(`SELECT refresh_expires_at FROM malls WHERE mall_id = $1`, [mallId]);
  return !!row && new Date(row.refresh_expires_at).getTime() > Date.now() + 60_000;
}

/** 유효한 access token 을 돌려준다. 만료 5분 전이면 refresh token 으로 갱신한다. */
export async function accessToken(mallId: string, force = false): Promise<string> {
  const row = await one<MallTokenRow>(
    `SELECT access_token, access_expires_at, refresh_token, refresh_expires_at FROM malls WHERE mall_id = $1`,
    [mallId]
  );
  if (!row) throw new Cafe24Error("설치되지 않은 쇼핑몰입니다.", 401);
  if (!force && new Date(row.access_expires_at).getTime() > Date.now() + 5 * 60_000) return row.access_token;
  if (new Date(row.refresh_expires_at).getTime() <= Date.now()) {
    throw new Cafe24Error("인증이 만료되었습니다. 카페24 관리자에서 앱을 다시 열어 주세요.", 401);
  }
  try {
    const t = await tokenRequest(mallId, { grant_type: "refresh_token", refresh_token: row.refresh_token });
    await saveToken(mallId, t);
    return t.access_token;
  } catch (e) {
    // 다른 요청이 동시에 갱신했을 수 있다(카페24 refresh token 은 1회용) — 저장된 값을 다시 확인
    const again = await one<MallTokenRow>(`SELECT access_token, access_expires_at FROM malls WHERE mall_id = $1`, [mallId]);
    if (again && again.access_token !== row.access_token && new Date(again.access_expires_at).getTime() > Date.now()) {
      return again.access_token;
    }
    throw e;
  }
}

export class Cafe24Error extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** 관리자 API 호출. 401 이면 토큰을 한 번 강제 갱신 후 재시도한다. */
export async function adminApi<T>(mallId: string, method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(mallId, attempt > 0);
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    if (env.cafe24ApiVersion) headers["X-Cafe24-Api-Version"] = env.cafe24ApiVersion;
    const res = await fetch(`${apiOrigin(mallId)}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (res.status === 401 && attempt === 0) continue;
    const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) throw new Cafe24Error(`카페24 API 오류 ${res.status} ${path}: ${json?.error?.message || ""}`, res.status);
    return json;
  }
  throw new Cafe24Error("카페24 인증 실패", 401);
}

// ── 스크립트 설치 ─────────────────────────────────────

export function widgetSrc(mallId: string): string {
  return `${env.appUrl}/widget.js?mall=${encodeURIComponent(mallId)}`;
}

interface ScriptTagRow {
  script_no: string | number;
  src: string;
}

/**
 * 주문완료 화면에 설문 스크립트를 등록한다. 기존에 등록한 우리 스크립트는 지우고 다시 단다(중복 방지).
 * ORDER_ORDERRESULT 코드가 거부되면 전체 페이지(all)로 등록한다 — 위젯이 스스로 주문완료 화면인지 확인하므로 안전하다.
 */
export async function installScriptTag(mallId: string): Promise<string> {
  const src = widgetSrc(mallId);
  try {
    const existing = await adminApi<{ scripttags?: ScriptTagRow[] }>(mallId, "GET", "/api/v2/admin/scripttags");
    for (const s of existing.scripttags || []) {
      if (String(s.src).startsWith(`${env.appUrl}/widget.js`)) {
        await adminApi(mallId, "DELETE", `/api/v2/admin/scripttags/${s.script_no}`).catch(() => undefined);
      }
    }
  } catch {
    // 목록 조회 실패는 설치를 막지 않는다
  }
  let created: { scripttag?: ScriptTagRow };
  try {
    created = await adminApi(mallId, "POST", "/api/v2/admin/scripttags", {
      shop_no: 1,
      request: { src, display_location: ["ORDER_ORDERRESULT"] },
    });
  } catch {
    created = await adminApi(mallId, "POST", "/api/v2/admin/scripttags", {
      shop_no: 1,
      request: { src, display_location: ["all"] },
    });
  }
  const scriptNo = String(created.scripttag?.script_no ?? "");
  await query(`UPDATE malls SET script_no = $2, updated_at = now() WHERE mall_id = $1`, [mallId, scriptNo]);
  return scriptNo;
}

// ── 주문 조회 ─────────────────────────────────────────

export interface OrderLookup {
  found: boolean;
  amount: number | null;
  orderedAt: Date | null;
}

function toWon(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function parseOrder(json: unknown): OrderLookup {
  const order = (json as { order?: Record<string, unknown> })?.order;
  if (!order) return { found: false, amount: null, orderedAt: null };
  const actual = order.actual_order_amount as Record<string, unknown> | undefined;
  const initial = order.initial_order_amount as Record<string, unknown> | undefined;
  const amount = toWon(order.payment_amount) ?? toWon(actual?.payment_amount) ?? toWon(initial?.payment_amount) ?? toWon(actual?.order_price_amount);
  const dateStr = (order.order_date || order.payment_date) as string | undefined;
  const orderedAt = dateStr ? parseCafe24Time(dateStr, 0) : null;
  return { found: true, amount, orderedAt };
}

export async function lookupOrder(mallId: string, orderId: string): Promise<OrderLookup> {
  try {
    const json = await adminApi<unknown>(mallId, "GET", `/api/v2/admin/orders/${encodeURIComponent(orderId)}`);
    return parseOrder(json);
  } catch (e) {
    if (e instanceof Cafe24Error && e.status === 404) return { found: false, amount: null, orderedAt: null };
    throw e;
  }
}

export async function countOrders(mallId: string, startDate: string, endDate: string): Promise<number | null> {
  try {
    const json = await adminApi<{ count?: number }>(
      mallId,
      "GET",
      `/api/v2/admin/orders/count?start_date=${startDate}&end_date=${endDate}`
    );
    return typeof json.count === "number" ? json.count : null;
  } catch {
    return null;
  }
}
