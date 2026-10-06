import { NextResponse } from "next/server";
import { secureCompare } from "@/lib/secure-compare";
import { getBillingMaintenance } from "@/lib/payments/billing-runtime";
import { isSubscriptionCheckoutReady } from "@/lib/payments/checkout-readiness";

export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store" };
/** Prepared endpoint only: scheduling requires an explicit activation and provider validation. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !secureCompare(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401, headers });
  }
  if (!isSubscriptionCheckoutReady()) return NextResponse.json({ error: "결제 준비 중" }, { status: 503, headers });
  try {
    const maintenance = await getBillingMaintenance();
    if (!maintenance) return NextResponse.json({ error: "결제 준비 중" }, { status: 503, headers });
    return NextResponse.json({ data: await maintenance.run({ batchLimit: 2, timeBudgetMs: 105_000 }) }, { headers });
  } catch {
    return NextResponse.json({ error: "결제 상태 확인을 완료하지 못했습니다" }, { status: 503, headers });
  }
}
