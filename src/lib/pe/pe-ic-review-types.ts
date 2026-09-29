/**
 * PE IC Review + Evidence Resolution Workflow — 순수 타입(PR #109).
 *
 * ## "review item"은 저장하지 않는다(핵심 원칙 5)
 *
 * `PEICReviewItem`은 항상 `buildPEDecisionReadiness()`/`buildICQuestions()`
 * (전부 수정 없음)의 현재 출력에서 매번 다시 계산되는 파생 뷰다 — DB
 * 테이블이 없다. 저장되는 건 오직 `PEEvidenceRequest`(사람이 실제로 취한
 * 워크플로 행동)뿐이다.
 *
 * ## RESOLVED의 의미(§4/§Step2 IMPORTANT — 가장 중요한 계약)
 *
 * `PEICReviewItemStatus.RESOLVED`는 절대 "누군가 버튼을 눌렀다"는 뜻이
 * 아니다. review item의 근원이 된 canonical 조건(factConflict/blocker/
 * missingInformation/DD finding)이 현재 재계산에서 더 이상 나타나지 않을
 * 때만 RESOLVED다 — `evaluatePEICReviewResolution()`(pe-ic-resolution.ts)이
 * 이 교차검증을 담당한다.
 */

import type { PEICQuestionPriority, ICQuestion } from "./pe-ic-decision-types";

// ── Review Item ────────────────────────────────────────────────────────

export const PE_IC_REVIEW_ITEM_TYPES = [
  "BLOCKER",
  "MISSING_INFORMATION",
  "IC_QUESTION",
  "DD_FOLLOWUP",
  "FINANCIAL_RECONCILIATION",
  "QOE_FOLLOWUP",
  "LBO_ASSUMPTION",
  "EVIDENCE_GAP",
] as const;
export type PEICReviewItemType = (typeof PE_IC_REVIEW_ITEM_TYPES)[number];

export const PE_IC_REVIEW_ITEM_STATUSES = [
  "OPEN",
  "IN_REVIEW",
  "WAITING_FOR_EVIDENCE",
  "EVIDENCE_RECEIVED",
  "RESOLVED",
  "REJECTED",
] as const;
export type PEICReviewItemStatus = (typeof PE_IC_REVIEW_ITEM_STATUSES)[number];

export interface PEICReviewItem {
  /** = sourceType:sourceId — pe-ic-questions.ts의 ICQuestion.code와 동일 값이라 결정론적이다 */
  id: string;
  dealId: string;
  type: PEICReviewItemType;
  priority: PEICQuestionPriority;
  title: string;
  question: string;
  reason: string;
  /** 이 항목이 파생된 원본 ICQuestion — 재해석 없이 그대로 보존한다(추적성).
   * RESOLVED 항목은 canonical 조건이 이미 사라져 지금 재계산으로는 복원할
   * 수 없으므로 undefined다(그때 저장해둔 evidenceRequests 필드에서 title/
   * question/reason/requiredEvidence를 대신 복원한다 — 지어내지 않는다). */
  sourceQuestion?: ICQuestion;
  requiredEvidence: string;
  status: PEICReviewItemStatus;
  /** 이 review item에 연결된 실제 요청(영속) — 최근 생성순 */
  evidenceRequests: PEEvidenceRequestView[];
}

// ── Evidence Request ──────────────────────────────────────────────────

export const PE_EVIDENCE_REQUEST_STATUSES = ["REQUESTED", "RECEIVED", "UNDER_REVIEW", "ACCEPTED", "REJECTED"] as const;
export type PEEvidenceRequestStatus = (typeof PE_EVIDENCE_REQUEST_STATUSES)[number];

/**
 * Evidence Request의 읽기 전용 뷰(DB row를 그대로 옮긴 것 — 새 계산 없음).
 * `RECEIVED` ≠ `ACCEPTED`다(§4 — "받았다"와 "검증됐다"는 다른 사실).
 * `RESOLVED`는 오직 `ACCEPTED` 상태의 요청 + canonical 조건 충족의 교집합에서만 나온다.
 */
