import { NextRequest, NextResponse } from "next/server";

// Toss Payments 빌링 성공 콜백
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const authKey = searchParams.get("authKey");
  const plan = searchParams.get("plan") ?? "solo";

  if (!authKey) {
    return NextResponse.redirect(new URL("/settings?payment=fail", request.url));
  }

  // TODO: Toss API로 빌링키 발급 후 DB 저장
  // const billingKey = await issueBillingKey(authKey, customerKey);
  // await prisma.user.update({ where: { id: userId }, data: { subscriptionPlan: plan, billingKey } });

  return NextResponse.redirect(
    new URL(`/settings?payment=success&plan=${plan}`, request.url)
  );
}
