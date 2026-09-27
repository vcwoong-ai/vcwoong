/**
 * PE Evidence Lineage — 순수 함수(PR-F).
 *
 * DB 호출·네트워크 호출·LLM 호출·`Date.now()`/`Math.random()` 같은 환경·
 * 무작위 의존을 전혀 쓰지 않는다 — 같은 입력이면 항상 같은 출력이다. ID는
 * 호출자가 넘긴다(이 파일이 스스로 생성하지 않는다) — 실제 배선 시에는
 * MAFinancialAdjustment.id 같은 진짜 DB id를 그대로 쓰면 된다.
 *
 * 계산은 전부 기존 엔진에 위임한다:
 * - Financial Fact 값 자체 → financial-normalization.ts(PR-B, 수정하지 않음)
 * - normalizedValue → `computeAdjustmentNormalizedValue()`(PR-B, 그대로 재사용)
 * - Adjusted EBITDA → qoe.ts `calculateAdjustedEbitda()`(PR-D, 수정하지 않음)
 * - 억원 변환 → qoe-lbo-bridge.ts `bridgeQoEToLboEntryEbitda()`(PR-E, 수정하지 않음)
 *
 * 이 파일은 그 결과들을 "누가 무엇을 근거로 삼았는가"의 ID 그래프로 잇고
 * 검증만 한다 — 숫자를 다시 계산하지 않는다.
 */

import { computeAdjustmentNormalizedValue } from "./financial-normalization";
import type { CanonicalLineItem, MaFinancialSourceType } from "./financial-types";
import type { QoEAdjustmentInput } from "./qoe-types";
import type { QoEResult } from "./qoe";
import type { QoEToLboBridgeResult } from "./qoe-lbo-bridge";
import type {
  LineageValidationIssue,
  LineageValidationResult,
  PEClaim,
  PEClaimType,
  PEEvidenceItem,
  PEEvidenceLineage,
  PEEvidenceSource,
  PEFinancialFactReference,
  PEFinancialPeriodIdentity,
  PELboBridgeLineageReference,
  PEQoEAdjustmentReference,
  PEQoEResultLineageReference,
} from "./evidence-lineage-types";

// ─────────────────────────────────────────────────────────────
// Create — 구조적으로 잘못된 입력(빈 id, 범위 밖 confidence 등)은 즉시
// throw한다. dart-adapter.ts의 parseDartFiscalYear()와 같은 선례를 따른다 —
// 이런 위반은 "아직 정보가 부족한 정상 상태"가 아니라 호출자 계약 위반이기
// 때문에 FinancialCalcResult류의 status 유니온으로 감싸지 않는다.
// ─────────────────────────────────────────────────────────────

function requireNonEmpty(value: string, field: string): void {
  if (!value || !value.trim()) {
    throw new Error(`${field}는 비어 있을 수 없습니다`);
  }
}

export function createEvidenceSource(input: {
  id: string;
  sourceType: MaFinancialSourceType;
  sourceName: string;
  sourceLocation?: string;
  externalReference?: string;
  createdAt?: string;
  /** PR-I.1 Finding #6 — 선택 필드, 하위 호환(evidence-lineage-types.ts 참고). */
  dealId?: string;
  documentId?: string;
}): PEEvidenceSource {
  requireNonEmpty(input.id, "EvidenceSource.id");
  requireNonEmpty(input.sourceName, "EvidenceSource.sourceName");
  return { ...input };
}

export function createEvidenceItem(input: {
  id: string;
  sourceId: string;
  locator?: string;
  excerpt?: string;
  confidence?: number;
}): PEEvidenceItem {
  requireNonEmpty(input.id, "EvidenceItem.id");
  requireNonEmpty(input.sourceId, "EvidenceItem.sourceId");
  if (input.confidence !== undefined && (input.confidence < 0 || input.confidence > 1)) {
    throw new Error(`EvidenceItem.confidence는 0~1 범위여야 합니다(받은 값: ${input.confidence})`);
  }
  return { ...input };
}

