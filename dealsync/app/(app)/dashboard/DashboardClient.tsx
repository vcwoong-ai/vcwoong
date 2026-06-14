"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  FileText,
  FolderOpen,
  Clock,
  ArrowRight,
  Building2,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

const PIPELINE_STAGES = ["검토중", "심층심사", "투심", "투자완료"] as const;

const stageColors: Record<string, string> = {
  검토중: "bg-blue-100 text-blue-700 border-blue-200",
  심층심사: "bg-amber-100 text-amber-700 border-amber-200",
  투심: "bg-purple-100 text-purple-700 border-purple-200",
  투자완료: "bg-green-100 text-green-700 border-green-200",
};

const sectorColors: Record<string, string> = {
  BIO: "bg-emerald-50 text-emerald-600",
  IT: "bg-sky-50 text-sky-600",
  핀테크: "bg-violet-50 text-violet-600",
  제조: "bg-orange-50 text-orange-600",
  커머스: "bg-pink-50 text-pink-600",
};

interface Props {
  deals: any[];
  recentReports: any[];
  stats: {
    totalDeals: number;
    thisMonthDeals: number;
    totalReports: number;
    pipeline: Record<string, number>;
  };
}

export default function DashboardClient({ deals, recentReports, stats }: Props) {
  const [activeStage, setActiveStage] = useState<string | null>(null);

  const filteredDeals = activeStage
    ? deals.filter((d) => d.status === activeStage)
    : deals;

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">전체 딜</span>
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                <FolderOpen className="w-3.5 h-3.5 text-[#1B4FD8]" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.totalDeals}</div>
            <p className="text-xs text-muted-foreground mt-0.5">총 진행 딜</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">이번달 검토</span>
              <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-green-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.thisMonthDeals}</div>
            <p className="text-xs text-muted-foreground mt-0.5">신규 딜 수</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">생성된 보고서</span>
              <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
                <FileText className="w-3.5 h-3.5 text-purple-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.totalReports}</div>
            <p className="text-xs text-muted-foreground mt-0.5">총 보고서</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">투심 대기</span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.pipeline["투심"] || 0}</div>
            <p className="text-xs text-muted-foreground mt-0.5">투자심의 대기</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Kanban */}
        <div className="lg:col-span-2">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">딜 파이프라인</CardTitle>
                <Link href="/deals">
                  <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                    전체보기 <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
              {/* Stage filters */}
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setActiveStage(null)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    activeStage === null
                      ? "bg-[#1B4FD8] text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  전체
                </button>
                {PIPELINE_STAGES.map((stage) => (
                  <button
                    key={stage}
                    onClick={() => setActiveStage(stage === activeStage ? null : stage)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      activeStage === stage
                        ? "bg-[#1B4FD8] text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {stage} ({stats.pipeline[stage] || 0})
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {filteredDeals.length === 0 ? (
                <div className="text-center py-10">
                  <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">딜이 없습니다</p>
                  <Link href="/deals/new">
                    <Button size="sm" className="mt-3 bg-[#1B4FD8] hover:bg-[#1540B0]">
                      첫 딜 추가하기
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredDeals.slice(0, 8).map((deal) => (
                    <Link key={deal.id} href={`/deals/${deal.id}`}>
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-[#1B4FD8]/30 hover:bg-blue-50/30 transition-all group">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-4 h-4 text-gray-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-gray-900 truncate">
                              {deal.companyName}
                            </span>
                            {deal.sector && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${sectorColors[deal.sector] || "bg-gray-100 text-gray-600"}`}>
                                {deal.sector}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {deal.amount
                                ? `${(deal.amount / 1e8).toFixed(1)}억원`
                                : "금액 미정"}
                            </span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">
                              문서 {deal._count?.documents || 0}개
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${stageColors[deal.status]}`}>
                            {deal.status}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#1B4FD8] transition-colors" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Reports */}
        <div>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">최근 보고서</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {recentReports.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">보고서가 없습니다</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentReports.map((report) => (
                    <Link key={report.id} href={`/deals/${report.dealId}/report`}>
                      <div className="p-3 rounded-lg border border-border hover:border-[#1B4FD8]/30 hover:bg-blue-50/20 transition-all">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {report.deal?.companyName}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatDistanceToNow(new Date(report.generatedAt), {
                                addSuffix: true,
                                locale: ko,
                              })}
                            </p>
                          </div>
                          <Badge
                            variant={report.status === "FINAL" ? "default" : "secondary"}
                            className={`text-[10px] flex-shrink-0 ${
                              report.status === "FINAL"
                                ? "bg-green-100 text-green-700 hover:bg-green-100"
                                : ""
                            }`}
                          >
                            {report.status === "FINAL" ? "최종" : "초안"}
                          </Badge>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="border-0 shadow-sm mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">파이프라인 현황</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {PIPELINE_STAGES.map((stage) => {
                const count = stats.pipeline[stage] || 0;
                const total = stats.totalDeals || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={stage} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{stage}</span>
                      <span className="font-medium">{count}건</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#1B4FD8] rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
