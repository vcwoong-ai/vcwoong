import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getCheckoutRuntime } from "@/lib/payments/billing-runtime";
import { isSubscriptionCheckoutReady, SUBSCRIPTION_CHECKOUT_NOTICE } from "@/lib/payments/checkout-readiness";

const checkoutSchema = z.object({ plan: z.enum(["solo", "sector_pro", "multi", "full", "bio_premium"]),
  cycle: z.enum(["monthly", "yearly"]) }).strict();
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "결제 요청의 출처를 확인할 수 없습니다." }, { status: 403, headers });
  }
  if (!isSubscriptionCheckoutReady()) return NextResponse.json({ error: SUBSCRIPTION_CHECKOUT_NOTICE }, { status: 503, headers });
  const body = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "요금제와 결제 주기를 확인해 주세요." }, { status: 400, headers });
  const runtime = await getCheckoutRuntime();
  if (!runtime) return NextResponse.json({ error: "결제 서비스 연결이 준비되지 않았습니다." }, { status: 503, headers });
  try {
    const result = await runtime.prepare({ userId: session.user.id, ...body.data, origin: new URL(request.url).origin });
    return NextResponse.json(result, { headers });
  } catch {
    return NextResponse.json({ error: "기존 결제 요청을 확인해야 합니다. 새로 결제하지 마시고 관리자에게 문의해 주세요." }, { status: 409, headers });
  }
}
