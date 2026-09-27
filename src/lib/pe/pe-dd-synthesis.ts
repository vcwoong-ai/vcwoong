/**
 * PE IC Synthesis(PR-I, hardened in PR-I.1 §34~§40, §60~§61).
 *
 * 투자 추천을 만들지 않는다(§16, §75, §76) — 이 파일의 출력은 항상
 * "정리된 사실/관측/이슈/공백"까지다. buildSynthesisSkeleton()은 AI 없이
 * 결정론적으로 구조화된 데이터로부터 뼈대를 만든다(항상 grounded — 원본
 * 객체에서 그대로 파생하므로 근거 없는 문장이 구조적으로 생길 수 없다).
 *
 * PR-I.1 수정(adversarial review):
 * - Finding #2: `containsUnquotedRecommendationWord`(따옴표 안 내용을
 *   검사에서 제외)를 제거했다 — AI가 스스로 지어낸 인용문
 *   ("Management said: \"BUY this company.\"")으로 필터를 우회할 수
 *   있음이 실증됐다. 이제 pe-ai-safety.ts의 `containsForbiddenRecommendationLanguage`를
 *   그대로 재사용한다(따옴표 여부와 무관하게 검사) — QoE candidate의
 *   reason 필드(pe-fact-extraction.ts)와 동일한 필터를 공유한다(Finding #3).
 * - Finding #1: 근거 ID가 "존재"하는 것과 narrative의 "수치 주장이 그
 *   대상의 실제 값과 일치"하는 것은 다른 문제다(referential vs semantic
 *   grounding). narrative가 구조화된 수치 주장(groundingAssertion)을
 *   담고 있으면, 그 값을 실제 fact/observation과 대조해 불일치하면
 *   거부한다. 임의의 자연어 문장에서 숫자를 정규식으로 뽑아내려 하지
 *   않는다(취약함) — 구조화된 주장만 검증하고, 순수 서술형 문장은
 *   여전히 참조 존재만 확인한다(§18 — "AI narrative가 구조화된 관측과
 *   충돌하면 병합하지 않는다. 평균 내지 않는다. 덮어쓰지 않는다").
 */

import type { PEDDFinancialObservation, PEDDCommercialObservation } from "./dd-metrics-types";
import type { PEDDFinding } from "./dd-types";
import { containsForbiddenRecommendationLanguage } from "./pe-ai-safety";
import type {
  AISynthesisGroundingAssertion,
  PEFactCandidate,
  PEFactConflict,
  PEICSynthesis,
  PESynthesisItem,
  RawAISynthesisNarrative,
} from "./pe-fact-types";

function fmtNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function factText(fact: PEFactCandidate): string {
  const period = fact.fiscalYear !== undefined ? `FY${fact.fiscalYear}${fact.normalizedPeriodType ? ` ${fact.normalizedPeriodType}` : ""}` : "(기간 미상)";
  return `${fact.metric} = ${fmtNumber(fact.value)}${fact.unit ? ` ${fact.unit}` : ""} (${period})`;
}

function financialObservationText(obs: PEDDFinancialObservation): string {
  if (obs.status !== "available") return `${obs.metric}: ${obs.status}${obs.detail ? ` — ${obs.detail}` : ""}`;
  return `${obs.metric} = ${obs.value}`;
}

function commercialObservationText(obs: PEDDCommercialObservation): string {
  if (obs.status !== "available") return `${obs.metric}: ${obs.status}${obs.detail ? ` — ${obs.detail}` : ""}`;
  return `${obs.metric} = ${obs.value}`;
}

function findingText(finding: PEDDFinding): string {
  return `[${finding.category}/${finding.severity}] ${finding.title} — ${finding.description}`;
}

function conflictText(conflict: PEFactConflict): string {
  return `${conflict.metric}(FY${conflict.fiscalYear} ${conflict.periodType})에 서로 다른 source가 다른 값을 보고함(${conflict.conflictType}) — 미해결`;
}

/**
 * AI 없이 구조화된 데이터에서 그대로 뼈대를 만든다. text는 원본 값을
 * 옮긴 템플릿 문자열일 뿐 새 주장을 추가하지 않는다 — evidenceGaps/
 * openQuestions는 여기서는 비워두고(§36 — 실제 "빠진 것"은 문서를 읽은
 * AI만 알 수 있다), mergeAISynthesisNarrative()가 채운다.
 */
