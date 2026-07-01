import { NextRequest, NextResponse } from "next/server";

// Toss Payments 웹훅 수신
export async function POST(request: NextRequest) {
  const body = await request.json() as {
    eventType?: string;
    data?: { status?: string; customerKey?: string };
  };

  const { eventType, data } = body;

  // 결제 성공: 구독 갱신
  if (eventType === "PAYMENT_STATUS_CHANGED" && data?.status === "DONE") {
    // TODO: 구독 갱신 처리
  }

  // 결제 실패/취소: 구독 만료 처리
  if (eventType === "PAYMENT_STATUS_CHANGED" && data?.status === "CANCELED") {
    // TODO: 구독 취소 처리
  }

  return NextResponse.json({ ok: true });
}
