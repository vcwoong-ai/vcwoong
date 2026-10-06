import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cancelSubscription, getUserSubscription } from "@/lib/subscription";
import { withBillingRepository } from "@/lib/payments/billing-runtime";

/** Durable subscriptions stop future renewal; legacy subscriptions keep their prior behavior. */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }
  const userId = session.user.id;
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "구독 변경 요청의 출처를 확인할 수 없습니다." }, { status: 403 });
  }

  try {
    const current = await getUserSubscription(userId);
    if (current?.source === "durable") {
      const billing = current.billing;
      if (!billing?.paidUntil || current.subscriptionStatus !== "ACTIVE") {
        return NextResponse.json({ error: "해지할 유료 구독이 없습니다" }, { status: 400 });
      }
      if (!billing.cancelAtPeriodEnd) {
        if (!billing.canCancel) return NextResponse.json({ error: "구독 상태를 확인하고 다시 시도해 주세요." }, { status: 409 });
        const cancelled = await withBillingRepository((repository) =>
          repository.cancelAtPeriodEnd(userId, billing.version, new Date()));
        if (!cancelled) return NextResponse.json({ error: "구독 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요." }, { status: 409 });
      }
      return NextResponse.json({ data: { plan: current.subscriptionPlan, status: "CANCEL_AT_PERIOD_END",
        paidUntil: billing.paidUntil.toISOString(), cancelAtPeriodEnd: true } });
    }
    if (!current || current.subscriptionPlan === "FREE") {
      return NextResponse.json({ error: "해지할 유료 구독이 없습니다" }, { status: 400 });
    }
    await cancelSubscription(userId);
    return NextResponse.json({ data: { plan: "FREE", status: "CANCELED" } });
  } catch {
    // Billing/Prisma diagnostics may contain private references: never log or return them.
    return NextResponse.json({ error: "구독 해지 중 오류가 발생했습니다" }, { status: 500 });
  }
}
