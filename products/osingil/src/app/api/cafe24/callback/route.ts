/** 카페24 권한 동의 후 돌아오는 주소 (개발자센터의 Redirect URI). 토큰 발급 → 기본 설문 생성 → 스크립트 설치. */
import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, installScriptTag } from "@/lib/cafe24";
import { env } from "@/lib/env";
import { errorPage } from "@/lib/http";
import { cookieOptions, readState, SESSION_COOKIE, SESSION_MAX_AGE, sessionCookieValue, STATE_COOKIE } from "@/lib/session";
import { ensureSurvey } from "@/lib/survey";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const saved = readState(req.cookies.get(STATE_COOKIE)?.value);

  if (url.searchParams.get("error")) {
    return errorPage("설치가 취소되었습니다", "권한 동의가 필요합니다. 카페24 관리자에서 앱을 다시 열어 주세요.", 400);
  }
  if (!code || !state || !saved || saved.state !== state) {
    return errorPage("요청이 만료되었습니다", "카페24 관리자 화면의 앱 메뉴에서 다시 열어 주세요.", 400);
  }

  const mallId = saved.mall_id;
  try {
    await exchangeCode(mallId, code);
  } catch (e) {
    console.error("[callback] token exchange failed", mallId, e);
    return errorPage("카페24 인증에 실패했습니다", "잠시 후 카페24 관리자에서 앱을 다시 열어 주세요.", 502);
  }
  await ensureSurvey(mallId);
  try {
    await installScriptTag(mallId);
  } catch (e) {
    // 대시보드에서 "다시 설치" 버튼으로 복구할 수 있다
    console.error("[callback] scripttag install failed", mallId, e);
  }

  const res = NextResponse.redirect(`${env.appUrl}/dashboard?installed=1`);
  res.cookies.set(SESSION_COOKIE, sessionCookieValue(mallId), cookieOptions(SESSION_MAX_AGE));
  res.cookies.set(STATE_COOKIE, "", cookieOptions(0));
  return res;
}
