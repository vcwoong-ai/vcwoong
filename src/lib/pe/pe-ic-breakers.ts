/**
 * PE IC Thesis Breakers — 순수 함수(PR #108).
 *
 * thesis breaker는 일반 리스크 목록이 아니다(§6). 정확히 세 가지 실제
 * 소스에서만 만들어진다 — 임의의 "위험 요인" 문구를 생성하지 않는다:
 *
 * 1. DD_FINDING — 아직 열려 있는(CLOSED/REJECTED 아님) CRITICAL/HIGH
 *    finding(dd-types.ts, PR-G, 수정 없음의 실제 데이터).
 * 2. CONTRADICTED_THESIS — pe-ic-thesis.ts가 factConflict와 겹친다고 판정한
 *    thesis item(이미 존재하는 재무 사실 충돌에서 유도, 새 판정 없음).
 * 3. STRUCTURAL_DATA_GAP — "이 조건이 성립하는지 자체를 지금 확인할 방법이
 *    없다"를 정직하게 알리는 항목(§6 고객 집중도 예시 그대로) — 숫자를
 *    추정하지 않는다. buildPEDecisionReadiness()의 COMMERCIAL 도메인이
 *    NOT_STARTED일 때만(즉 고객 매출 데이터 자체가 없을 때만) 생성한다.
 */

import type { PEDDCase, PEDDFinding } from "./dd-types";
import type { PEDecisionReadiness } from "./pe-decision-readiness";
import type { PEThesisItem, PEThesisBreaker, PEThesisBreakerState } from "./pe-ic-decision-types";
import { PE_DD_FINDING_MATERIAL_SEVERITIES, PE_DD_FINDING_OPEN_STATUSES } from "./pe-ic-decision-types";
import { PE_DD_CATEGORY_LABEL, PE_DD_SEVERITY_LABEL, PE_DD_FINDING_STATUS_LABEL } from "./ma-deal-labels";

function findingToBreakerState(status: PEDDFinding["status"]): PEThesisBreakerState {
  if (status === "MITIGATED") return "MITIGATED";
  if (status === "ACCEPTED") return "ACCEPTED";
  return "OPEN"; // DRAFT/IN_REVIEW/CONFIRMED
}

function fromFinding(f: PEDDFinding): PEThesisBreaker {
  const evidenceCount = f.evidenceIds.length + f.claimIds.length;
  return {
    id: `DD_FINDING:${f.id}`,
    sourceType: "DD_FINDING",
    condition: f.title,
    whyItMatters: f.description,
    evidenceIds: f.evidenceIds,
    currentState: findingToBreakerState(f.status),
    decisionImpact: `${PE_DD_CATEGORY_LABEL[f.category]} DD / ${PE_DD_SEVERITY_LABEL[f.severity]} — 현재 상태: ${PE_DD_FINDING_STATUS_LABEL[f.status]}`,
    verificationRequired:
      evidenceCount > 0 ? `연결된 근거 ${evidenceCount}건 재검토` : "근거가 아직 연결되지 않음 — 근거 확보 필요",
  };
}

function fromContradictedThesis(t: PEThesisItem): PEThesisBreaker {
  return {
    id: `CONTRADICTED_THESIS:${t.id}`,
    sourceType: "CONTRADICTED_THESIS",
    condition: t.statement,
    whyItMatters: "이 주장이 가리키는 재무기간에 서로 다른 값이 존재해(factConflict) 지금은 이 주장을 근거로 판단할 수 없음",
    evidenceIds: t.supportingEvidenceIds,
    currentState: "OPEN",
    decisionImpact: "관련 재무 데이터가 모순 상태로 남아있는 한 이 thesis 항목을 신뢰할 수 없음",
    verificationRequired: "상충하는 값들의 원문 출처 대조",
  };
}

const CUSTOMER_CONCENTRATION_GAP: PEThesisBreaker = {
  id: "STRUCTURAL_DATA_GAP:CUSTOMER_CONCENTRATION",
  sourceType: "STRUCTURAL_DATA_GAP",
  condition: "고객 매출 집중도가 임계치를 초과하는가",
  whyItMatters: "상위 고객 이탈 시 매출 영향을 가늠하지 못하면 downside 시나리오를 평가할 수 없음",
  evidenceIds: [],
  currentState: "CANNOT_BE_ESTABLISHED",
  decisionImpact: "고객별 매출 데이터가 없어 현재는 이 조건 자체를 확인할 수 없음(추정하지 않음)",
  verificationRequired: "고객별 매출 데이터(customer-level revenue) 확보",
};

export function buildPEThesisBreakers(
  ddCase: PEDDCase | undefined,
  thesisItems: PEThesisItem[],
  readiness: PEDecisionReadiness
): PEThesisBreaker[] {
  const findingBreakers = (ddCase?.findings ?? [])
    .filter((f) => PE_DD_FINDING_OPEN_STATUSES.includes(f.status) && PE_DD_FINDING_MATERIAL_SEVERITIES.includes(f.severity))
    .map(fromFinding);

  const contradictedBreakers = thesisItems.filter((t) => t.status === "CONTRADICTED").map(fromContradictedThesis);

  const commercialDomain = readiness.domains.find((d) => d.domain === "COMMERCIAL");
  const structuralGaps = commercialDomain?.status === "NOT_STARTED" ? [CUSTOMER_CONCENTRATION_GAP] : [];

  return [...findingBreakers, ...contradictedBreakers, ...structuralGaps];
}
