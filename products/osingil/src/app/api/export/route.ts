/** 응답 전체 CSV 내보내기 (엑셀에서 한글이 깨지지 않도록 BOM 포함) */
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { sessionMall } from "@/lib/http";
import { toCsv } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET() {
  const mallId = sessionMall();
  if (!mallId) return NextResponse.json({ error: "로그인이 만료되었습니다." }, { status: 401 });
  const rows = await query<{ created_at: Date; order_id: string; answer_label: string; other_text: string | null; amount: number | null; verified: boolean }>(
    `SELECT created_at, order_id, answer_label, other_text, amount, verified FROM responses WHERE mall_id = $1 ORDER BY created_at DESC LIMIT 100000`,
    [mallId]
  );
  const date = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="osingil-${mallId}-${date}.csv"`,
    },
  });
}