export function createClaim(input: {
  id: string;
  statement: string;
  claimType: PEClaimType;
  financialPeriodId?: string;
  evidenceIds?: string[];
}): PEClaim {
  requireNonEmpty(input.id, "Claim.id");
  requireNonEmpty(input.statement, "Claim.statement");
  return { ...input, evidenceIds: input.evidenceIds ?? [] };
}

export function createFinancialFactReference(input: {
  id: string;
  financialPeriodId: string;
  metric: CanonicalLineItem;
  value: number;
  currency: string;
  sourceClaimIds?: string[];
  evidenceIds?: string[];
}): PEFinancialFactReference {
  requireNonEmpty(input.id, "FinancialFactReference.id");
  requireNonEmpty(input.financialPeriodId, "FinancialFactReference.financialPeriodId");
  requireNonEmpty(input.currency, "FinancialFactReference.currency");
  if (!Number.isFinite(input.value)) {
    throw new Error(`FinancialFactReference.value가 유효하지 않습니다(NaN/Infinity 불가): ${input.value}`);
  }
  return {
    ...input,
    sourceClaimIds: input.sourceClaimIds ?? [],
    evidenceIds: input.evidenceIds ?? [],
  };
}

/**
 * `adjustment`(QoEAdjustmentInput, qoe-types.ts)를 그대로 확장한다 — 필드를
 * 다시 적지 않는다. `normalizedValue`만 PR-B의 기존 공식으로 채운다.
 */
export function createQoEAdjustmentReference(input: {
  id: string;
  financialPeriodId: string;
  adjustment: QoEAdjustmentInput;
  evidenceIds?: string[];
  claimIds?: string[];
}): PEQoEAdjustmentReference {
  requireNonEmpty(input.id, "QoEAdjustmentReference.id");
  requireNonEmpty(input.financialPeriodId, "QoEAdjustmentReference.financialPeriodId");
  const normalizedValue = computeAdjustmentNormalizedValue(
    input.adjustment.reportedValue,
    input.adjustment.adjustmentValue
  );
  return {
    ...input.adjustment,
    id: input.id,
    financialPeriodId: input.financialPeriodId,
    normalizedValue,
    evidenceIds: input.evidenceIds ?? [],
    claimIds: input.claimIds ?? [],
  };
}

// ─────────────────────────────────────────────────────────────
// Link — 이미 만든 노드에 근거 ID를 덧붙인다(불변 — 새 객체 반환, 중복 추가 없음).
// ─────────────────────────────────────────────────────────────

export function linkClaimToEvidence(claim: PEClaim, evidenceId: string): PEClaim {
  return claim.evidenceIds.includes(evidenceId)
    ? claim
    : { ...claim, evidenceIds: [...claim.evidenceIds, evidenceId] };
}

export function linkFinancialFactToClaim(
  fact: PEFinancialFactReference,
  claimId: string
): PEFinancialFactReference {
  return fact.sourceClaimIds.includes(claimId)
    ? fact
    : { ...fact, sourceClaimIds: [...fact.sourceClaimIds, claimId] };
}

export function linkFinancialFactToEvidence(
  fact: PEFinancialFactReference,
  evidenceId: string
): PEFinancialFactReference {
  return fact.evidenceIds.includes(evidenceId)
    ? fact
    : { ...fact, evidenceIds: [...fact.evidenceIds, evidenceId] };
}

export function linkAdjustmentToEvidence(
  adjustment: PEQoEAdjustmentReference,
  evidenceId: string
): PEQoEAdjustmentReference {
  return adjustment.evidenceIds.includes(evidenceId)
    ? adjustment
    : { ...adjustment, evidenceIds: [...adjustment.evidenceIds, evidenceId] };
}

export function linkAdjustmentToClaim(
  adjustment: PEQoEAdjustmentReference,
  claimId: string
): PEQoEAdjustmentReference {
  return adjustment.claimIds.includes(claimId)
    ? adjustment
    : { ...adjustment, claimIds: [...adjustment.claimIds, claimId] };
}

// ─────────────────────────────────────────────────────────────
// QoE Result / LBO Bridge lineage — 기존 엔진 출력을 그대로 참조만 한다.
// 이 두 함수는 "아직 계산할 수 없는 정상 상태"(missing_input 등)를 다뤄야
// 하므로 FinancialCalcResult/QoEToLboBridgeResult와 같은 status 유니온으로
// 반환한다(throw하지 않음).
// ─────────────────────────────────────────────────────────────

