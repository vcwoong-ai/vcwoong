/**
 * PE IC Review Sign-off — Repository/Service Layer(PR #110).
 *
 * `pe-dd-repository.ts`(PR #105)/`pe-evidence-request-repository.ts`(PR #109)와
 * 정확히 같은 권한 모델을 재사용한다 — 새 인가 프레임워크가 아니다.
 * `PEDDActor`/`PEDDResult<T>`를 그대로 가져다 쓰고, 존재하지 않는 리소스와
 * 접근 권한 없는 리소스를 구분해서 응답하지 않는다(IDOR 방지, 동일 관례).
 *
 * ## 쓰기 권한
 *
 * 서명 상태 변경/코멘트 작성 전부 `maDealWriteWhere()` 기준이다 — ANALYST는
 * (팀 공유 딜에서) 조회만 가능하고 리뷰 액션을 할 수 없다(team-access.ts의
 * `canEditShared()` 정책 그대로, evidence-request-repository.ts와 동일
 * 판단 — §Step9 "reuse existing team role semantics").
 *
 * ## reviewerId/authorId는 절대 클라이언트에서 받지 않는다(§Step18 8/9)
 *
 * 모든 쓰기 함수는 `actor.userId`만 reviewerId/authorId로 쓴다 — 파라미터로
 * 다른 사용자 id를 받지 않는다. "다른 리뷰어를 대신 검토 완료 처리"는
 * 구조적으로 불가능하다(함수 시그니처 자체에 그 여지가 없음).
 *
 * ## fingerprint는 여기서 계산하지 않는다
 *
 * `upsertOwnPEICReview()`는 호출자(API route)가 `buildPECommitteePack()`으로
 * 이미 계산해 넘긴 fingerprint breakdown을 그대로 저장할 뿐이다 — 클라이언트
 * 요청 바디에서 fingerprint 값을 절대 읽지 않는다(§Step18 10, §Step24 2 —
 * "클라이언트가 fingerprint를 조작/주입할 수 없다"의 핵심 방어).
 */

import { prisma } from "@/lib/prisma";
import type {
  Prisma,
  PEICReview as PEICReviewRow,
  PEICReviewComment as PEICReviewCommentRow,
  PEICReviewSignoffStatus,
  PEICReviewCommentTargetType,
} from "@prisma/client";
import { maDealReadWhere, maDealWriteWhere } from "./ma-team-access";
import type { PEDDActor, PEDDResult } from "./pe-dd-repository";
import { collectSignoffTransitionIssues, collectReviewCommentIssues } from "./pe-ic-review-signoff";
import type { PECommitteePackFingerprintBreakdown } from "./pe-committee-pack-fingerprint";
import { recordAuditEvent, createReviewSnapshotInTransaction, isUniqueConstraintConflict } from "./pe-ic-review-audit-repository";
import type { PEICAuditEventType } from "@prisma/client";
export type { PEDDActor, PEDDResult };

/** PEICReviewSignoffStatus → 이 전이가 만드는 감사 이벤트 종류(§12). NOT_REVIEWED로의
 * 전이는 UI 액션으로 노출되지 않아 이벤트를 만들지 않는다(null). */
const AUDIT_EVENT_FOR_STATUS: Record<PEICReviewSignoffStatus, PEICAuditEventType | null> = {
  NOT_REVIEWED: null,
  IN_REVIEW: "REVIEW_STARTED",
  CHANGES_REQUESTED: "CHANGE_REQUESTED",
  REVIEWED: "REVIEW_COMPLETED",
};

const MAX_VERSION_CONFLICT_RETRIES = 3;

function maDealWhereRead(actor: PEDDActor): Prisma.MADealWhereInput {
  return maDealReadWhere(actor.userId, actor.teamId);
}
function maDealWhereWrite(actor: PEDDActor): Prisma.MADealWhereInput {
  return maDealWriteWhere(actor.userId, actor.teamId, actor.role);
}

// ── 서명 상태(리뷰어 한 명당 딜 하나에 행 하나, unique(maDealId, reviewerId)) ──

