import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cancelSubscription, getUserSubscription } from "@/lib/subscription";

/** 사용자가 직접 구독을 해지한다 (Free로 전환) */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const current = await getUserSubscription(session.user.id);
  if (!current || current.subscriptionPlan === "FREE") {
    return NextResponse.json(
      { error: "해지할 유료 구독이 없습니다" },
      { status: 400 }
    );
  }

  await cancelSubscription(session.user.id);

  return NextResponse.json({
    data: { plan: "FREE", status: "CANCELED" },
  });
}