export type QoEResultLineageBuildResult =
  | { status: "ok"; reference: PEQoEResultLineageReference }
  | { status: "missing_input"; missing: string[] }
  | { status: "invalid_qoe_result"; detail: string };

/**
 * `qoeResult`는 `calculateAdjustedEbitda()`(qoe.ts)의 결과를, `adjustmentReferences`는
 * 그 호출에 넘긴 것과 **정확히 같은 순서의 같은 adjustment 목록**(PEQoEAdjustmentReference는
 * QoEAdjustmentInput을 그대로 확장하므로 `calculateAdjustedEbitda(currency, lineItems,
 * adjustmentReferences)`처럼 직접 넘겨도 구조적으로 호환된다)을 넘겨야 한다 — 이 함수는
 * 그 대응이 실제로 일치하는지 방어적으로 재확인한다(개수·핵심 필드 비교).
 */
export function createQoEResultLineageReference(
  id: string,
  financialPeriodId: string,
  qoeResult: QoEResult,
  adjustmentReferences: PEQoEAdjustmentReference[]
): QoEResultLineageBuildResult {
  if (qoeResult.adjustedEbitda.status === "missing_input") {
    return { status: "missing_input", missing: qoeResult.adjustedEbitda.missing };
  }
  if (qoeResult.adjustedEbitda.status === "currency_mismatch") {
    return { status: "invalid_qoe_result", detail: qoeResult.adjustedEbitda.detail };
  }
  if (qoeResult.baseEbitda.status !== "ok") {
    return {
      status: "invalid_qoe_result",
      detail: "adjustedEbitda는 ok이지만 baseEbitda가 ok가 아닙니다(QoE 엔진 불변조건 위반)",
    };
  }
  if (adjustmentReferences.length !== qoeResult.allAdjustments.length) {
    return {
      status: "invalid_qoe_result",
      detail: `adjustmentReferences(${adjustmentReferences.length}건)가 QoEResult.allAdjustments(${qoeResult.allAdjustments.length}건)와 개수가 다릅니다`,
    };
  }
  for (let i = 0; i < adjustmentReferences.length; i++) {
    const ref = adjustmentReferences[i];
    const original = qoeResult.allAdjustments[i];
    if (
      ref.metric !== original.metric ||
      ref.reportedValue !== original.reportedValue ||
      ref.adjustmentValue !== original.adjustmentValue ||
      ref.status !== original.status
    ) {
      return {
        status: "invalid_qoe_result",
        detail: `adjustmentReferences[${i}]가 QoEResult.allAdjustments[${i}]와 일치하지 않습니다 — calculateAdjustedEbitda()에 넘긴 것과 동일한 순서의 동일한 adjustment 목록을 넘겨야 합니다`,
      };
    }
  }

  return {
    status: "ok",
    reference: {
      id,
      financialPeriodId,
      baseEbitdaKrw: qoeResult.baseEbitda.value,
      approvedAdjustmentIds: adjustmentReferences.filter((a) => a.status === "APPROVED").map((a) => a.id),
      adjustedEbitdaKrw: qoeResult.adjustedEbitda.value,
    },
  };
}

export type LboBridgeLineageBuildResult =
  | { status: "ok"; reference: PELboBridgeLineageReference }
  | Exclude<QoEToLboBridgeResult, { status: "ok" }>;

/** `bridgeResult`는 `bridgeQoEToLboEntryEbitda()`(qoe-lbo-bridge.ts, PR-E)의 결과를
 * 그대로 받는다 — 실패 상태(missing_input/unsupported_currency/...)도 그대로 전파한다. */
export function createLboBridgeLineageReference(
  id: string,
  qoeResultLineageId: string,
  bridgeResult: QoEToLboBridgeResult
): LboBridgeLineageBuildResult {
  if (bridgeResult.status !== "ok") {
    return bridgeResult;
  }
  return {
    status: "ok",
    reference: { id, qoeResultLineageId, provenance: bridgeResult.provenance },
  };
}

