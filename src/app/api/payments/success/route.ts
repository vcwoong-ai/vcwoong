import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  issueBillingKey,
  chargeBilling,
  recordPayment,
  isTossConfigured,
} from "@/lib/payments/toss";
import {
  activateSubscription,
  getPlanByKey,
  planParamToEnum,
} from "@/lib/subscription";
import type { PlanKey } from "@/lib/quotas";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = new URL(request.url);
  const authKey = searchParams.get("authKey");
  const customerKey = searchParams.get("customerKey");
  const planKey = searchParams.get("plan") as PlanKey | null;

  if (!authKey || !customerKey || !planKey) {
    return NextResponse.redirect(
      new URL("/settings?payment=missing_params", request.url)
    );
  }

  const plan = getPlanByKey(planKey);
  if (!plan || plan.price === 0) {
    return NextResponse.redirect(
      new URL("/settings?payment=invalid_plan", request.url)
    );
  }

  if (!isTossConfigured()) {
    return NextResponse.redirect(
      new URL("/settings?payment=not_configured", request.url)
    );
  }

  try {
    const billing = await issueBillingKey(authKey, customerKey);
    const orderId = `sub-${session.user.id}-${Date.now()}`;
    const charge = await chargeBilling(
      billing.billingKey,
      customerKey,
      planKey,
      orderId
    );

    await recordPayment(
      session.user.id,
      planParamToEnum(planKey),
      charge.totalAmount,
      "DONE",
      charge.paymentKey
    );

    await activateSubscription(
      session.user.id,
      planParamToEnum(planKey),
      billing.billingKey
    );

    return NextResponse.redirect(
      new URL(`/settings?payment=success&plan=${planKey}`, request.url)
    );
  } catch (error) {
    console.error("Payment success handler error:", error);
    return NextResponse.redirect(
      new URL("/settings?payment=error", request.url)
    );
  }
}
