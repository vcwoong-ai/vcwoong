import { MA_DEAL_TYPE_LABEL, MA_DEAL_STATUS_LABEL } from "@/lib/pe/ma-deal-labels";
import { MaDealIcSnapshot } from "./ma-deal-ic-snapshot";
import { MaDealFinancialSummary } from "./ma-deal-financial-summary";
import { MaDealQoeSummary } from "./ma-deal-qoe-summary";
import { MaDealDartStatus } from "./ma-deal-dart-status";
import { MaDealReadiness } from "./ma-deal-readiness";
import { MaDealMissingInfo } from "./ma-deal-missing-info";
import { MaDealStatusPanel } from "./ma-deal-status-panel";
import type { MaDealType, MaDealStatus } from "@prisma/client";
import type {
  QoESummaryView,
  DartStatusView,
  FinancialQualityView,
  computeLboEntryEbitda,
} from "@/lib/pe/ma-deal-dashboard";
import type { PEDecisionReadiness } from "@/lib/pe/pe-decision-readiness";

interface MaDeal {
  dealType: MaDealType;
  status: MaDealStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MaDealDashboardData {
  qoeSummary: QoESummaryView | null;
  lboEntryEbitda: ReturnType<typeof computeLboEntryEbitda>;
  dartStatus: DartStatusView;
  financialQuality: FinancialQualityView;
  /** pe-decision-readiness.ts의 buildPEDecisionReadiness() 결과 그대로(PR #103, 수정 없음) — UI는 재해석하지 않는다 */
  decisionReadiness: PEDecisionReadiness;
}

/**
 * PE IC Decision Dashboard(§3) — "이 딜 지금 어디까지 왔나"를 한 화면에서
 * 답한다. 여기서 어떤 재무/QoE/LBO 숫자도 새로 계산하지 않는다 — 전부
 * page.tsx가 ma-deal-dashboard.ts(기존 엔진 재사용)로 미리 계산해 내려준
 * 값을 그대로 배치할 뿐이다. BUY/PASS 같은 투자 추천은 만들지 않는다(§4).
 */
export function MaDealOverview({
  maDeal,
  dashboard,
  onNavigateTab,
}: {
  maDeal: MaDeal;
  dashboard: MaDealDashboardData;
  onNavigateTab: (tab: string) => void;
}) {
  const meta = [
    MA_DEAL_TYPE_LABEL[maDeal.dealType],
    MA_DEAL_STATUS_LABEL[maDeal.status],
    dashboard.financialQuality.latestPeriodLabel
      ? `최근 재무 ${dashboard.financialQuality.latestPeriodLabel}`
      : "등록된 재무 데이터 없음",
    `등록 ${new Date(maDeal.createdAt).toLocaleDateString("ko-KR")}`,
    `수정 ${new Date(maDeal.updatedAt).toLocaleDateString("ko-KR")}`,
  ];
  return (
    <div className="space-y-4">
      <MaDealStatusPanel readiness={dashboard.decisionReadiness} meta={meta} onNavigateTab={onNavigateTab} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <MaDealFinancialSummary quality={dashboard.financialQuality} conflictCount={dashboard.decisionReadiness.factConflicts.length} />
          <MaDealIcSnapshot lboEntryEbitda={dashboard.lboEntryEbitda} onOpenLbo={() => onNavigateTab("lbo")} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MaDealQoeSummary qoe={dashboard.qoeSummary} onOpenFinancials={() => onNavigateTab("financials")} />
            <MaDealDartStatus dart={dashboard.dartStatus} onOpenDart={() => onNavigateTab("dart")} />
          </div>
        </div>
        <div className="space-y-4">
          <MaDealReadiness readiness={dashboard.decisionReadiness} variant="compact" />
          <MaDealMissingInfo readiness={dashboard.decisionReadiness} />
        </div>
      </div>
    </div>
  );
}
