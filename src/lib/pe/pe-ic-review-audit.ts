/**
 * PE IC Review Audit Trail — 순수 로직(PR #111).
 *
 * DB를 건드리지 않는다 — 저장/조회는 `pe-ic-review-audit-repository.ts`가
 * 담당한다. 이 파일은 "스냅샷에 무엇을 담을지"와 "저장된 row를 어떻게
 * 화면용 뷰로 바꿀지"만 순수하게 계산한다.
 */

import { diffCommitteePackFingerprintBreakdown, type PECommitteePackFingerprintBreakdown } from "./pe-committee-pack-fingerprint";
import type { ICQuestion } from "./pe-ic-decision-types";
import type { PEICReviewSnapshotView, PEICAuditEventView, PEICAuditEventType } from "./pe-ic-review-audit-types";

/**
 * REVIEWED 전환 시점에 스냅샷에 저장할 "미해결 항목" 요약을 뽑는다.
 * 전체 질문 문구가 아니라 결정론적 코드(`ICQuestion.code`)만 담는다(§45).
 * `buildICQuestions()`(수정 없음)가 이미 P0→P1→P2로 정렬해 넘기므로
 * 여기서 우선순위를 다시 판정하지 않는다 — priority 필드를 그대로 센다.
 */
export function extractOpenQuestionSummary(questions: ICQuestion[]): {
  codes: string[];
  count: number;
  p0Count: number;
} {
  return {
    codes: questions.map((q) => q.code),
    count: questions.length,
    p0Count: questions.filter((q) => q.priority === "P0").length,
  };
}

export interface PEICReviewSnapshotRowLike {
  id: string;
  maDealId: string;
  version: number;
  reviewerId: string;
  fingerprint: string;
  fingerprintBreakdown: string;
  openQuestionCodes: string;
  openQuestionCount: number;
  openP0Count: number;
  comment: string | null;
  reviewedAt: Date;
  createdAt: Date;
  reviewer: { name: string | null; email: string | null };
}

function parseBreakdown(json: string): PECommitteePackFingerprintBreakdown | null {
  try {
    return JSON.parse(json) as PECommitteePackFingerprintBreakdown;
  } catch {
    return null;
  }
}

function parseCodes(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 저장된 스냅샷 row를 화면용 뷰로 바꾼다. `isCurrent`/`changedCategoriesFromPrevious`는
 * 전부 파생값 — 저장하지 않고 매 조회마다 다시 계산한다. `previousSnapshotBreakdown`은
 * 호출자가 "바로 이전 버전(version-1)" 스냅샷에서 미리 파싱해 넘긴다(이
 * 함수는 다른 row를 조회하지 않는 순수 함수이므로).
 */
export function toPEICReviewSnapshotView(
  row: PEICReviewSnapshotRowLike,
  currentFingerprint: string,
  previousSnapshotBreakdown: PECommitteePackFingerprintBreakdown | null
): PEICReviewSnapshotView {
  const breakdown = parseBreakdown(row.fingerprintBreakdown);
  const safeBreakdown: PECommitteePackFingerprintBreakdown =
    breakdown ?? { overall: row.fingerprint, financial: "", qoe: "", lbo: "", dd: "", evidence: "", questions: "" };
  return {
    id: row.id,
    maDealId: row.maDealId,
    version: row.version,
    reviewerId: row.reviewerId,
    reviewerName: row.reviewer.name,
    reviewerEmail: row.reviewer.email,
    fingerprint: row.fingerprint,
    fingerprintBreakdown: safeBreakdown,
    openQuestionCodes: parseCodes(row.openQuestionCodes),
    openQuestionCount: row.openQuestionCount,
    openP0Count: row.openP0Count,
    comment: row.comment,
    reviewedAt: row.reviewedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    isCurrent: row.fingerprint === currentFingerprint,
    changedCategoriesFromPrevious: diffCommitteePackFingerprintBreakdown(previousSnapshotBreakdown, safeBreakdown),
  };
}

export interface PEICAuditEventRowLike {
  id: string;
  maDealId: string;
  reviewSnapshotId: string | null;
  actorId: string;
  eventType: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: Date;
  actor: { name: string | null; email: string | null };
  reviewSnapshot: { version: number } | null;
}

export function toPEICAuditEventView(row: PEICAuditEventRowLike): PEICAuditEventView {
  return {
    id: row.id,
    maDealId: row.maDealId,
    reviewSnapshotId: row.reviewSnapshotId,
    reviewSnapshotVersion: row.reviewSnapshot?.version ?? null,
    actorId: row.actorId,
    actorName: row.actor.name,
    actorEmail: row.actor.email,
    eventType: row.eventType as PEICAuditEventType,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