// ─────────────────────────────────────────────────────────────
// Build — 그래프 조립(계산 없음, 순수 조립)
// ─────────────────────────────────────────────────────────────

export function buildPEEvidenceLineage(input: {
  periods?: PEFinancialPeriodIdentity[];
  sources?: PEEvidenceSource[];
  evidence?: PEEvidenceItem[];
  claims?: PEClaim[];
  financialFacts?: PEFinancialFactReference[];
  adjustments?: PEQoEAdjustmentReference[];
  qoeResults?: PEQoEResultLineageReference[];
  lboBridges?: PELboBridgeLineageReference[];
}): PEEvidenceLineage {
  return {
    periods: input.periods ?? [],
    sources: input.sources ?? [],
    evidence: input.evidence ?? [],
    claims: input.claims ?? [],
    financialFacts: input.financialFacts ?? [],
    adjustments: input.adjustments ?? [],
    qoeResults: input.qoeResults ?? [],
    lboBridges: input.lboBridges ?? [],
  };
}

/** evidence가 하나도 연결되지 않은 claim만 골라낸다 — reject 대상이 아니라
 * 보고용이다(evidence.ts의 status:"unverified" 선례 — §10 rule 9 참고). */
export function findUnsupportedClaims(lineage: PEEvidenceLineage): PEClaim[] {
  return lineage.claims.filter((c) => c.evidenceIds.length === 0);
}

// ─────────────────────────────────────────────────────────────
// Cycle 탐지 — 3색 DFS. lineage 내부에서 파생한 인접 그래프뿐 아니라
// 임의의 adjacency map에도 쓸 수 있는 범용 함수로 둔다(테스트 용이성).
// ─────────────────────────────────────────────────────────────

export function detectCycle(adjacency: Map<string, string[]>): string[] | null {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const path: string[] = [];
  let cycle: string[] | null = null;

  function visit(node: string): void {
    if (cycle) return;
    color.set(node, GRAY);
    path.push(node);
    for (const next of adjacency.get(node) ?? []) {
      if (cycle) return;
      const c = color.get(next) ?? WHITE;
      if (c === WHITE) {
        visit(next);
      } else if (c === GRAY) {
        const start = path.indexOf(next);
        cycle = path.slice(start).concat(next);
        return;
      }
    }
    if (!cycle) {
      path.pop();
      color.set(node, BLACK);
    }
  }

  for (const node of Array.from(adjacency.keys())) {
    if (cycle) break;
    if ((color.get(node) ?? WHITE) === WHITE) {
      visit(node);
    }
  }
  return cycle;
}

// ─────────────────────────────────────────────────────────────
// Validate — §10의 "반드시 reject" 규칙 전체
// ─────────────────────────────────────────────────────────────

