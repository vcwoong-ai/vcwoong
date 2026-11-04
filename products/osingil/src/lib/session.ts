/**
 * 서명된 쿠키 세션. 서버 저장소 없이 HMAC-SHA256 서명으로 위변조를 막는다.
 * 카페24 관리자 화면 안(iframe)에서 열려도 동작하도록 운영(https)에서는 SameSite=None; Secure 를 쓴다.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export const SESSION_COOKIE = "osg_session";
export const STATE_COOKIE = "osg_state";
const SESSION_TTL_SEC = 60 * 60 * 12;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function seal(data: Record<string, unknown>, secret: string, ttlSec: number): string {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSec })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function unseal<T extends Record<string, unknown>>(token: string | undefined, secret: string): T | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T & { exp: number };
    if (typeof data.exp !== "number" || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export function sessionCookieValue(mallId: string): string {
  return seal({ mall_id: mallId }, env.sessionSecret, SESSION_TTL_SEC);
}

export function readSession(cookieValue: string | undefined): { mall_id: string } | null {
  const s = unseal<{ mall_id: string }>(cookieValue, env.sessionSecret);
  return s && typeof s.mall_id === "string" ? { mall_id: s.mall_id } : null;
}

export function newState(mallId: string): { state: string; cookie: string } {
  const state = randomBytes(16).toString("hex");
  return { state, cookie: seal({ state, mall_id: mallId }, env.sessionSecret, 600) };
}

export function readState(cookieValue: string | undefined): { state: string; mall_id: string } | null {
  return unseal<{ state: string; mall_id: string }>(cookieValue, env.sessionSecret);
}

export function cookieOptions(maxAgeSec: number) {
  const secure = env.secureCookies;
  return {
    httpOnly: true,
    secure,
    sameSite: (secure ? "none" : "lax") as "none" | "lax",
    path: "/",
    maxAge: maxAgeSec,
  };
}

export const SESSION_MAX_AGE = SESSION_TTL_SEC;
