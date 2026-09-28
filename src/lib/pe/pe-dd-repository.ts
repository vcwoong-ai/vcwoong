/**
 * PE DD & Evidence Persistence — Repository/Service Layer(PR #105).
 *
 * ## 역할 분리(반드시 지킬 것)
 *
 * 이 파일은 "사실과 워크플로 상태"만 저장/검증한다. "이 finding이 실제로
 * 타당한가", "이 딜의 decision readiness가 무엇인가"는 여전히 순수
 * 결정론적 엔진(`dd-lineage.ts`의 `requiresEvidenceForStatus()`,
 * `pe-decision-readiness.ts`의 `buildPEDecisionReadiness()`)이 판단한다 —
 * 이 파일은 그 판단 로직을 다시 구현하지 않고 재사용만 한다. AI는 이 계층을
 * 거치지 않고는 CONFIRMED/MITIGATED/ACCEPTED/CLOSED 상태를 저장할 수 없다
 * (모든 쓰기가 이 파일의 `requiresEvidenceForStatus()` 검증을 통과해야 함 —
 * §Step 3/§Step 10-J).
 *
 * ## 권한 모델(ma-team-access.ts 재사용, 새 프레임워크 없음)
 *
 * 모든 함수는 `PEDDActor`(userId/teamId/role)를 받는다. 권한 판정은 전부
 * `maDealReadWhere()`/`maDealWriteWhere()`(ma-team-access.ts, 수정하지
 * 않음)를 MADeal → PEDDCase → PEDDFinding/PEEvidence 체인을 따라 중첩
 * where절로 연결하는 것으로 해결한다(team-access.ts의 reportReadWhere가
 * `{ deal: dealReadWhere(...) }`로 위임하는 것과 동일 패턴).
 *
 * 존재하지 않는 리소스와 "존재하지만 접근 권한이 없는" 리소스를 구분해서
 * 응답하지 않는다(IDOR 방지 — MADeal 상세 페이지가 이미 따르는 관례:
 * `if (!maDeal) notFound()`와 동일하게 둘 다 `{status:"not_found"}`).
 *
 * ## Evidence 자동 승격 금지(§Step 3)
 *
 * `addPEEvidence()`는 finding의 status를 절대 바꾸지 않는다 — evidence가
 * 추가됐다고 자동으로 CONFIRMED가 되지 않는다. status 변경은 오직
 * `updatePEDDFinding()`의 명시적 호출로만 일어나고, 그때마다 evidence
 * 요구사항을 다시 검증한다.
 */

import { prisma } from "@/lib/prisma";
import type {
  Prisma,
  PEDDCase as PEDDCaseRow,
  PEDDFinding as PEDDFindingRow,
  PEEvidence as PEEvidenceRow,
  PEDDCategory,
  PEDDSeverity,
  PEDDFindingStatus,
  MaFinancialSourceType,
} from "@prisma/client";
import { maDealReadWhere, maDealWriteWhere } from "./ma-team-access";
import { requiresEvidenceForStatus } from "./dd-types";

export interface PEDDActor {
  userId: string;
  teamId: string | null;
  role: string;
}

export type PEDDResult<T> =
  | { status: "ok"; data: T }
  | { status: "not_found" }
  | { status: "invalid"; issues: string[] };

// ── 순수 구조 검증(DB 호출 없음 — 이 저장소 test:* 관례대로 라이브 DB 없이
// 단위 테스트 가능하도록 분리했다) ───────────────────────────────────────

/** finding 생성 입력의 구조적 유효성만 본다(교차 딜 참조 등 DB 의존 검사는 별도). */
export function collectCreateFindingIssues(input: {
  title: string;
  description: string;
  status?: PEDDFindingStatus;
}): string[] {
  const issues: string[] = [];
  if (!input.title.trim()) issues.push("title_required");
  if (!input.description.trim()) issues.push("description_required");
  // CONFIRMED 이상으로 바로 생성 금지 — evidence는 finding 생성 후에만 붙을 수
  // 있으므로 생성 시점엔 항상 0건이다(requiresEvidenceForStatus 재사용, 새 규칙 없음).
  if (requiresEvidenceForStatus(input.status ?? "DRAFT")) {
    issues.push("cannot_create_with_status_requiring_evidence");
  }
  return issues;
}

/** finding 수정 입력 중 구조적 유효성만 본다(evidence 개수 확인 등 DB 의존 검사는 별도). */
export function collectUpdateFindingIssues(patch: { title?: string; description?: string }): string[] {
  const issues: string[] = [];
  if (patch.title !== undefined && !patch.title.trim()) issues.push("title_required");
  if (patch.description !== undefined && !patch.description.trim()) issues.push("description_required");
  return issues;
}

