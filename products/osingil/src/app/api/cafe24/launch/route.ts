/**
 * 카페24 관리자에서 앱을 열 때 호출되는 주소 (개발자센터의 App URL).
 * 요청 서명을 검증하고, 이미 설치된 쇼핑몰이면 대시보드로, 아니면 카페24 권한 동의 화면으로 보낸다.
 */
import { NextRequest, NextResponse } from "next/server";
import { authorizeUrl, hasValidInstall, verifyLaunchQuery } from "@/lib/cafe24";
import { env } from "@/lib/env";
import { errorPage } from "@/lib/http";
import { cookieOptions, newState, SESSION_COOKIE, SESSION_MAX_AGE, sessionCookieValue, STATE_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = new URL(req.url).search;
  const v = verifyLaunchQuery(raw, env.clientSecret);
  if (!v.ok) {
    return errorPage("앱을 열 수 없습니다", `카페24 관리자 화면의 앱 메뉴에서 다시 열어 주세요. (${v.reason})`, 401);
  }
  const mallId = v.params.get("mall_id")!;

  if (await hasValidInstall(mallId)) {
    const res = NextResponse.redirect(`${env.appUrl}/dashboard`);
    res.cookies.set(SESSION_COOKIE, sessionCookieValue(mallId), cookieOptions(SESSION_MAX_AGE));
    return res;
  }

  const { state, cookie } = newState(mallId);
  const res = NextResponse.redirect(authorizeUrl(mallId, state));
  res.cookies.set(STATE_COOKIE, cookie, cookieOptions(600));
  return res;
}
