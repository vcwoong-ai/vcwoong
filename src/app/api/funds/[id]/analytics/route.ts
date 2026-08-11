import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/plan-gates";
import {
  fundXIRR,
  simulateWaterfall,
  sensitivityGrid,
  calculateImpairment,
} from "@/lib/fund-analytics";
import { calculatePortfolioMetrics } from "@/lib/portfolio";
import { getUserTeamContext, fundReadWhere } from "@/lib/team-access";

/**
 * 펀드 운용 심화 지표 — XIRR·워터폴·회수 시뮬레이션·자본잠식.
 * AI 호출이 없는 순수 계산이라 쿼리 파라미터로 즉시 재계산할 수 있다.
 *
 * 쿼리 파라미터(전부 선택, 기본값 있음):
 *   hurdleRate(연 %, 기본 8), carryPercent(%, 기본 20),
 *   distributable(억원, 기본=현재 총가치), exitMultiple(기본 1), yearsFromNow(기본 2)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const locked = await requireFeature(session.user.id, "lpReporting");
  if (locked) return locked;

  const { teamId } = await getUserTeamContext(session.user.id);
  const fund = await prisma.fund.findFirst({
    where: { id: params.id, ...fundReadWhere(session.user.id, teamId) },
    include: { companies: true },
  });

  if (!fund) {
    return NextResponse.json({ error: "펀드를 찾을 수 없습니다" }, { status: 404 });
  }

  const sp = request.nextUrl.searchParams;
  const num = (key: string, fallback: number) => {
    const v = Number(sp.get(key));
    return Number.isFinite(v) && sp.has(key) ? v : fallback;
  };

  const companies = fund.companies.map((c) => ({ ...c }));
  const metrics = calculatePortfolioMetrics(companies);

  const xirr = fundXIRR(companies);
  const impairment = calculateImpairment(companies);

  const vintageYears = Math.max(
    0,
    (Date.now() - new Date(fund.vintageYear, 0, 1).getTime()) /
      (365 * 24 * 60 * 60 * 1000)
  );

  const hurdleRate = num("hurdleRate", 8);
  const carryPercent = num("carryPercent", 20);
  const distributable = num("distributable", metrics.totalValue);
  const paidIn = fund.paidIn || metrics.totalInvested;

  const waterfall = simulateWaterfall({
    distributable,
    paidIn,
    hurdleRate,
    carryPercent,
    years: vintageYears,
  });

  const sensitivity = sensitivityGrid(companies);

  return NextResponse.json({
    data: {
      metrics,
      xirr,
      impairment,
      waterfall: {
        input: { distributable, paidIn, hurdleRate, carryPercent, years: round(vintageYears) },
        result: waterfall,
      },
      sensitivity,
    },
  });
}

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
