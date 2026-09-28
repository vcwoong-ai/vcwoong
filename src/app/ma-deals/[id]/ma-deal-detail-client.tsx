"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Landmark, Calculator, TrendingUp, RefreshCw, FolderOpen } from "lucide-react";
import type { MaDealType, MaDealStatus } from "@prisma/client";
import { MA_DEAL_TYPE_LABEL, MA_DEAL_STATUS_LABEL, MA_ADJUSTMENT_STATUS_LABEL } from "@/lib/pe/ma-deal-labels";
import type { FinancialCalcResult } from "@/lib/pe/financial-types";
import { useToast } from "@/hooks/use-toast";
import { AddFinancialPeriodDialog } from "@/components/ma-deals/add-financial-period-dialog";
import { LboSimulatorPanel } from "@/components/ma-deals/lbo-simulator-panel";
import { MaDealOverview, type MaDealDashboardData } from "@/components/ma-deals/ma-deal-overview";
import { MaDealDataRoom } from "@/components/ma-deals/ma-deal-data-room";
import { MaDealFinancialDataQuality } from "@/components/ma-deals/ma-deal-financial-data-quality";
import { MaDealCanonicalAccountsTable } from "@/components/ma-deals/ma-deal-canonical-accounts-table";
import { MaDealReadiness } from "@/components/ma-deals/ma-deal-readiness";
import {
  computeQoESummary,
  computeLboEntryEbitda,
  computeDartStatus,
  computeFinancialQuality,
  toPEDecisionReadinessInput,
  type DashboardPeriod,
  type DashboardAdjustmentRow,
} from "@/lib/pe/ma-deal-dashboard";
import { buildPEDecisionReadiness } from "@/lib/pe/pe-decision-readiness";
import { computeFinancialDataQuality } from "@/lib/pe/pe-financials-view-model";
import type {
  DataRoomDocumentRow,
  DataRoomEvidenceRow,
  DataRoomFindingRow,
} from "@/lib/pe/pe-data-room-view-model";

interface LineItem {
  id: string;
  statementType: string;
  lineItem: string;
  value: number;
  currency: string;
  source: string;
  sourceName?: string | null;
}

interface Adjustment {
  id: string;
  metric: string;
  reportedValue: number;
  adjustmentValue: number;
  normalizedValue: number;
  reason: string;
  status: string;
  adjustmentType: string;
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
  const [activeTab, setActiveTab] = useState("overview");

  // Data Room(PR #106) — 개요/재무 탭과 달리 처음 탭을 열 때만 지연 로딩한다
  // (모든 딜이 문서를 갖는 건 아니므로 항상 미리 불러올 필요가 없음).
  const [dataRoomLoaded, setDataRoomLoaded] = useState(false);
  const [dataRoomLoading, setDataRoomLoading] = useState(false);
  const [documents, setDocuments] = useState<DataRoomDocumentRow[]>([]);
  const [evidence, setEvidence] = useState<DataRoomEvidenceRow[]>([]);
  const [findings, setFindings] = useState<DataRoomFindingRow[]>([]);

