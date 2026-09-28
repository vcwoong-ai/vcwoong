/**
 * PE Due Diligence Framework — 단일 Finding 구조 검증 + lifecycle 전이 검증(PR-G).
 *
 * evidence-lineage.ts(PR-F)의 create* 함수와 같은 패턴을 따른다: 구조적으로
 * 잘못된 입력(빈 id/title, 정의되지 않은 category/severity/status)은 즉시
 * throw한다 — "아직 근거가 부족한 정상 상태"가 아니라 호출자 계약 위반이기
 * 때문이다. 여러 Finding 사이의 참조 무결성(evidence/claim/period 존재
 * 여부 등)은 이 파일이 아니라 dd-lineage.ts가 다룬다(PR-F의 전체 그래프가
 * 필요한 검사이므로).
 */

import {
  PE_DD_CATEGORIES,
  PE_DD_FINDING_STATUSES,
  PE_DD_SEVERITIES,
  type PEDDCategory,
  type PEDDFinancialImpactReference,
  type PEDDFinding,
  type PEDDFindingStatus,
  type PEDDLboImpactReference,
  type PEDDSeverity,
  type PEDDSubCategory,
} from "./dd-types";

function requireNonEmpty(value: string, field: string): void {
  if (!value || !value.trim()) {
    throw new Error(`${field}는 비어 있을 수 없습니다`);
  }
}

function requireOneOf<T extends string>(value: T, allowed: readonly T[], field: string): void {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`유효하지 않은 ${field}입니다: ${value}`);
  }
}

/** §13 "### Finding" 규칙(id/title 필수, category/severity/status 유효성)을 그대로 구현한다. */
export function createPEDDFinding(input: {
  id: string;
  category: PEDDCategory;
  subCategory?: PEDDSubCategory;
  title: string;
  description: string;
  severity: PEDDSeverity;
  status: PEDDFindingStatus;
  evidenceIds?: string[];
  claimIds?: string[];
  financialPeriodId?: string;
  owner?: string;
  resolution?: string;
  financialImpact?: PEDDFinancialImpactReference;
  lboImpact?: PEDDLboImpactReference;
  createdAt?: string;
}): PEDDFinding {
  requireNonEmpty(input.id, "PEDDFinding.id");
  requireNonEmpty(input.title, "PEDDFinding.title");
  requireOneOf(input.category, PE_DD_CATEGORIES, "category");
  requireOneOf(input.severity, PE_DD_SEVERITIES, "severity");
  requireOneOf(input.status, PE_DD_FINDING_STATUSES, "status");

  return {
    ...input,
    evidenceIds: input.evidenceIds ?? [],
    claimIds: input.claimIds ?? [],
  };
}

export function linkFindingToEvidence(finding: PEDDFinding, evidenceId: string): PEDDFinding {
  return finding.evidenceIds.includes(evidenceId)
    ? finding
    : { ...finding, evidenceIds: [...finding.evidenceIds, evidenceId] };
}

export function linkFindingToClaim(finding: PEDDFinding, claimId: string): PEDDFinding {
  return finding.claimIds.includes(claimId)
    ? finding
    : { ...finding, claimIds: [...finding.claimIds, claimId] };
}

// ─────────────────────────────────────────────────────────────
// Lifecycle transition(§15) — 허용된 전이만 명시적으로 나열한다. 목록에
// 없는 전이(예: CLOSED → DRAFT)는 invalid. 같은 상태로의 "전이"(no-op)는
// 항상 허용한다(변경이 없으므로 lifecycle 위반이 아님).
// ─────────────────────────────────────────────────────────────

const DD_FINDING_TRANSITIONS: Record<PEDDFindingStatus, readonly PEDDFindingStatus[]> = {
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["CONFIRMED", "REJECTED"],
  CONFIRMED: ["MITIGATED", "ACCEPTED"],
  MITIGATED: ["CLOSED"],
  ACCEPTED: ["CLOSED"],
  REJECTED: ["CLOSED"],
  CLOSED: [],
};

export function isValidFindingStatusTransition(
  from: PEDDFindingStatus,
  to: PEDDFindingStatus
): boolean {
  if (from === to) return true;
  return DD_FINDING_TRANSITIONS[from].includes(to);
}

/** allowed transition이 아니면 새 Finding을 만들지 않고 명시적으로 실패시킨다
 * (throw — lifecycle 계약 위반은 "정상 상태"가 아니라 호출자 오류이므로). */
export function transitionFindingStatus(
  finding: PEDDFinding,
  to: PEDDFindingStatus
): PEDDFinding {
  requireOneOf(to, PE_DD_FINDING_STATUSES, "status");
  if (!isValidFindingStatusTransition(finding.status, to)) {
    throw new Error(`허용되지 않는 상태 전이입니다: ${finding.status} → ${to}`);
  }
  return { ...finding, status: to };
}
