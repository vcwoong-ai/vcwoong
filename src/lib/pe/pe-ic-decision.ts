/**
 * PE IC Decision Assembler — 순수 함수(PR #108).
 *
 * 이 파일은 아무것도 계산하지 않는다. `buildPEDecisionReadiness()`(PR #103)/
 * `computeQoESummary()`/`computeLboEntryEbitda()`/`computeFinancialQuality()`
 * (ma-deal-dashboard.ts, PR #102/#104, 수정 없음)가 이미 만든 값과,
 * `buildPEThesisItems()`/`buildPEInvestmentDrivers()`/`buildPEThesisBreakers()`
 * /`buildICQuestions()`(전부 이 PR 안의 다른 순수 함수)가 만든 값을
 * `PEICDecision` 모양으로 한 번만 조립한다.
 *
 * BUY/PASS/투자 점수는 어디에도 없다 — `processState`는 readiness 엔진의
 * `overall` 값을 IC 프로세스 어휘로 그대로 옮긴 것뿐이다(재판정 없음,
 * pe-ic-decision-types.ts 상단 주석 참고).
 */

import type { PEDDCase } from "./dd-types";
import type { PEDecisionReadiness } from "./pe-decision-readiness";
import type { QoESummaryView, DartStatusView, FinancialQualityView, computeLboEntryEbitda } from "./ma-deal-dashboard";
import { buildPEThesisItems } from "./pe-ic-thesis";
import { buildPEInvestmentDrivers } from "./pe-ic-drivers";
import { buildPEThesisBreakers } from "./pe-ic-breakers";
import { buildICQuestions } from "./pe-ic-questions";
import type {
  PEICDecision,
  PEICProcessState,
  PEICFinancialSnapshot,
  PEICQoESnapshot,
  PEICLboSnapshot,
  PEICDdSnapshot,
  PEICEvidenceSnapshot,
  ICQuestion,
} from "./pe-ic-decision-types";
import { PE_DD_FINDING_MATERIAL_SEVERITIES } from "./pe-ic-decision-types";
import { PE_DECISION_DOMAIN_LABEL } from "./ma-deal-labels";

type LboEntryEbitdaResult = ReturnType<typeof computeLboEntryEbitda>;

export interface PEICDecisionInput {
  dealId: string;
  readiness: PEDecisionReadiness;
  financialQuality: FinancialQualityView;
  qoeSummary: QoESummaryView | null;
  lboEntryEbitda: LboEntryEbitdaResult;
  dartStatus: DartStatusView;
  ddCase?: PEDDCase;
  /** LBO 탭 가정 — 세션 로컬 state일 뿐 영속화되지 않는다(lbo-simulator-panel.tsx
   * 참고). 서버 조립 시점엔 항상 undefined다 — 지어내지 않고 명시적으로 그렇게 둔다. */
  lboAssumptionKeysProvided?: string[];
}

const PROCESS_STATE_BY_READINESS: Record<PEDecisionReadiness["overall"], PEICProcessState> = {
  READY: "READY_FOR_IC",
  PARTIAL: "PARTIALLY_READY",
  MISSING: "NOT_READY",
  NOT_STARTED: "NOT_READY",
  BLOCKED: "BLOCKED",
};

const REQUIRED_LBO_ASSUMPTION_LABELS: Record<string, string> = {
  entryMultiple: "인수 배수",
  debtToEbitda: "레버리지",
  interestRate: "이자율",
  ebitdaGrowthRate: "EBITDA 성장률",
  fcfConversionRate: "FCF 전환율",
  cashSweepRate: "캐시 스윕 비율",
  exitMultiple: "Exit 배수",
  holdPeriodYears: "보유 기간",
};

/** readiness.domains/blockers에서 실제로 존재하는 이유만 골라 3~5개로
 * 압축한다(§8) — 템플릿 조합일 뿐 새 문장을 생성하지 않는다. */
function buildProcessStateReasons(readiness: PEDecisionReadiness): string[] {
  const reasons: string[] = [readiness.summary];

  if (readiness.overall === "BLOCKED") {
    for (const b of readiness.blockers) {
      reasons.push(`[${PE_DECISION_DOMAIN_LABEL[b.domain]}] ${b.label}: ${b.detail}`);
      if (reasons.length >= 5) break;
    }
  } else if (readiness.overall === "PARTIAL" || readiness.overall === "MISSING") {
    const material = readiness.missingInformation.filter((m) => m.severity === "MATERIAL");
    for (const m of material) {
      reasons.push(`[${PE_DECISION_DOMAIN_LABEL[m.domain]}] ${m.reason}`);
      if (reasons.length >= 5) break;
    }
  } else if (readiness.overall === "READY") {
    for (const d of readiness.domains.filter((d) => d.status === "READY")) {
      reasons.push(`[${PE_DECISION_DOMAIN_LABEL[d.domain]}] ${d.reason}`);
      if (reasons.length >= 5) break;
    }
  }

  return reasons.slice(0, 5);
}

function buildFinancialSnapshot(quality: FinancialQualityView, readiness: PEDecisionReadiness): PEICFinancialSnapshot {
  return {
    latestPeriodLabel: quality.latestPeriodLabel,
    revenue: quality.revenue,
    ebitda: quality.ebitda,
    netDebt: quality.netDebt,
    hasConflict: readiness.factConflicts.length > 0,
    conflictCount: readiness.factConflicts.length,
  };
}

