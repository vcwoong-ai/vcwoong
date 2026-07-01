import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cancelSubscription } from "@/lib/subscription";

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
    const body = (await request.json()) as TossWebhookBody;
    const { eventType, data } = body;

    if (!eventType || !data) {
      return NextResponse.json({ ok: true });
    }

    if (eventType === "PAYMENT_STATUS_CHANGED" && data.status === "CANCELED") {
      if (data.paymentKey) {
        await prisma.subscriptionPayment.updateMany({
          where: { paymentKey: data.paymentKey },
          data: { status: "CANCELED" },
        });
      }
    }

    if (eventType === "BILLING_DELETED" && data.customerKey) {
      const userId = data.customerKey.replace(/^dealsync-/, "");
      if (userId) {
        await cancelSubscription(userId);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Toss webhook error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
