import { NextRequest, NextResponse } from "next/server";
import { confirmUpgrade } from "@/lib/billing";
import { env } from "@/lib/env";
import { sessionMall } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const mallId = sessionMall();
  const orderId = req.nextUrl.searchParams.get("order_id") || "";
  if (!mallId || !orderId) return NextResponse.redirect(`${env.appUrl}/dashboard?billing=unknown`);
  try {
    const ok = await confirmUpgrade(mallId, orderId);
    return NextResponse.redirect(`${env.appUrl}/dashboard?billing=${ok ? "paid" : "pending"}`);
  } catch (e) {
    console.error("[billing] confirm failed", mallId, orderId, e);
    return NextResponse.redirect(`${env.appUrl}/dashboard?billing=pending`);
  }
}
