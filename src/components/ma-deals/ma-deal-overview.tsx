import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MA_DEAL_TYPE_LABEL, MA_DEAL_STATUS_LABEL } from "@/lib/pe/ma-deal-labels";
import { MaDealIcSnapshot } from "./ma-deal-ic-snapshot";
import { MaDealFinancialSummary } from "./ma-deal-financial-summary";
import { MaDealQoeSummary } from "./ma-deal-qoe-summary";
import { MaDealDartStatus } from "./ma-deal-dart-status";
import { MaDealReadiness } from "./ma-deal-readiness";
import { MaDealMissingInfo } from "./ma-deal-missing-info";
import type { MaDealType, MaDealStatus } from "@prisma/client";
import type {
  QoESummaryView,
  DartStatusView,
  FinancialQualityView,
  ReadinessRow,
  MissingInfoItem,
  computeLboEntryEbitda,
} from "@/lib/pe/ma-deal-dashboard";

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
  readiness: ReadinessRow[];
  missingInformation: MissingInfoItem[];
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
  return (
    <div className="space-y-4">
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
            <p className="font-medium">{dashboard.financialQuality.latestPeriodLabel ?? "등록된 재무 데이터 없음"}</p>
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

      <MaDealIcSnapshot
        lboEntryEbitda={dashboard.lboEntryEbitda}
        onOpenLbo={() => onNavigateTab("lbo")}
      />

      <MaDealFinancialSummary quality={dashboard.financialQuality} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MaDealQoeSummary qoe={dashboard.qoeSummary} onOpenFinancials={() => onNavigateTab("financials")} />
        <MaDealDartStatus dart={dashboard.dartStatus} onOpenDart={() => onNavigateTab("dart")} />
      </div>

      <MaDealReadiness rows={dashboard.readiness} />

      <MaDealMissingInfo items={dashboard.missingInformation} />
    </div>
  );
}
