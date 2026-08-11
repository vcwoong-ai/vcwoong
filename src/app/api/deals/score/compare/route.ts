import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamContext, dealReadWhere } from "@/lib/team-access";

/** 여러 딜의 저장된 점수를 한 번에 조회 (레이더 오버레이 비교용) */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const idsParam = request.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5); // 레이더에 5개 넘게 겹치면 못 읽으므로 상한을 둔다

  if (ids.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const { teamId } = await getUserTeamContext(session.user.id);
  const deals = await prisma.deal.findMany({
    where: { id: { in: ids }, ...dealReadWhere(session.user.id, teamId) },
    select: {
      id: true,
      companyName: true,
      score: true,
    },
  });

  // 요청 순서를 보존한다 (색상 배정이 클라이언트에서 인덱스 기준이라 순서가 섞이면 안 됨)
  const byId = new Map(deals.map((d) => [d.id, d]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

  return NextResponse.json({ data: ordered });
}
