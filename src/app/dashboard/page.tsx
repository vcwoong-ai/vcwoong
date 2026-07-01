import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { Briefcase, FileText, TrendingUp, ArrowRight, Plus } from "lucide-react";
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
        take: 6,
        include: { reports: { orderBy: { createdAt: "desc" }, take: 1 } },
      }),
      prisma.report.findMany({
        where: { deal: { userId }, status: { not: ReportStatus.PENDING } },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { deal: { select: { companyName: true } } },
      }),
    ]);

  const stageLabel: Record<DealStage, string> = {
    SCREENING: "스크리닝",
    DEEP_DIVE: "딥다이브",
    IC_PREP: "IC 준비",
    IC_REVIEW: "IC 심의",
    CLOSED: "완료",
    REJECTED: "거절",
  };

  const stageColor: Record<DealStage, string> = {
    SCREENING: "text-gray-500",
    DEEP_DIVE: "text-blue-600",
    IC_PREP: "text-amber-600",
    IC_REVIEW: "text-orange-600",
    CLOSED: "text-emerald-600",
    REJECTED: "text-red-500",
  };

  const reportStatusLabel: Record<ReportStatus, string> = {
    PENDING: "대기", GENERATING: "생성 중", DRAFT: "초안",
    REVIEW: "검토 중", FINAL: "최종", EXPORTED: "완료",
  };

  const reportStatusColor: Record<ReportStatus, string> = {
    PENDING: "text-gray-400", GENERATING: "text-amber-600",
    DRAFT: "text-blue-600", REVIEW: "text-purple-600",
    FINAL: "text-emerald-600", EXPORTED: "text-emerald-600",
  };

  return (
    <AppLayout title="대시보드">
      <div className="space-y-8 max-w-5xl">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "전체 딜", value: totalDeals, icon: Briefcase, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "활성 딜", value: activeDeals, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "보고서", value: totalReports, icon: FileText, color: "text-purple-600", bg: "bg-purple-50" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white border border-gray-100 rounded-xl p-5">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center flex-shrink-0`}>
                  <stat.icon className={`w-4.5 h-4.5 ${stat.color}`} style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <p className="text-xs text-gray-400">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 leading-tight">{stat.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Deals */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-900">최근 딜</h3>
              <Link href="/deals" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                전체 보기 <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {recentDeals.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-gray-400">등록된 딜이 없습니다</p>
                <Link href="/deals" className="inline-flex items-center gap-1.5 mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium">
                  <Plus className="w-3 h-3" /> 딜 등록하기
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentDeals.map((deal) => (
                  <Link key={deal.id} href={`/deals/${deal.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{deal.companyName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{deal.name}</p>
                    </div>
                    <span className={`text-xs font-medium ${stageColor[deal.stage]}`}>
                      {stageLabel[deal.stage]}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent Reports */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-900">최근 보고서</h3>
              <Link href="/reports/new" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                <Plus className="w-3 h-3" /> 새 보고서
              </Link>
            </div>
            {recentReports.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-gray-400">생성된 보고서가 없습니다</p>
                <Link href="/reports/new" className="inline-flex items-center gap-1.5 mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium">
                  <Plus className="w-3 h-3" /> 보고서 생성하기
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentReports.map((report) => (
                  <Link key={report.id} href={`/reports/${report.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{report.deal.companyName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(report.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <span className={`text-xs font-medium ${reportStatusColor[report.status]}`}>
                      {reportStatusLabel[report.status]}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
