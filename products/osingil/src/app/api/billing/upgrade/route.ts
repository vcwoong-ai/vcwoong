import { NextResponse } from "next/server";
import { createUpgradeOrder } from "@/lib/billing";
import { env } from "@/lib/env";
import { sessionMall } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST() {
  const mallId = sessionMall();
  if (!mallId) return NextResponse.json({ error: "로그인이 만료되었습니다." }, { status: 401 });
  if (env.billingMode !== "cafe24") return NextResponse.json({ error: "지금은 베타 기간이라 결제가 필요 없습니다." }, { status: 400 });
  try {
    return NextResponse.json({ url: await createUpgradeOrder(mallId) });
  } catch (e) {
    console.error("[billing] create order failed", mallId, e);
    return NextResponse.json({ error: "결제 화면을 열지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
}
