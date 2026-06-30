import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, FileText, TrendingUp, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";
import { DealStage, ReportStatus } from "@prisma/client";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  const [totalDeals, activeDeals, totalReports, recentDeals, recentReports] =
    await Promise.all([
      prisma.deal.count({ where: { userId } }),
      prisma.deal.count({
        where: { userId, stage: { in: [DealStage.IC_PREP, DealStage.IC_REVIEW, DealStage.DEEP_DIVE] } },
      }),
      prisma.report.count({ where: { deal: { userId } } }),
      prisma.deal.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: {
          reports: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      }),
      prisma.report.findMany({
        where: { deal: { userId }, status: { not: ReportStatus.PENDING } },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { deal: { select: { companyName: true } } },
      }),
    ]);

  const stats = [
    {
      label: "전체 딜",
      value: totalDeals,
      icon: Briefcase,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "활성 딜",
      value: activeDeals,
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "생성된 보고서",
      value: totalReports,
      icon: FileText,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  const stageLabel: Record<DealStage, string> = {
    SCREENING: "스크리닝",
    DEEP_DIVE: "딥다이브",
    IC_PREP: "IC 준비",
    IC_REVIEW: "IC 심의",
    CLOSED: "완료",
    REJECTED: "거절",
  };

  const statusLabel: Record<ReportStatus, string> = {
    PENDING: "대기",
    GENERATING: "생성 중",
    DRAFT: "초안",
    REVIEW: "검토 중",
    FINAL: "최종",
    EXPORTED: "내보내기",
  };

  return (
    <AppLayout title="대시보드">
      <div className="space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            안녕하세요, {session.user.name} 심사역님 👋
          </h1>
          <p className="text-gray-500 mt-1">
            오늘도 좋은 투자 딜을 발굴하세요.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="pt-5">
                <div className="flex items-center gap-4">
                  <div className={`p-2.5 rounded-xl ${stat.bg}`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {stat.value}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Deals */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">최근 딜</CardTitle>
                <Link
                  href="/deals"
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                >
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
                  {recentDeals.map((deal: any) => (
                    <Link
                      key={deal.id}
                      href={`/deals/${deal.id}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div>
                        <p className="font-medium text-sm text-gray-900">
                          {deal.companyName}
                        </p>
                        <p className="text-xs text-gray-500">{deal.name}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {stageLabel[deal.stage as keyof typeof stageLabel]}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Reports */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">최근 보고서</CardTitle>
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
                  {recentReports.map((report: any) => (
                    <Link
                      key={report.id}
                      href={`/reports/${report.id}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div>
                        <p className="font-medium text-sm text-gray-900">
                          {report.deal.companyName}
                        </p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(report.createdAt).toLocaleDateString(
                            "ko-KR"
                          )}
                        </p>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${
                          report.status === "FINAL" ||
                          report.status === "EXPORTED"
                            ? "bg-green-50 text-green-700"
                            : report.status === "GENERATING"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-gray-50 text-gray-600"
                        }`}
                      >
                        {statusLabel[report.status as keyof typeof statusLabel]}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
