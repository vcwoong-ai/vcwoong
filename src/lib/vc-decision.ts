/**
 * VC Investment Decision Intelligence — 결정적 변환 계층(PR-J).
 *
 * 이 파일은 새 AI 호출도, 새 채점/근거 로직도 만들지 않는다. Phase 3~5가
 * 이미 계산해둔 결과(ScoreEvidenceAssessment, NumericClaim[], IcQuestion[])와
 * ic-review.ts의 기존 선정 함수(selectKeyStrengths/selectKeyRisks/
 * selectUnresolvedEvidence)를 그대로 재사용해 "투자 결정 지도" 형태로
 * 재구성한다. 순수 함수라 네트워크·DB 없이 테스트 가능하다
 * (tools/test-vc-decision-layer.ts).
 *
 * 핵심 경계(요청 §11 그대로): 여기서 재무 수치·시장점유율·CAGR·PoS·MOIC·
 * IRR·희석률·수익률 가정을 지어내지 않는다. 계산 불가능하면 명시적으로
 * NOT_COMPUTABLE을 반환한다.
 */
import { SCORE_DIMENSIONS, type ScoreDimensionKey } from "./deal-scoring-shared";
import {
  DIMENSION_FLAG,
  type ScoreEvidenceAssessment,
  type ScoreConfidence,
  type DecisionImpact,
  type RiskFlag,
} from "./deal-scoring-evidence";
import type { NumericClaim } from "./evidence";
import type { IcQuestion } from "./ic-questions";
import {
  computeInvestmentSignal,
  computeRecommendation,
  selectKeyStrengths,
  selectKeyRisks,
  selectUnresolvedEvidence,
  type KeyStrength,
  type KeyRisk,
} from "./ic-review";
import type {
  VCDecisionDimension,
  VCDecisionImpact,
  VCEvidenceState,
  VCInvestmentDecision,
  VCInvestmentDriver,
  VCMissingInformation,
  VCPriority,
  VCThesisBreaker,
  VCValuationCase,
  VCValuationLineItem,
} from "./vc-decision-types";

function dimensionLabel(dim: ScoreDimensionKey): string {
  return SCORE_DIMENSIONS.find((d) => d.key === dim)?.label ?? dim;
}

// ── 1. Evidence state / decision impact 매핑 ────────────────────────────
// 점수(score)·confidence 계산 자체는 절대 바꾸지 않는다 — 여기서는 이미
// 계산된 confidence/decisionImpact를 표시용 상위 개념으로 옮기기만 한다.

export function mapConfidenceToEvidenceState(confidence: ScoreConfidence): VCEvidenceState {
  switch (confidence) {
    case "HIGH":
      return "VERIFIED";
    case "MEDIUM":
      return "PARTIALLY_VERIFIED";
    case "LOW":
      return "UNVERIFIED";
    case "UNSUPPORTED":
      return "UNVERIFIED";
    case "NO_EVIDENCE":
      return "MISSING";
  }
}

export function mapDecisionImpactToVC(
  impact: DecisionImpact,
  confidence: ScoreConfidence
): VCDecisionImpact {
  const noEvidence = confidence === "NO_EVIDENCE" || confidence === "UNSUPPORTED";
  if (impact === "HIGH" && noEvidence) return "CRITICAL";
  return impact;
}

// ── 2. Contradiction 탐지 ────────────────────────────────────────────────
// claimKey는 값 자체를 포함해 유일하므로(evidence.ts) "같은 사실을 가리키는
// 서로 다른 값"을 찾는 데는 쓸 수 없다 — 대신 (정규화한 label, unit)로
// 묶어, 실제로 매칭된(=UNSUPPORTED가 아닌) claim들 사이에 서로 다른 값이
// 2개 이상 있으면 상충으로 본다. 하나를 조용히 고르지 않는다.

