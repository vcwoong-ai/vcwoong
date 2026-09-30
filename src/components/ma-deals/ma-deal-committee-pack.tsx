"use client";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { buildPECommitteePackContent } from "@/lib/pe/pe-committee-pack";
import { MaDealThesis } from "./ma-deal-thesis";
import { MaDealDrivers } from "./ma-deal-drivers";
import { MaDealThesisBreakers } from "./ma-deal-thesis-breakers";
import { MaDealFinancialSummary } from "./ma-deal-financial-summary";
import { MaDealQoeSummary } from "./ma-deal-qoe-summary";
import { MaDealIcSnapshot } from "./ma-deal-ic-snapshot";
import { MaDealDdFindings } from "./ma-deal-dd-findings";
import { MaDealIcQuestions } from "./ma-deal-ic-questions";
import { MaDealCommitteePackExport } from "./ma-deal-committee-pack-export";
import { MaDealCommitteePackReviewPanel } from "./ma-deal-committee-pack-review-panel";
import { MaDealReviewHistory } from "./ma-deal-review-history";
import { PE_IC_REVIEW_STATE_LABEL, MA_DEAL_TYPE_LABEL, MA_DEAL_STATUS_LABEL } from "@/lib/pe/ma-deal-labels";
import type { MaDealDashboardData } from "./ma-deal-overview";
import type { PEDDCase } from "@/lib/pe/dd-types";
import type { PEEvidenceRequestView } from "@/lib/pe/pe-ic-review-types";
import type { MaDealType, MaDealStatus } from "@prisma/client";

interface MaDeal {
  id: string;
  companyName: string;
  name: string;
  dealType: MaDealType;
  status: MaDealStatus;
}

const REVIEW_STATE_VARIANT: Record<string, StatusTone> = {
  READY_FOR_IC: "positive",
  PARTIALLY_READY: "info",
  NOT_READY: "neutral",
  BLOCKED: "critical",
};

/**
 * PE IC Committee Pack(PR #110) — "위원회 자료" 탭.
 *
 * 이 탭은 새로운 진실 소스가 아니다(§3 최우선 원칙) — `buildPECommitteePackContent()`가
 * 내부에서 호출하는 `buildPEICDecision()`/`buildPEICReviewWorkspace()`는
 * "IC 의사결정"/"검토 Workflow" 탭이 쓰는 것과 정확히 같은 함수다. thesis/
 * drivers/breakers/financial/QoE/LBO/DD/IC 질문 섹션은 그 탭들이 이미 쓰는
 * 컴포넌트(MaDealThesis 등)를 그대로 재사용한다 — 화면을 두 번 만들지
 * 않는다. 이 탭이 추가하는 것은 (1) 위원회 심의용으로 압축된 레이아웃과
 * (2) 리뷰 서명/코멘트 패널, (3) 인쇄/DOCX/PPTX 내보내기뿐이다.
 *
 * `buildPECommitteePackContent()`(fingerprint 없음, crypto 없음)만 쓴다 —
 * fingerprint가 필요한 `buildPECommitteePack()`(pe-committee-pack-
 * fingerprint.ts)은 여기서 절대 import하지 않는다(그 파일을 client
 * component에서 import하면 Node crypto가 그대로 브라우저 번들에 실린다).
 * 리뷰 패널이 보여주는 재검토 필요 여부는 서버(GET /ic-review-signoff)가
 * 계산한 값을 그대로 받아 쓴다(§Step18 10).
 */
