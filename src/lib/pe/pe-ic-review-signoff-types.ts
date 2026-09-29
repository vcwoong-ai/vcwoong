/**
 * PE IC Review Sign-off — 순수 타입(PR #110).
 *
 * ## "검토했다" ≠ "투자를 승인한다"(§7, 최우선 원칙)
 *
 * `REVIEWED`는 절대 투자 승인/추천/GO를 뜻하지 않는다 — 오직 "리뷰어가
 * 지금 시점의 Committee Pack을 확인했다"는 사실만 기록한다. 이 계약을
 * 코드에서도 지키기 위해 상태 이름에 `APPROVED`를 절대 쓰지 않는다.
 *
 * ## RE_REVIEW_REQUIRED는 저장되지 않는다
 *
 * `PEICReviewDisplayState`에는 있지만 `PEICReviewSignoffStatus`(DB에 저장되는
 * 값)에는 없다 — `computeReviewDisplayState()`(pe-ic-review-signoff.ts)가
 * "저장된 REVIEWED + 저장된 fingerprint ≠ 지금 fingerprint"를 감지해
 * 매번 다시 파생시키는 표시 전용 상태다. DB의 REVIEWED 값 자체는 절대
 * 조용히 덮어쓰지 않는다(§Step13 — 리뷰어가 실제로 재검토해야만 갱신).
 */

import { computeReviewDisplayState } from "./pe-ic-review-signoff";
import { diffCommitteePackFingerprintBreakdown, type PECommitteePackFingerprintBreakdown } from "./pe-committee-pack-fingerprint";

export const PE_IC_REVIEW_SIGNOFF_STATUSES = ["NOT_REVIEWED", "IN_REVIEW", "CHANGES_REQUESTED", "REVIEWED"] as const;
export type PEICReviewSignoffStatus = (typeof PE_IC_REVIEW_SIGNOFF_STATUSES)[number];

export const PE_IC_REVIEW_DISPLAY_STATES = [...PE_IC_REVIEW_SIGNOFF_STATUSES, "RE_REVIEW_REQUIRED"] as const;
export type PEICReviewDisplayState = (typeof PE_IC_REVIEW_DISPLAY_STATES)[number];

export interface PEICReviewView {
  id: string;
  maDealId: string;
  reviewerId: string;
  reviewerName: string | null;
  reviewerEmail: string | null;
  status: PEICReviewSignoffStatus;
  /** 화면에 보여줄 실제 상태 — REVIEWED인데 fingerprint가 어긋나면 RE_REVIEW_REQUIRED(파생, DB 값 아님). */
  displayState: PEICReviewDisplayState;
  comment: string | null;
  reviewedFingerprint: string | null;
  reviewedAt: string | null;
  /** 저장된 breakdown과 지금 breakdown을 비교해 바뀐 카테고리 라벨(§Step14 "무엇이 바뀌었나") — displayState가 RE_REVIEW_REQUIRED일 때만 의미가 있다. */
  changedCategories: string[];
  createdAt: string;
  updatedAt: string;
}

export const PE_IC_REVIEW_COMMENT_TARGET_TYPES = ["COMMITTEE_PACK", "IC_QUESTION", "REVIEW_ITEM", "EVIDENCE_REQUEST"] as const;
export type PEICReviewCommentTargetType = (typeof PE_IC_REVIEW_COMMENT_TARGET_TYPES)[number];

export interface PEICReviewCommentView {
  id: string;
  maDealId: string;
  reviewId: string | null;
  authorId: string;
  authorName: string | null;
  authorEmail: string | null;
  targetType: PEICReviewCommentTargetType;
  targetId: string | null;
  text: string;
  createdAt: string;
}

// ── DB row → 뷰 매핑(순수, 새 계산 없음) ──────────────────────────────────

export interface PEICReviewRowLike {
  id: string;
  maDealId: string;
  reviewerId: string;
  status: string;
  comment: string | null;
  reviewedFingerprint: string | null;
  reviewedFingerprintBreakdown: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  reviewer: { name: string | null; email: string | null };
}

function parseBreakdown(json: string | null): PECommitteePackFingerprintBreakdown | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as PECommitteePackFingerprintBreakdown;
  } catch {
    return null;
  }
}

/** 저장된 status/fingerprint를 그대로 옮기지 않는다 — computeReviewDisplayState()로
 * 지금 fingerprint와 비교해 displayState를 매번 파생시킨다(pe-ic-review-signoff.ts,
 * 타입만 여기서 가져다 쓰므로 런타임 순환 참조는 생기지 않는다). */
export function toPEICReviewView(row: PEICReviewRowLike, currentBreakdown: PECommitteePackFingerprintBreakdown): PEICReviewView {
  const status = row.status as PEICReviewSignoffStatus;
  const previousBreakdown = parseBreakdown(row.reviewedFingerprintBreakdown);
  return {
    id: row.id,
    maDealId: row.maDealId,
    reviewerId: row.reviewerId,
    reviewerName: row.reviewer.name,
    reviewerEmail: row.reviewer.email,
    status,
    displayState: computeReviewDisplayState(status, row.reviewedFingerprint, currentBreakdown.overall),
    comment: row.comment,
    reviewedFingerprint: row.reviewedFingerprint,
    changedCategories: diffCommitteePackFingerprintBreakdown(previousBreakdown, currentBreakdown),
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface PEICReviewCommentRowLike {
  id: string;
  maDealId: string;
  reviewId: string | null;
  authorId: string;
  targetType: string;
  targetId: string | null;
  text: string;
  createdAt: Date;
  author: { name: string | null; email: string | null };
}

export function toPEICReviewCommentView(row: PEICReviewCommentRowLike): PEICReviewCommentView {
  return {
    id: row.id,
    maDealId: row.maDealId,
    reviewId: row.reviewId,
    authorId: row.authorId,
    authorName: row.author.name,
    authorEmail: row.author.email,
    targetType: row.targetType as PEICReviewCommentTargetType,
    targetId: row.targetId,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  };
}
