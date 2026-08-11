import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchDartCompany } from "@/lib/dart";
import { checkRateLimit } from "@/lib/rate-limit";
import { getUserTeamContext, dealReadWhere } from "@/lib/team-access";

/**
 * DART 전자공시 조회 (재무제표 + 최근 공시 목록).
 * AI 호출은 없지만 외부 API(우리 예산 밖의 무료 API)를 쓰므로 남용 방지용
 * 레이트리밋만 가볍게 건다.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const rate = await checkRateLimit(`dart:${session.user.id}`, 30, 60 * 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  const { teamId } = await getUserTeamContext(session.user.id);
  const deal = await prisma.deal.findFirst({
    where: { id: params.id, ...dealReadWhere(session.user.id, teamId) },
    select: { companyName: true },
  });

  if (!deal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = await searchDartCompany(deal.companyName);
  return NextResponse.json({ data });
}
