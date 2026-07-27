"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Loader2,
  Plus,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PORTFOLIO_STATUS_LABEL,
  PORTFOLIO_STATUS_TONE,
  comparePeriod,
  kpiChangePercent,
  type PortfolioAlert,
  type PortfolioMetrics,
} from "@/lib/portfolio";
import type { PortfolioStatus } from "@prisma/client";
import { PromoteDealDialog } from "@/components/portfolio/promote-deal-dialog";

export interface PortfolioCompanyView {
  id: string;
  companyName: string;
  sector: string;
  status: PortfolioStatus;
  investedAt: string;
  investAmount: number;
  ownershipPercent: number;
  entryValuation: number;
  currentValuation: number | null;
  realizedAmount: number;
  fund: { id: string; name: string } | null;
  kpis: Array<{ period: string; metric: string; value: number; unit: string }>;
  milestones: Array<{
    id: string;
    title: string;
    dueDate: string;
    status: string;
  }>;
  updates: Array<{ period: string; summary: string }>;
}

export interface PromotableDeal {
  id: string;
  companyName: string;
  sector: string;
  investAmount: number | null;
  valuation: number | null;
}

const SECTOR_LABEL: Record<string, string> = {
  BIO: "바이오",
  IT: "IT",
  DEEPTECH: "딥테크",
  MANUFACTURING: "제조",
  CONTENT: "콘텐츠",
  FINTECH: "핀테크",
  CONSUMER: "소비재",
  CLIMATE: "기후",
  GENERAL: "일반",
};

function moicOf(c: PortfolioCompanyView): number {
  const holding =
    c.status === "EXITED" || c.status === "WRITTEN_OFF"
      ? 0
      : ((c.currentValuation ?? c.entryValuation) * c.ownershipPercent) / 100;
  if (!c.investAmount) return 0;
  return Math.round(((holding + c.realizedAmount) / c.investAmount) * 100) / 100;
}

export function PortfolioPageClient({
  companies,
  funds,
  promotableDeals,
  metrics,
  alerts,
}: {
  companies: PortfolioCompanyView[];
  funds: Array<{ id: string; name: string; vintageYear: number; fundSize: number }>;
  promotableDeals: PromotableDeal[];
  metrics: PortfolioMetrics;
  alerts: PortfolioAlert[];
}) {
  const router = useRouter();
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const summaryCards = [
    { label: "투자 원금", value: `${metrics.totalInvested.toLocaleString()}억` },
    { label: "총 가치", value: `${metrics.totalValue.toLocaleString()}억` },
    { label: "MOIC", value: `${metrics.moic.toFixed(2)}x` },
    { label: "DPI", value: `${metrics.dpi.toFixed(2)}x` },
    { label: "보유사", value: `${metrics.companyCount}개` },
  ];

  return (
    <div className="space-y-6">
      <PromoteDealDialog
        open={promoteOpen}
        deals={promotableDeals}
        funds={funds}
        onClose={() => setPromoteOpen(false)}
        onDone={() => {
          setPromoteOpen(false);
          setRefreshing(true);
          router.refresh();
          setTimeout(() => setRefreshing(false), 1200);
        }}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">포트폴리오 사후관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            투자 집행 이후 KPI·마일스톤·분기 노트를 추적합니다.
          </p>
        </div>
        <Button
          onClick={() => setPromoteOpen(true)}
          className="bg-blue-600 hover:bg-blue-700"
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Plus className="w-4 h-4 mr-2" />
          )}
          포트폴리오사 추가
        </Button>
      </div>

      {/* 펀드 지표 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {summaryCards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-400">{c.label}</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 사후관리 알림 */}
      {alerts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-900">
              <AlertTriangle className="w-4 h-4" />
              사후관리 알림 ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {alerts.slice(0, 8).map((a, i) => (
                <li
                  key={`${a.companyId}-${i}`}
                  className="text-sm flex items-start gap-2"
                >
                  <span
                    className={cn(
                      "mt-1.5 w-1.5 h-1.5 rounded-full shrink-0",
                      a.severity === "high" ? "bg-red-500" : "bg-amber-400"
                    )}
                  />
                  <Link
                    href={`/portfolio/${a.companyId}`}
                    className="hover:underline"
                  >
                    <span className="font-medium">{a.companyName}</span>
                    <span className="text-gray-600"> — {a.message}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 보유사 목록 */}
      {companies.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">등록된 포트폴리오사가 없습니다.</p>
            <p className="text-sm text-gray-400 mt-1">
              심사를 마친 딜을 포트폴리오로 승격하면 사후관리가 시작됩니다.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setPromoteOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              포트폴리오사 추가
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {companies.map((c) => {
            const moic = moicOf(c);
            const arrSeries = c.kpis
              .filter((k) => k.metric === "ARR" || k.metric === "매출")
              .sort((a, b) => comparePeriod(a.period, b.period));
            const change = kpiChangePercent(arrSeries);
            const latestKpis = [...c.kpis]
              .sort((a, b) => comparePeriod(a.period, b.period))
              .slice(-3);

            return (
              <Card key={c.id} className="hover:border-blue-200 transition-colors">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/portfolio/${c.id}`}
                          className="font-semibold text-gray-900 hover:text-blue-600"
                        >
                          {c.companyName}
                        </Link>
                        <Badge variant="outline" className="text-xs">
                          {SECTOR_LABEL[c.sector] ?? c.sector}
                        </Badge>
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded border font-medium",
                            PORTFOLIO_STATUS_TONE[c.status]
                          )}
                        >
                          {PORTFOLIO_STATUS_LABEL[c.status]}
                        </span>
                        {c.fund && (
                          <span className="text-xs text-gray-400">
                            {c.fund.name}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-gray-500">
                        <span>
                          투자 {c.investAmount.toLocaleString()}억 · 지분{" "}
                          {c.ownershipPercent}%
                        </span>
                        <span>
                          Entry {c.entryValuation.toLocaleString()}억 → 현재{" "}
                          {(c.currentValuation ?? c.entryValuation).toLocaleString()}억
                        </span>
                        <span>
                          {new Date(c.investedAt).toLocaleDateString("ko-KR")} 투자
                        </span>
                      </div>

                      {latestKpis.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {latestKpis.map((k) => (
                            <span
                              key={`${k.period}-${k.metric}`}
                              className="text-[11px] bg-gray-50 border rounded px-2 py-0.5 text-gray-600"
                            >
                              {k.period} {k.metric} {k.value.toLocaleString()}
                              {k.unit}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-400">MOIC</p>
                      <p
                        className={cn(
                          "text-lg font-bold",
                          moic >= 1 ? "text-green-600" : "text-red-500"
                        )}
                      >
                        {moic.toFixed(2)}x
                      </p>
                      {change !== null && (
                        <p
                          className={cn(
                            "text-xs flex items-center justify-end gap-0.5",
                            change >= 0 ? "text-green-600" : "text-red-500"
                          )}
                        >
                          <TrendingUp className="w-3 h-3" />
                          {change >= 0 ? "+" : ""}
                          {change}% QoQ
                        </p>
                      )}
                      <Link href={`/portfolio/${c.id}`}>
                        <Button variant="ghost" size="sm" className="mt-1">
                          상세
                          <ArrowUpRight className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
