import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { confirmBillingPayment } from "@/lib/payments/toss";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { searchParams } = new URL(req.url);
  const authKey = searchParams.get("authKey");
  const customerKey = searchParams.get("customerKey");
  const plan = searchParams.get("plan") || "solo";

  if (!authKey || !customerKey) {
    return NextResponse.redirect(new URL("/settings?error=payment_failed", req.url));
  }

  const result = await confirmBillingPayment(authKey, customerKey, plan);

  if (!result.success) {
    return NextResponse.redirect(new URL("/settings?error=payment_failed", req.url));
  }

  await prisma.user.update({
    where: { email: session.user.email },
    data: {
      subscriptionPlan: plan,
      subscriptionStatus: "active",
    } as Parameters<typeof prisma.user.update>[0]["data"],
  });

  return NextResponse.redirect(new URL("/settings?success=subscribed", req.url));
}