export function buildSynthesisSkeleton(input: {
  facts: PEFactCandidate[];
  financialObservations: PEDDFinancialObservation[];
  commercialObservations: PEDDCommercialObservation[];
  findings: PEDDFinding[];
  findingEvidenceIds?: Record<string, string[]>;
  findingClaimIds?: Record<string, string[]>;
  conflicts: PEFactConflict[];
}): PEICSynthesis {
  return {
    keyFacts: input.facts.map((f) => ({
      text: factText(f),
      evidenceIds: f.sourceEvidenceId ? [f.sourceEvidenceId] : [],
      claimIds: [],
      factIds: [f.id],
    })),
    financialObservations: input.financialObservations.map((o) => ({
      text: financialObservationText(o),
      evidenceIds: [],
      claimIds: [],
      factIds: [],
    })),
    commercialObservations: input.commercialObservations.map((o) => ({
      text: commercialObservationText(o),
      evidenceIds: [],
      claimIds: [],
      factIds: [],
    })),
    findings: input.findings.map((f) => ({
      text: findingText(f),
      evidenceIds: input.findingEvidenceIds?.[f.id] ?? f.evidenceIds,
      claimIds: input.findingClaimIds?.[f.id] ?? f.claimIds,
      factIds: [],
    })),
    evidenceGaps: [],
    openQuestions: [],
    conflicts: input.conflicts.map((c) => ({
      text: conflictText(c),
      evidenceIds: [],
      claimIds: [],
      factIds: c.factIds,
    })),
  };
}

// ─────────────────────────────────────────────────────────────
// AI narrative 병합(§35, §39, §60, §76) — grounding 검증 + 투자판단 단어 필터.
// ─────────────────────────────────────────────────────────────

export interface SynthesisGroundingPool {
  evidenceIds: Set<string>;
  claimIds: Set<string>;
  factIds: Set<string>;
  /** PR-I.1 Finding #1 — 구조화된 수치 검증을 위해 실제 값도 함께 받는다.
   * ID 존재 여부뿐 아니라 narrative가 주장하는 값이 실제와 일치하는지까지
   * 검증하려면 이 맵들이 필요하다. 생략하면(레거시 호출) 구조화 grounding
   * 검증은 건너뛰고 기존 참조-존재 검증만 수행한다. */
  factsById?: Map<string, PEFactCandidate>;
  financialObservationsByMetric?: Map<string, PEDDFinancialObservation>;
  commercialObservationsByMetric?: Map<string, PEDDCommercialObservation>;
}

export interface MergeNarrativeReport {
  synthesis: PEICSynthesis;
  accepted: number;
  rejected: Array<{ narrative: RawAISynthesisNarrative; reason: string }>;
}

interface GroundingTarget {
  value: number;
  unit?: string;
  currency?: string;
  fiscalYear?: number;
  periodType?: string;
}

function resolveGroundingTarget(
  assertion: AISynthesisGroundingAssertion,
  pool: SynthesisGroundingPool
): GroundingTarget | null {
  if (assertion.factId) {
    const fact = pool.factsById?.get(assertion.factId);
    if (!fact) return null;
    return {
      value: fact.value,
      unit: fact.unit,
      currency: fact.currency,
      fiscalYear: fact.fiscalYear,
      periodType: fact.normalizedPeriodType,
    };
  }
  if (assertion.observationMetric) {
    const obs =
      pool.financialObservationsByMetric?.get(assertion.observationMetric) ??
      pool.commercialObservationsByMetric?.get(assertion.observationMetric);
    if (!obs || obs.status !== "available" || obs.value === undefined) return null;
    return { value: obs.value };
  }
  return null;
}

/** 구조화된 주장이 실제 대상과 일치하는지 확인한다 — 값은 정확히
 * 일치해야 한다(부동소수 오차만 허용, 임의 근사 없음). unit/currency/
 * 기간은 "주장에 있고 대상에도 있을 때만" 비교한다(관측치처럼 대상이
 * unit/currency를 안 갖는 경우가 있으므로). */