  useEffect(() => {
    if (activeTab !== "data-room" || dataRoomLoaded || dataRoomLoading) return;
    setDataRoomLoading(true);
    fetch(`/api/ma-deals/${maDeal.id}/documents`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((json) => {
        setDocuments(json.data?.documents ?? []);
        setEvidence(json.data?.evidence ?? []);
        setFindings(json.data?.findings ?? []);
        setDataRoomLoaded(true);
      })
      .catch(() => {
        toast.error("Data Room을 불러오지 못했습니다");
      })
      .finally(() => setDataRoomLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dataRoomLoaded, dataRoomLoading, maDeal.id]);

  // IC Decision Dashboard(PR #102) — periods state(재무 추가/DART 임포트 시
  // refreshPeriods()로 이미 최신화됨)에서 매번 다시 계산한다. page.tsx가
  // 한 번만 계산해 내려주면 재무 기간을 추가해도 Overview가 새로고침 전까지
  // 옛 데이터를 보여주는 문제가 있어(실사용 중 발견), 여기서 periods와
  // 항상 같은 소스를 보도록 옮겼다 — 새 계산 로직은 없다(ma-deal-dashboard.ts
  // 그대로 재사용). Decision Readiness는 PR #104부터 buildPEDecisionReadiness()
  // (pe-decision-readiness.ts, PR #103, 수정 없음)가 유일한 판정처다 — 여기서
  // 재판정하지 않고 그 결과를 그대로 전달만 한다.
  const dashboard: MaDealDashboardData = useMemo(() => {
    const dashboardPeriods: DashboardPeriod[] = periods.map((p) => ({
      id: p.id,
      fiscalYear: p.fiscalYear,
      periodType: p.periodType as DashboardPeriod["periodType"],
      currency: p.currency,
      lineItems: p.lineItems,
      adjustments: p.adjustments as DashboardAdjustmentRow[],
      normalizedSummary: {
        revenue: p.normalizedSummary.revenue,
        ebitda: p.normalizedSummary.ebitda,
        netDebt: p.normalizedSummary.netDebt,
      },
    }));
    const latest = dashboardPeriods[0] ?? null;
    const qoeSummary = latest ? computeQoESummary(latest) : null;
    const lboEntryEbitda = computeLboEntryEbitda(latest, qoeSummary);
    const dartStatus = computeDartStatus(dashboardPeriods);
    return {
      qoeSummary,
      lboEntryEbitda,
      dartStatus,
      financialQuality: computeFinancialQuality(dashboardPeriods),
      decisionReadiness: buildPEDecisionReadiness(toPEDecisionReadinessInput(dashboardPeriods)),
    };
  }, [periods]);

  const dartPeriods = useMemo(
    () => periods.filter((p) => p.lineItems.some((li) => li.source === "DART")),
    [periods]
  );

  // Financials 탭 데이터 품질 요약(PR #106) — computeFinancialDataQuality()는
  // 순수 집계(새 재무 계산 없음)이고, conflict 개수는 dashboard.decisionReadiness가
  // 이미 계산한 factConflicts를 그대로 받는다(재계산 없음).
  const financialDataQuality = useMemo(
    () => computeFinancialDataQuality(periods, dashboard.decisionReadiness.factConflicts.length),
    [periods, dashboard.decisionReadiness.factConflicts.length]
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto overflow-x-auto justify-start">
          <TabsTrigger value="overview" className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            개요
          </TabsTrigger>
          <TabsTrigger value="data-room" className="flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" />
            데이터룸
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
          <MaDealOverview maDeal={maDeal} dashboard={dashboard} onNavigateTab={setActiveTab} />
        </TabsContent>

        <TabsContent value="data-room" className="space-y-4">
          <MaDealDataRoom
            documents={documents}
            evidence={evidence}
            findings={findings}
            loading={dataRoomLoading && !dataRoomLoaded}
          />
        </TabsContent>

        <TabsContent value="financials" className="space-y-4">
          <div className="flex justify-end">
            {canEdit && (
              <AddFinancialPeriodDialog maDealId={maDeal.id} onCreated={refreshPeriods} />
            )}
          </div>
          {periods.length > 0 && (
            <>
              <MaDealFinancialDataQuality
                quality={financialDataQuality}
                conflicts={dashboard.decisionReadiness.factConflicts}
              />
              <MaDealCanonicalAccountsTable periods={periods} />
              <MaDealReadiness readiness={dashboard.decisionReadiness} />
            </>
          )}
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
          <LboSimulatorPanel
            initialEbitda={latestPeriod?.normalizedSummary.ebitda}
            initialEbitdaInEok={
              dashboard.lboEntryEbitda.status === "ok"
                ? dashboard.lboEntryEbitda.lbo.entryEbitdaInEok
                : undefined
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
