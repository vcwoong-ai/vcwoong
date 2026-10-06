"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { PeFileUploader } from "@/components/ma-deals/pe-file-uploader";
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
  const [financialLoading, setFinancialLoading] = useState(false);
  const [financialError, setFinancialError] = useState<string | null>(null);
  const financialControllerRef = useRef<AbortController | null>(null);
  const financialEpochRef = useRef(0);
  const savedRefreshPendingRef = useRef(false);
  const cancelFinancialRead = useCallback(() => {
    financialEpochRef.current++;
    financialControllerRef.current?.abort();
    financialControllerRef.current = null;
  }, []);
  useEffect(() => {
    setPeriods(initialPeriods);
    setFinancialError(null);
    setFinancialLoading(false);
    savedRefreshPendingRef.current = false;
    return cancelFinancialRead;
  }, [initialPeriods, maDeal.id, cancelFinancialRead]);
  const [importingDart, setImportingDart] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [confirmedStatus, setConfirmedStatus] = useState<MaDealStatus>(maDeal.status);
  const confirmedStatusRef = useRef<MaDealStatus>(maDeal.status);
  const [dartError, setDartError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [dartUncertain, setDartUncertain] = useState(false);
  const [archiveUncertain, setArchiveUncertain] = useState(false);
  const [checkingArchive, setCheckingArchive] = useState(false);
  const dartPendingRef = useRef(false);
  const archivePendingRef = useRef(false);
  const dartUncertainRef = useRef(false);
  const archiveUncertainRef = useRef(false);
  const mutationEpochRef = useRef(0);
  const dartControllerRef = useRef<AbortController | null>(null);
  const archiveControllerRef = useRef<AbortController | null>(null);
  const archiveReadControllerRef = useRef<AbortController | null>(null);
  const cancelMutations = useCallback(() => {
    mutationEpochRef.current++;
    dartControllerRef.current?.abort();
    archiveControllerRef.current?.abort();
    archiveReadControllerRef.current?.abort();
    dartControllerRef.current = null;
    archiveControllerRef.current = null;
    archiveReadControllerRef.current = null;
    dartPendingRef.current = false;
    archivePendingRef.current = false;
    dartUncertainRef.current = false;
    archiveUncertainRef.current = false;
  }, []);
  useEffect(() => {
    setImportingDart(false);
    setTogglingStatus(false);
    setCheckingArchive(false);
    setDartError(null);
    setArchiveError(null);
    setDartUncertain(false);
    setArchiveUncertain(false);
    return cancelMutations;
  }, [maDeal.id, cancelMutations]);
  useEffect(() => {
    confirmedStatusRef.current = maDeal.status;
    setConfirmedStatus(maDeal.status);
  }, [maDeal.id, maDeal.status]);
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
  const [dataRoomError, setDataRoomError] = useState<string | null>(null);
  const dataRoomControllerRef = useRef<AbortController | null>(null);
  const dataRoomEpochRef = useRef(0);
  const evidenceControllerRef = useRef<AbortController | null>(null);
  const evidenceEpochRef = useRef(0);
  const cancelDocumentRequests = useCallback(() => {
    dataRoomEpochRef.current++;
    evidenceEpochRef.current++;
    dataRoomControllerRef.current?.abort();
    evidenceControllerRef.current?.abort();
    dataRoomControllerRef.current = null;
    evidenceControllerRef.current = null;
  }, []);

  const loadDataRoom = useCallback(async (): Promise<boolean> => {
    dataRoomControllerRef.current?.abort();
    const controller = new AbortController();
    const epoch = ++dataRoomEpochRef.current;
    dataRoomControllerRef.current = controller;
    setDataRoomLoading(true);
    setDataRoomError(null);
    try {
      const response = await fetch(`/api/ma-deals/${maDeal.id}/documents`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Data unavailable");
      const { data } = await response.json();
      if (controller.signal.aborted || epoch !== dataRoomEpochRef.current) return false;
      if (!data || ![data.documents, data.evidence, data.findings].every(value => Array.isArray(value) &&
        value.every((row: unknown) => row && typeof row === "object" && "id" in row && typeof row.id === "string"))) throw new Error("Data unavailable");
      setDocuments(data.documents);
      setEvidence(data.evidence);
      setFindings(data.findings);
      setDataRoomLoaded(true);
      return true;
    } catch {
      if (!controller.signal.aborted && epoch === dataRoomEpochRef.current)
        setDataRoomError("자료 목록을 불러오지 못했습니다. 등록된 자료가 없는 상태로 판단하지 마세요. 다시 조회해 주세요.");
      return false;
    } finally {
      if (!controller.signal.aborted && epoch === dataRoomEpochRef.current) {
        dataRoomControllerRef.current = null;
        setDataRoomLoading(false);
      }
    }
  }, [maDeal.id]);

  // Evidence Request(PR #109) — 데이터룸 문서 상세의 "이 자료로 해결 가능한
  // 이슈"와 "검토 Workflow" 탭이 공유하는 하나의 state다(중복 조회 방지).
  // 두 탭 중 아무 쪽이나 먼저 열리면 로딩하고, 이후 재조회는 명시적
  // refreshEvidenceRequests() 호출(생성/상태변경/문서연결 이후)로만 한다.
  const [evidenceRequestsLoaded, setEvidenceRequestsLoaded] = useState(false);
  const [evidenceRequestsLoading, setEvidenceRequestsLoading] = useState(false);
  const [evidenceRequests, setEvidenceRequests] = useState<PEEvidenceRequestView[]>([]);
  const [evidenceRequestsError, setEvidenceRequestsError] = useState<string | null>(null);

  const refreshEvidenceRequests = useCallback(async () => {
    evidenceControllerRef.current?.abort();
    const controller = new AbortController();
    const epoch = ++evidenceEpochRef.current;
    evidenceControllerRef.current = controller;
    setEvidenceRequestsLoading(true);
    setEvidenceRequestsError(null);
    try {
      const res = await fetch(`/api/ma-deals/${maDeal.id}/evidence-requests`, { cache: "no-store", signal: controller.signal });
      if (!res.ok) throw new Error("Requests unavailable");
      const json = await res.json();
      if (controller.signal.aborted || epoch !== evidenceEpochRef.current) return;
      if (!Array.isArray(json.data) || !json.data.every((row: unknown) => row && typeof row === "object" && "id" in row && typeof row.id === "string")) throw new Error("Requests unavailable");
      setEvidenceRequests(json.data);
      setEvidenceRequestsLoaded(true);
    } catch {
      if (!controller.signal.aborted && epoch === evidenceEpochRef.current)
        setEvidenceRequestsError("근거 요청 목록을 불러오지 못했습니다. 요청이 없는 상태로 판단하지 마세요. 다시 조회해 주세요.");
    } finally {
      if (!controller.signal.aborted && epoch === evidenceEpochRef.current) {
        evidenceControllerRef.current = null;
        setEvidenceRequestsLoading(false);
      }
    }
  }, [maDeal.id]);

  useEffect(() => {
    setDataRoomLoaded(false);
    setDataRoomLoading(false);
    setDataRoomError(null);
    setDocuments([]);
    setEvidence([]);
    setFindings([]);
    setEvidenceRequestsLoaded(false);
    setEvidenceRequestsLoading(false);
    setEvidenceRequestsError(null);
    setEvidenceRequests([]);
    return cancelDocumentRequests;
  }, [maDeal.id, cancelDocumentRequests]);

  useEffect(() => {
    // Document-dependent tabs share one bounded initial read; errors require a manual retry.
    if (!DOCUMENT_DEPENDENT_TABS.includes(activeTab) || dataRoomLoaded || dataRoomLoading || dataRoomError) return;
    void loadDataRoom();
  }, [activeTab, dataRoomLoaded, dataRoomLoading, dataRoomError, loadDataRoom]);

  useEffect(() => {
    if (!DOCUMENT_DEPENDENT_TABS.includes(activeTab) || evidenceRequestsLoaded || evidenceRequestsLoading || evidenceRequestsError) return;
    void refreshEvidenceRequests();
  }, [activeTab, evidenceRequestsLoaded, evidenceRequestsLoading, evidenceRequestsError, refreshEvidenceRequests]);

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

  const refreshPeriods = async (reason: "read" | "saved" = "read"): Promise<boolean> => {
    financialControllerRef.current?.abort();
    const controller = new AbortController();
    const epoch = ++financialEpochRef.current;
    financialControllerRef.current = controller;
    setFinancialLoading(true);
    if (reason === "saved") savedRefreshPendingRef.current = true;
    setFinancialError(null);
    try {
      const res = await fetch(`/api/ma-deals/${maDeal.id}/financials`, { cache: "no-store", signal: controller.signal });
      if (!res.ok) throw new Error("Financial data unavailable");
      const json = await res.json();
      if (controller.signal.aborted || epoch !== financialEpochRef.current) return false;
      if (!Array.isArray(json.data) || !json.data.every((period: unknown) => period && typeof period === "object" &&
        "id" in period && typeof period.id === "string" && "lineItems" in period && Array.isArray(period.lineItems))) throw new Error("Financial data unavailable");
      setPeriods(json.data);
      savedRefreshPendingRef.current = false;
      return true;
    } catch {
      if (!controller.signal.aborted && epoch === financialEpochRef.current)
        setFinancialError(savedRefreshPendingRef.current
          ? "재무 데이터는 저장되었지만 목록을 갱신하지 못했습니다. 재무 목록만 다시 조회해 주세요."
          : "재무 목록을 조회하지 못했습니다. 이전에 불러온 내용을 유지하고 있습니다. 다시 조회해 주세요.");
      return false;
    } finally {
      if (!controller.signal.aborted && epoch === financialEpochRef.current) {
        financialControllerRef.current = null;
        setFinancialLoading(false);
      }
    }
  };

  const handleDartImport = async () => {
    if (!canEdit || dartPendingRef.current || dartUncertainRef.current) return;
    dartPendingRef.current = true;
    const epoch = mutationEpochRef.current;
    const controller = new AbortController();
    dartControllerRef.current = controller;
    const isCurrent = () => !controller.signal.aborted && epoch === mutationEpochRef.current;
    setImportingDart(true);
    setDartError(null);
    const hold = () => {
      dartUncertainRef.current = true;
      setDartUncertain(true);
      setDartError("DART 가져오기 결과를 확인하지 못했습니다. 일부 재무 기간이 저장되었을 수 있습니다. 다시 가져오지 말고 재무 목록을 조회해 확인하세요.");
    };
    try {
      const res = await fetch(`/api/ma-deals/${maDeal.id}/dart/import`, { method: "POST", signal: controller.signal });
      if (!isCurrent()) return;
      if (!res.ok) {
        if (res.status >= 500) hold();
        else setDartError(res.status === 401 ? "로그인이 만료되었습니다. 다시 로그인한 뒤 재무 목록을 확인하세요."
          : res.status === 403 ? "재무 데이터를 가져올 권한이 없습니다."
          : "DART 가져오기 요청을 완료하지 못했습니다. 기업 정보와 기존 재무 목록을 확인하세요.");
        return;
      }
      const { data } = await res.json();
      if (!isCurrent()) return;
      if (!data || data.maDealId !== maDeal.id || data.source !== "DART" || !Number.isSafeInteger(data.importedPeriods) ||
          data.importedPeriods < 0 || !Number.isSafeInteger(data.importedLineItems) || data.importedLineItems < 0 || !Array.isArray(data.skippedPeriods)) {
        hold(); return;
      }
      toast.success(data.importedPeriods > 0 ? "DART 재무데이터를 가져왔습니다" : "기존 재무 기간을 보존했습니다. 새로 추가된 기간은 없습니다.");
      await refreshPeriods(data.importedPeriods > 0 ? "saved" : "read");
    } catch {
      if (isCurrent()) hold();
    } finally {
      if (isCurrent()) { dartPendingRef.current = false; dartControllerRef.current = null; setImportingDart(false); }
    }
  };

  const refreshDealStatus = async () => {
    archiveReadControllerRef.current?.abort();
    const controller = new AbortController();
    archiveReadControllerRef.current = controller;
    const epoch = mutationEpochRef.current;
    const isCurrent = () => !controller.signal.aborted && epoch === mutationEpochRef.current;
    setCheckingArchive(true);
    try {
      const response = await fetch(`/api/ma-deals/${maDeal.id}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Status unavailable");
      const { data } = await response.json();
      if (!isCurrent()) return;
      if (!data || data.id !== maDeal.id || !["ACTIVE", "ARCHIVED"].includes(data.status)) throw new Error("Status unavailable");
      confirmedStatusRef.current = data.status;
      setConfirmedStatus(data.status);
      archiveUncertainRef.current = false;
      setArchiveUncertain(false);
      setArchiveError(null);
    } catch {
      if (isCurrent()) setArchiveError("딜 상태를 조회하지 못했습니다. 상태 변경을 다시 요청하기 전에 현재 상태를 확인하세요.");
    } finally {
      if (isCurrent()) { archiveReadControllerRef.current = null; setCheckingArchive(false); }
    }
  };

  const handleToggleStatus = async () => {
    if (!canEdit || archivePendingRef.current || archiveUncertainRef.current || archiveReadControllerRef.current) return;
    archivePendingRef.current = true;
    const controller = new AbortController();
    archiveControllerRef.current = controller;
    const epoch = mutationEpochRef.current;
    const isCurrent = () => !controller.signal.aborted && epoch === mutationEpochRef.current;
    const nextStatus = confirmedStatusRef.current === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    setTogglingStatus(true);
    setArchiveError(null);
    const hold = () => {
      archiveUncertainRef.current = true;
      setArchiveUncertain(true);
      setArchiveError("딜 상태 변경 결과를 확인하지 못했습니다. 같은 변경을 다시 요청하지 말고 현재 딜 상태를 조회해 주세요.");
    };
    try {
      const res = await fetch(`/api/ma-deals/${maDeal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!isCurrent()) return;
      if (!res.ok) {
        if (res.status >= 500) hold();
        else setArchiveError(res.status === 401 ? "로그인이 만료되었습니다. 다시 로그인한 뒤 딜 상태를 확인하세요."
          : res.status === 403 ? "딜 상태를 변경할 권한이 없습니다."
          : "딜 상태 변경 요청을 완료하지 못했습니다. 현재 상태를 확인하세요.");
        return;
      }
      const { data } = await res.json();
      if (!isCurrent()) return;
      if (!data || data.id !== maDeal.id || data.status !== nextStatus) { hold(); return; }
      confirmedStatusRef.current = data.status;
      setConfirmedStatus(data.status);
      toast.success(nextStatus === "ARCHIVED" ? "딜을 보관했습니다" : "딜을 다시 활성화했습니다");
      router.refresh();
    } catch {
      if (isCurrent()) hold();
    } finally {
      if (isCurrent()) { archivePendingRef.current = false; archiveControllerRef.current = null; setTogglingStatus(false); }
    }
  };

  const latestPeriod = periods[0];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="outline">{MA_DEAL_TYPE_LABEL[maDeal.dealType]}</Badge>
            <Badge variant={confirmedStatus === "ACTIVE" ? "default" : "secondary"}>
              {MA_DEAL_STATUS_LABEL[confirmedStatus]}
            </Badge>
            {maDeal.teamId && <Badge variant="secondary">팀 공유</Badge>}
          </div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight leading-snug text-foreground">{maDeal.companyName}</h1>
          <p className="text-sm text-gray-500">{maDeal.name}</p>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={handleToggleStatus} disabled={togglingStatus || archiveUncertain || checkingArchive}>
            {confirmedStatus === "ACTIVE" ? "딜 보관" : "다시 활성화"}
          </Button>
        )}
      </div>
      {archiveError && <div role="alert" data-testid="pe-archive-error" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p>{archiveError}</p>
        <Button variant="outline" size="sm" onClick={refreshDealStatus} disabled={checkingArchive || togglingStatus}>딜 상태 다시 조회</Button>
      </div>}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {DOCUMENT_DEPENDENT_TABS.includes(activeTab) && dataRoomError && (
          <div role="alert" data-testid="pe-data-room-error" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p>{dataRoomError}</p>
            <Button variant="outline" size="sm" onClick={loadDataRoom} disabled={dataRoomLoading}>자료 목록 다시 조회</Button>
          </div>
        )}
        {DOCUMENT_DEPENDENT_TABS.includes(activeTab) && evidenceRequestsError && (
          <div role="alert" data-testid="pe-evidence-requests-error" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p>{evidenceRequestsError}</p>
            <Button variant="outline" size="sm" onClick={refreshEvidenceRequests} disabled={evidenceRequestsLoading}>근거 요청 다시 조회</Button>
          </div>
        )}
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
          {!dataRoomError && !evidenceRequestsError && <MaDealIcReviewWorkspace
            maDeal={maDeal}
            dashboard={dashboard}
            ddCase={ddCase}
            documents={documents}
            evidenceRequests={evidenceRequests}
            evidenceRequestsLoading={!evidenceRequestsLoaded}
            canEdit={canEdit}
            onRefresh={refreshEvidenceRequests}
          />}
        </TabsContent>

        <TabsContent value="committee-pack" className="space-y-4">
          {!dataRoomError && !evidenceRequestsError && <MaDealCommitteePack
            maDeal={maDeal}
            dashboard={dashboard}
            ddCase={ddCase}
            evidenceRequests={evidenceRequests}
            evidenceRequestsLoading={!evidenceRequestsLoaded}
            canEdit={canEdit}
            currentUserId={currentUserId}
            onNavigateTab={setActiveTab}
            onEvidenceRequestCreated={refreshEvidenceRequests}
          />}
        </TabsContent>

        <TabsContent value="data-room" className="space-y-4">
          <PeFileUploader dealId={maDeal.id} canEdit={canEdit} onUploaded={loadDataRoom} />
          {!dataRoomError && !evidenceRequestsError && <MaDealDataRoom
            dealId={maDeal.id}
            canEdit={canEdit}
            documents={documents}
            evidence={evidence}
            findings={findings}
            evidenceRequests={evidenceRequests}
            loading={!dataRoomLoaded || !evidenceRequestsLoaded}
          />}
        </TabsContent>

        <TabsContent value="financials" className="space-y-4">
          {financialLoading && <p role="status" className="text-sm text-muted-foreground">재무 목록을 조회하는 중입니다.</p>}
          {financialError && <div role="alert" data-testid="pe-financial-read-error" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p>{financialError}</p>
            <Button variant="outline" size="sm" onClick={() => refreshPeriods()} disabled={financialLoading}>재무 목록 다시 조회</Button>
          </div>}
          <div className="flex justify-end">
            {canEdit && (
              <AddFinancialPeriodDialog maDealId={maDeal.id} onCreated={() => refreshPeriods("saved")} onReload={() => refreshPeriods()} />
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
          {periods.length === 0 ? (!financialError && !financialLoading &&
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
          {dartError && <div role="alert" data-testid="pe-dart-import-error" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p>{dartError}</p>
            <Button variant="outline" size="sm" onClick={() => refreshPeriods()} disabled={financialLoading || importingDart}>DART 결과 목록 조회</Button>
          </div>}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              DART(전자공시)에서 대상 기업명으로 최근 2개 사업연도 재무제표를 가져옵니다.
              비상장이거나 회사명이 일치하지 않으면 조회되지 않을 수 있습니다.
            </p>
            {canEdit && (
              <Button size="sm" onClick={handleDartImport} disabled={importingDart || dartUncertain}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${importingDart ? "animate-spin" : ""}`} />
                {importingDart ? "가져오는 중..." : "DART에서 가져오기"}
              </Button>
            )}
          </div>
          {dartPeriods.length === 0 ? (!dartError && !financialError &&
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
