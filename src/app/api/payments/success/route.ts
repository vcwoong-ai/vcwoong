import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  issueBillingKey,
  chargeBilling,
  recordPayment,
  isTossConfigured,
  planAmount,
} from "@/lib/payments/toss";
import {
  activateSubscription,
  planParamToEnum,
} from "@/lib/subscription";
import { brandCustomerKey } from "@/lib/brand";
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
  const cycle = searchParams.get("cycle") === "yearly" ? "yearly" : "monthly";

  if (!authKey || !customerKey || !planKey) {
    return NextResponse.redirect(
      new URL("/settings?payment=missing_params", request.url)
    );
  }

  // customerKey는 URL로 들어오므로 남의 키를 넣어 호출할 수 있다.
  // 로그인한 사용자 본인의 키가 아니면 거부한다.
  if (customerKey !== brandCustomerKey(session.user.id)) {
    console.warn(
      `[Payment] customerKey 불일치 — user=${session.user.id} key=${customerKey}`
    );
    return NextResponse.redirect(
      new URL("/settings?payment=invalid_customer", request.url)
    );
  }

  let amount: number;
  try {
    amount = planAmount(planKey, cycle);
  } catch {
    return NextResponse.redirect(
      new URL("/settings?payment=invalid_plan", request.url)
    );
  }
  if (amount === 0) {
    return NextResponse.redirect(
      new URL("/settings?payment=invalid_plan", request.url)
    );
  }

  if (!isTossConfigured()) {
    return NextResponse.redirect(
      new URL("/settings?payment=not_configured", request.url)
    );
  }

  // 결제 전 실패인지, "결제는 됐는데 뒷정리가 실패"인지 구분한다.
  // 후자를 그냥 error로 돌려보내면 사용자가 다시 시도해 이중 결제된다.
  let charged: { paymentKey: string; totalAmount: number } | null = null;

  try {
    const billing = await issueBillingKey(authKey, customerKey);
    const orderId = `sub-${session.user.id}-${cycle}-${Date.now()}`;
    const charge = await chargeBilling(
      billing.billingKey,
      customerKey,
      planKey,
      orderId,
      cycle
    );
    charged = charge;

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
      new URL(
        `/settings?payment=success&plan=${planKey}&cycle=${cycle}`,
        request.url
      )
    );
  } catch (error) {
    if (charged) {
      // 돈은 빠져나갔는데 구독 활성화·기록이 실패한 상태 — 사람이 직접
      // 확인해야 하므로 결제키를 남겨 추적 가능하게 하고, 화면에서는
      // 재시도 대신 문의를 안내한다.
      console.error(
        `[Payment] 결제 완료 후 처리 실패 — 수동 확인 필요 ` +
          `user=${session.user.id} paymentKey=${charged.paymentKey} ` +
          `amount=${charged.totalAmount} plan=${planKey}`,
        error
      );
      return NextResponse.redirect(
        new URL("/settings?payment=charged_not_activated", request.url)
      );
    }

    console.error("Payment success handler error:", error);
    return NextResponse.redirect(
      new URL("/settings?payment=error", request.url)
    );
  }
}