function assertionMatchesTarget(
  assertion: AISynthesisGroundingAssertion,
  target: GroundingTarget
): { ok: true } | { ok: false; reason: string } {
  if (assertion.value !== undefined && Math.abs(assertion.value - target.value) > 1e-9) {
    return { ok: false, reason: `수치 불일치: narrative 주장=${assertion.value}, 실제=${target.value}` };
  }
  if (assertion.unit !== undefined && target.unit !== undefined && assertion.unit !== target.unit) {
    return { ok: false, reason: `unit 불일치: narrative 주장=${assertion.unit}, 실제=${target.unit}` };
  }
  if (assertion.currency !== undefined && target.currency !== undefined && assertion.currency !== target.currency) {
    return { ok: false, reason: `currency 불일치: narrative 주장=${assertion.currency}, 실제=${target.currency}` };
  }
  if (assertion.fiscalYear !== undefined && target.fiscalYear !== undefined && assertion.fiscalYear !== target.fiscalYear) {
    return { ok: false, reason: `기간(fiscalYear) 불일치: narrative 주장=${assertion.fiscalYear}, 실제=${target.fiscalYear}` };
  }
  if (assertion.periodType !== undefined && target.periodType !== undefined && assertion.periodType !== target.periodType) {
    return { ok: false, reason: `기간(periodType) 불일치: narrative 주장=${assertion.periodType}, 실제=${target.periodType}` };
  }
  return { ok: true };
}

/**
 * AI가 제안한 narrative 문장을 검증 후 병합한다. 다음 중 하나라도 걸리면
 * 그 문장은 버린다(synthesis에 포함하지 않음, 절대 병합/평균/덮어쓰기
 * 하지 않는다 — §18):
 *   - evidenceIds/claimIds/factIds가 전혀 없음(근거 없는 주장, §35)
 *   - 참조된 ID 중 하나라도 실제 pool에 존재하지 않음(§39)
 *   - groundingAssertion(구조화된 수치 주장)이 있는데 대상을 찾을 수
 *     없거나, 찾은 대상의 실제 값과 불일치함(Finding #1)
 *   - 투자 추천 단어를 포함(따옴표 여부 무관 — Finding #2)
 */
export function mergeAISynthesisNarrative(
  skeleton: PEICSynthesis,
  narratives: RawAISynthesisNarrative[],
  pool: SynthesisGroundingPool
): MergeNarrativeReport {
  const synthesis: PEICSynthesis = {
    keyFacts: [...skeleton.keyFacts],
    financialObservations: [...skeleton.financialObservations],
    commercialObservations: [...skeleton.commercialObservations],
    findings: [...skeleton.findings],
    evidenceGaps: [...skeleton.evidenceGaps],
    openQuestions: [...skeleton.openQuestions],
    conflicts: [...skeleton.conflicts],
  };

  let accepted = 0;
  const rejected: MergeNarrativeReport["rejected"] = [];

  for (const narrative of narratives) {
    const evidenceIds = narrative.evidenceIds ?? [];
    const claimIds = narrative.claimIds ?? [];
    const factIds = narrative.factIds ?? [];

    if (evidenceIds.length === 0 && claimIds.length === 0 && factIds.length === 0 && !narrative.groundingAssertion) {
      rejected.push({ narrative, reason: "근거 ID(evidenceIds/claimIds/factIds)가 전혀 없음 — grounded되지 않음" });
      continue;
    }
    const danglingEvidence = evidenceIds.filter((id) => !pool.evidenceIds.has(id));
    const danglingClaim = claimIds.filter((id) => !pool.claimIds.has(id));
    const danglingFact = factIds.filter((id) => !pool.factIds.has(id));
    if (danglingEvidence.length > 0 || danglingClaim.length > 0 || danglingFact.length > 0) {
      rejected.push({
        narrative,
        reason: `존재하지 않는 참조: evidence=${danglingEvidence.join(",")} claim=${danglingClaim.join(",")} fact=${danglingFact.join(",")}`,
      });
      continue;
    }
    if (narrative.groundingAssertion) {
      const target = resolveGroundingTarget(narrative.groundingAssertion, pool);
      if (!target) {
        rejected.push({ narrative, reason: "구조화된 grounding 대상을 찾을 수 없습니다(존재하지 않는 factId/observationMetric)" });
        continue;
      }
      const check = assertionMatchesTarget(narrative.groundingAssertion, target);
      if (!check.ok) {
        rejected.push({ narrative, reason: check.reason });
        continue;
      }
    }
    if (containsForbiddenRecommendationLanguage(narrative.text)) {
      rejected.push({ narrative, reason: "투자 추천성 단어가 포함됨(따옴표 여부 무관, §76)" });
      continue;
    }

    const item: PESynthesisItem = { text: narrative.text, evidenceIds, claimIds, factIds };
    synthesis[narrative.section] = [...synthesis[narrative.section], item];
    accepted++;
  }

  return { synthesis, accepted, rejected };
}
