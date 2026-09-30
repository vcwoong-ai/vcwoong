"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { buildPEICDecision } from "@/lib/pe/pe-ic-decision";
import { buildPEICReviewWorkspace } from "@/lib/pe/pe-ic-review";
import type { PEICReviewItem } from "@/lib/pe/pe-ic-review-types";
import {
  PE_IC_REVIEW_STATE_LABEL,
  PE_IC_REVIEW_ITEM_TYPE_LABEL,
  PE_IC_REVIEW_ITEM_STATUS_LABEL,
  PE_EVIDENCE_REQUEST_STATUS_LABEL,
  PE_IC_QUESTION_PRIORITY_LABEL,
} from "@/lib/pe/ma-deal-labels";
import { MaDealIcReviewItemDetail } from "./ma-deal-ic-review-item-detail";
import type { MaDealDashboardData } from "./ma-deal-overview";
import type { PEDDCase } from "@/lib/pe/dd-types";
import type { PEEvidenceRequestView, PEEvidenceRequestStatus } from "@/lib/pe/pe-ic-review-types";
import type { DataRoomDocumentRow } from "@/lib/pe/pe-data-room-view-model";
import type { MaDealType, MaDealStatus } from "@prisma/client";

interface MaDeal {
  id: string;
  companyName: string;
  dealType: MaDealType;
  status: MaDealStatus;
}

const STATE_VARIANT: Record<string, StatusTone> = {
  READY_FOR_IC: "positive",
  PARTIALLY_READY: "info",
  NOT_READY: "neutral",
  BLOCKED: "critical",
};

const ITEM_STATUS_VARIANT: Record<string, StatusTone> = {
  OPEN: "neutral",
  IN_REVIEW: "info",
  WAITING_FOR_EVIDENCE: "info",
  EVIDENCE_RECEIVED: "info",
  RESOLVED: "positive",
  REJECTED: "critical",
};

const REQUEST_STATUS_ORDER: PEEvidenceRequestStatus[] = ["REQUESTED", "RECEIVED", "UNDER_REVIEW", "ACCEPTED", "REJECTED"];

function ReviewItemCard({ item, onSelect }: { item: PEICReviewItem; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left border rounded-md px-3 py-2 hover:bg-gray-50 space-y-1"
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <StatusBadge tone={ITEM_STATUS_VARIANT[item.status] ?? "neutral"}>
          {PE_IC_REVIEW_ITEM_STATUS_LABEL[item.status]}
        </StatusBadge>
        <Badge variant="outline" className="text-xs">
          {PE_IC_REVIEW_ITEM_TYPE_LABEL[item.type]}
        </Badge>
        {item.evidenceRequests.length > 0 && (
          <span className="text-xs text-gray-400">요청 {item.evidenceRequests.length}건</span>
        )}
      </div>
      <p className="text-sm font-medium">{item.title}</p>
    </button>
  );
}

/**
 * PE IC 검토 Workflow 워크스페이스(PR #109, §Step9). "IC 의사결정" 탭이
 * 지금 상태의 스냅샷이라면, 이 탭은 그 스냅샷의 각 항목을 실제로
 * 해소해나가는 작업 공간이다. `buildPEICDecision()`으로 현재 questions/
 * processState를 얻고, `buildPEICReviewWorkspace()`(pe-ic-review.ts, 순수
 * 조립)로 영속된 `PEEvidenceRequest`와 결합해 review item을 매번 다시
 * 계산한다 — review item 자체는 어디에도 저장하지 않는다(pe-ic-review-
 * types.ts 파일 상단 주석의 핵심 원칙).
 */
