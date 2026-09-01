import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase,
  FileText,
  TrendingUp,
  Clock,
  ArrowRight,
  Cpu,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { DealStage, ReportStatus, DealSector } from "@prisma/client";
import { STAGE_LABEL } from "@/lib/deal-labels";
import { DashboardCharts } from "./dashboard-charts";
import { DashboardQuickActions } from "@/components/dashboard/quick-actions";
import {
  getUserTeamContext,
  dealReadWhere,
  reportReadWhere,
  portfolioReadWhere,
} from "@/lib/team-access";
import { buildAlerts } from "@/lib/portfolio";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const { teamId } = await getUserTeamContext(userId);
  const dealScope = dealReadWhere(userId, teamId);
  const reportScope = reportReadWhere(userId, teamId);
  const portfolioScope = portfolioReadWhere(userId, teamId);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalDeals,
    activeDeals,
    totalReports,
    finalReports,
    recentDeals,
    recentReports,
    usageLogs,
    dealsBySector,
    dealsByStage,
    portfolioCompanies,
  ] = await Promise.all([
    prisma.deal.count({ where: dealScope }),
    prisma.deal.count({
      where: {
        AND: [
          dealScope,
          { stage: { in: [DealStage.IC_PREP, DealStage.IC_REVIEW, DealStage.DEEP_DIVE] } },
        ],
      },
    }),
    prisma.report.count({ where: reportScope }),
    prisma.report.count({
      where: {
        AND: [
          reportScope,
          { status: { in: [ReportStatus.FINAL, ReportStatus.EXPORTED] } },
        ],
      },
    }),
    prisma.deal.findMany({
      where: dealScope,
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { reports: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.report.findMany({
      where: {
        AND: [reportScope, { status: { not: ReportStatus.PENDING } }],
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { deal: { select: { companyName: true } } },
    }),
    prisma.usageLog.findMany({
      where: { userId, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, totalTokens: true, agentType: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.deal.groupBy({
      by: ["sector"],
      where: dealScope,
      _count: true,
    }),
    prisma.deal.groupBy({
      by: ["stage"],
      where: dealScope,
      _count: true,
    }),
    prisma.portfolioCompany.findMany({
      where: portfolioScope,
      include: {
        kpis: { orderBy: { period: "asc" } },
        milestones: { orderBy: { dueDate: "asc" } },
        updates: { orderBy: { period: "desc" }, take: 1 },
      },
    }),
  ]);

  const portfolioAlerts = buildAlerts(portfolioCompanies).slice(0, 5);

  const stageLabel = STAGE_LABEL;
  const statusLabel: Record<ReportStatus, string> = {
    PENDING: "대기", GENERATING: "생성 중", DRAFT: "초안",
    REVIEW: "검토 중", FINAL: "최종", EXPORTED: "내보내기",
  };
  const sectorLabel: Record<DealSector, string> = {
    BIO: "바이오", IT: "IT/SaaS", DEEPTECH: "AI/딥테크",
    MANUFACTURING: "제조", CONTENT: "콘텐츠", FINTECH: "핀테크",
    CONSUMER: "소비재", CLIMATE: "기후", GENERAL: "일반",
  };

  // 일별 토큰 집계
  const dailyTokenMap: Record<string, number> = {};
  for (const log of usageLogs) {
    const day = log.createdAt.toISOString().slice(0, 10);
    dailyTokenMap[day] = (dailyTokenMap[day] ?? 0) + log.totalTokens;
  }
  const dailyTokens = Object.entries(dailyTokenMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, tokens]) => ({ date: date.slice(5), tokens })); // MM-DD 형식

  const totalTokens = usageLogs.reduce((s, l) => s + l.totalTokens, 0);

  const stats = [
    { label: "전체 딜", value: totalDeals, icon: Briefcase, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "활성 딜", value: activeDeals, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "생성된 보고서", value: totalReports, icon: FileText, color: "text-purple-600", bg: "bg-purple-50" },
    {
      label: "최종 보고서",
      value: finalReports,
      icon: BarChart3,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ];

  const sectorData = dealsBySector.map((d) => ({
    name: sectorLabel[d.sector] ?? d.sector,
    value: d._count,
  }));
  const stageData = dealsByStage.map((d) => ({
    name: stageLabel[d.stage] ?? d.stage,
    value: d._count,
  }));

  return (
    <AppLayout title="대시보드">
      <div className="space-y-6">
        {/* 환영 — 데이터가 있어도 로그인할 때마다 항상 보이는 자리라 일러스트를 넣었다 */}
        <div className="relative flex items-center justify-between gap-4 bg-blue-50/60 border border-blue-100 rounded-2xl px-6 py-5 overflow-hidden">
          <div className="relative z-10">
            <h1 className="text-2xl font-bold text-gray-900">
              안녕하세요, {session.user.name ?? "사용자"}님
            </h1>
            <p className="text-gray-500 mt-1">
              {teamId
                ? "팀 공유 딜·보고서를 포함한 현황입니다."
                : "오늘도 좋은 투자 딜을 발굴하세요."}
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/illustrations/dashboard-welcome.svg"
            alt=""
            className="hidden sm:block w-40 md:w-48 flex-shrink-0 opacity-95"
          />
        </div>

        <DashboardQuickActions />

        {portfolioAlerts.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/40">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  사후관리 알림
                </CardTitle>
                <Link
                  href="/portfolio"
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                >
                  포트폴리오 <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {portfolioAlerts.map((a, i) => (
                <Link
                  key={`${a.companyId}-${i}`}
                  href={`/portfolio/${a.companyId}`}
                  className="flex items-start gap-2 text-sm rounded-lg px-2 py-1.5 hover:bg-white/80"
                >
                  <span
                    className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                      a.severity === "high" ? "bg-red-500" : "bg-amber-500"
                    }`}
                  />
                  <span>
                    <span className="font-medium text-gray-900">{a.companyName}</span>
                    <span className="text-gray-600"> — {a.message}</span>
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="pt-5">
                <div className="flex items-center gap-4">
                  <div className={`p-2.5 rounded-xl ${stat.bg}`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 차트 영역 (Client Component) */}
        <DashboardCharts
          dailyTokens={dailyTokens}
          sectorData={sectorData}
          stageData={stageData}
          totalTokens={totalTokens}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 최근 딜 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">최근 딜</CardTitle>
                <Link href="/deals" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                  전체 보기 <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {recentDeals.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">등록된 딜이 없습니다</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentDeals.map((deal) => (
                    <Link
                      key={deal.id}
                      href={`/deals/${deal.id}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0">
                        {/* Badge가 <div>라 <p> 안에 넣으면 HTML 규격 위반이라
                            하이드레이션 에러가 난다. 컨테이너를 div로 둔다. */}
                        <div className="font-medium text-sm text-gray-900 flex items-center gap-2">
                          <span className="truncate">{deal.companyName}</span>
                          {deal.teamId && (
                            <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                              팀
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">{deal.name}</p>
                      </div>
                      <Badge variant="outline" className="text-xs flex-shrink-0 ml-2">
                        {stageLabel[deal.stage]}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 최근 보고서 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">최근 보고서</CardTitle>
                <Link href="/reports" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                  전체 보기 <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {recentReports.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">생성된 보고서가 없습니다</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentReports.map((report) => (
                    <Link
                      key={report.id}
                      href={`/reports/${report.id}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div>
                        <p className="font-medium text-sm text-gray-900">{report.deal.companyName}</p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(report.createdAt).toLocaleDateString("ko-KR")}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        report.status === "FINAL" || report.status === "EXPORTED"
                          ? "bg-green-50 text-green-700"
                          : report.status === "GENERATING"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-gray-50 text-gray-600"
                      }`}>
                        {statusLabel[report.status]}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* AI 사용량 */}
        {totalTokens > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-500" />
                AI 토큰 사용량 (최근 30일: {totalTokens.toLocaleString()} tokens)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-gray-500">
                실제 사용량 추적이 시작됐습니다. 이전 보고서는 0으로 표시됩니다.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
