import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCustomerKeyUserId } from "@/lib/brand";
import { cancelSubscription } from "@/lib/subscription";
import { getPayment, verifyTossWebhookSecret } from "@/lib/payments/toss";

/**
 * Toss 결제 웹훅.
 *
 * 이 엔드포인트는 인증 없이 외부에 열려 있으므로, 본문 값을 그대로 믿고
 * DB를 바꾸면 안 된다. customerKey는 `axiom-<userId>` 형태라 추측이 쉬워서,
 * 검증 없이 BILLING_DELETED를 받아주면 아무나 남의 구독을 해지시킬 수 있다.
 *
 * 두 겹으로 막는다:
 *   1. 공유 시크릿 헤더(TOSS_WEBHOOK_SECRET) — 미설정 시 상태 변경 거부(fail-closed)
 *   2. 결제 이벤트는 Toss API로 실제 상태를 되물어 확인
 */

interface TossWebhookBody {
  eventType?: string;
  data?: {
    paymentKey?: string;
    orderId?: string;
    status?: string;
    customerKey?: string;
    totalAmount?: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyTossWebhookSecret(request.headers)) {
      // 미설정이면 설정하라고 알리고, 상태는 건드리지 않는다.
      if (!process.env.TOSS_WEBHOOK_SECRET?.trim()) {
        console.error(
          "[Toss] TOSS_WEBHOOK_SECRET 미설정 — 웹훅 이벤트를 무시했습니다. " +
            "Toss 개발자센터의 웹훅 시크릿을 환경변수에 넣어야 구독 해지 등이 반영됩니다."
        );
      } else {
        console.warn("[Toss] 웹훅 시크릿 불일치 — 요청을 거부했습니다.");
      }
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as TossWebhookBody;
    const { eventType, data } = body;

    if (!eventType || !data) {
      return NextResponse.json({ ok: true });
    }

    if (eventType === "PAYMENT_STATUS_CHANGED" && data.paymentKey) {
      // 본문의 status를 믿지 않고 Toss에 실제 상태를 되묻는다.
      const payment = await getPayment(data.paymentKey);
      if (!payment) {
        console.warn(
          `[Toss] 결제 조회 실패로 웹훅 무시: paymentKey=${data.paymentKey}`
        );
        return NextResponse.json({ ok: true });
      }
      if (payment.status === "CANCELED" || payment.status === "PARTIAL_CANCELED") {
        await prisma.subscriptionPayment.updateMany({
          where: { paymentKey: data.paymentKey },
          data: { status: payment.status },
        });
      }
    }

    if (eventType === "BILLING_DELETED" && data.customerKey) {
      const userId = parseCustomerKeyUserId(data.customerKey);
      if (userId) {
        // 존재하는 사용자에 대해서만 처리한다.
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true },
        });
        if (user) {
          await cancelSubscription(userId);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Toss webhook error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
