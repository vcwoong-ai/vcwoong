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
import type { PEThesisItem, PEICQuestionPriority, ICQuestion, ICQuestionSourceType } from "./pe-ic-decision-types";

// PR #108 — 타입 자체는 pe-ic-decision-types.ts에 있다(순환 참조 회피 —
// 그 파일의 PEThesisItem을 이 파일이 입력으로 쓰므로). 기존
// `@/lib/pe/pe-ic-questions`에서 이 이름들을 그대로 import해온 컴포넌트가
// 깨지지 않도록 여기서 재수출한다.
export type { ICQuestion, ICQuestionSourceType };

function fromBlocker(b: PEBlockingCondition): ICQuestion {
  return {
    code: b.code,
    sourceType: "BLOCKER",
    domainLabel: PE_DECISION_DOMAIN_LABEL[b.domain],
    priority: "P0",
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
    priority: "P0",
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
    priority: m.severity === "MATERIAL" ? "P1" : "P2",
    question: `${m.label}은(는) 언제, 어떤 방식으로 확보할 수 있는가?`,
    whyItMatters: m.reason,
    requiredEvidence: `${m.label} 관련 자료/입력`,
    decisionImpact:
      m.blocks.length > 0
        ? `${m.blocks.join(", ")} readiness를 막고 있음`
        : `${PE_DECISION_DOMAIN_LABEL[m.domain]} 판단에 참고 정보로 필요(차단 아님)`,
  };
}

/** severity에서만 우선순위를 유도한다(§7) — 새 위험도 판정이 아니다. */
function findingPriority(severity: PEDDFinding["severity"]): PEICQuestionPriority {
  if (severity === "CRITICAL") return "P0";
  if (severity === "HIGH") return "P1";
  return "P2";
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
    priority: findingPriority(f.severity),
    question: `"${f.title}"(${PE_DD_SEVERITY_LABEL[f.severity]}, ${PE_DD_FINDING_STATUS_LABEL[f.status]}) — 해결 방안 또는 다음 조치는 무엇인가?`,
    whyItMatters: f.description,
    requiredEvidence:
      evidenceCount > 0 ? `연결된 근거 ${evidenceCount}건 검토` : "아직 근거가 연결되지 않음 — 근거 확보 필요",
    decisionImpact: `DD readiness / ${PE_DD_CATEGORY_LABEL[f.category]} 영역`,
  };
}

/** UNSUPPORTED이면서 MATERIAL인 thesis item만 질문화한다(§7 소스 8 —
 * "중요한 근거 없는 thesis 주장") — INFORMATIONAL이거나 이미 근거가 있는
 * 주장은 질문을 만들 필요가 없다. */
function fromUnsupportedThesis(t: PEThesisItem): ICQuestion {
  return {
    code: `UNSUPPORTED_THESIS:${t.id}`,
    sourceType: "UNSUPPORTED_THESIS",
    domainLabel: "Thesis",
    priority: "P1",
    question: `"${t.statement}" — 이 주장을 뒷받침할 근거는 무엇인가?`,
    whyItMatters: "근거 없는 중요 주장은 investment driver로 승격되지 않음(§5)",
    requiredEvidence: "이 주장을 뒷받침할 문서/데이터",
    decisionImpact: "근거가 확보되기 전까지 이 주장은 thesis driver에 포함되지 않음",
  };
}

const PRIORITY_RANK: Record<PEICQuestionPriority, number> = { P0: 0, P1: 1, P2: 2 };

/**
 * 소스별로 먼저 모은 뒤, priority(P0→P1→P2)로 안정 정렬한다(§7). 각 소스
 * 내부 순서(안정 정렬이므로)와 그룹 순서(모순→재무 충돌→누락 정보→
 * DD finding→미지지 thesis)는 이전 순서를 그대로 보존한다 — 동일
 * priority 안에서는 항상 같은 상대 순서를 유지한다(결정론).
 */
export function buildICQuestions(
  readiness: PEDecisionReadiness,
  ddCase?: PEDDCase,
  thesisItems: PEThesisItem[] = []
): ICQuestion[] {
  const material = readiness.missingInformation.filter((m) => m.severity === "MATERIAL");
  const informational = readiness.missingInformation.filter((m) => m.severity === "INFORMATIONAL");
  const findingQuestions = (ddCase?.findings ?? [])
    .map(fromFinding)
    .filter((q): q is ICQuestion => q !== null);
  const unsupportedThesisQuestions = thesisItems
    .filter((t) => t.status === "UNSUPPORTED" && t.materiality === "MATERIAL")
    .map(fromUnsupportedThesis);

  const all = [
    ...readiness.blockers.map(fromBlocker),
    ...readiness.factConflicts.map(fromFactConflict),
    ...material.map(fromMissingInfo),
    ...findingQuestions,
    ...unsupportedThesisQuestions,
    ...informational.map(fromMissingInfo),
  ];

  return all
    .map((q, index) => ({ q, index }))
    .sort((a, b) => PRIORITY_RANK[a.q.priority] - PRIORITY_RANK[b.q.priority] || a.index - b.index)
    .map(({ q }) => q);
}