export function MaDealIcReviewWorkspace({
  maDeal,
  dashboard,
  ddCase,
  documents,
  evidenceRequests,
  evidenceRequestsLoading,
  canEdit,
  onRefresh,
}: {
  maDeal: MaDeal;
  dashboard: MaDealDashboardData;
  ddCase: PEDDCase | undefined;
  documents: DataRoomDocumentRow[];
  evidenceRequests: PEEvidenceRequestView[];
  evidenceRequestsLoading: boolean;
  canEdit: boolean;
  onRefresh: () => void | Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const decision = useMemo(
    () =>
      buildPEICDecision({
        dealId: maDeal.id,
        readiness: dashboard.decisionReadiness,
        financialQuality: dashboard.financialQuality,
        qoeSummary: dashboard.qoeSummary,
        lboEntryEbitda: dashboard.lboEntryEbitda,
        dartStatus: dashboard.dartStatus,
        ddCase,
        lboAssumptionKeysProvided: undefined,
      }),
    [maDeal.id, dashboard, ddCase]
  );

  const workspace = useMemo(
    () => buildPEICReviewWorkspace(maDeal.id, decision.processState, decision.questions, evidenceRequests),
    [maDeal.id, decision.processState, decision.questions, evidenceRequests]
  );

  const openByPriority = useMemo(() => {
    const grouped: Record<"P0" | "P1" | "P2", PEICReviewItem[]> = { P0: [], P1: [], P2: [] };
    for (const item of workspace.openItems) grouped[item.priority].push(item);
    return grouped;
  }, [workspace.openItems]);

  const requestsByStatus = useMemo(() => {
    const grouped = new Map<PEEvidenceRequestStatus, PEEvidenceRequestView[]>();
    for (const status of REQUEST_STATUS_ORDER) grouped.set(status, []);
    for (const req of workspace.evidenceRequests) grouped.get(req.status)?.push(req);
    return grouped;
  }, [workspace.evidenceRequests]);

  const selectedItem =
    workspace.openItems.find((i) => i.id === selectedId) ?? workspace.resolvedItems.find((i) => i.id === selectedId) ?? null;

  if (evidenceRequestsLoading) {
    return <p className="text-center text-gray-400 py-12">불러오는 중...</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">검토 진행 상태</CardTitle>
          <StatusBadge tone={STATE_VARIANT[workspace.overallState] ?? "neutral"}>
            {PE_IC_REVIEW_STATE_LABEL[workspace.overallState]}
          </StatusBadge>
        </CardHeader>
        <CardContent className="flex items-center gap-6 text-sm">
          <div>
            <p className="text-xs text-gray-400">미해결 항목</p>
            <p className="font-medium">{workspace.openItems.length}건</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">근거 요청</p>
            <p className="font-medium">{workspace.evidenceRequests.length}건</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">최근 해소됨</p>
            <p className="font-medium">{workspace.resolvedItems.length}건</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">미해결 항목</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {workspace.openItems.length === 0 ? (
            <p className="text-sm text-gray-400">지금 미해결 항목이 없습니다.</p>
          ) : (
            (["P0", "P1", "P2"] as const).map(
              (priority) =>
                openByPriority[priority].length > 0 && (
                  <div key={priority} className="space-y-2">
                    <p className="text-xs font-medium text-gray-500">
                      {PE_IC_QUESTION_PRIORITY_LABEL[priority]} ({openByPriority[priority].length}건)
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {openByPriority[priority].map((item) => (
                        <ReviewItemCard key={item.id} item={item} onSelect={() => setSelectedId(item.id)} />
                      ))}
                    </div>
                  </div>
                )
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">근거 요청 현황</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {workspace.evidenceRequests.length === 0 ? (
            <p className="text-sm text-gray-400">아직 만들어진 근거 요청이 없습니다. IC 질문에서 &ldquo;자료 요청&rdquo;을 눌러 시작하세요.</p>
          ) : (
            REQUEST_STATUS_ORDER.map(
              (status) =>
                (requestsByStatus.get(status)?.length ?? 0) > 0 && (
                  <div key={status} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                    <span>{PE_EVIDENCE_REQUEST_STATUS_LABEL[status]}</span>
                    <Badge variant="outline">{requestsByStatus.get(status)?.length}건</Badge>
                  </div>
                )
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">최근 해소된 항목</CardTitle>
          <p className="text-xs text-gray-500">
            근거 요청 기록이 있었고 지금은 근원 조건이 재계산에서 사라진 항목입니다. 요청 기록 없이 저절로
            해소된 항목은 추적할 근거가 없어 여기 나타나지 않습니다.
          </p>
        </CardHeader>
        <CardContent>
          {workspace.resolvedItems.length === 0 ? (
            <p className="text-sm text-gray-400">아직 해소된 항목이 없습니다.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {workspace.resolvedItems.map((item) => (
                <ReviewItemCard key={item.id} item={item} onSelect={() => setSelectedId(item.id)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <MaDealIcReviewItemDetail
        maDealId={maDeal.id}
        item={selectedItem}
        documents={documents}
        canEdit={canEdit}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onChanged={onRefresh}
      />
    </div>
  );
}