export interface ContradictionGroup {
  label: string;
  unit: string;
  claims: NumericClaim[];
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

export function detectContradictions(claims: NumericClaim[]): ContradictionGroup[] {
  const groups = new Map<string, NumericClaim[]>();
  for (const c of claims) {
    if (c.claimType !== "numeric") continue;
    if (c.confidence === "UNSUPPORTED") continue; // 근거를 못 찾은 건 "상충"이 아니라 "미확인"
    if (!c.label) continue;
    const key = `${normalizeLabel(c.label)}|${c.unit}`;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }
  const contradictions: ContradictionGroup[] = [];
  Array.from(groups.entries()).forEach(([key, group]) => {
    const distinctValues = new Set(group.map((c) => c.value));
    if (distinctValues.size >= 2) {
      const [label, unit] = key.split("|");
      contradictions.push({ label, unit, claims: group });
    }
  });
  return contradictions;
}

function contradictionForDimension(
  dimClaims: NumericClaim[],
  contradictions: ContradictionGroup[]
): ContradictionGroup | undefined {
  const dimKeys = new Set(dimClaims.map((c) => `${normalizeLabel(c.label)}|${c.unit}`));
  return contradictions.find((g) => dimKeys.has(`${normalizeLabel(g.label)}|${g.unit}`));
}

// ── 3. Decision Dimensions ───────────────────────────────────────────────

export function buildDecisionDimensions(
  assessment: ScoreEvidenceAssessment | null | undefined,
  claims: NumericClaim[] | null | undefined
): VCDecisionDimension[] {
  if (!assessment) return [];
  const allClaims = claims ?? [];
  const contradictions = detectContradictions(allClaims);

  return SCORE_DIMENSIONS.map(({ key }) => {
    const dim = assessment.dimensions[key];
    if (!dim) {
      return {
        dimension: key,
        label: dimensionLabel(key),
        state: "MISSING" as VCEvidenceState,
        decisionImpact: "MEDIUM" as VCDecisionImpact,
        positiveDrivers: [],
        negativeDrivers: [],
        missingInfoCount: 0,
      };
    }
    // 이 차원에 매핑된 claim만 상충 탐지 대상으로 좁힌다(전체 claim이 아니라).
    const dimClaims = allClaims.filter(
      (c) => c.claimType === "numeric" && dim.keyEvidence.some((k) => k.raw === c.raw)
    );
    const contradiction = contradictionForDimension(dimClaims, contradictions);
    const state = contradiction ? "CONTRADICTED" : mapConfidenceToEvidenceState(dim.confidence);

    return {
      dimension: key,
      label: dimensionLabel(key),
      state,
      decisionImpact: mapDecisionImpactToVC(dim.decisionImpact, dim.confidence),
      positiveDrivers: dim.keyEvidence
        .filter((e) => e.confidence === "HIGH" || e.confidence === "MEDIUM")
        .map((e) => e.raw),
      negativeDrivers: dim.unsupportedClaims.map((c) => c.raw),
      missingInfoCount: dim.unsupportedClaims.length,
      ...(contradiction
        ? {
            contradiction: {
              valueA: `${contradiction.claims[0].value}${contradiction.claims[0].unit}`,
              valueB: `${contradiction.claims[1].value}${contradiction.claims[1].unit}`,
              sourceA: contradiction.claims[0].source?.documentName,
              sourceB: contradiction.claims[1].source?.documentName,
            },
          }
        : {}),
    };
  });
}

// ── 4. Investment Drivers (from KeyStrength) ────────────────────────────

const MAX_DRIVERS = 5;

export function buildInvestmentDrivers(
  assessment: ScoreEvidenceAssessment | null | undefined,
  rationale: Partial<Record<ScoreDimensionKey, string>> | undefined,
  max = MAX_DRIVERS
): VCInvestmentDriver[] {
  if (!assessment) return [];
  const strengths: KeyStrength[] = selectKeyStrengths(assessment, rationale, max);
  return strengths.map((s) => {
    const dim = assessment.dimensions[s.dimension];
    const evidenceState = mapConfidenceToEvidenceState(s.confidence);
    return {
      id: `driver:${s.dimension}`,
      dimension: s.dimension,
      title: `${s.label} — ${s.score}점`,
      description: s.rationale || `${s.label} 평가가 상대적으로 높습니다.`,
      whyItMatters: s.rationale || `${s.label}이(가) 투자 매력도의 핵심 축 중 하나로 평가됩니다.`,
      evidenceState,
      evidence: dim.keyEvidence.map((e) => ({
        raw: e.raw,
        documentName: e.documentName,
        location: e.location,
      })),
      whatCouldInvalidate:
        dim.unsupportedClaims[0]?.raw
          ? `"${dim.unsupportedClaims[0].raw}"가 사실과 다르거나 재현되지 않으면 이 강점의 근거가 약해집니다.`
          : dim.uncertaintyNote || "현재 근거 범위를 벗어나는 반증 자료가 나오면 재평가가 필요합니다.",
      verificationRequirement:
        evidenceState === "VERIFIED"
          ? "추가 검증 없이 IC 상정 가능(근거 확인됨)"
          : "원문 자료(계약서·실측 데이터 등) 재확인 필요",
      decisionImpact: mapDecisionImpactToVC(s.decisionImpact ?? dim.decisionImpact, s.confidence),
    };
  });
}

// ── 5. Thesis Breakers (from KeyRisk) ───────────────────────────────────

const MAX_THESIS_BREAKERS = 5;

function findIcQuestionForRisk(
  risk: KeyRisk,
  questions: IcQuestion[] | null | undefined
): IcQuestion | undefined {
  if (!questions) return undefined;
  if (risk.dimension) {
    const match = questions.find((q) => q.relatedDimension === risk.dimension);
    if (match) return match;
  }
  if (risk.trigger === "VALUATION_EVIDENCE_GAP") {
    return questions.find((q) => q.trigger === "VALUATION_EVIDENCE_GAP");
  }
  return undefined;
}

export function buildThesisBreakers(
  assessment: ScoreEvidenceAssessment | null | undefined,
  rationale: Partial<Record<ScoreDimensionKey, string>> | undefined,
  questions: IcQuestion[] | null | undefined,
  max = MAX_THESIS_BREAKERS
): VCThesisBreaker[] {
  if (!assessment) return [];
  const risks: KeyRisk[] = selectKeyRisks(assessment, rationale, max);
  return risks.map((r) => {
    const dim = r.dimension ? assessment.dimensions[r.dimension] : undefined;
    const evidenceState: VCEvidenceState = dim
      ? mapConfidenceToEvidenceState(dim.confidence)
      : "UNVERIFIED"; // 밸류에이션처럼 차원이 없는 리스크는 evidence.ts 근거 자체가 unverified라 이 상태다
    return {
      id: `breaker:${r.trigger}:${r.dimension ?? "none"}`,
      trigger: r.trigger,
      dimension: r.dimension,
      title: r.label,
      whyItMatters: r.detail,
      evidenceState,
      evidence: dim
        ? dim.unsupportedClaims.map((c) => ({ raw: c.raw }))
        : [],
      probability: "NOT_ASSESSED",
      decisionImpact: dim
        ? mapDecisionImpactToVC(r.decisionImpact ?? dim.decisionImpact, dim.confidence)
        : "HIGH",
      verificationRequirement: "원문 자료로 직접 재확인 필요(추정치로 대체 불가)",
      icQuestion: findIcQuestionForRisk(r, questions),
    };
  });
}

// ── 6. Missing Information (first-class output) ─────────────────────────

const MAX_MISSING_INFO = 8;

const P0_FLAGS: RiskFlag[] = ["UNSUPPORTED_KEY_CLAIM", "HIGH_SCORE_LOW_EVIDENCE"];
const P1_FLAGS: RiskFlag[] = [
  "VALUATION_EVIDENCE_GAP",
  "MARKET_EVIDENCE_GAP",
  "TEAM_EVIDENCE_GAP",
  "PRODUCT_EVIDENCE_GAP",
  "BUSINESS_MODEL_EVIDENCE_GAP",
  "FINANCIALS_EVIDENCE_GAP",
  "MOAT_EVIDENCE_GAP",
];

function priorityForFlag(flag: RiskFlag): VCPriority {
  if (P0_FLAGS.includes(flag)) return "P0";
  if (P1_FLAGS.includes(flag)) return "P1";
  return "P2";
}

const PRIORITY_RANK: Record<VCPriority, number> = { P0: 3, P1: 2, P2: 1 };

export function buildMissingInformation(
  assessment: ScoreEvidenceAssessment | null | undefined,
  claims: NumericClaim[] | null | undefined,
  questions: IcQuestion[] | null | undefined,
  max = MAX_MISSING_INFO
): VCMissingInformation[] {
  if (!assessment) return [];

  const items: VCMissingInformation[] = [];

  // (a) 근거 공백 risk flag 자체를 미해결 정보로 승격한다.
  for (const flag of assessment.riskFlags) {
    if (flag === "VALUATION_EVIDENCE_GAP") {
      items.push({
        id: `missing:${flag}`,
        priority: priorityForFlag(flag),
        item: "밸류에이션 산정 근거(비교기업·가정)",
        whyItMatters: "밸류에이션은 투자조건의 핵심이지만 관련 주장의 근거가 자료에서 확인되지 않았습니다.",
        decisionImpact: "HIGH",
        requiredEvidence: "비교기업 선정 기준, 적용 배수, 산정 근거 문서",
        icQuestion: questions?.find((q) => q.trigger === "VALUATION_EVIDENCE_GAP"),
      });
      continue;
    }
    // UNSUPPORTED_KEY_CLAIM/HIGH_SCORE_LOW_EVIDENCE는 특정 차원 전용 flag가
    // 아니라 여러 차원에 걸쳐 발생할 수 있는 신호다(ic-review.ts의
    // selectKeyRisks와 동일한 탐색 방식을 그대로 재사용 — DIMENSION_FLAG
    // 역매핑은 차원 전용 *_EVIDENCE_GAP 6종에만 해당한다).
    const dims = Object.values(assessment.dimensions);
    let dim = null as (typeof dims)[number] | null;
    if (flag === "UNSUPPORTED_KEY_CLAIM") {
      dim = dims.find((d) => d.unsupportedClaims.length > 0) ?? null;
    } else if (flag === "HIGH_SCORE_LOW_EVIDENCE") {
      dim =
        dims.find(
          (d) =>
            d.score >= 70 &&
            (d.confidence === "LOW" || d.confidence === "UNSUPPORTED" || d.confidence === "NO_EVIDENCE")
        ) ?? null;
    } else {
      dim = dims.find((d) => DIMENSION_FLAG[d.dimension] === flag) ?? null;
    }
    if (!dim) continue;
    items.push({
      id: `missing:${flag}:${dim.dimension}`,
      priority: priorityForFlag(flag),
      item:
        flag === "UNSUPPORTED_KEY_CLAIM" && dim.unsupportedClaims[0]
          ? dim.unsupportedClaims[0].raw
          : `${dimensionLabel(dim.dimension)} 평가를 뒷받침하는 근거`,
      whyItMatters: dim.uncertaintyNote || `${dimensionLabel(dim.dimension)} 점수(${dim.score}점)의 근거 확인이 필요합니다.`,
      decisionImpact: mapDecisionImpactToVC(dim.decisionImpact, dim.confidence),
      requiredEvidence: "관련 계약서·실측 데이터·고객 자료 등 1차 근거",
      relatedDimension: dim.dimension,
      icQuestion: questions?.find((q) => q.relatedDimension === dim!.dimension),
    });
  }

  // (b) 개별 unresolved claim(문서 어디에도 없는 주장)도 놓치지 않는다.
  const unresolved = selectUnresolvedEvidence(claims, questions, max);
  for (const u of unresolved) {
    items.push({
      id: `missing:unresolved:${u.claim.slice(0, 40)}`,
      priority: "P1",
      item: u.claim,
      whyItMatters: "보고서에 사용된 주장이지만 업로드 자료 어디에서도 확인되지 않았습니다.",
      decisionImpact: "MEDIUM",
      requiredEvidence: "해당 주장의 1차 출처 문서",
      icQuestion: questions?.find((q) => q.relatedClaim === u.claim),
    });
  }

  const deduped = items.filter((it, i) => items.findIndex((o) => o.id === it.id) === i);
  deduped.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
  return deduped.slice(0, max);
}

// ── 7. Valuation & Return ────────────────────────────────────────────────

export function buildValuationCase(
  deal: { investAmount?: number | null; valuation?: number | null },
  riskFlags: RiskFlag[]
): VCValuationCase {
  const facts = {
    investAmount: deal.investAmount ?? undefined,
    valuation: deal.valuation ?? undefined,
  };
  const lineItems: VCValuationLineItem[] = [];

  if (facts.investAmount != null && facts.valuation != null && facts.valuation > 0) {
    const ownershipPct = (facts.investAmount / facts.valuation) * 100;
    lineItems.push({
      status: "computed",
      label: "예상 지분율(Post-money 기준, 투자금액/포스트밸류)",
      value: `${ownershipPct.toFixed(2)}%`,
    });
  } else {
    lineItems.push({
      status: "not_computable",
      label: "예상 지분율",
      reason: "투자금액 또는 포스트밸류가 입력되지 않았습니다.",
      requiredInput: "투자금액(억원), Post-money 밸류에이션(억원)",
    });
  }

  // MOIC/IRR: 현재 Deal 모델에는 exit 밸류에이션·회수 시점 가정 필드가 없다
  // (schema.prisma 감사 결과) — 없는 가정을 지어내지 않고 명시적으로
  // NOT_COMPUTABLE로 남긴다(§16 그대로).
  lineItems.push({
    status: "not_computable",
    label: "MOIC",
    reason: "Exit 밸류에이션·회수 시점 가정이 시스템에 없습니다.",
    requiredInput: "Exit 밸류에이션 가정, 회수 시점, 추가 희석 가정",
  });
  lineItems.push({
    status: "not_computable",
    label: "IRR",
    reason: "Exit 밸류에이션·회수 시점 가정이 시스템에 없습니다.",
    requiredInput: "Exit 밸류에이션 가정, 회수 시점, 현금흐름 스케줄",
  });

  const evidenceState: VCEvidenceState = riskFlags.includes("VALUATION_EVIDENCE_GAP")
    ? "UNVERIFIED"
    : facts.investAmount != null && facts.valuation != null
      ? "PARTIALLY_VERIFIED" // 사용자가 직접 입력한 값(deal_input)이라 "완전 검증"까지는 아님
      : "MISSING";

  return { facts, lineItems, evidenceState };
}

// ── 8. Investment Thesis (결정적 템플릿 — AI 자유 서술 아님) ─────────────

export function synthesizeInvestmentThesis(
  drivers: VCInvestmentDriver[],
  breakers: VCThesisBreaker[],
  missingInformation: VCMissingInformation[]
): string {
  const p0Count = missingInformation.filter((m) => m.priority === "P0").length;
  const driverTitles = drivers.slice(0, 3).map((d) => d.title.split(" — ")[0]);
  const breakerTitles = breakers.slice(0, 3).map((b) => b.title);

  const parts: string[] = [];
  if (driverTitles.length > 0) {
    parts.push(`투자 논지는 ${driverTitles.join(", ")}에 근거합니다.`);
  } else {
    parts.push("현재 근거 기반의 명확한 투자 논지 축을 찾지 못했습니다 — 추가 자료가 필요합니다.");
  }
  if (breakerTitles.length > 0) {
    parts.push(`이 논지를 흔들 수 있는 요인은 ${breakerTitles.join(", ")}입니다.`);
  }
  if (p0Count > 0) {
    parts.push(`현재 ${p0Count}건의 결정-차단(P0) 정보 공백이 있어, 해소 전에는 최종 판단을 내리기 어렵습니다.`);
  } else {
    parts.push("결정을 차단하는(P0) 정보 공백은 현재 없습니다.");
  }
  return parts.join(" ");
}

// ── 9. Investment Decision (전체 조립) ───────────────────────────────────

export function buildInvestmentDecision(
  overall: number,
  assessment: ScoreEvidenceAssessment | null | undefined,
  rationale: Partial<Record<ScoreDimensionKey, string>> | undefined,
  claims: NumericClaim[] | null | undefined,
  questions: IcQuestion[] | null | undefined,
  deal: { investAmount?: number | null; valuation?: number | null }
): VCInvestmentDecision {
  const overallConfidence: ScoreConfidence = assessment?.overallConfidence ?? "NO_EVIDENCE";
  const signal = computeInvestmentSignal(overall, overallConfidence);
  const recommendation = computeRecommendation(signal, assessment?.riskFlags ?? []);

  const decisionDimensions = buildDecisionDimensions(assessment, claims);
  const drivers = buildInvestmentDrivers(assessment, rationale);
  const thesisBreakers = buildThesisBreakers(assessment, rationale, questions);
  const missingInformation = buildMissingInformation(assessment, claims, questions);
  const valuation = buildValuationCase(deal, assessment?.riskFlags ?? []);
  const thesis = synthesizeInvestmentThesis(drivers, thesisBreakers, missingInformation);

  return {
    signal,
    recommendation,
    thesis,
    confidence: mapConfidenceToEvidenceState(overallConfidence),
    decisionDimensions,
    drivers,
    thesisBreakers,
    missingInformation,
    valuation,
  };
}
