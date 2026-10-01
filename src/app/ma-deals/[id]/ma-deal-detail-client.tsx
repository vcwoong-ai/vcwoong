"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Landmark, Calculator, TrendingUp, RefreshCw, FolderOpen, ClipboardList, Gavel, ListChecks, Presentation } from "lucide-react";
import type { MaDealType, MaDealStatus } from "@prisma/client";
import { MA_DEAL_TYPE_LABEL, MA_DEAL_STATUS_LABEL, MA_ADJUSTMENT_STATUS_LABEL } from "@/lib/pe/ma-deal-labels";
import type { FinancialCalcResult } from "@/lib/pe/financial-types";
import { useToast } from "@/hooks/use-toast";
import { isMaDealTab } from "@/lib/pe/ma-deal-queue";
import { AddFinancialPeriodDialog } from "@/components/ma-deals/add-financial-period-dialog";
import { LboSimulatorPanel } from "@/components/ma-deals/lbo-simulator-panel";
import { MaDealOverview, type MaDealDashboardData } from "@/components/ma-deals/ma-deal-overview";
import { MaDealDataRoom } from "@/components/ma-deals/ma-deal-data-room";
import { MaDealFinancialDataQuality } from "@/components/ma-deals/ma-deal-financial-data-quality";
import { MaDealCanonicalAccountsTable } from "@/components/ma-deals/ma-deal-canonical-accounts-table";
import { MaDealReadiness } from "@/components/ma-deals/ma-deal-readiness";
import { MaDealIcWorkspace } from "@/components/ma-deals/ma-deal-ic-workspace";
import { MaDealIcDecision } from "@/components/ma-deals/ma-deal-ic-decision";
import { MaDealIcReviewWorkspace } from "@/components/ma-deals/ma-deal-ic-review-workspace";
import { MaDealCommitteePack } from "@/components/ma-deals/ma-deal-committee-pack";
import {
  buildMaDealDashboard,
  type DashboardPeriod,
  type DashboardAdjustmentRow,
} from "@/lib/pe/ma-deal-dashboard";
import { computeFinancialDataQuality } from "@/lib/pe/pe-financials-view-model";
import type {
  DataRoomDocumentRow,
  DataRoomEvidenceRow,
  DataRoomFindingRow,
} from "@/lib/pe/pe-data-room-view-model";
import type { PEEvidenceRequestView } from "@/lib/pe/pe-ic-review-types";
import type { PEDDCase } from "@/lib/pe/dd-types";

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
  if (!result) return <span className="text-slate-400">—</span>;
  if (result.status === "ok") return <span className="font-medium">{formatWon(result.value)}</span>;
  if (result.status === "currency_mismatch")
    return <span className="text-amber-600 text-xs" title={result.detail}>통화 불일치</span>;
  return <span className="text-slate-500 text-xs">데이터 없음</span>;
}

const PERIOD_TYPE_LABEL: Record<string, string> = {
  ANNUAL: "연간",
  QUARTERLY: "분기",
  TTM: "TTM",
};

/** 문서 목록(데이터룸 API)을 필요로 하는 탭 — 한 번만 로드해 공유한다(PR #109/#110). */
const DOCUMENT_DEPENDENT_TABS = ["data-room", "ic-review-workflow", "committee-pack"];

