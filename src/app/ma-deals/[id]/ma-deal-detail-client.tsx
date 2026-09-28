"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Landmark, Calculator, TrendingUp, RefreshCw } from "lucide-react";
import type { MaDealType, MaDealStatus } from "@prisma/client";
import { MA_DEAL_TYPE_LABEL, MA_DEAL_STATUS_LABEL, MA_ADJUSTMENT_STATUS_LABEL } from "@/lib/pe/ma-deal-labels";
import type { FinancialCalcResult } from "@/lib/pe/financial-types";
import { useToast } from "@/hooks/use-toast";
import { AddFinancialPeriodDialog } from "@/components/ma-deals/add-financial-period-dialog";
import { LboSimulatorPanel } from "@/components/ma-deals/lbo-simulator-panel";

interface LineItem {
  id: string;
  statementType: string;
  lineItem: string;
  value: number;
  currency: string;
  source: string;
}

interface Adjustment {
  id: string;
  metric: string;
  reportedValue: number;
  adjustmentValue: number;
  normalizedValue: number;
  reason: string;
  status: string;
  source: string;
}

interface Period {
  id: string;
  fiscalYear: number;
  periodType: string;
  currency: string;
  lineItems: LineItem[];
  adjustments: Adjustment[];
  normalizedSummary: Record<string, FinancialCalcResult>;
}

interface MaDeal {
  id: string;
  name: string;
  companyName: string;
  dealType: MaDealType;
  status: MaDealStatus;
  teamId: string | null;
  createdAt: string;
  updatedAt: string;
}

const SUMMARY_ROWS: Array<{ key: keyof Period["normalizedSummary"] & string; label: string }> = [
  { key: "revenue", label: "매출액" },
  { key: "grossProfit", label: "매출총이익" },
  { key: "ebitda", label: "EBITDA" },
  { key: "adjustedEbitda", label: "조정 EBITDA" },
  { key: "ebit", label: "EBIT" },
  { key: "netIncome", label: "당기순이익" },
  { key: "cash", label: "현금성자산" },
  { key: "totalDebt", label: "총차입금" },
  { key: "netDebt", label: "순차입금" },
  { key: "capex", label: "Capex" },
  { key: "freeCashFlow", label: "FCF" },
];

/** value는 원천 단위 원본 금액(원) — 화면 표시용으로만 억원 환산한다(financial-types.ts 주석 참고) */
function formatWon(value: number): string {
  return `${(value / 100_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}억원`;
}

function renderCalcResult(result: FinancialCalcResult | undefined): React.ReactNode {
  if (!result) return <span className="text-gray-300">—</span>;
  if (result.status === "ok") return <span className="font-medium">{formatWon(result.value)}</span>;
  if (result.status === "currency_mismatch")
    return <span className="text-amber-600 text-xs" title={result.detail}>통화 불일치</span>;
  return <span className="text-gray-300 text-xs">데이터 없음</span>;
}

const PERIOD_TYPE_LABEL: Record<string, string> = {
  ANNUAL: "연간",
  QUARTERLY: "분기",
  TTM: "TTM",
};