/** confidence 범위는 evidence-lineage.ts createEvidenceItem()과 정확히 같은 규칙(0~1)을 그대로 반영한다. */
export function collectAddEvidenceIssues(input: { sourceName: string; confidence?: number }): string[] {
  const issues: string[] = [];
  if (!input.sourceName.trim()) issues.push("source_name_required");
  if (input.confidence !== undefined && (input.confidence < 0 || input.confidence > 1)) {
    issues.push("confidence_out_of_range");
  }
  return issues;
}

// ── 접근 제어 where절(ma-team-access.ts 위임, 새 판정 로직 없음) ────────

function ddCaseReadWhere(actor: PEDDActor): Prisma.PEDDCaseWhereInput {
  return { maDeal: maDealReadWhere(actor.userId, actor.teamId) };
}

function ddCaseWriteWhere(actor: PEDDActor): Prisma.PEDDCaseWhereInput {
  return { maDeal: maDealWriteWhere(actor.userId, actor.teamId, actor.role) };
}

function findingWriteWhere(actor: PEDDActor): Prisma.PEDDFindingWhereInput {
  return { ddCase: ddCaseWriteWhere(actor) };
}

function evidenceWriteWhere(actor: PEDDActor): Prisma.PEEvidenceWhereInput {
  return { ddCase: ddCaseWriteWhere(actor) };
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────────────

async function getReadableDDCase(actor: PEDDActor, ddCaseId: string): Promise<PEDDResult<PEDDCaseRow>> {
  const found = await prisma.pEDDCase.findFirst({ where: { id: ddCaseId, ...ddCaseReadWhere(actor) } });
  if (!found) return { status: "not_found" };
  return { status: "ok", data: found };
}

async function getWritableDDCase(actor: PEDDActor, ddCaseId: string): Promise<PEDDResult<PEDDCaseRow>> {
  const found = await prisma.pEDDCase.findFirst({ where: { id: ddCaseId, ...ddCaseWriteWhere(actor) } });
  if (!found) return { status: "not_found" };
  return { status: "ok", data: found };
}

async function getWritableFinding(actor: PEDDActor, findingId: string): Promise<PEDDResult<PEDDFindingRow>> {
  const found = await prisma.pEDDFinding.findFirst({ where: { id: findingId, ...findingWriteWhere(actor) } });
  if (!found) return { status: "not_found" };
  return { status: "ok", data: found };
}

/** getWritableFinding()과 동일한 권한 검증 + 소속 ddCase(=maDealId)를 함께 반환한다(교차 딜 검증용). */
async function getWritableFindingWithDeal(
  actor: PEDDActor,
  findingId: string
): Promise<PEDDResult<{ finding: PEDDFindingRow; maDealId: string }>> {
  const found = await prisma.pEDDFinding.findFirst({
    where: { id: findingId, ...findingWriteWhere(actor) },
    include: { ddCase: { select: { maDealId: true } } },
  });
  if (!found) return { status: "not_found" };
  const { ddCase, ...finding } = found;
  return { status: "ok", data: { finding: finding as PEDDFindingRow, maDealId: ddCase.maDealId } };
}

// ── PEDDCase ─────────────────────────────────────────────────────────

/** 딜당 canonical case 1개만 허용(schema.prisma의 `maDealId @unique`가 DB 레벨로도 보장) — 이미 있으면 그대로 반환한다(get-or-create, 버저닝 없음). */
export async function createPEDDCase(
  actor: PEDDActor,
  maDealId: string
): Promise<PEDDResult<{ ddCase: PEDDCaseRow; created: boolean }>> {
  const deal = await prisma.mADeal.findFirst({ where: { id: maDealId, ...maDealWriteWhere(actor.userId, actor.teamId, actor.role) } });
  if (!deal) return { status: "not_found" };

  const existing = await prisma.pEDDCase.findUnique({ where: { maDealId } });
  if (existing) return { status: "ok", data: { ddCase: existing, created: false } };

  const created = await prisma.pEDDCase.create({ data: { maDealId } });
  return { status: "ok", data: { ddCase: created, created: true } };
}

export async function getPEDDCase(actor: PEDDActor, ddCaseId: string): Promise<PEDDResult<PEDDCaseRow>> {
  return getReadableDDCase(actor, ddCaseId);
}

export async function getPEDDCaseForDeal(actor: PEDDActor, maDealId: string): Promise<PEDDResult<PEDDCaseRow | null>> {
  const deal = await prisma.mADeal.findFirst({ where: { id: maDealId, ...maDealReadWhere(actor.userId, actor.teamId) } });
  if (!deal) return { status: "not_found" };
  const ddCase = await prisma.pEDDCase.findUnique({ where: { maDealId } });
  return { status: "ok", data: ddCase };
}

// ── PEDDFinding ──────────────────────────────────────────────────────

export interface CreatePEDDFindingInput {
  category: PEDDCategory;
  subCategory?: string;
  title: string;
  description: string;
  severity: PEDDSeverity;
  /** 생략하면 DRAFT. CONFIRMED 이상 상태로 바로 생성하는 것은 금지한다
   * (evidence는 finding 생성 후에만 연결할 수 있으므로 생성 시점엔 항상 0건). */
  status?: PEDDFindingStatus;
  /** ddCase와 같은 MADeal에 속한 MAFinancialPeriod.id여야 한다(교차 딜 참조는 reject). */
  financialPeriodId?: string;
  owner?: string;
  resolution?: string;
}

async function assertPeriodBelongsToDeal(financialPeriodId: string, maDealId: string): Promise<string | null> {
  const period = await prisma.mAFinancialPeriod.findUnique({ where: { id: financialPeriodId } });
  if (!period || period.maDealId !== maDealId) return "financial_period_cross_deal_or_missing";
  return null;
}

export async function createPEDDFinding(
  actor: PEDDActor,
  ddCaseId: string,
  input: CreatePEDDFindingInput
): Promise<PEDDResult<PEDDFindingRow>> {
  const caseResult = await getWritableDDCase(actor, ddCaseId);
  if (caseResult.status !== "ok") return caseResult;
  const ddCase = caseResult.data;

  const status = input.status ?? "DRAFT";
  const issues = collectCreateFindingIssues({ title: input.title, description: input.description, status });

  if (input.financialPeriodId) {
    const err = await assertPeriodBelongsToDeal(input.financialPeriodId, ddCase.maDealId);
    if (err) issues.push(err);
  }

  if (issues.length > 0) return { status: "invalid", issues };

  const created = await prisma.pEDDFinding.create({
    data: {
      ddCaseId,
      category: input.category,
      subCategory: input.subCategory,
      title: input.title,
      description: input.description,
      severity: input.severity,
      status,
      financialPeriodId: input.financialPeriodId,
      owner: input.owner,
      resolution: input.resolution,
    },
  });
  return { status: "ok", data: created };
}

export interface UpdatePEDDFindingInput {
  category?: PEDDCategory;
  subCategory?: string | null;
  title?: string;
  description?: string;
  severity?: PEDDSeverity;
  status?: PEDDFindingStatus;
  financialPeriodId?: string | null;
  owner?: string | null;
  resolution?: string | null;
}

export async function updatePEDDFinding(
  actor: PEDDActor,
  findingId: string,
  patch: UpdatePEDDFindingInput
): Promise<PEDDResult<PEDDFindingRow>> {
  const findingResult = await getWritableFindingWithDeal(actor, findingId);
  if (findingResult.status !== "ok") return findingResult;
  const { finding, maDealId } = findingResult.data;

  // CLOSED는 종결 상태 — 여기서 다른 상태로 되돌아가는 전이를 포함해 어떤
  // 수정도 허용하지 않는다(dd-types.ts PEDDFindingStatus 문서화 그대로,
  // §Step 3: "다른 상태로 되돌아가는 전이는 허용하지 않는다").
  if (finding.status === "CLOSED") {
    return { status: "invalid", issues: ["finding_closed_immutable"] };
  }

  const issues = collectUpdateFindingIssues({ title: patch.title, description: patch.description });

  if (patch.financialPeriodId) {
    const err = await assertPeriodBelongsToDeal(patch.financialPeriodId, maDealId);
    if (err) issues.push(err);
  }

  const nextStatus = patch.status ?? finding.status;
  if (requiresEvidenceForStatus(nextStatus)) {
    const evidenceCount = await prisma.pEEvidence.count({ where: { findingId } });
    if (evidenceCount === 0) {
      issues.push("missing_evidence_for_status");
    }
  }

  if (issues.length > 0) return { status: "invalid", issues };

  const updated = await prisma.pEDDFinding.update({
    where: { id: findingId },
    data: {
      category: patch.category,
      subCategory: patch.subCategory,
      title: patch.title,
      description: patch.description,
      severity: patch.severity,
      status: patch.status,
      financialPeriodId: patch.financialPeriodId,
      owner: patch.owner,
      resolution: patch.resolution,
    },
  });
  return { status: "ok", data: updated };
}

export async function deletePEDDFinding(actor: PEDDActor, findingId: string): Promise<PEDDResult<null>> {
  const findingResult = await getWritableFinding(actor, findingId);
  if (findingResult.status !== "ok") return findingResult;
  if (findingResult.data.status === "CLOSED") {
    return { status: "invalid", issues: ["finding_closed_immutable"] };
  }
  // PEEvidence.findingId는 onDelete: SetNull — evidence 자체는 감사 기록으로 남는다.
  await prisma.pEDDFinding.delete({ where: { id: findingId } });
  return { status: "ok", data: null };
}

export async function listPEDDFindings(actor: PEDDActor, ddCaseId: string): Promise<PEDDResult<PEDDFindingRow[]>> {
  const caseResult = await getReadableDDCase(actor, ddCaseId);
  if (caseResult.status !== "ok") return caseResult;
  const findings = await prisma.pEDDFinding.findMany({ where: { ddCaseId }, orderBy: { createdAt: "asc" } });
  return { status: "ok", data: findings };
}

// ── PEEvidence ───────────────────────────────────────────────────────

export interface AddPEEvidenceInput {
  /** 특정 finding에 연결하지 않고 DD case 레벨 근거로만 둘 수도 있다 */
  findingId?: string;
  /** 업로드 문서에서 온 근거일 때만 — ddCase와 같은 MADeal의 문서여야 한다 */
  documentId?: string;
  sourceType: MaFinancialSourceType;
  sourceName: string;
  sourceLocation?: string;
  externalReference?: string;
  locator?: string;
  excerpt?: string;
  /** 0~1 범위(evidence-lineage.ts createEvidenceItem()과 동일 규칙) */
  confidence?: number;
}

export async function addPEEvidence(
  actor: PEDDActor,
  ddCaseId: string,
  input: AddPEEvidenceInput
): Promise<PEDDResult<PEEvidenceRow>> {
  const caseResult = await getWritableDDCase(actor, ddCaseId);
  if (caseResult.status !== "ok") return caseResult;
  const ddCase = caseResult.data;

  const issues = collectAddEvidenceIssues({ sourceName: input.sourceName, confidence: input.confidence });

  if (input.findingId) {
    const finding = await prisma.pEDDFinding.findUnique({ where: { id: input.findingId } });
    if (!finding || finding.ddCaseId !== ddCaseId) {
      issues.push("finding_cross_case_or_missing");
    }
  }

  if (input.documentId) {
    const doc = await prisma.mADocument.findUnique({ where: { id: input.documentId } });
    if (!doc || doc.maDealId !== ddCase.maDealId) {
      issues.push("document_cross_deal_or_missing");
    }
  }

  if (issues.length > 0) return { status: "invalid", issues };

  const created = await prisma.pEEvidence.create({
    data: {
      ddCaseId,
      findingId: input.findingId,
      documentId: input.documentId,
      sourceType: input.sourceType,
      sourceName: input.sourceName,
      sourceLocation: input.sourceLocation,
      externalReference: input.externalReference,
      locator: input.locator,
      excerpt: input.excerpt,
      confidence: input.confidence,
    },
  });
  return { status: "ok", data: created };
}

export async function removePEEvidence(actor: PEDDActor, evidenceId: string): Promise<PEDDResult<null>> {
  const evidence = await prisma.pEEvidence.findFirst({ where: { id: evidenceId, ...evidenceWriteWhere(actor) } });
  if (!evidence) return { status: "not_found" };

  if (evidence.findingId) {
    const finding = await prisma.pEDDFinding.findUnique({ where: { id: evidence.findingId } });
    if (finding && requiresEvidenceForStatus(finding.status)) {
      const count = await prisma.pEEvidence.count({ where: { findingId: evidence.findingId } });
      if (count <= 1) {
        return { status: "invalid", issues: ["cannot_remove_last_evidence_for_status_requiring_evidence"] };
      }
    }
  }

  await prisma.pEEvidence.delete({ where: { id: evidenceId } });
  return { status: "ok", data: null };
}

export async function listPEEvidence(
  actor: PEDDActor,
  ddCaseId: string,
  findingId?: string
): Promise<PEDDResult<PEEvidenceRow[]>> {
  const caseResult = await getReadableDDCase(actor, ddCaseId);
  if (caseResult.status !== "ok") return caseResult;
  const where: Prisma.PEEvidenceWhereInput = findingId ? { ddCaseId, findingId } : { ddCaseId };
  const rows = await prisma.pEEvidence.findMany({ where, orderBy: { createdAt: "asc" } });
  return { status: "ok", data: rows };
}
