/**
 * 매일 1회 (vercel.json cron): refresh token 이 3일 안에 만료되는 쇼핑몰의 토큰을 미리 갱신한다.
 * 카페24 refresh token 은 2주 뒤 만료되므로, 운영자가 대시보드를 오래 안 열어도 주문 확인이 계속 동작하게 한다.
 */
import { NextRequest, NextResponse } from "next/server";
import { accessToken } from "@/lib/cafe24";
import { query } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows = await query<{ mall_id: string }>(
    `SELECT mall_id FROM malls WHERE refresh_expires_at > now() AND refresh_expires_at < now() + interval '3 days'`
  );
  let ok = 0;
  const failed: string[] = [];
  for (const r of rows) {
    try {
      await accessToken(r.mall_id, true);
      ok++;
    } catch {
      failed.push(r.mall_id);
    }
  }
  return NextResponse.json({ checked: rows.length, refreshed: ok, failed });
}