export function MaDealDetailClient({
  maDeal,
  periods: initialPeriods,
  canEdit,
}: {
  maDeal: MaDeal;
  periods: Period[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [periods, setPeriods] = useState<Period[]>(initialPeriods);
  const [importingDart, setImportingDart] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const dartPeriods = useMemo(
    () => periods.filter((p) => p.lineItems.some((li) => li.source === "DART")),
    [periods]
  );

  const refreshPeriods = async () => {
    const res = await fetch(`/api/ma-deals/${maDeal.id}/financials`);
    if (!res.ok) return;
    const json = await res.json();
    setPeriods(json.data ?? []);
  };

  const handleDartImport = async () => {
    setImportingDart(true);
    try {
      const res = await fetch(`/api/ma-deals/${maDeal.id}/dart/import`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? json.error ?? "DART 연동 실패");
      toast.success("DART 재무데이터를 가져왔습니다");
      await refreshPeriods();
    } catch (e) {
      toast.error("DART 연동 실패", {
        description: e instanceof Error ? e.message : "다시 시도해 주세요",
      });
    } finally {
      setImportingDart(false);
    }
  };

  const handleToggleStatus = async () => {
    const nextStatus = maDeal.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    setTogglingStatus(true);
    try {
      const res = await fetch(`/api/ma-deals/${maDeal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "상태 변경 실패");
      }
      toast.success(nextStatus === "ARCHIVED" ? "딜을 보관했습니다" : "딜을 다시 활성화했습니다");
      router.refresh();
    } catch (e) {
      toast.error("상태 변경 실패", {
        description: e instanceof Error ? e.message : "다시 시도해 주세요",
      });
    } finally {
      setTogglingStatus(false);
    }
  };

  const latestPeriod = periods[0];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="outline">{MA_DEAL_TYPE_LABEL[maDeal.dealType]}</Badge>
            <Badge variant={maDeal.status === "ACTIVE" ? "default" : "secondary"}>
              {MA_DEAL_STATUS_LABEL[maDeal.status]}
            </Badge>
            {maDeal.teamId && <Badge variant="secondary">팀 공유</Badge>}
          </div>
          <h1 className="text-xl font-semibold text-gray-900">{maDeal.companyName}</h1>
          <p className="text-sm text-gray-500">{maDeal.name}</p>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={handleToggleStatus} disabled={togglingStatus}>
            {maDeal.status === "ACTIVE" ? "딜 보관" : "다시 활성화"}
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="w-full sm:w-auto overflow-x-auto justify-start">
          <TabsTrigger value="overview" className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            개요
          </TabsTrigger>
          <TabsTrigger value="financials" className="flex items-center gap-1.5">
            <Calculator className="w-3.5 h-3.5" />
            재무 · QoE
          </TabsTrigger>
          <TabsTrigger value="dart" className="flex items-center gap-1.5">
            <Landmark className="w-3.5 h-3.5" />
            DART
          </TabsTrigger>
          <TabsTrigger value="lbo" className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            LBO 시뮬레이션
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">딜 기본 정보</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400">딜 유형</p>
                <p className="font-medium">{MA_DEAL_TYPE_LABEL[maDeal.dealType]}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">상태</p>
                <p className="font-medium">{MA_DEAL_STATUS_LABEL[maDeal.status]}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">최근 재무기간</p>
                <p className="font-medium">
                  {latestPeriod
                    ? `FY${latestPeriod.fiscalYear} ${PERIOD_TYPE_LABEL[latestPeriod.periodType]}`
                    : "등록된 재무 데이터 없음"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">등록일</p>
                <p className="font-medium">{new Date(maDeal.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">최근 수정</p>
                <p className="font-medium">{new Date(maDeal.updatedAt).toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>
          <p className="text-xs text-gray-400">
            문서 업로드를 통한 AI 사실 추출·DD 종합은 다음 라운드에서 연결될 예정입니다.
            지금은 재무 데이터를 직접 입력하거나 DART에서 가져올 수 있습니다.
          </p>
        </TabsContent>

        <TabsContent value="financials" className="space-y-4">
          <div className="flex justify-end">
            {canEdit && (
              <AddFinancialPeriodDialog maDealId={maDeal.id} onCreated={refreshPeriods} />
            )}
          </div>
          {periods.length === 0 ? (
            <p className="text-center text-gray-400 py-12">
              등록된 재무 데이터가 없습니다. 재무 기간을 추가하거나 DART 탭에서 가져와보세요.
            </p>
          ) : (
            periods.map((period) => (
              <Card key={period.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">
                    FY{period.fiscalYear} · {PERIOD_TYPE_LABEL[period.periodType]}
                  </CardTitle>
                  <Badge variant="outline">{period.currency}</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    {SUMMARY_ROWS.map((row) => (
                      <div key={row.key}>
                        <p className="text-xs text-gray-400">{row.label}</p>
                        {renderCalcResult(period.normalizedSummary[row.key])}
                      </div>
                    ))}
                  </div>

                  {period.adjustments.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-2">QoE 조정 항목</p>
                      <div className="space-y-1.5">
                        {period.adjustments.map((adj) => (
                          <div
                            key={adj.id}
                            className="flex items-center justify-between text-sm border rounded-md px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="font-medium truncate">{adj.metric}</p>
                              <p className="text-xs text-gray-500 truncate">{adj.reason}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={
                                  adj.adjustmentValue >= 0 ? "text-emerald-600" : "text-red-600"
                                }
                              >
                                {adj.adjustmentValue >= 0 ? "+" : ""}
                                {formatWon(adj.adjustmentValue)}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {MA_ADJUSTMENT_STATUS_LABEL[adj.status as keyof typeof MA_ADJUSTMENT_STATUS_LABEL] ?? adj.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="dart" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              DART(전자공시)에서 대상 기업명으로 최근 2개 사업연도 재무제표를 가져옵니다.
              비상장이거나 회사명이 일치하지 않으면 조회되지 않을 수 있습니다.
            </p>
            {canEdit && (
              <Button size="sm" onClick={handleDartImport} disabled={importingDart}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${importingDart ? "animate-spin" : ""}`} />
                {importingDart ? "가져오는 중..." : "DART에서 가져오기"}
              </Button>
            )}
          </div>
          {dartPeriods.length === 0 ? (
            <p className="text-center text-gray-400 py-12">
              아직 DART에서 가져온 재무 데이터가 없습니다.
            </p>
          ) : (
            dartPeriods.map((period) => (
              <Card key={period.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">
                    FY{period.fiscalYear} · {PERIOD_TYPE_LABEL[period.periodType]}
                  </CardTitle>
                  <Badge variant="outline">DART</Badge>
                </CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  {SUMMARY_ROWS.map((row) => (
                    <div key={row.key}>
                      <p className="text-xs text-gray-400">{row.label}</p>
                      {renderCalcResult(period.normalizedSummary[row.key])}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="lbo">
          <LboSimulatorPanel initialEbitda={latestPeriod?.normalizedSummary.ebitda} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
