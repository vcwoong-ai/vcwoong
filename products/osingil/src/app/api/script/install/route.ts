/** 대시보드의 "설문 스크립트 다시 설치" 버튼 */
import { NextResponse } from "next/server";
import { installScriptTag } from "@/lib/cafe24";
import { sessionMall } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST() {
  const mallId = sessionMall();
  if (!mallId) return NextResponse.json({ error: "로그인이 만료되었습니다. 카페24 관리자에서 앱을 다시 열어 주세요." }, { status: 401 });
  try {
    const scriptNo = await installScriptTag(mallId);
    return NextResponse.json({ ok: true, script_no: scriptNo });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "설치 실패" }, { status: 502 });
  }
}