export function MaDealDetailClient({
  maDeal,
  periods: initialPeriods,
  ddCase,
  canEdit,
  currentUserId,
}: {
  maDeal: MaDeal;
  periods: Period[];
  /** page.tsx가 서버에서 이미 조회해 내려준 값(PR #107) — IC 워크스페이스와
   * readiness의 DD/EVIDENCE 도메인이 함께 쓴다. 클라이언트에서 다시 조회하지 않는다. */
  ddCase: PEDDCase | undefined;
  canEdit: boolean;
  /** page.tsx의 session.user.id(PR #110) — Committee Pack 리뷰 패널이 "내 서명"을
   * 가려내는 데 쓴다. 클라이언트에서 별도로 세션을 다시 조회하지 않는다. */
  currentUserId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [periods, setPeriods] = useState<Period[]>(initialPeriods);
  const [importingDart, setImportingDart] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  // 탭은 URL(?tab=)과 같이 움직인다 — 새로고침·링크 공유·목록의 "다음 행동" 링크가 같은 탭을 연다.
  // 알 수 없는 값은 무시하고 개요로 시작한다(임의 문자열로 탭이 깨지지 않게).
  const searchParams = useSearchParams();
  const [activeTab, setActiveTabState] = useState<string>(() => {
    const requested = searchParams.get("tab");
    return isMaDealTab(requested) ? requested : "overview";
  });
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    const url = new URL(window.location.href);
    if (tab === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url.toString());
  };

  // Data Room(PR #106) — 개요/재무 탭과 달리 처음 탭을 열 때만 지연 로딩한다
  // (모든 딜이 문서를 갖는 건 아니므로 항상 미리 불러올 필요가 없음).
  const [dataRoomLoaded, setDataRoomLoaded] = useState(false);
  const [dataRoomLoading, setDataRoomLoading] = useState(false);
  const [documents, setDocuments] = useState<DataRoomDocumentRow[]>([]);
  const [evidence, setEvidence] = useState<DataRoomEvidenceRow[]>([]);
  const [findings, setFindings] = useState<DataRoomFindingRow[]>([]);

  useEffect(() => {
    // "검토 Workflow"/"위원회 자료" 탭의 문서 연결 select도 같은 문서 목록을
    // 쓴다(§Step9/PR #110 — 데이터룸을 먼저 열지 않아도 문서를 고를 수 있어야 한다).
    if (!DOCUMENT_DEPENDENT_TABS.includes(activeTab) || dataRoomLoaded || dataRoomLoading) return;
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

  // Evidence Request(PR #109) — 데이터룸 문서 상세의 "이 자료로 해결 가능한
  // 이슈"와 "검토 Workflow" 탭이 공유하는 하나의 state다(중복 조회 방지).
  // 두 탭 중 아무 쪽이나 먼저 열리면 로딩하고, 이후 재조회는 명시적
  // refreshEvidenceRequests() 호출(생성/상태변경/문서연결 이후)로만 한다.
  const [evidenceRequestsLoaded, setEvidenceRequestsLoaded] = useState(false);
  const [evidenceRequestsLoading, setEvidenceRequestsLoading] = useState(false);
  const [evidenceRequests, setEvidenceRequests] = useState<PEEvidenceRequestView[]>([]);

  const refreshEvidenceRequests = async () => {
    setEvidenceRequestsLoading(true);
    try {
      const res = await fetch(`/api/ma-deals/${maDeal.id}/evidence-requests`);
      if (!res.ok) return;
      const json = await res.json();
      setEvidenceRequests(json.data ?? []);
      setEvidenceRequestsLoaded(true);
    } catch {
      toast.error("근거 요청 목록을 불러오지 못했습니다");
    } finally {
      setEvidenceRequestsLoading(false);
    }
  };

  useEffect(() => {
    if (!DOCUMENT_DEPENDENT_TABS.includes(activeTab) || evidenceRequestsLoaded || evidenceRequestsLoading) return;
    refreshEvidenceRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, evidenceRequestsLoaded, evidenceRequestsLoading, maDeal.id]);

  // IC Decision Dashboard(PR #102) — periods state(재무 추가/DART 임포트 시
  // refreshPeriods()로 이미 최신화됨)에서 매번 다시 계산한다. page.tsx가
  // 한 번만 계산해 내려주면 재무 기간을 추가해도 Overview가 새로고침 전까지
  // 옛 데이터를 보여주는 문제가 있어(실사용 중 발견), 여기서 periods와
  // 항상 같은 소스를 보도록 옮겼다 — 새 계산 로직은 없다. PR #108부터는
  // 이 조립 시퀀스 자체를 `buildMaDealDashboard()`(ma-deal-dashboard.ts,
  // 순수 함수)로 뽑아 IC Memo export route(서버)도 정확히 같은 함수를
  // 호출하도록 했다 — UI와 export가 서로 다른 결론을 내는 걸 구조적으로
  // 막는다. Decision Readiness는 PR #104부터 buildPEDecisionReadiness()
  // (pe-decision-readiness.ts, PR #103, 수정 없음)가 유일한 판정처다.
  const dashboardPeriods: DashboardPeriod[] = useMemo(
    () =>
      periods.map((p) => ({
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
      })),
    [periods]
  );
  const dashboard: MaDealDashboardData = useMemo(
    () => buildMaDealDashboard(dashboardPeriods, ddCase),
    [dashboardPeriods, ddCase]
  );

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
          <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight leading-snug text-foreground">{maDeal.companyName}</h1>
          <p className="text-sm text-gray-500">{maDeal.name}</p>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={handleToggleStatus} disabled={togglingStatus}>
            {maDeal.status === "ACTIVE" ? "딜 보관" : "다시 활성화"}
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* `sm:w-auto`가 640px 이상에서 폭 제약을 풀어버려 탭 9개가 자연
         * 너비로 렌더되면서 페이지 전체가 가로로 밀리는 문제가 있었다
         * (768px/1024px에서 실측 확인, PR #111/#112에서 "이 PR 범위 밖의
         * 기존 문제"로 남겨뒀던 바로 그 오버플로). w-full을 모든 화면
         * 폭에서 유지해 탭 바 자기 자신만 가로 스크롤되게 고정한다 —
         * 페이지 자체는 넘치지 않는다. */}
        <TabsList className="w-full overflow-x-auto justify-start rounded-none border-b border-border bg-transparent p-0 h-auto gap-1 pb-2">
          <TabsTrigger value="overview" className="flex items-center gap-1.5 px-4 py-3 min-h-11">
            <Building2 className="w-3.5 h-3.5" />
            개요
          </TabsTrigger>
          <TabsTrigger value="ic-review" className="flex items-center gap-1.5 px-4 py-3 min-h-11">
            <ClipboardList className="w-3.5 h-3.5" />
            IC 검토
          </TabsTrigger>
          <TabsTrigger value="ic-decision" className="flex items-center gap-1.5 px-4 py-3 min-h-11">
            <Gavel className="w-3.5 h-3.5" />
            IC 의사결정
          </TabsTrigger>
          <TabsTrigger value="ic-review-workflow" className="flex items-center gap-1.5 px-4 py-3 min-h-11">
            <ListChecks className="w-3.5 h-3.5" />
            검토 Workflow
          </TabsTrigger>
          <TabsTrigger value="committee-pack" className="flex items-center gap-1.5 px-4 py-3 min-h-11">
            <Presentation className="w-3.5 h-3.5" />
            위원회 자료
          </TabsTrigger>
          <TabsTrigger value="data-room" className="flex items-center gap-1.5 px-4 py-3 min-h-11">
            <FolderOpen className="w-3.5 h-3.5" />
            데이터룸
          </TabsTrigger>
          <TabsTrigger value="financials" className="flex items-center gap-1.5 px-4 py-3 min-h-11">
            <Calculator className="w-3.5 h-3.5" />
            재무 · QoE
          </TabsTrigger>
          <TabsTrigger value="dart" className="flex items-center gap-1.5 px-4 py-3 min-h-11">
            <Landmark className="w-3.5 h-3.5" />
            DART
          </TabsTrigger>
          <TabsTrigger value="lbo" className="flex items-center gap-1.5 px-4 py-3 min-h-11">
            <TrendingUp className="w-3.5 h-3.5" />
            LBO 시뮬레이션
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <MaDealOverview maDeal={maDeal} dashboard={dashboard} onNavigateTab={setActiveTab} />
        </TabsContent>

        <TabsContent value="ic-review" className="space-y-4">
          <MaDealIcWorkspace
            maDealId={maDeal.id}
            maDeal={maDeal}
            dashboard={dashboard}
            ddCase={ddCase}
            periods={periods}
            canEdit={canEdit}
            onNavigateTab={setActiveTab}
            onEvidenceRequestCreated={refreshEvidenceRequests}
          />
        </TabsContent>

        <TabsContent value="ic-decision" className="space-y-4">
          <MaDealIcDecision
            maDeal={maDeal}
            dashboard={dashboard}
            ddCase={ddCase}
            canEdit={canEdit}
            onNavigateTab={setActiveTab}
            onEvidenceRequestCreated={refreshEvidenceRequests}
          />
        </TabsContent>

        <TabsContent value="ic-review-workflow" className="space-y-4">
          <MaDealIcReviewWorkspace
            maDeal={maDeal}
            dashboard={dashboard}
            ddCase={ddCase}
            documents={documents}
            evidenceRequests={evidenceRequests}
            evidenceRequestsLoading={evidenceRequestsLoading && !evidenceRequestsLoaded}
            canEdit={canEdit}
            onRefresh={refreshEvidenceRequests}
          />
        </TabsContent>

        <TabsContent value="committee-pack" className="space-y-4">
          <MaDealCommitteePack
            maDeal={maDeal}
            dashboard={dashboard}
            ddCase={ddCase}
            evidenceRequests={evidenceRequests}
            evidenceRequestsLoading={evidenceRequestsLoading && !evidenceRequestsLoaded}
            canEdit={canEdit}
            currentUserId={currentUserId}
            onNavigateTab={setActiveTab}
            onEvidenceRequestCreated={refreshEvidenceRequests}
          />
        </TabsContent>

        <TabsContent value="data-room" className="space-y-4">
          <MaDealDataRoom
            dealId={maDeal.id}
            documents={documents}
            evidence={evidence}
            findings={findings}
            evidenceRequests={evidenceRequests}
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
