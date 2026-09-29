/**
 * IC Questions — 순수 뷰 모델(PR #107).
 *
 * 새로운 텍스트 생성이나 AI 호출이 아니다. `buildPEDecisionReadiness()`
 * (pe-decision-readiness.ts, PR #103, 수정 없음)가 이미 계산한
 * blockers/missingInformation/factConflicts와, PR #105가 이미 영속화한
 * `PEDDCase.findings`를 결정론적 템플릿에 그대로 대입해 "IC가 확인해야
 * 할 질문" 목록으로 옮겨 담을 뿐이다.
 *
 * 모든 질문은 정확히 하나의 실제 소스(blocker code / missingInformation
 * code / factConflict / 실제 DD finding id)에서 나온다 — 임의의 일반
 * 질문을 만들지 않는다(§13 "generic AI question 금지"). 현재 데이터로
 * 안전하게 구체적 질문을 만들 수 없으면(예: severity/evidence가 없는
 * finding) 그 항목 자체를 건너뛴다 — 지어내는 대신 없는 채로 둔다.
 */

import type {
  PEDecisionReadiness,
  PEBlockingCondition,
  PEMissingInformationItem,
  PEFinancialFactConflict,
} from "./pe-decision-readiness";
import type { PEDDCase, PEDDFinding } from "./dd-types";
import { PE_DECISION_DOMAIN_LABEL, PE_DD_CATEGORY_LABEL, PE_DD_SEVERITY_LABEL, PE_DD_FINDING_STATUS_LABEL } from "./ma-deal-labels";

export type ICQuestionSourceType = "BLOCKER" | "FACT_CONFLICT" | "MISSING_INFO" | "DD_FINDING";

export interface ICQuestion {
  /** blocker/missingInformation code, factConflict 조합, 또는 DD finding id — 추적용 유일 키 */
  code: string;
  sourceType: ICQuestionSourceType;
  domainLabel: string;
  question: string;
  whyItMatters: string;
  requiredEvidence: string;
  decisionImpact: string;
}

function fromBlocker(b: PEBlockingCondition): ICQuestion {
  return {
    code: b.code,
    sourceType: "BLOCKER",
    domainLabel: PE_DECISION_DOMAIN_LABEL[b.domain],
    question: `${b.label} 문제를 해소하지 않고 ${PE_DECISION_DOMAIN_LABEL[b.domain]} 분석 결과를 신뢰해도 되는가?`,
    whyItMatters: b.detail,
    requiredEvidence: "모순/오류를 해소할 원본 근거 또는 정정된 입력",
    decisionImpact: `${PE_DECISION_DOMAIN_LABEL[b.domain]} readiness가 BLOCKED로 유지됨`,
  };
}

function fromFactConflict(c: PEFinancialFactConflict): ICQuestion {
  const values = c.conflictingValues.map((v) => v.value.toLocaleString()).join(" vs ");
  return {
    code: `FACT_CONFLICT:${c.financialPeriodId}:${c.metric}:${c.currency}`,
    sourceType: "FACT_CONFLICT",
    domainLabel: PE_DECISION_DOMAIN_LABEL.FINANCIAL,
    question: `${c.metric}(${c.currency})에 서로 다른 값(${values})이 존재한다 — 어느 값이 맞는가?`,
    whyItMatters: "같은 재무기간에 동일 계정의 값이 상충해 하위 QoE/LBO 분석을 신뢰할 수 없음",
    requiredEvidence: "각 값의 원문 출처 문서/근거 대조",
    decisionImpact: "FINANCIAL/QOE/LBO readiness가 BLOCKED로 유지됨",
  };
}

function fromMissingInfo(m: PEMissingInformationItem): ICQuestion {
  return {
    code: m.code,
    sourceType: "MISSING_INFO",
    domainLabel: PE_DECISION_DOMAIN_LABEL[m.domain],
    question: `${m.label}은(는) 언제, 어떤 방식으로 확보할 수 있는가?`,
    whyItMatters: m.reason,
    requiredEvidence: `${m.label} 관련 자료/입력`,
    decisionImpact:
      m.blocks.length > 0
        ? `${m.blocks.join(", ")} readiness를 막고 있음`
        : `${PE_DECISION_DOMAIN_LABEL[m.domain]} 판단에 참고 정보로 필요(차단 아님)`,
  };
}

/** CLOSED/REJECTED는 이미 결론이 난 상태라 IC 질문으로 만들지 않는다(§10 —
 * lifecycle을 자동으로 재해석하지 않음). 나머지 상태(DRAFT/IN_REVIEW/
 * CONFIRMED/MITIGATED/ACCEPTED)는 아직 IC가 확인할 여지가 있는 실제
 * finding이다. */
const OPEN_FINDING_STATUSES = new Set(["DRAFT", "IN_REVIEW", "CONFIRMED", "MITIGATED", "ACCEPTED"]);

function fromFinding(f: PEDDFinding): ICQuestion | null {
  if (!OPEN_FINDING_STATUSES.has(f.status)) return null;
  const evidenceCount = f.evidenceIds.length + f.claimIds.length;
  return {
    code: `DD_FINDING:${f.id}`,
    sourceType: "DD_FINDING",
    domainLabel: PE_DD_CATEGORY_LABEL[f.category],
    question: `"${f.title}"(${PE_DD_SEVERITY_LABEL[f.severity]}, ${PE_DD_FINDING_STATUS_LABEL[f.status]}) — 해결 방안 또는 다음 조치는 무엇인가?`,
    whyItMatters: f.description,
    requiredEvidence:
      evidenceCount > 0 ? `연결된 근거 ${evidenceCount}건 검토` : "아직 근거가 연결되지 않음 — 근거 확보 필요",
    decisionImpact: `DD readiness / ${PE_DD_CATEGORY_LABEL[f.category]} 영역`,
  };
}

/**
 * 우선순위: 모순(BLOCKED 원인) → 재무 사실 충돌 → 중요 누락 정보 →
 * 열려 있는 DD finding → 정보성 누락 정보. 각 그룹 내부는 이미 엔진이
 * 반환한 순서(code 기준 안정 정렬)를 그대로 따른다.
 */
export function buildICQuestions(readiness: PEDecisionReadiness, ddCase?: PEDDCase): ICQuestion[] {
  const material = readiness.missingInformation.filter((m) => m.severity === "MATERIAL");
  const informational = readiness.missingInformation.filter((m) => m.severity === "INFORMATIONAL");
  const findingQuestions = (ddCase?.findings ?? [])
    .map(fromFinding)
    .filter((q): q is ICQuestion => q !== null);

  return [
    ...readiness.blockers.map(fromBlocker),
    ...readiness.factConflicts.map(fromFactConflict),
    ...material.map(fromMissingInfo),
    ...findingQuestions,
    ...informational.map(fromMissingInfo),
  ];
}