export function validatePEEvidenceLineage(lineage: PEEvidenceLineage): LineageValidationResult {
  const issues: LineageValidationIssue[] = [];

  // 0) 동일 ID가 서로 다른 entity type(혹은 같은 type 내에서도)에 중복 사용되는지
  //    먼저 확인한다 — 여기서 충돌이 있으면 아래의 모든 ID 조회 기반 검증이
  //    신뢰할 수 없으므로 그 즉시 반환한다.
  const idOccurrences = new Map<string, string[]>();
  const record = (id: string, entityType: string) => {
    const arr = idOccurrences.get(id) ?? [];
    arr.push(entityType);
    idOccurrences.set(id, arr);
  };
  lineage.periods.forEach((p) => record(p.id, "period"));
  lineage.sources.forEach((s) => record(s.id, "source"));
  lineage.evidence.forEach((e) => record(e.id, "evidence"));
  lineage.claims.forEach((c) => record(c.id, "claim"));
  lineage.financialFacts.forEach((f) => record(f.id, "financialFact"));
  lineage.adjustments.forEach((a) => record(a.id, "adjustment"));
  lineage.qoeResults.forEach((q) => record(q.id, "qoeResult"));
  lineage.lboBridges.forEach((b) => record(b.id, "lboBridge"));

  for (const [id, types] of Array.from(idOccurrences)) {
    if (types.length > 1) {
      issues.push({ rule: "duplicate_id", id, entityTypes: Array.from(new Set(types)) });
    }
  }
  if (issues.length > 0) {
    return { status: "invalid", issues };
  }

  const periodById = new Map(lineage.periods.map((p) => [p.id, p]));
  const sourceById = new Map(lineage.sources.map((s) => [s.id, s]));
  const evidenceById = new Map(lineage.evidence.map((e) => [e.id, e]));
  const claimById = new Map(lineage.claims.map((c) => [c.id, c]));
  const adjustmentById = new Map(lineage.adjustments.map((a) => [a.id, a]));
  const qoeResultById = new Map(lineage.qoeResults.map((q) => [q.id, q]));

  // 1) EvidenceItem → Source
  for (const ev of lineage.evidence) {
    if (!sourceById.has(ev.sourceId)) {
      issues.push({ rule: "dangling_source", entityId: ev.id, sourceId: ev.sourceId });
    }
    if (ev.confidence !== undefined && (ev.confidence < 0 || ev.confidence > 1)) {
      issues.push({ rule: "invalid_confidence", entityId: ev.id, confidence: ev.confidence });
    }
  }

  // 2) Claim → Evidence, Claim → Period(있으면)
  for (const claim of lineage.claims) {
    for (const evId of claim.evidenceIds) {
      if (!evidenceById.has(evId)) {
        issues.push({ rule: "dangling_evidence", entityId: claim.id, evidenceId: evId });
      }
    }
    if (claim.financialPeriodId !== undefined && !periodById.has(claim.financialPeriodId)) {
      issues.push({
        rule: "dangling_period",
        entityId: claim.id,
        financialPeriodId: claim.financialPeriodId,
      });
    }
  }
  // rule 9(evidence 없는 claim)는 reject 대상이 아니다 — evidence.ts의
  // status:"unverified" 선례를 그대로 따른다(findUnsupportedClaims 참고).

  // 3) Financial Fact → Period/Claim/Evidence + 통화 일치
  for (const fact of lineage.financialFacts) {
    const period = periodById.get(fact.financialPeriodId);
    if (!period) {
      issues.push({
        rule: "dangling_period",
        entityId: fact.id,
        financialPeriodId: fact.financialPeriodId,
      });
    } else if (period.currency !== fact.currency) {
      issues.push({
        rule: "currency_mismatch",
        entityId: fact.id,
        detail: `Financial Fact 통화(${fact.currency})가 기간 통화(${period.currency})와 다릅니다`,
      });
    }
    for (const claimId of fact.sourceClaimIds) {
      const claim = claimById.get(claimId);
      if (!claim) {
        issues.push({ rule: "dangling_claim", entityId: fact.id, claimId });
        continue;
      }
      if (claim.financialPeriodId !== undefined && claim.financialPeriodId !== fact.financialPeriodId) {
        issues.push({
          rule: "period_mismatch",
          entityId: fact.id,
          detail: `Financial Fact 기간(${fact.financialPeriodId})이 연결된 Claim ${claim.id}의 기간(${claim.financialPeriodId})과 다릅니다`,
        });
      }
    }
    for (const evId of fact.evidenceIds) {
      if (!evidenceById.has(evId)) {
        issues.push({ rule: "dangling_evidence", entityId: fact.id, evidenceId: evId });
      }
    }
  }

  // 4) QoE Adjustment → Period/Evidence/Claim
  for (const adj of lineage.adjustments) {
    if (!periodById.has(adj.financialPeriodId)) {
      issues.push({
        rule: "dangling_period",
        entityId: adj.id,
        financialPeriodId: adj.financialPeriodId,
      });
    }
    for (const evId of adj.evidenceIds) {
      if (!evidenceById.has(evId)) {
        issues.push({ rule: "dangling_evidence", entityId: adj.id, evidenceId: evId });
      }
    }
    for (const claimId of adj.claimIds) {
      const claim = claimById.get(claimId);
      if (!claim) {
        issues.push({ rule: "dangling_claim", entityId: adj.id, claimId });
        continue;
      }
      if (claim.financialPeriodId !== undefined && claim.financialPeriodId !== adj.financialPeriodId) {
        issues.push({
          rule: "period_mismatch",
          entityId: adj.id,
          detail: `Adjustment 기간(${adj.financialPeriodId})이 연결된 Claim ${claim.id}의 기간(${claim.financialPeriodId})과 다릅니다`,
        });
      }
    }
  }

  // 5) QoE Result → Period/Adjustment(+ APPROVED-only 계약)
  for (const qr of lineage.qoeResults) {
    if (!periodById.has(qr.financialPeriodId)) {
      issues.push({
        rule: "dangling_period",
        entityId: qr.id,
        financialPeriodId: qr.financialPeriodId,
      });
    }
    for (const adjId of qr.approvedAdjustmentIds) {
      const adj = adjustmentById.get(adjId);
      if (!adj) {
        issues.push({ rule: "dangling_adjustment", entityId: qr.id, adjustmentId: adjId });
        continue;
      }
      if (adj.status !== "APPROVED") {
        issues.push({
          rule: "non_approved_in_result",
          entityId: qr.id,
          adjustmentId: adjId,
          status: adj.status,
        });
      }
      if (adj.financialPeriodId !== qr.financialPeriodId) {
        issues.push({
          rule: "period_mismatch",
          entityId: qr.id,
          detail: `QoE Result 기간(${qr.financialPeriodId})이 Adjustment ${adj.id}의 기간(${adj.financialPeriodId})과 다릅니다`,
        });
      }
    }
  }

  // 6) LBO Bridge → QoE Result/Period + 통화 일치
  for (const bridge of lineage.lboBridges) {
    const qr = qoeResultById.get(bridge.qoeResultLineageId);
    if (!qr) {
      issues.push({
        rule: "dangling_qoe_result",
        entityId: bridge.id,
        qoeResultId: bridge.qoeResultLineageId,
      });
    } else if (bridge.provenance.financialPeriodId !== qr.financialPeriodId) {
      issues.push({
        rule: "period_mismatch",
        entityId: bridge.id,
        detail: `LBO Bridge 기간(${bridge.provenance.financialPeriodId})이 연결된 QoE Result ${qr.id}의 기간(${qr.financialPeriodId})과 다릅니다`,
      });
    }
    const period = periodById.get(bridge.provenance.financialPeriodId);
    if (!period) {
      issues.push({
        rule: "dangling_period",
        entityId: bridge.id,
        financialPeriodId: bridge.provenance.financialPeriodId,
      });
    } else if (period.currency !== bridge.provenance.currency) {
      issues.push({
        rule: "currency_mismatch",
        entityId: bridge.id,
        detail: `LBO Bridge 통화(${bridge.provenance.currency})가 기간 통화(${period.currency})와 다릅니다`,
      });
    }
  }

  // 7) Cycle 탐지 — 위에서 확인한 모든 참조 엣지를 그대로 그래프로 만든다.
  const adjacency = new Map<string, string[]>();
  const addEdge = (from: string, to: string) => {
    const arr = adjacency.get(from) ?? [];
    arr.push(to);
    adjacency.set(from, arr);
  };
  lineage.evidence.forEach((e) => addEdge(e.id, e.sourceId));
  lineage.claims.forEach((c) => c.evidenceIds.forEach((evId) => addEdge(c.id, evId)));
  lineage.financialFacts.forEach((f) => {
    f.sourceClaimIds.forEach((cId) => addEdge(f.id, cId));
    f.evidenceIds.forEach((evId) => addEdge(f.id, evId));
  });
  lineage.adjustments.forEach((a) => {
    a.evidenceIds.forEach((evId) => addEdge(a.id, evId));
    a.claimIds.forEach((cId) => addEdge(a.id, cId));
  });
  lineage.qoeResults.forEach((q) => q.approvedAdjustmentIds.forEach((aId) => addEdge(q.id, aId)));
  lineage.lboBridges.forEach((b) => addEdge(b.id, b.qoeResultLineageId));

  const cycle = detectCycle(adjacency);
  if (cycle) {
    issues.push({ rule: "cycle_detected", cycle });
  }

  return issues.length === 0 ? { status: "ok" } : { status: "invalid", issues };
}
