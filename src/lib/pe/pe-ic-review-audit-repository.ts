/**
 * PE IC Review Audit Trail — Repository/Service Layer(PR #111).
 *
 * `pe-dd-repository.ts`(PR #105)/`pe-evidence-request-repository.ts`(PR #109)/
 * `pe-ic-review-signoff-repository.ts`(PR #110)와 정확히 같은 권한 모델을
 * 재사용한다 — `PEDDActor`/`PEDDResult<T>`를 그대로 가져다 쓰고, 존재하지
 * 않는 리소스와 접근 권한 없는 리소스를 구분해서 응답하지 않는다(IDOR
 * 방지, 동일 관례).
 *
 * ## 쓰기는 여기 없다
 *
 * 이 파일은 스냅샷/감사 이벤트를 **조회**만 한다. 실제 스냅샷/이벤트
 * 생성은 `pe-ic-review-signoff-repository.ts`(서명 상태 전환/코멘트
 * 작성)와 `pe-evidence-request-repository.ts`(근거 요청 생성)의 기존
 * 쓰기 함수 안에서, 그 함수들이 이미 열어둔 트랜잭션 안에서 `recordAuditEvent()`/
 * `createReviewSnapshotInTransaction()`(둘 다 이 파일이 export)를 호출해
 * 이뤄진다 — 새 엔드포인트나 새 진실 소스를 만들지 않는다(§3/§12).
 *
 * ## 불변성(§6/§13)
 *
 * 이 파일 어디에도 `pEICReviewSnapshot.update()`/`delete()`나
 * `pEICAuditEvent.update()`/`delete()`가 없다 — 의도적으로 없다. 스냅샷과
 * 이벤트는 append-only다.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma, PEICAuditEventType } from "@prisma/client";
import { maDealReadWhere } from "./ma-team-access";
import type { PEDDActor, PEDDResult } from "./pe-dd-repository";
import type { PECommitteePackFingerprintBreakdown } from "./pe-committee-pack-fingerprint";
import { toPEICReviewSnapshotView, toPEICAuditEventView } from "./pe-ic-review-audit";
import type { PEICReviewSnapshotView, PEICAuditEventView } from "./pe-ic-review-audit-types";

function maDealWhereRead(actor: PEDDActor): Prisma.MADealWhereInput {
  return maDealReadWhere(actor.userId, actor.teamId);
}

function parseBreakdownSafe(json: string): PECommitteePackFingerprintBreakdown | null {
  try {
    return JSON.parse(json) as PECommitteePackFingerprintBreakdown;
  } catch {
    return null;
  }
}

// ── 스냅샷 이력 조회(불변, 시간순) ─────────────────────────────────────

/**
 * 버전 오름차순으로 전부 가져와 `changedCategoriesFromPrevious`를 이웃한
 * 스냅샷끼리 비교해 계산한다(§23 review diff — 전체 이력이 아니라 "바로
 * 이전 버전 대비"만). 딜 하나의 검토 완료 횟수는 실무적으로 수백 건을
 * 넘지 않으므로 페이지네이션 없이 전부 가져온다(근거 요청/코멘트처럼
 * 무한히 늘어날 수 있는 로그가 아니다 — §32와 달리 감사 이벤트 목록만
 * 경계가 필요하다).
 */
export async function listPEICReviewSnapshots(
  actor: PEDDActor,
  maDealId: string,
  currentBreakdown: PECommitteePackFingerprintBreakdown
): Promise<PEDDResult<PEICReviewSnapshotView[]>> {
  const deal = await prisma.mADeal.findFirst({ where: { id: maDealId, ...maDealWhereRead(actor) } });
  if (!deal) return { status: "not_found" };

  const rows = await prisma.pEICReviewSnapshot.findMany({
    where: { maDealId },
    include: { reviewer: { select: { name: true, email: true } } },
    orderBy: { version: "asc" },
  });

  const views: PEICReviewSnapshotView[] = [];
  let previousBreakdown: PECommitteePackFingerprintBreakdown | null = null;
  for (const row of rows) {
    views.push(toPEICReviewSnapshotView(row, currentBreakdown.overall, previousBreakdown));
    previousBreakdown = parseBreakdownSafe(row.fingerprintBreakdown);
  }
  return { status: "ok", data: views.reverse() }; // 최신(가장 높은 version)이 먼저 보이도록
}