function buildQoeSnapshot(qoe: QoESummaryView | null, readiness: PEDecisionReadiness): PEICQoESnapshot {
  if (!qoe) {
    return {
      hasData: false,
      approvedAdjustmentCount: 0,
      totalAdjustmentCount: 0,
      reviewTrackingLimitation: readiness.qoeReviewTrackingLimitation,
    };
  }
  return {
    hasData: true,
    reportedEbitda: qoe.reportedEbitda,
    adjustedEbitda: qoe.adjustedEbitda,
    approvedAdjustmentCount: qoe.counts.approved,
    totalAdjustmentCount: qoe.counts.total,
    reviewTrackingLimitation: readiness.qoeReviewTrackingLimitation,
  };
}

function buildLboSnapshot(
  lboEntryEbitda: LboEntryEbitdaResult,
  providedKeys: string[] | undefined,
  readiness: PEICDecisionInput["readiness"]
): PEICLboSnapshot {
  const entryOk = lboEntryEbitda.status === "ok";
  const providedSet = new Set(providedKeys ?? []);
  const missingLabels = Object.entries(REQUIRED_LBO_ASSUMPTION_LABELS)
    .filter(([key]) => !providedSet.has(key))
    .map(([, label]) => label);

  // computeLboEntryEbitda()는 readiness와 무관하게 계산 가능 여부만 본다 —
  // 상위 FINANCIAL/QOE가 BLOCKED여도(예: 다른 계정에 factConflict가 있어도)
  // EBITDA 자체가 단일 값이면 여기 status는 "ok"로 나온다. 이 값을 신뢰해도
  // 되는지는 readiness의 LBO 도메인 판정으로 별도 확인한다(재판정 아님 —
  // 이미 존재하는 판정을 그대로 읽을 뿐).
  const lboDomain = readiness.domains.find((d) => d.domain === "LBO");

  return {
    entryEbitdaStatus: entryOk ? "ok" : "not_available",
    entryEbitdaInEok: entryOk ? lboEntryEbitda.lbo.entryEbitdaInEok : undefined,
    upstreamBlocked: lboDomain?.status === "BLOCKED",
    assumptionsMissing: missingLabels.length > 0,
    missingAssumptionLabels: missingLabels,
  };
}

function buildDdSnapshot(ddCase: PEDDCase | undefined): PEICDdSnapshot {
  if (!ddCase) {
    return { findingCount: 0, openMaterialFindingCount: 0, confirmedFindingCount: 0, mitigatedFindingCount: 0, byCategory: {}, findings: [] };
  }
  const byCategory: PEICDdSnapshot["byCategory"] = {};
  for (const f of ddCase.findings) {
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
  }
  return {
    findingCount: ddCase.findings.length,
    openMaterialFindingCount: ddCase.findings.filter(
      (f) => PE_DD_FINDING_MATERIAL_SEVERITIES.includes(f.severity) && f.status !== "CLOSED" && f.status !== "REJECTED"
    ).length,
    confirmedFindingCount: ddCase.findings.filter((f) => f.status === "CONFIRMED").length,
    mitigatedFindingCount: ddCase.findings.filter((f) => f.status === "MITIGATED").length,
    byCategory,
    findings: ddCase.findings,
  };
}

function buildEvidenceSnapshot(ddCase: PEDDCase | undefined, readiness: PEDecisionReadiness): PEICEvidenceSnapshot {
  const evidenceDomain = readiness.domains.find((d) => d.domain === "EVIDENCE");
  return {
    evidenceCount: ddCase?.lineage.evidence.length ?? 0,
    sourceCount: ddCase?.lineage.sources.length ?? 0,
    claimCount: ddCase?.lineage.claims.length ?? 0,
    unsupportedClaimCount: (evidenceDomain?.counts?.unsupportedClaims as number | undefined) ?? 0,
  };
}

export function buildPEICDecision(input: PEICDecisionInput): PEICDecision {
  const { readiness } = input;
  const thesis = buildPEThesisItems(input.ddCase, readiness);
  const drivers = buildPEInvestmentDrivers(thesis, input.ddCase);
  const breakers = buildPEThesisBreakers(input.ddCase, thesis, readiness);
  const questions: ICQuestion[] = buildICQuestions(readiness, input.ddCase, thesis);

  const materialMissingInfoDomains = Array.from(
    new Set(readiness.missingInformation.filter((m) => m.severity === "MATERIAL").map((m) => m.domain))
  );

  return {
    dealId: input.dealId,
    processState: PROCESS_STATE_BY_READINESS[readiness.overall],
    processStateReasons: buildProcessStateReasons(readiness),
    thesis,
    drivers,
    breakers,
    questions,
    financial: buildFinancialSnapshot(input.financialQuality, readiness),
    qoe: buildQoeSnapshot(input.qoeSummary, readiness),
    lbo: buildLboSnapshot(input.lboEntryEbitda, input.lboAssumptionKeysProvided, readiness),
    dd: buildDdSnapshot(input.ddCase),
    evidence: buildEvidenceSnapshot(input.ddCase, readiness),
    readiness,
    materialMissingInfoDomains,
  };
}

export type { ICQuestion };
