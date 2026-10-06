/**
 * PE Evidence Request — Repository/Service Layer(PR #109).
 *
 * `pe-dd-repository.ts`(PR #105)와 정확히 같은 권한 모델을 그대로
 * 재사용한다 — 새 인가 프레임워크가 아니다. `PEDDActor`/`PEDDResult<T>`를
 * import해 쓰고, 존재하지 않는 리소스와 접근 권한 없는 리소스를 구분해서
 * 응답하지 않는다(IDOR 방지, 동일 관례).
 *
 * ## 쓰기 권한
 *
 * Evidence Request 생성/상태 변경/문서 연결은 전부 `maDealWriteWhere()`
 * 기준이다 — ANALYST는 (팀 공유 딜에서) 조회만 가능하고 요청을 만들 수
 * 없다(team-access.ts의 `canEditShared()` 정책 그대로, §Step16 "ANALYST
 * behavior follows existing authorization").
 *
 * ## 상태 전이(dd-validation.ts의 DD_FINDING_TRANSITIONS와 동일 패턴)
 *
 * REQUESTED → RECEIVED(문서 연결 시 자동, 판단 아님) → UNDER_REVIEW →
 * ACCEPTED | REJECTED. REJECTED → REQUESTED(재요청)만 예외적으로 허용한다.
 * ACCEPTED는 종결 상태 — 여기서 되돌아가는 전이는 없다.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma, PEEvidenceRequest as PEEvidenceRequestRow, PEEvidenceRequestStatus, PEICQuestionPriorityDb } from "@prisma/client";
import { maDealReadWhere, maDealWriteWhere } from "./ma-team-access";
import type { PEDDActor, PEDDResult } from "./pe-dd-repository";
import { isValidEvidenceRequestTransition } from "./pe-ic-review-types";
import { recordAuditEvent } from "./pe-ic-review-audit-repository";
export type { PEDDActor, PEDDResult };
export { isValidEvidenceRequestTransition };

function ddCaseReadWhere(actor: PEDDActor): Prisma.PEDDCaseWhereInput {
  return { maDeal: maDealReadWhere(actor.userId, actor.teamId) };
}
function ddCaseWriteWhere(actor: PEDDActor): Prisma.PEDDCaseWhereInput {
  return { maDeal: maDealWriteWhere(actor.userId, actor.teamId, actor.role) };
}
function requestWriteWhere(actor: PEDDActor): Prisma.PEEvidenceRequestWhereInput {
  return { ddCase: ddCaseWriteWhere(actor) };
}

// ── 순수 구조 검증(DB 호출 없음) ──────────────────────────────────────────

export function collectCreateEvidenceRequestIssues(input: { title: string; reason: string; reviewItemSourceId: string }): string[] {
  const issues: string[] = [];
  if (!input.title.trim()) issues.push("title_required");
  if (!input.reason.trim()) issues.push("reason_required");
  if (!input.reviewItemSourceId.trim()) issues.push("review_item_source_id_required");
  return issues;
}

// ── Create ────────────────────────────────────────────────────────────

export interface CreatePEEvidenceRequestInput {
  reviewItemSourceType: string;
  reviewItemSourceId: string;
  title: string;
  requestedDocument?: string;
  requestedFact?: string;
  reason: string;
  priority: PEICQuestionPriorityDb;
}

/** 근거 요청 생성 + 감사 이벤트 기록을 한 트랜잭션으로 묶는다(PR #111 §43,
 * §12 EVIDENCE_REQUESTED — "어떤 근거가 이 결정을 뒷받침했는가"를 감사
 * 타임라인에서도 추적 가능하게 한다. pe-ic-review-audit-repository.ts의
 * 쓰기 헬퍼를 그대로 재사용할 뿐 새 감사 로직을 만들지 않는다). */
