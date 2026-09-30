"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  PE_IC_REVIEW_ITEM_TYPE_LABEL,
  PE_IC_REVIEW_ITEM_STATUS_LABEL,
  PE_EVIDENCE_REQUEST_STATUS_LABEL,
  PE_IC_QUESTION_PRIORITY_LABEL,
} from "@/lib/pe/ma-deal-labels";
import { PE_EVIDENCE_REQUEST_STATUS_TRANSITIONS } from "@/lib/pe/pe-ic-review-types";
import type { PEICReviewItem, PEEvidenceRequestStatus } from "@/lib/pe/pe-ic-review-types";
import type { DataRoomDocumentRow } from "@/lib/pe/pe-data-room-view-model";
import { CreatePEEvidenceRequestDialog } from "./create-pe-evidence-request-dialog";

const STATUS_VARIANT: Record<string, StatusTone> = {
  OPEN: "neutral",
  IN_REVIEW: "info",
  WAITING_FOR_EVIDENCE: "info",
  EVIDENCE_RECEIVED: "info",
  RESOLVED: "positive",
  REJECTED: "critical",
  REQUESTED: "neutral",
  RECEIVED: "info",
  UNDER_REVIEW: "info",
  ACCEPTED: "positive",
};

/**
 * Review Item 상세 패널(PR #109, §Step10). 이 다이얼로그는 판단을 내리지
 * 않는다 — `item.status`는 이미 `evaluatePEICReviewItemStatus()`(순수
 * 함수)가 계산해 넘긴 값을 그대로 보여줄 뿐이고, 여기서 하는 두 액션
 * (문서 연결 / 상태 변경)은 둘 다 evidence-requests API가 서버에서 다시
 * 검증한다(전이 규칙 위반, cross-deal 문서 등은 서버가 막는다) — 이
 * 컴포넌트는 실패 시 에러 메시지를 그대로 보여줄 뿐 자체적으로 상태를
 * 낙관적으로 바꾸지 않는다(항상 onChanged로 서버 값을 다시 받아온다).
 */