export interface PEEvidenceRequestView {
  id: string;
  ddCaseId: string;
  reviewItemSourceType: string;
  reviewItemSourceId: string;
  title: string;
  requestedDocument: string | null;
  requestedFact: string | null;
  reason: string;
  priority: PEICQuestionPriority;
  status: PEEvidenceRequestStatus;
  linkedDocumentId: string | null;
  linkedDocumentName?: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

// ── 딜 전체 리뷰 워크플로 요약 ────────────────────────────────────────────

export const PE_IC_REVIEW_STATES = ["READY_FOR_IC", "PARTIALLY_READY", "NOT_READY", "BLOCKED"] as const;
export type PEICReviewState = (typeof PE_IC_REVIEW_STATES)[number];

export interface PEICReviewWorkspace {
  dealId: string;
  /** buildPEICDecision().processState를 그대로 옮긴다(재판정 없음) */
  overallState: PEICReviewState;
  openItems: PEICReviewItem[];
  resolvedItems: PEICReviewItem[];
  evidenceRequests: PEEvidenceRequestView[];
}

// ── 상태 전이(순수, 클라이언트/서버 공용 단일 소스) ──────────────────────
// pe-evidence-request-repository.ts(서버 전용, prisma import)는 이 맵을
// 그대로 가져다 쓴다 — 전이 규칙을 두 곳에 따로 정의하지 않는다. 이
// 파일은 DB를 건드리지 않아 클라이언트 컴포넌트에서도 안전하게 import할
// 수 있어, 상태 변경 버튼을 어떤 상태로 보여줄지 UI가 직접 계산할 때도
// 같은 규칙을 쓴다(REQUESTED → RECEIVED(문서 연결 시 자동) →
// UNDER_REVIEW → ACCEPTED | REJECTED, REJECTED → REQUESTED만 예외 허용).
export const PE_EVIDENCE_REQUEST_STATUS_TRANSITIONS: Record<PEEvidenceRequestStatus, readonly PEEvidenceRequestStatus[]> = {
  REQUESTED: ["RECEIVED"],
  RECEIVED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["ACCEPTED", "REJECTED"],
  ACCEPTED: [],
  REJECTED: ["REQUESTED"],
};

/** 같은 상태로의 전이(no-op)는 항상 허용한다(dd-validation.ts와 동일 원칙). */
export function isValidEvidenceRequestTransition(from: PEEvidenceRequestStatus, to: PEEvidenceRequestStatus): boolean {
  if (from === to) return true;
  return PE_EVIDENCE_REQUEST_STATUS_TRANSITIONS[from].includes(to);
}

// ── DB row → 뷰 매핑(순수, 새 계산 없음) ──────────────────────────────────

export interface PEEvidenceRequestRowLike {
  id: string;
  ddCaseId: string;
  reviewItemSourceType: string;
  reviewItemSourceId: string;
  title: string;
  requestedDocument: string | null;
  requestedFact: string | null;
  reason: string;
  priority: string;
  status: string;
  linkedDocumentId: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** GET/PATCH evidence-requests route와 ic-memo route가 공유하는 유일한
 * row→view 변환 — 각자 날짜 포맷팅을 따로 하지 않는다. */
export function toPEEvidenceRequestView(
  row: PEEvidenceRequestRowLike,
  linkedDocumentName?: string | null
): PEEvidenceRequestView {
  return {
    id: row.id,
    ddCaseId: row.ddCaseId,
    reviewItemSourceType: row.reviewItemSourceType,
    reviewItemSourceId: row.reviewItemSourceId,
    title: row.title,
    requestedDocument: row.requestedDocument,
    requestedFact: row.requestedFact,
    reason: row.reason,
    priority: row.priority as PEICQuestionPriority,
    status: row.status as PEEvidenceRequestStatus,
    linkedDocumentId: row.linkedDocumentId,
    linkedDocumentName: linkedDocumentName ?? undefined,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
