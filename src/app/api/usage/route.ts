import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const userId = session.user.id;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totalLogs, recentLogs, byAgent, totalReports] = await Promise.all([
    // 전체 토큰 합계
    prisma.usageLog.aggregate({
      where: { userId },
      _sum: { totalTokens: true, inputTokens: true, outputTokens: true },
      _count: true,
    }),
    // 최근 30일 일별 집계
    prisma.usageLog.findMany({
      where: { userId, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, totalTokens: true, agentType: true },
      orderBy: { createdAt: "asc" },
    }),
    // 에이전트별 토큰 집계
    prisma.usageLog.groupBy({
      by: ["agentType"],
      where: { userId },
      _sum: { totalTokens: true },
      _count: true,
    }),
    // 총 보고서 수
    prisma.report.count({ where: { deal: { userId } } }),
  ]);

  // 일별 집계
  const dailyMap: Record<string, number> = {};
  for (const log of recentLogs) {
    const day = log.createdAt.toISOString().slice(0, 10);
    dailyMap[day] = (dailyMap[day] ?? 0) + log.totalTokens;
  }
  const dailyUsage = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, tokens]) => ({ date, tokens }));

  return NextResponse.json({
    data: {
      total: {
        tokens: totalLogs._sum.totalTokens ?? 0,
        inputTokens: totalLogs._sum.inputTokens ?? 0,
        outputTokens: totalLogs._sum.outputTokens ?? 0,
        calls: totalLogs._count,
        reports: totalReports,
      },
      dailyUsage,
      byAgent: byAgent.map((a) => ({
        agentType: a.agentType,
        tokens: a._sum.totalTokens ?? 0,
        calls: a._count,
      })),
    },
  });
}
