import { buildPEICDecision } from "@/lib/pe/pe-ic-decision";
import { MaDealIcDecisionSummary } from "./ma-deal-ic-decision-summary";
import { MaDealThesis } from "./ma-deal-thesis";
import { MaDealDrivers } from "./ma-deal-drivers";
import { MaDealThesisBreakers } from "./ma-deal-thesis-breakers";
import { MaDealReadiness } from "./ma-deal-readiness";
import { MaDealFinancialSummary } from "./ma-deal-financial-summary";
import { MaDealQoeSummary } from "./ma-deal-qoe-summary";
import { MaDealIcSnapshot } from "./ma-deal-ic-snapshot";
import { MaDealDdFindings } from "./ma-deal-dd-findings";
import { MaDealMissingInfo } from "./ma-deal-missing-info";
import { MaDealIcQuestions } from "./ma-deal-ic-questions";
import { MaDealIcMemoExport } from "./ma-deal-ic-memo-export";
import { AlertTriangle } from "lucide-react";
import type { MaDealType, MaDealStatus } from "@prisma/client";
import type { MaDealDashboardData } from "./ma-deal-overview";
import type { PEDDCase } from "@/lib/pe/dd-types";

interface MaDeal {
  id: string;
  companyName: string;
  dealType: MaDealType;
  status: MaDealStatus;
}

/**
 * PE/M&A IC 의사결정 워크스페이스(PR #108) — "IC 의사결정" 탭.
 *
 * PR #107의 "IC 검토" 탭(ma-deal-ic-workspace.tsx, 건드리지 않음)이
 * "IC가 무엇을 알고 있는가"를 보여주는 소비형 요약이었다면, 이 탭은
 * 거기서 한 걸음 더 나아가 "IC가 지금 판단을 내려도 되는가"를 thesis/
 * driver/breaker/우선순위 질문까지 포함한 하나의 결정 패키지
 * (`buildPEICDecision()`, pe-ic-decision.ts, 새 계산 없음)로 조립해 보여주고,
 * 그 패키지를 그대로 IC 메모(DOCX/PPTX)로 내려받을 수 있게 한다.
 *
 * `buildPEICDecision()`이 서버 export route와 정확히 같은 함수이므로
 * (둘 다 `buildMaDealDashboard()`의 출력을 입력으로 받음) 화면과 메모가
 * 다른 결론을 낼 수 없다.
 */
export function MaDealIcDecision({
  maDeal,
  dashboard,
  ddCase,
  onNavigateTab,
}: {
  maDeal: MaDeal;
  dashboard: MaDealDashboardData;
  ddCase: PEDDCase | undefined;
  onNavigateTab: (tab: string) => void;
}) {
  const decision = buildPEICDecision({
    dealId: maDeal.id,
    readiness: dashboard.decisionReadiness,
    financialQuality: dashboard.financialQuality,
    qoeSummary: dashboard.qoeSummary,
    lboEntryEbitda: dashboard.lboEntryEbitda,
    dartStatus: dashboard.dartStatus,
    ddCase,
    // LBO 가정은 세션 로컬 state일 뿐 서버에 없다(ic-decision-types.ts 주석 참고) —
    // 지어내지 않고 항상 undefined로 둔다.
    lboAssumptionKeysProvided: undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base font-semibold text-gray-900">IC 의사결정</h2>
        <MaDealIcMemoExport maDealId={maDeal.id} />
      </div>

      <MaDealIcDecisionSummary processState={decision.processState} reasons={decision.processStateReasons} />

      <MaDealThesis items={decision.thesis} />
      <MaDealDrivers drivers={decision.drivers} />
      <MaDealThesisBreakers breakers={decision.breakers} />

      <MaDealFinancialSummary quality={dashboard.financialQuality} />
      <MaDealQoeSummary qoe={dashboard.qoeSummary} onOpenFinancials={() => onNavigateTab("financials")} />
      {decision.lbo.entryEbitdaStatus === "ok" && decision.lbo.upstreamBlocked && (
        <div className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>상위 재무 데이터에 모순(BLOCKED)이 있어 아래 Entry EBITDA 값을 지금은 신뢰할 수 없습니다 — 재무 데이터 충돌을 먼저 해소하세요.</span>
        </div>
      )}
      <MaDealIcSnapshot lboEntryEbitda={dashboard.lboEntryEbitda} onOpenLbo={() => onNavigateTab("lbo")} />

      <MaDealDdFindings findings={decision.dd.findings} />

      <MaDealReadiness readiness={decision.readiness} />
      <MaDealMissingInfo readiness={decision.readiness} />
      <MaDealIcQuestions questions={decision.questions} />
    </div>
  );
}
