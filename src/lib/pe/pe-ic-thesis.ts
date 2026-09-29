/**
 * PE IC Thesis — 순수 함수(PR #108).
 *
 * `PEClaim`(evidence-lineage-types.ts, PR-F, 수정 없음)은 "근거로 뒷받침되는
 * 주장"을 표현하도록 이미 설계된 타입이다 — 이 파일은 새 주장 저장소를
 * 만들지 않고 `ddCase.lineage.claims`를 그대로 IC Thesis Item으로 옮긴다.
 * status/materiality는 이미 존재하는 데이터(evidence 연결 여부, evidence의
 * confidence, factConflicts, DD finding severity)에서만 결정론적으로
 * 유도한다 — 새 신뢰도 점수를 만들지 않는다.
 *
 * 지금 이 시점엔 실제 딜에 claim을 만드는 경로가 없다(PR #105 audit과
 * 동일한 이유 — PEDDFinding.claimIds는 항상 빈 배열). 그래서 이 함수는
 * 대부분의 실제 딜에서 빈 배열을 반환한다 — 이것이 정직한 결과다(§4
 * "지어내는 대신 없는 채로 둔다").
 */

import type { PEDDCase } from "./dd-types";
import type { PEDecisionReadiness } from "./pe-decision-readiness";
import type { PEThesisItem, PEThesisStatus, PEThesisMateriality } from "./pe-ic-decision-types";
import { PE_DD_FINDING_MATERIAL_SEVERITIES } from "./pe-ic-decision-types";

const LOW_CONFIDENCE_THRESHOLD = 0.5;

function classifyStatus(
  claim: PEDDCase["lineage"]["claims"][number],
  ddCase: PEDDCase,
  factConflictPeriodIds: Set<string>
): PEThesisStatus {
  if (claim.financialPeriodId && factConflictPeriodIds.has(claim.financialPeriodId)) {
    return "CONTRADICTED";
  }
  if (claim.evidenceIds.length === 0) return "UNSUPPORTED";

  const evidenceById = new Map(ddCase.lineage.evidence.map((e) => [e.id, e]));
  const hasLowConfidence = claim.evidenceIds.some((id) => {
    const ev = evidenceById.get(id);
    return ev?.confidence !== undefined && ev.confidence < LOW_CONFIDENCE_THRESHOLD;
  });
  return hasLowConfidence ? "PARTIALLY_SUPPORTED" : "SUPPORTED";
}

/** 이 claim을 참조하는 DD finding 중 CRITICAL/HIGH가 하나라도 있으면 MATERIAL(§4). */
function classifyMateriality(claimId: string, ddCase: PEDDCase): PEThesisMateriality {
  const referencedByMaterialFinding = ddCase.findings.some(
    (f) => f.claimIds.includes(claimId) && PE_DD_FINDING_MATERIAL_SEVERITIES.includes(f.severity)
  );
  return referencedByMaterialFinding ? "MATERIAL" : "INFORMATIONAL";
}

export function buildPEThesisItems(ddCase: PEDDCase | undefined, readiness: PEDecisionReadiness): PEThesisItem[] {
  if (!ddCase) return [];
  const factConflictPeriodIds = new Set(readiness.factConflicts.map((c) => c.financialPeriodId));

  return ddCase.lineage.claims.map((claim) => ({
    id: claim.id,
    statement: claim.statement,
    status: classifyStatus(claim, ddCase, factConflictPeriodIds),
    materiality: classifyMateriality(claim.id, ddCase),
    supportingEvidenceIds: claim.evidenceIds,
    supportingClaimIds: [claim.id],
    financialPeriodId: claim.financialPeriodId,
  }));
}
