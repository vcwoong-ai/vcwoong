"use client";

import { useState, type RefObject } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DocumentSourceText } from "./document-source-text";
import { PeDocumentParseRetry } from "./pe-document-parse-retry";
import { Badge } from "@/components/ui/badge";
import { MA_DOCUMENT_TYPE_LABEL, PE_EVIDENCE_REQUEST_STATUS_LABEL } from "@/lib/pe/ma-deal-labels";
import type { DataRoomDocumentView } from "@/lib/pe/pe-data-room-view-model";
import type { PEEvidenceRequestView } from "@/lib/pe/pe-ic-review-types";
import type { MaDocumentType } from "@prisma/client";

/**
 * PE Data Room 문서 상세(PR #106, PR #109에서 근거 요청 연결 표시 추가) —
 * 기존 파싱 텍스트를 별도 인가 API로 읽고, 편집 권한자는 저장 원본 재추출을 요청한다.
 *
 * "이 자료로 해결 가능한 이슈" 절은 파일명 추론을 하지 않는다(§Step12
 * 명시 요구) — `linkedDocumentId === document.id`로 **실제로 연결된**
 * `PEEvidenceRequest`만 보여준다. 아직 아무것도 연결되지 않은 문서는
 * 빈 목록을 그대로 보여준다(추측해서 채우지 않음).
 */
export function MaDealDocumentDetailDialog({
  dealId,
  returnFocusRef,
  document,
  linkedEvidenceRequests,
  onOpenChange,
  canEdit = false,
}: {
  dealId: string;
  returnFocusRef: RefObject<HTMLButtonElement>;
  document: DataRoomDocumentView | null;
  linkedEvidenceRequests: PEEvidenceRequestView[];
  onOpenChange: (open: boolean) => void;
  canEdit?: boolean;
}) {
  const [textRevision, setTextRevision] = useState(0);
  return (
    <Dialog open={document !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]" onCloseAutoFocus={(event) => { event.preventDefault(); returnFocusRef.current?.focus(); }}>
        {document && (
          <>
            <DialogHeader>
              <DialogTitle className="break-words pr-5">{document.name}</DialogTitle>
              <DialogDescription>문서 내용과 실제로 연결된 근거·요청을 확인합니다.</DialogDescription>
            </DialogHeader>
            <div className="min-w-0 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400">유형</p>
                  <p className="font-medium">{MA_DOCUMENT_TYPE_LABEL[document.type as MaDocumentType] ?? document.type}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">파일 형식</p>
                  <p className="break-words font-medium">{document.mimeType}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">업로드일</p>
                  <p className="font-medium">{new Date(document.createdAt).toLocaleDateString()}</p>
                </div>
              </div>

              <PeDocumentParseRetry key={`${dealId}-${document.id}`} dealId={dealId} document={document} canEdit={canEdit} onRecovered={() => setTextRevision(value => value + 1)} />
              <DocumentSourceText key={`${dealId}-${document.id}-${textRevision}`} dealId={dealId} documentId={document.id} />

              <div>
                <p className="text-xs text-gray-400 mb-2">연결된 근거(Evidence)</p>
                {document.linkedEvidence.length === 0 ? (
                  <p className="text-gray-400 text-sm">연결된 근거가 없습니다.</p>
                ) : (
                  <ul className="space-y-2">
                    {document.linkedEvidence.map((ev) => (
                      <li key={ev.id} className="border rounded-md px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{ev.sourceName}</span>
                          {ev.confidence !== null && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              신뢰도 {Math.round(ev.confidence * 100)}%
                            </Badge>
                          )}
                        </div>
                        {ev.sourceLocation && <p className="text-xs text-gray-500 mt-0.5">{ev.sourceLocation}</p>}
                        {ev.excerpt && <p className="text-xs text-gray-500 mt-1 italic">&ldquo;{ev.excerpt}&rdquo;</p>}
                        {ev.linkedFinding ? (
                          <p className="text-xs text-gray-600 mt-1">
                            연결된 DD finding: <span className="font-medium">{ev.linkedFinding.title}</span>
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500 mt-1">연결된 DD finding 없음</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="text-xs text-gray-400 mb-2">이 자료로 해결 가능한 이슈</p>
                {linkedEvidenceRequests.length === 0 ? (
                  <p className="text-gray-400 text-sm">이 문서에 명시적으로 연결된 근거 요청이 없습니다.</p>
                ) : (
                  <ul className="space-y-2">
                    {linkedEvidenceRequests.map((req) => (
                      <li key={req.id} className="border rounded-md px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{req.title}</span>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {PE_EVIDENCE_REQUEST_STATUS_LABEL[req.status]}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{req.reason}</p>
                      </li>
                    ))}
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
