/**
 * PE Data Room — 순수 뷰 모델(PR #106).
 *
 * `/api/ma-deals/[id]/documents`가 조회해 온 MADocument/PEEvidence/
 * PEDDFinding row를 화면이 보기 좋은 모양으로 묶기만 한다 — 새 evidence를
 * 만들거나 finding을 추론하지 않는다(순수 조립, DB 호출 없음).
 *
 * Evidence/Finding 생성·수정 UI는 이번 PR 범위 밖이다 — 이 파일은 READ-ONLY로
 * PR #105의 persistence(pe-dd-repository.ts)가 이미 반환한 값을 그대로
 * 옮겨 담는다.
 */

export interface DataRoomDocumentRow {
  id: string;
  name: string;
  type: string;
  size: number;
  mimeType: string;
  createdAt: string;
  parseStatus?: "complete" | "unavailable" | "processing" | "unknown";
  parseRetryAllowed?: boolean;
  parseAttempts?: number;
}

export interface DataRoomEvidenceRow {
  id: string;
  documentId: string | null;
  findingId: string | null;
  sourceName: string;
  sourceLocation: string | null;
  excerpt: string | null;
  confidence: number | null;
}

export interface DataRoomFindingRow {
  id: string;
  title: string;
  category: string;
  severity: string;
  status: string;
}

export interface LinkedEvidenceView {
  id: string;
  sourceName: string;
  sourceLocation: string | null;
  excerpt: string | null;
  confidence: number | null;
  linkedFinding?: DataRoomFindingRow;
}

export interface DataRoomDocumentView {
  id: string;
  name: string;
  type: string;
  size: number;
  mimeType: string;
  createdAt: string;
  parseStatus?: DataRoomDocumentRow["parseStatus"];
  parseRetryAllowed?: boolean;
  parseAttempts?: number;
  linkedEvidence: LinkedEvidenceView[];
}

export interface DataRoomSummary {
  documentCount: number;
  /** 근거가 1건이라도 연결된 문서 수 */
  evidenceLinkedDocumentCount: number;
  totalEvidenceCount: number;
}

export interface DataRoomViewModel {
  documents: DataRoomDocumentView[];
  summary: DataRoomSummary;
}

export function buildPEDataRoomViewModel(
  documents: DataRoomDocumentRow[],
  evidence: DataRoomEvidenceRow[],
  findings: DataRoomFindingRow[]
): DataRoomViewModel {
  const findingById = new Map(findings.map((f) => [f.id, f]));
  const evidenceByDocument = new Map<string, DataRoomEvidenceRow[]>();
  for (const e of evidence) {
    if (!e.documentId) continue;
    const list = evidenceByDocument.get(e.documentId) ?? [];
    list.push(e);
    evidenceByDocument.set(e.documentId, list);
  }

  const documentViews: DataRoomDocumentView[] = documents.map((doc) => {
    const linked = evidenceByDocument.get(doc.id) ?? [];
    return {
      id: doc.id,
      name: doc.name,
      type: doc.type,
      size: doc.size,
      mimeType: doc.mimeType,
      createdAt: doc.createdAt,
      parseStatus: doc.parseStatus,
      parseRetryAllowed: doc.parseRetryAllowed,
      parseAttempts: doc.parseAttempts,
      linkedEvidence: linked.map((e) => ({
        id: e.id,
        sourceName: e.sourceName,
        sourceLocation: e.sourceLocation,
        excerpt: e.excerpt,
        confidence: e.confidence,
        linkedFinding: e.findingId ? findingById.get(e.findingId) : undefined,
      })),
    };
  });

  return {
    documents: documentViews,
    summary: {
      documentCount: documentViews.length,
      evidenceLinkedDocumentCount: documentViews.filter((d) => d.linkedEvidence.length > 0).length,
      totalEvidenceCount: evidence.filter((e) => e.documentId !== null).length,
    },
  };
}