export function MaDealIcReviewItemDetail({
  maDealId,
  item,
  documents,
  canEdit,
  onOpenChange,
  onChanged,
}: {
  maDealId: string;
  item: PEICReviewItem | null;
  documents: DataRoomDocumentRow[];
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [linkSelection, setLinkSelection] = useState<Record<string, string>>({});

  const updateStatus = async (requestId: string, status: PEEvidenceRequestStatus) => {
    setBusyRequestId(requestId);
    try {
      const res = await fetch(`/api/ma-deals/${maDealId}/evidence-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_status", status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "상태 변경 실패");
      }
      await onChanged();
    } catch (e) {
      toast.error("상태 변경 실패", { description: e instanceof Error ? e.message : "다시 시도해 주세요" });
    } finally {
      setBusyRequestId(null);
    }
  };

  const linkDocument = async (requestId: string) => {
    const documentId = linkSelection[requestId];
    if (!documentId) return;
    setBusyRequestId(requestId);
    try {
      const res = await fetch(`/api/ma-deals/${maDealId}/evidence-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link_document", documentId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "문서 연결 실패");
      }
      toast.success("문서를 근거로 연결했습니다");
      await onChanged();
    } catch (e) {
      toast.error("문서 연결 실패", { description: e instanceof Error ? e.message : "다시 시도해 주세요" });
    } finally {
      setBusyRequestId(null);
    }
  };

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        {item && (
          <>
            <DialogHeader>
              <DialogTitle className="break-words">{item.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-1.5 flex-wrap">
                <StatusBadge tone={STATUS_VARIANT[item.status] ?? "neutral"}>
                  {PE_IC_REVIEW_ITEM_STATUS_LABEL[item.status]}
                </StatusBadge>
                <Badge variant="outline" className="text-xs">
                  {PE_IC_REVIEW_ITEM_TYPE_LABEL[item.type]}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {PE_IC_QUESTION_PRIORITY_LABEL[item.priority]}
                </Badge>
              </div>

              <div>
                <p className="text-xs text-gray-400 mb-0.5">질문</p>
                <p>{item.question}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">왜 중요한가</p>
                <p className="text-gray-600">{item.reason}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">필요한 근거</p>
                <p className="text-gray-600">{item.requiredEvidence}</p>
              </div>

              {item.status === "RESOLVED" && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                  이 항목의 근원 조건이 최신 재계산에서 더 이상 나타나지 않습니다 — 해소된 것으로
                  확인됩니다. 이 상태는 재계산으로만 바뀝니다(수동으로 되돌릴 수 없음).
                </p>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">근거 요청 이력 ({item.evidenceRequests.length}건)</p>
                  {canEdit && item.sourceQuestion && (
                    <CreatePEEvidenceRequestDialog
                      maDealId={maDealId}
                      question={item.sourceQuestion}
                      onCreated={onChanged}
                    />
                  )}
                </div>

                {item.evidenceRequests.length === 0 ? (
                  <p className="text-xs text-gray-400">아직 만들어진 근거 요청이 없습니다.</p>
                ) : (
                  <ul className="space-y-2">
                    {[...item.evidenceRequests]
                      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                      .map((req) => {
                        const nextStatuses = PE_EVIDENCE_REQUEST_STATUS_TRANSITIONS[req.status];
                        const busy = busyRequestId === req.id;
                        return (
                          <li key={req.id} className="border rounded-md px-3 py-2 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium truncate">{req.title}</span>
                              <StatusBadge tone={STATUS_VARIANT[req.status] ?? "neutral"} className="shrink-0">
                                {PE_EVIDENCE_REQUEST_STATUS_LABEL[req.status]}
                              </StatusBadge>
                            </div>
                            {req.requestedDocument && (
                              <p className="text-xs text-gray-500">요청 자료: {req.requestedDocument}</p>
                            )}
                            {req.requestedFact && (
                              <p className="text-xs text-gray-500">확인 필요: {req.requestedFact}</p>
                            )}
                            <p className="text-xs text-gray-500">{req.reason}</p>
                            {req.linkedDocumentId ? (
                              <p className="text-xs text-gray-600">
                                연결된 문서: <span className="font-medium">{req.linkedDocumentName ?? req.linkedDocumentId}</span>
                              </p>
                            ) : (
                              <p className="text-xs text-slate-500">아직 연결된 문서 없음</p>
                            )}

                            {canEdit && req.status !== "ACCEPTED" && req.status !== "REJECTED" && (
                              <div className="flex items-center gap-2 pt-1">
                                <Select
                                  value={linkSelection[req.id] ?? ""}
                                  onValueChange={(val) => setLinkSelection((s) => ({ ...s, [req.id]: val }))}
                                >
                                  <SelectTrigger className="h-7 text-xs flex-1">
                                    <SelectValue placeholder="연결할 문서 선택" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {documents.map((doc) => (
                                      <SelectItem key={doc.id} value={doc.id} className="text-xs">
                                        {doc.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs shrink-0"
                                  disabled={busy || !linkSelection[req.id]}
                                  onClick={() => linkDocument(req.id)}
                                >
                                  연결
                                </Button>
                              </div>
                            )}

                            {canEdit && nextStatuses.length > 0 && (
                              <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                                {nextStatuses.map((next) => (
                                  <Button
                                    key={next}
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    disabled={busy || (next !== "REJECTED" && !req.linkedDocumentId && (next === "UNDER_REVIEW" || next === "ACCEPTED"))}
                                    onClick={() => updateStatus(req.id, next)}
                                  >
                                    {PE_EVIDENCE_REQUEST_STATUS_LABEL[next]}로 변경
                                  </Button>
                                ))}
                              </div>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