export async function createPEEvidenceRequest(
  actor: PEDDActor,
  ddCaseId: string,
  input: CreatePEEvidenceRequestInput
): Promise<PEDDResult<PEEvidenceRequestRow>> {
  const ddCase = await prisma.pEDDCase.findFirst({ where: { id: ddCaseId, ...ddCaseWriteWhere(actor) } });
  if (!ddCase) return { status: "not_found" };

  const issues = collectCreateEvidenceRequestIssues(input);
  if (issues.length > 0) return { status: "invalid", issues };

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.pEEvidenceRequest.create({
      data: {
        ddCaseId,
        reviewItemSourceType: input.reviewItemSourceType,
        reviewItemSourceId: input.reviewItemSourceId,
        title: input.title,
        requestedDocument: input.requestedDocument,
        requestedFact: input.requestedFact,
        reason: input.reason,
        priority: input.priority,
        createdByUserId: actor.userId,
      },
    });

    await recordAuditEvent(tx, {
      maDealId: ddCase.maDealId,
      actorId: actor.userId,
      eventType: "EVIDENCE_REQUESTED",
      targetType: input.reviewItemSourceType,
      targetId: input.reviewItemSourceId,
    });

    return row;
  });
  return { status: "ok", data: created };
}

export async function listPEEvidenceRequests(actor: PEDDActor, ddCaseId: string, client: Prisma.TransactionClient = prisma): Promise<PEDDResult<PEEvidenceRequestRow[]>> {
  const ddCase = await client.pEDDCase.findFirst({ where: { id: ddCaseId, ...ddCaseReadWhere(actor) } });
  if (!ddCase) return { status: "not_found" };
  const rows = await client.pEEvidenceRequest.findMany({ where: { ddCaseId }, orderBy: { createdAt: "asc" } });
  return { status: "ok", data: rows };
}

// ── 문서 연결(자동 REQUESTED→RECEIVED — 판단 아니라 사실 기록) ───────────

export async function linkDocumentToPEEvidenceRequest(
  actor: PEDDActor,
  requestId: string,
  documentId: string
): Promise<PEDDResult<PEEvidenceRequestRow>> {
  const request = await prisma.pEEvidenceRequest.findFirst({
    where: { id: requestId, ...requestWriteWhere(actor) },
    include: { ddCase: { select: { maDealId: true } } },
  });
  if (!request) return { status: "not_found" };

  // 문서가 실제로 같은 딜 소속인지 검증(§Step16 — 다른 딜 문서로 이 요청을
  // '해결됐다'고 조작 불가, addPEEvidence()의 document_cross_deal_or_missing과 동일 패턴).
  const doc = await prisma.mADocument.findUnique({ where: { id: documentId } });
  if (!doc || doc.maDealId !== request.ddCase.maDealId) {
    return { status: "invalid", issues: ["document_cross_deal_or_missing"] };
  }

  if (request.status === "ACCEPTED" || request.status === "REJECTED") {
    return { status: "invalid", issues: ["cannot_relink_document_on_terminal_request"] };
  }

  const nextStatus: PEEvidenceRequestStatus = request.status === "REQUESTED" ? "RECEIVED" : request.status;
  const updated = await prisma.pEEvidenceRequest.update({
    where: { id: requestId },
    data: { linkedDocumentId: documentId, status: nextStatus },
  });
  return { status: "ok", data: updated };
}

// ── 상태 변경(사람의 명시적 검토 결정만 — AI/자동 승인 없음) ────────────

export async function updatePEEvidenceRequestStatus(
  actor: PEDDActor,
  requestId: string,
  nextStatus: PEEvidenceRequestStatus
): Promise<PEDDResult<PEEvidenceRequestRow>> {
  const request = await prisma.pEEvidenceRequest.findFirst({ where: { id: requestId, ...requestWriteWhere(actor) } });
  if (!request) return { status: "not_found" };

  if (!isValidEvidenceRequestTransition(request.status, nextStatus)) {
    return { status: "invalid", issues: ["invalid_status_transition"] };
  }
  if ((nextStatus === "UNDER_REVIEW" || nextStatus === "ACCEPTED") && !request.linkedDocumentId) {
    // 문서(근거) 없이 검토/승인 상태로 넘어갈 수 없다 — RECEIVED = "받았다"가
    // 구조적으로 선행돼야 한다(§4 — evidence 없이 resolve 우회 금지와 동일 정신).
    return { status: "invalid", issues: ["cannot_advance_without_linked_document"] };
  }

  const updated = await prisma.pEEvidenceRequest.update({ where: { id: requestId }, data: { status: nextStatus } });
  return { status: "ok", data: updated };
}