export async function listPEICReviews(actor: PEDDActor, maDealId: string): Promise<PEDDResult<(PEICReviewRow & { reviewer: { name: string | null; email: string | null } })[]>> {
  const deal = await prisma.mADeal.findFirst({ where: { id: maDealId, ...maDealWhereRead(actor) } });
  if (!deal) return { status: "not_found" };
  const rows = await prisma.pEICReview.findMany({
    where: { maDealId },
    include: { reviewer: { select: { name: true, email: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return { status: "ok", data: rows };
}

export interface UpsertPEICReviewInput {
  status: PEICReviewSignoffStatus;
  comment?: string | null;
}

/** REVIEWED 전환 시점의 스냅샷에 담을 "지금 미해결 항목" 요약(pe-ic-review-audit.ts의
 * extractOpenQuestionSummary()로 계산) — status가 REVIEWED가 아니면 무시된다. */
export interface OpenQuestionSummary {
  codes: string[];
  count: number;
  p0Count: number;
}

/**
 * actor 본인의 서명 상태만 만들거나 바꾼다 — maDealId+reviewerId(=actor.userId)
 * unique 제약으로 "딜당 리뷰어 한 명당 행 하나"를 보장한다(PR #110부터
 * 그대로, "지금 상태"를 나타내는 살아있는 행이라 재검토할 때마다 덮어써진다).
 * status가 REVIEWED일 때만 `currentBreakdown`을 `reviewedFingerprint`/
 * `reviewedFingerprintBreakdown`에 기록한다(다른 상태로 바뀔 때는 이전에
 * 기록된 값을 그대로 둔다 — "마지막으로 실제 검토 완료했던 시점"의 기록이라는
 * 의미를 유지). `currentBreakdown`은 항상 호출자(API route)가
 * `buildPECommitteePack()`으로 직접 계산해 넘긴다 — 요청 바디에서 읽지
 * 않는다(§Step18 10 "클라이언트가 fingerprint를 조작/주입할 수 없다").
 *
 * PR #111부터: 이 살아있는 행을 upsert하는 것과 별개로, status===REVIEWED로
 * 전환하는 매 순간(재검토 포함) `PEICReviewSnapshot`에 불변 행을 하나 더
 * insert하고 `PEICAuditEvent`도 함께 남긴다 — 전부 한 트랜잭션 안에서
 * 이뤄진다(§43 "DB는 REVIEWED라는데 감사 이벤트는 실패" 같은 반쪽 상태
 * 방지). 스냅샷의 `version`은 트랜잭션 안에서 서버가 계산하므로, 동시에
 * 두 번 검토 완료가 들어오면 unique(maDealId, version) 충돌이 나고
 * 최대 3번까지 재시도한다(§42 "duplicate review version impossible").
 */
export async function upsertOwnPEICReview(
  actor: PEDDActor,
  maDealId: string,
  input: UpsertPEICReviewInput,
  currentBreakdown: PECommitteePackFingerprintBreakdown,
  openQuestionSummary: OpenQuestionSummary
): Promise<PEDDResult<PEICReviewRow>> {
  const deal = await prisma.mADeal.findFirst({ where: { id: maDealId, ...maDealWhereWrite(actor) } });
  if (!deal) return { status: "not_found" };

  const issues = collectSignoffTransitionIssues(input);
  if (issues.length > 0) return { status: "invalid", issues };

  const eventType = AUDIT_EVENT_FOR_STATUS[input.status];

  for (let attempt = 0; attempt < MAX_VERSION_CONFLICT_RETRIES; attempt++) {
    try {
      const row = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const reviewedFields =
          input.status === "REVIEWED"
            ? { reviewedFingerprint: currentBreakdown.overall, reviewedFingerprintBreakdown: JSON.stringify(currentBreakdown), reviewedAt: now }
            : {};

        const reviewRow = await tx.pEICReview.upsert({
          where: { maDealId_reviewerId: { maDealId, reviewerId: actor.userId } },
          create: { maDealId, reviewerId: actor.userId, status: input.status, comment: input.comment ?? null, ...reviewedFields },
          update: { status: input.status, comment: input.comment ?? null, ...reviewedFields },
        });

        let snapshotId: string | null = null;
        if (input.status === "REVIEWED") {
          const snapshot = await createReviewSnapshotInTransaction(tx, {
            maDealId,
            reviewerId: actor.userId,
            fingerprint: currentBreakdown.overall,
            fingerprintBreakdown: currentBreakdown,
            openQuestionCodes: openQuestionSummary.codes,
            openQuestionCount: openQuestionSummary.count,
            openP0Count: openQuestionSummary.p0Count,
            comment: input.comment ?? null,
            reviewedAt: now,
          });
          snapshotId = snapshot.id;
        }

        if (eventType) {
          await recordAuditEvent(tx, { maDealId, reviewSnapshotId: snapshotId, actorId: actor.userId, eventType });
        }

        return reviewRow;
      });
      return { status: "ok", data: row };
    } catch (error) {
      if (isUniqueConstraintConflict(error) && attempt < MAX_VERSION_CONFLICT_RETRIES - 1) continue;
      throw error;
    }
  }
  // 이론상 도달 불가(루프가 항상 return 또는 throw로 끝남) — TS 제어 흐름 분석용.
  throw new Error("upsertOwnPEICReview: unreachable");
}

// ── 코멘트(§Step10 — 의견/메모일 뿐 canonical 재무 데이터를 절대 바꾸지 않음) ──

export function collectCreateReviewCommentIssues(input: { text: string; targetType: PEICReviewCommentTargetType; targetId?: string | null }): string[] {
  return collectReviewCommentIssues(input);
}

export interface CreatePEICReviewCommentInput {
  targetType: PEICReviewCommentTargetType;
  targetId?: string | null;
  text: string;
}

/** 코멘트 작성 + 감사 이벤트 기록을 한 트랜잭션으로 묶는다(§43) — 코멘트는
 * 생겼는데 감사 이벤트는 안 생기는 반쪽 상태를 방지한다. */
export async function addPEICReviewComment(
  actor: PEDDActor,
  maDealId: string,
  input: CreatePEICReviewCommentInput
): Promise<PEDDResult<PEICReviewCommentRow>> {
  const deal = await prisma.mADeal.findFirst({ where: { id: maDealId, ...maDealWhereWrite(actor) } });
  if (!deal) return { status: "not_found" };

  const issues = collectReviewCommentIssues(input);
  if (issues.length > 0) return { status: "invalid", issues };

  const row = await prisma.$transaction(async (tx) => {
    // 있으면 actor 본인의 review 행에 연결한다(없어도 코멘트는 만들 수 있다 —
    // "검토 시작" 전에도 의견을 남길 수 있어야 하므로).
    const ownReview = await tx.pEICReview.findUnique({
      where: { maDealId_reviewerId: { maDealId, reviewerId: actor.userId } },
      select: { id: true },
    });

    const created = await tx.pEICReviewComment.create({
      data: {
        maDealId,
        reviewId: ownReview?.id,
        authorId: actor.userId,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        text: input.text,
      },
    });

    await recordAuditEvent(tx, {
      maDealId,
      actorId: actor.userId,
      eventType: "COMMENT_ADDED",
      targetType: input.targetType,
      targetId: input.targetId ?? null,
    });

    return created;
  });
  return { status: "ok", data: row };
}

export async function listPEICReviewComments(
  actor: PEDDActor,
  maDealId: string,
  filter?: { targetType?: PEICReviewCommentTargetType; targetId?: string | null }
): Promise<PEDDResult<(PEICReviewCommentRow & { author: { name: string | null; email: string | null } })[]>> {
  const deal = await prisma.mADeal.findFirst({ where: { id: maDealId, ...maDealWhereRead(actor) } });
  if (!deal) return { status: "not_found" };

  const rows = await prisma.pEICReviewComment.findMany({
    where: {
      maDealId,
      ...(filter?.targetType ? { targetType: filter.targetType } : {}),
      ...(filter?.targetId !== undefined ? { targetId: filter.targetId } : {}),
    },
    include: { author: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return { status: "ok", data: rows };
}
