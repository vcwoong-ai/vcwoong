"use client";

import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText } from "lucide-react";
import { MA_DOCUMENT_TYPE_LABEL } from "@/lib/pe/ma-deal-labels";
import { buildPEDataRoomViewModel, type DataRoomDocumentView } from "@/lib/pe/pe-data-room-view-model";
import type {
  DataRoomDocumentRow,
  DataRoomEvidenceRow,
  DataRoomFindingRow,
} from "@/lib/pe/pe-data-room-view-model";
import { MaDealDocumentDetailDialog } from "./ma-deal-document-detail-dialog";
import type { PEEvidenceRequestView } from "@/lib/pe/pe-ic-review-types";
import type { MaDocumentType } from "@prisma/client";

function formatBytes(size: number): string {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * PE Data Room(PR #106) — READ-ONLY. `/api/ma-deals/[id]/documents`가 내려준
 * MADocument/PEEvidence/PEDDFinding row를 buildPEDataRoomViewModel()(순수
 * 조립, 새 데이터 생성 없음)로 옮겨 담아 보여줄 뿐이다. 문서 업로드/근거
 * 생성/finding 생성 UI는 이번 PR 범위 밖이다.
 */
export function MaDealDataRoom({
  dealId,
  documents,
  evidence,
  findings,
  evidenceRequests,
  loading,
  canEdit = false,
}: {
  dealId: string;
  documents: DataRoomDocumentRow[];
  evidence: DataRoomEvidenceRow[];
  findings: DataRoomFindingRow[];
  evidenceRequests: PEEvidenceRequestView[];
  loading: boolean;
  canEdit?: boolean;
}) {
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [selected, setSelected] = useState<DataRoomDocumentView | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  const viewModel = useMemo(() => buildPEDataRoomViewModel(documents, evidence, findings), [documents, evidence, findings]);

  const availableTypes = useMemo(
    () => Array.from(new Set(documents.map((d) => d.type))),
    [documents]
  );

  const filteredDocuments = useMemo(
    () => (typeFilter === "ALL" ? viewModel.documents : viewModel.documents.filter((d) => d.type === typeFilter)),
    [viewModel.documents, typeFilter]
  );

  if (loading) {
    return <p className="text-center text-gray-400 py-12">불러오는 중...</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data Room</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-6 text-sm">
          <div>
            <p className="text-xs text-gray-400">문서</p>
            <p className="font-medium">{viewModel.summary.documentCount}건</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">근거 연결된 문서</p>
            <p className="font-medium">{viewModel.summary.evidenceLinkedDocumentCount}건</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">연결된 근거</p>
            <p className="font-medium">{viewModel.summary.totalEvidenceCount}건</p>
          </div>
        </CardContent>
      </Card>

      {viewModel.documents.length === 0 ? (
        <p className="text-center text-gray-400 py-12">아직 업로드된 문서가 없습니다.</p>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">문서 목록</CardTitle>
            {availableTypes.length > 1 && (
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">전체 유형</SelectItem>
                  {availableTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {MA_DOCUMENT_TYPE_LABEL[t as MaDocumentType] ?? t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-400">
                    <th className="px-4 py-2 font-medium">문서명</th>
                    <th className="px-4 py-2 font-medium">유형</th>
                    <th className="px-4 py-2 font-medium">크기</th>
                    <th className="px-4 py-2 font-medium">업로드일</th>
                    <th className="px-4 py-2 font-medium">연결된 근거</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocuments.map((doc) => (
                    <tr
                      key={doc.id}
                      className="border-b last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <button type="button" onClick={(event) => { opener.current = event.currentTarget; setSelected(doc); }} className="text-left font-medium text-primary underline-offset-2 hover:underline focus-visible:underline">{doc.name}</button>
                          <a href={`/api/ma-deals/${dealId}/documents/${doc.id}/download`} className="shrink-0 text-xs text-primary underline" aria-label={`${doc.name} 원본 다운로드`}>원본 다운로드</a>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="text-xs">
                          {MA_DOCUMENT_TYPE_LABEL[doc.type as MaDocumentType] ?? doc.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{formatBytes(doc.size)}</td>
                      <td className="px-4 py-2.5 text-gray-500">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5">
                        {doc.linkedEvidence.length > 0 ? (
                          <Badge variant="secondary" className="text-xs">
                            {doc.linkedEvidence.length}건
                          </Badge>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <MaDealDocumentDetailDialog
        dealId={dealId}
        canEdit={canEdit}
        returnFocusRef={opener}
        document={selected}
        linkedEvidenceRequests={selected ? evidenceRequests.filter((r) => r.linkedDocumentId === selected.id) : []}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}