/** 단일 스냅샷 상세 — maDealId 불일치는 not_found로 통일 응답(IDOR 방지, §25). */
export async function getPEICReviewSnapshot(
  actor: PEDDActor,
  maDealId: string,
  snapshotId: string,
  currentBreakdown: PECommitteePackFingerprintBreakdown
): Promise<PEDDResult<PEICReviewSnapshotView>> {
  const deal = await prisma.mADeal.findFirst({ where: { id: maDealId, ...maDealWhereRead(actor) } });
  if (!deal) return { status: "not_found" };

  const row = await prisma.pEICReviewSnapshot.findUnique({
    where: { id: snapshotId },
    include: { reviewer: { select: { name: true, email: true } } },
  });
  if (!row || row.maDealId !== maDealId) return { status: "not_found" };

  const previous = await prisma.pEICReviewSnapshot.findUnique({
    where: { maDealId_version: { maDealId, version: row.version - 1 } },
    select: { fingerprintBreakdown: true },
  });

  return {
    status: "ok",
    data: toPEICReviewSnapshotView(row, currentBreakdown.overall, previous ? parseBreakdownSafe(previous.fingerprintBreakdown) : null),
  };
}

// ── 감사 이벤트 조회(append-only, 경계 있는 페이지네이션) ────────────────

const AUDIT_EVENT_DEFAULT_LIMIT = 30;
const AUDIT_EVENT_MAX_LIMIT = 50;

export interface ListPEICAuditEventsOptions {
  /** 이 createdAt 이전(과거) 이벤트부터 — cursor 기반 페이지네이션(§32, N+1/무제한 조회 방지). */
  before?: Date;
  limit?: number;
}

export async function listPEICAuditEvents(
  actor: PEDDActor,
  maDealId: string,
  options: ListPEICAuditEventsOptions = {}
): Promise<PEDDResult<PEICAuditEventView[]>> {
  const deal = await prisma.mADeal.findFirst({ where: { id: maDealId, ...maDealWhereRead(actor) } });
  if (!deal) return { status: "not_found" };

  const limit = Math.min(options.limit ?? AUDIT_EVENT_DEFAULT_LIMIT, AUDIT_EVENT_MAX_LIMIT);
  const rows = await prisma.pEICAuditEvent.findMany({
    where: { maDealId, ...(options.before ? { createdAt: { lt: options.before } } : {}) },
    include: {
      actor: { select: { name: true, email: true } },
      reviewSnapshot: { select: { version: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return { status: "ok", data: rows.map(toPEICAuditEventView) };
}

// ── 쓰기 헬퍼(다른 repository의 트랜잭션 안에서만 호출된다) ──────────────

export interface RecordAuditEventInput {
  maDealId: string;
  reviewSnapshotId?: string | null;
  actorId: string;
  eventType: PEICAuditEventType;
  targetType?: string | null;
  targetId?: string | null;
  /** 원본 문서/민감정보를 담지 않는다(§45) — 구조적 참조/카운트만. */
  metadata?: Record<string, unknown> | null;
}

export async function recordAuditEvent(tx: Prisma.TransactionClient, input: RecordAuditEventInput): Promise<void> {
  await tx.pEICAuditEvent.create({
    data: {
      maDealId: input.maDealId,
      reviewSnapshotId: input.reviewSnapshotId ?? null,
      actorId: input.actorId,
      eventType: input.eventType,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata === undefined ? undefined : (input.metadata as Prisma.InputJsonValue | undefined),
    },
  });
}

export interface CreateReviewSnapshotInput {
  maDealId: string;
  reviewerId: string;
  fingerprint: string;
  fingerprintBreakdown: PECommitteePackFingerprintBreakdown;
  openQuestionCodes: string[];
  openQuestionCount: number;
  openP0Count: number;
  comment: string | null;
  reviewedAt: Date;
}

/**
 * REVIEWED 전환 시점의 불변 스냅샷을 만든다. `version`은 이 딜의 현재
 * 최댓값+1을 트랜잭션 안에서 계산한다 — 클라이언트가 절대 보내지 않는다
 * (§5 "서버가 계산", §Step18 11 "review-version spoofing 불가"). 동시에
 * 두 번 검토 완료가 들어와 버전이 충돌하면(unique(maDealId, version))
 * 호출자가 `isReviewSnapshotVersionConflict()`로 감지해 재시도한다(§42).
 */
export async function createReviewSnapshotInTransaction(
  tx: Prisma.TransactionClient,
  input: CreateReviewSnapshotInput
) {
  const maxVersion = await tx.pEICReviewSnapshot.aggregate({
    where: { maDealId: input.maDealId },
    _max: { version: true },
  });
  const nextVersion = (maxVersion._max.version ?? 0) + 1;

  return tx.pEICReviewSnapshot.create({
    data: {
      maDealId: input.maDealId,
      version: nextVersion,
      reviewerId: input.reviewerId,
      fingerprint: input.fingerprint,
      fingerprintBreakdown: JSON.stringify(input.fingerprintBreakdown),
      openQuestionCodes: JSON.stringify(input.openQuestionCodes),
      openQuestionCount: input.openQuestionCount,
      openP0Count: input.openP0Count,
      comment: input.comment,
      reviewedAt: input.reviewedAt,
    },
  });
}

/** Prisma unique 제약 위반(P2002) 여부 — 버전 충돌 재시도 판단에 쓴다(§42/§Step41 "duplicate review version impossible"). */
export function isUniqueConstraintConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}
