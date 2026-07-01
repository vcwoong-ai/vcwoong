import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code") ?? "UNKNOWN";
  const message = searchParams.get("message") ?? "결제에 실패했습니다.";

  return NextResponse.redirect(
    new URL(
      `/settings?payment=fail&code=${encodeURIComponent(code)}&message=${encodeURIComponent(message)}`,
      request.url
    )
  );
}
