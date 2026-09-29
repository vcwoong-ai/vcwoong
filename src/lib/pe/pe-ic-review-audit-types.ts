/**
 * PE IC Review Audit Trail — 순수 타입(PR #111).
 *
 * ## 이 파일이 답하려는 질문
 *
 * "정확히 무엇을 검토했는가? 언제? 그 순간의 canonical 데이터는 무엇이었나?
 * 무엇이 미해결이었나? 이후 무엇이 바뀌었나? 왜 재검토가 필요해졌나?
 * 누가 각 행동을 했나?" — 이 질문에 답하려면 "지금 상태"(PEICReview, PR #110)
 * 만으로는 부족하다. 재검토할 때마다 이전 상태가 upsert로 덮어써지기
 * 때문이다. 이 파일이 정의하는 `PEICReviewSnapshot`은 REVIEWED로 전환하는
 * 매 순간을 영구 보존하는 불변 기록이고, `PEICAuditEvent`는 그 사이
 * 일어난 모든 행동(코멘트/변경요청/근거요청 등)의 append-only 타임라인이다.
 *
 * ## 두 번째 진실 소스가 아니다
 *
 * `PEICReviewSnapshot`은 canonical 재무/QoE/LBO/DD/근거 데이터를 복제하지
 * 않는다 — `buildPECommitteePack()`(PR #110, 수정 없음)이 이미 계산한
 * fingerprint/fingerprintBreakdown을 "그 순간의 값"으로 그대로 복사해
 * 저장할 뿐이다. 미해결 IC 질문도 전체 문구가 아니라 결정론적 코드
 * (`ICQuestion.code`)만 저장한다 — 필요하면 그 코드로 지금 다시 계산된
 * review item과 대조할 수 있다(원본을 복제하지 않고 참조만 남김, §45).
 */

import type { PECommitteePackFingerprintBreakdown } from "./pe-committee-pack-fingerprint";

export const PE_IC_AUDIT_EVENT_TYPES = [
  "REVIEW_STARTED",
  "CHANGE_REQUESTED",
  "REVIEW_COMPLETED",
  "COMMENT_ADDED",
  "EVIDENCE_REQUESTED",
] as const;
export type PEICAuditEventType = (typeof PE_IC_AUDIT_EVENT_TYPES)[number];

export interface PEICReviewSnapshotView {
  id: string;
  maDealId: string;
  /** 딜 하나 안에서 단조 증가(리뷰어 무관) — "이 딜의 몇 번째 검토 완료인가" */
  version: number;
  reviewerId: string;
  reviewerName: string | null;
  reviewerEmail: string | null;
  fingerprint: string;
  fingerprintBreakdown: PECommitteePackFingerprintBreakdown;
  openQuestionCodes: string[];
  openQuestionCount: number;
  openP0Count: number;
  comment: string | null;
  reviewedAt: string;
  createdAt: string;
  /** 지금 canonical fingerprint와 같은가(=이 스냅샷이 "현재"를 반영하는가) — 파생값, 저장 안 함. */
  isCurrent: boolean;
  /** 바로 이전 버전(version-1) 스냅샷 대비 바뀐 카테고리 라벨(§23 review diff) — 파생값. */
  changedCategoriesFromPrevious: string[];
}

export interface PEICAuditEventView {
  id: string;
  maDealId: string;
  reviewSnapshotId: string | null;
  reviewSnapshotVersion: number | null;
  actorId: string;
  actorName: string | null;
  actorEmail: string | null;
  eventType: PEICAuditEventType;
  targetType: string | null;
  targetId: string | null;
  /** 원본 문서/민감정보를 담지 않는다(§45) — 구조적 참조/카운트만. */
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
