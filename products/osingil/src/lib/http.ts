import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE } from "./session";

/** 쇼핑몰 화면(다른 도메인)에서 부르는 공개 API용 CORS 헤더 */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function corsJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export function corsPreflight() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** 관리자(쇼핑몰 운영자) 세션의 mall_id. 없으면 null */
export function sessionMall(): string | null {
  return readSession(cookies().get(SESSION_COOKIE)?.value)?.mall_id ?? null;
}

export function errorPage(title: string, detail: string, status = 400) {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;background:#f6f7f9;color:#1b1f24;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
main{max-width:420px;background:#fff;border:1px solid #e3e6ea;border-radius:12px;padding:28px}h1{font-size:18px;margin:0 0 8px}p{color:#56606b;margin:0;line-height:1.6}</style></head>
<body><main><h1>${title}</h1><p>${detail}</p></main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