export function MaDealCommitteePack({
  maDeal,
  dashboard,
  ddCase,
  evidenceRequests,
  evidenceRequestsLoading,
  canEdit,
  currentUserId,
  onNavigateTab,
  onEvidenceRequestCreated,
}: {
  maDeal: MaDeal;
  dashboard: MaDealDashboardData;
  ddCase: PEDDCase | undefined;
  evidenceRequests: PEEvidenceRequestView[];
  evidenceRequestsLoading: boolean;
  canEdit: boolean;
  currentUserId: string;
  onNavigateTab: (tab: string) => void;
  onEvidenceRequestCreated: () => void | Promise<void>;
}) {
  const pack = useMemo(
    () =>
      buildPECommitteePackContent({
        dealId: maDeal.id,
        maDeal: { companyName: maDeal.companyName, name: maDeal.name, dealType: maDeal.dealType, status: maDeal.status },
        readiness: dashboard.decisionReadiness,
        financialQuality: dashboard.financialQuality,
        qoeSummary: dashboard.qoeSummary,
        lboEntryEbitda: dashboard.lboEntryEbitda,
        dartStatus: dashboard.dartStatus,
        ddCase,
        evidenceRequests,
      }),
    [maDeal, dashboard, ddCase, evidenceRequests]
  );

  const { decision, review } = pack;

  // PR #111 — 리뷰 패널에서 서명/코멘트를 남기면 그 즉시 검토 이력 카드도
  // 최신 스냅샷/감사 이벤트를 다시 불러온다(두 컴포넌트가 서로 다른
  // API를 각자 조회하므로, 신호를 안 주면 새로고침 전까진 예전 화면
  // 그대로 남아 있게 된다 — 감사 이력이 실시간처럼 보이는 게 중요함).
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-gray-900">PE IC Committee Pack</h2>
          <p className="text-xs text-gray-500">
            {pack.deal.companyName} · {MA_DEAL_TYPE_LABEL[maDeal.dealType]} · {MA_DEAL_STATUS_LABEL[maDeal.status]}
          </p>
        </div>
        <MaDealCommitteePackExport maDealId={maDeal.id} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Decision Readiness</CardTitle>
          <StatusBadge tone={REVIEW_STATE_VARIANT[decision.processState] ?? "neutral"}>
            {PE_IC_REVIEW_STATE_LABEL[decision.processState]}
          </StatusBadge>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-gray-700">{pack.currentReviewStateLabel}</p>
          {decision.processState === "BLOCKED" && (
            <div className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{decision.processStateReasons[0]}</span>
            </div>
          )}
          <div className="flex items-center gap-4 text-xs text-gray-500 pt-1 flex-wrap">
            <button type="button" className="underline hover:text-gray-700" onClick={() => onNavigateTab("ic-review-workflow")}>
              미해결 항목 {review.openItems.length}건 보기
            </button>
            <button type="button" className="underline hover:text-gray-700" onClick={() => onNavigateTab("data-room")}>
              근거 요청 {review.evidenceRequests.length}건 보기
            </button>
          </div>
        </CardContent>
      </Card>

      <MaDealThesis items={decision.thesis} />
      <MaDealDrivers drivers={decision.drivers} />
      <MaDealThesisBreakers breakers={decision.breakers} />
      <MaDealFinancialSummary quality={dashboard.financialQuality} conflictCount={dashboard.decisionReadiness.factConflicts.length} />
      <MaDealQoeSummary qoe={dashboard.qoeSummary} onOpenFinancials={() => onNavigateTab("financials")} />
      <MaDealIcSnapshot lboEntryEbitda={dashboard.lboEntryEbitda} onOpenLbo={() => onNavigateTab("lbo")} />
      <MaDealDdFindings findings={decision.dd.findings} />
      <MaDealIcQuestions
        maDealId={maDeal.id}
        questions={decision.questions}
        canEdit={canEdit}
        onRequestCreated={onEvidenceRequestCreated}
      />

      {evidenceRequestsLoading ? (
        <p className="text-center text-gray-400 py-8">검토 현황을 불러오는 중...</p>
      ) : (
        <>
          <MaDealCommitteePackReviewPanel
            maDealId={maDeal.id}
            currentUserId={currentUserId}
            canEdit={canEdit}
            onReviewChanged={() => setHistoryRefreshKey((k) => k + 1)}
          />
          <MaDealReviewHistory maDealId={maDeal.id} refreshKey={historyRefreshKey} />
        </>
      )}
    </div>
  );
}
