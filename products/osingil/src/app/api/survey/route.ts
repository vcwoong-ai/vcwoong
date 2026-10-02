import { NextRequest, NextResponse } from "next/server";
import { sessionMall } from "@/lib/http";
import { saveSurvey, surveyInput } from "@/lib/survey";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const mallId = sessionMall();
  if (!mallId) return NextResponse.json({ error: "로그인이 만료되었습니다. 카페24 관리자에서 앱을 다시 열어 주세요." }, { status: 401 });
  const parsed = surveyInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "입력값을 확인하세요." }, { status: 400 });
  }
  await saveSurvey(mallId, parsed.data);
  return NextResponse.json({ ok: true });
}
