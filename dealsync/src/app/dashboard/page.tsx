import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, DEAL_STATUSES } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight,
  BarChart3,
  FileText,
  Plus,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  const [deals, recentDeals] = await Promise.all([
    prisma.deal.findMany({
      where: { userId: session!.user.id },
    }),
    prisma.deal.findMany({
      where: { userId: session!.user.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { report: true },
    }),
  ]);

  const stats = {
    total: deals.length,
    reviewing: deals.filter((d) => d.status === "reviewing").length,
    reportGenerated: deals.filter((d) => d.status === "report_generated").length,
    approved: deals.filter((d) => d.status === "approved").length,
    rejected: deals.filter((d) => d.status === "rejected").length,
    totalInvestment: deals
      .filter((d) => d.status === "approved")
      .reduce((sum, d) => sum + (d.investmentAmount ?? 0), 0),
  };

  const statCards = [
    {
      title: "전체 딜",
      value: stats.total,
      icon: BarChart3,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      title: "검토중",
      value: stats.reviewing,
      icon: Clock,
      color: "text-yellow-600",
      bg: "bg-yellow-50",
    },
    {
      title: "보고서 완료",
      value: stats.reportGenerated,
      icon: FileText,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      title: "투자 승인",
      value: stats.approved,
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-50",
    },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            안녕하세요, {session?.user?.name?.split(" ")[0] ?? ""}님 👋
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            오늘의 딜 파이프라인을 확인하세요
          </p>
        </div>
        <Link href="/deals/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            새 딜 추가
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat) => (
          <Card key={stat.title} className="border-gray-100">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 mb-1">{stat.title}</p>
                  <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 ${stat.bg} rounded-xl flex items-center justify-center`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Deals */}
        <div className="lg:col-span-2">
          <Card className="border-gray-100">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">최근 딜</CardTitle>
                <Link href="/deals" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                  전체 보기 <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {recentDeals.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <TrendingUp className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-gray-500 text-sm mb-4">아직 딜이 없습니다</p>
                  <Link href="/deals/new">
                    <Button size="sm" className="gap-2">
                      <Plus className="w-3.5 h-3.5" />
                      첫 딜 추가하기
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentDeals.map((deal) => {
                    const statusInfo = DEAL_STATUSES[deal.status as keyof typeof DEAL_STATUSES] ?? DEAL_STATUSES.draft;
                    return (
                      <Link
                        key={deal.id}
                        href={`/deals/${deal.id}`}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-blue-50/50 transition-colors group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <TrendingUp className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 text-sm group-hover:text-blue-700 transition-colors truncate">
                              {deal.companyName}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {deal.sector} · {deal.stage} · {formatDate(deal.updatedAt)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {deal.investmentAmount && (
                            <span className="text-sm font-medium text-gray-700">
                              {formatCurrency(deal.investmentAmount, deal.investmentCurrency)}
                            </span>
                          )}
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions & Summary */}
        <div className="space-y-6">
          {/* Pipeline Summary */}
          <Card className="border-gray-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">파이프라인 현황</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "초안", count: deals.filter(d => d.status === "draft").length, color: "bg-gray-200" },
                { label: "검토중", count: stats.reviewing, color: "bg-blue-400" },
                { label: "보고서 완료", count: stats.reportGenerated, color: "bg-purple-400" },
                { label: "투자 승인", count: stats.approved, color: "bg-green-400" },
                { label: "투자 거절", count: stats.rejected, color: "bg-red-400" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${item.color}`} />
                  <span className="text-sm text-gray-600 flex-1">{item.label}</span>
                  <span className="text-sm font-semibold text-gray-900">{item.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="border-gray-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">빠른 작업</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/deals/new">
                <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                  <Plus className="w-4 h-4 text-blue-600" />
                  새 딜 추가
                </Button>
              </Link>
              <Link href="/deals">
                <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                  <BarChart3 className="w-4 h-4 text-purple-600" />
                  딜 목록 보기
                </Button>
              </Link>
              <Link href="/reports">
                <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                  <FileText className="w-4 h-4 text-green-600" />
                  보고서 목록
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
