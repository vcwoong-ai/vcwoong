/**
 * PE IC Decision / Readiness Engine — PR #103.
 *
 * "이 딜이 좋은 투자인가"를 판단하지 않는다. "IC가 지금 이 딜에 대해 무엇을
 * 알고 있고, 무엇이 검증됐으며, 무엇이 아직 없고, 어떤 확인이 남았는가"만
 * 결정론적으로 답한다.
 *
 * ## 아키텍처(중요)
 *
 * 이 파일은 새 재무/QoE/LBO 계산을 하지 않는다. 이미 존재하는 결정론적
 * 엔진을 그대로 재사용한다:
 * - 재무 정규화: financial-normalization.ts(PR-B, 수정 없음) — 호출자가 이미
 *   계산해 넘긴 NormalizedFinancialSummary를 그대로 받는다(중복 계산 금지).
 * - QoE(승인된 조정만 반영): qoe.ts(PR-D, 수정 없음).
 * - QoE→LBO 브릿지: qoe-lbo-bridge.ts(PR-E, 수정 없음).
 * - LBO 가정 구조적 유효성 확인: lbo-model.ts(PR #90, 수정 없음) —
 *   calculateLboModel()을 그대로 호출해 결과의 moic가 null이 아닌지만
 *   확인한다. MOIC/IRR 숫자 자체는 이 엔진의 출력에 포함하지 않는다
 *   (§8 — "READY는 계산 가능하다는 뜻이지 매력적이라는 뜻이 아니다").
 * - DD: dd-lineage.ts/dd-validation.ts(PR-G, 수정 없음).
 * - Evidence: evidence-lineage.ts(PR-F, 수정 없음).
 * - Commercial: dd-commercial.ts(PR-H, 수정 없음).
 *
 * ## DD/Evidence/Commercial이 옵션인 이유(실제 현재 상태 감사 결과)
 *
 * schema.prisma에는 DD finding·evidence lineage·고객 매출 데이터를 저장하는
 * Prisma 모델이 하나도 없다(MADeal/MADocument/MAReport/MAReportSection/
 * MAFinancialPeriod/MAFinancialLineItem/MAFinancialAdjustment뿐 — 2026-09-28
 * 확인). pe-fact-extraction.ts 등 AI 추출 파이프라인도 문서 업로드 API에
 * 연결돼 있지 않다. 즉 지금 이 시점엔 **실제 MA 딜에 대해 PEDDCase/
 * PEEvidenceLineage/고객 데이터를 만들어낼 방법이 존재하지 않는다.**
 *
 * 그래서 이 세 도메인의 입력은 optional이다 — 값이 없으면(현재 모든 실제
 * 딜이 이 상태) 거짓으로 "완료"라고 하지 않고 NOT_STARTED로 정직하게
 * 표시하고, 그 이유를 "데이터 적재 파이프라인이 아직 연결되지 않음"으로
 * 명시한다. 나중에 그 파이프라인이 생기면 caller가 값을 채워 넘기기만
 * 하면 이 엔진은 이미 그 경우도 처리한다(§9, §10, §11 요구사항).
 *
 * ## QoE 상태 모델의 의도적 한계(§7 그대로 반영)
 *
 * "조정이 0건"과 "QoE 검토를 아직 안 함"을 이 데이터 모델은 구조적으로
 * 구분할 수 없다(조정 상태 컬럼은 있지만 "이 기간을 검토했다"는 별도
 * 플래그가 없음). 이 사실을 감추고 임의로 PARTIAL/READY를 나누는 대신,
 * QoE 계산이 성공하면(=Adjusted EBITDA를 구할 수 있으면) READY로 판정하고
 * 이 한계를 `qoeReviewTrackingLimitation` 필드로 명시한다(§7: "데이터
 * 모델이 구분 못 하면 임의로 지어내는 대신 그 한계를 명시하라").
 */

import { calculateAdjustedEbitda, type QoEResult } from "./qoe";
import { bridgeQoEToLboEntryEbitda, type QoEToLboBridgeResult, type QoEToLboBridgePeriodIdentity } from "./qoe-lbo-bridge";
import { calculateLboModel, type LboAssumptions } from "../lbo-model";
import {
  validatePEDDCase,
  findUnsupportedFindings,
} from "./dd-lineage";
import type { PEDDCase } from "./dd-types";
import { validatePEEvidenceLineage, findUnsupportedClaims } from "./evidence-lineage";
import type { PEEvidenceLineage } from "./evidence-lineage-types";
import { findCustomerDatasetIssues } from "./dd-commercial";
import type { PEDDCustomerRevenueInput } from "./dd-metrics-types";
import type {
  CanonicalLineItem,
  FinancialCalcResult,
  FinancialLineItemInput,
  MaFinancialSourceType,
} from "./financial-types";
import type { QoEAdjustmentInput, QoEAdjustmentStatus } from "./qoe-types";

// ── 공용 상태 모델 ─────────────────────────────────────────────────────

export const READINESS_STATES = ["READY", "PARTIAL", "MISSING", "NOT_STARTED", "BLOCKED"] as const;
export type ReadinessState = (typeof READINESS_STATES)[number];

/**
 * 상태 정의(§4 — 반드시 이 의미로만 쓴다, "좋은/나쁜 투자"가 아니다):
 * - READY: 이 영역에 필요한 입력이 존재하고 내부적으로 유효하다.
 * - PARTIAL: 일부 필요한 입력은 있지만 최소 1개의 중요한 입력이 아직 없다.
 * - MISSING: 이 영역 분석에 필요한 정보 자체가 현재 없다.
 * - NOT_STARTED: 의미 있는 데이터가 아직 전혀 공급/처리되지 않았다.
 * - BLOCKED: 상위 데이터는 있지만 검증 실패·모순 때문에 하위 분석을 믿을 수 없다.
 */
export const READINESS_STATE_MEANING: Record<ReadinessState, string> = {
  READY: "필요한 입력이 존재하고 내부적으로 유효함",
  PARTIAL: "일부 입력은 있으나 중요한 입력이 최소 1개 없음",
  MISSING: "필요한 정보 자체가 현재 없음",
  NOT_STARTED: "의미 있는 데이터가 아직 전혀 없음",
  BLOCKED: "상위 데이터는 있으나 검증 실패/모순으로 하위 분석을 신뢰할 수 없음",
};

export const PE_DECISION_DOMAINS = [
  "FINANCIAL",
  "QOE",
  "LBO",
  "DD",
  "EVIDENCE",
  "COMMERCIAL",
  "DART",
] as const;
export type PEDecisionDomainKey = (typeof PE_DECISION_DOMAINS)[number];

/** IC_COMPLETENESS 집계 시 결과를 좌우하는 필수 도메인 — 지금 실제로 데이터
 * 경로가 연결된 도메인만 필수로 삼는다(§13: "일부 도메인은 정보성일 수
 * 있다, 어느 게 필수인지 문서화하라"). DD/EVIDENCE/COMMERCIAL/DART는
 * 아직 실제 딜에 데이터를 채울 방법이 없거나(DD/EVIDENCE/COMMERCIAL)
 * 기존 제품에서도 필수로 요구하지 않는 보조 검증(DART, §12)이라 정보성으로
 * 둔다. */
export const MANDATORY_DOMAINS: readonly PEDecisionDomainKey[] = ["FINANCIAL", "QOE", "LBO"];
export const INFORMATIONAL_DOMAINS: readonly PEDecisionDomainKey[] = ["DD", "EVIDENCE", "COMMERCIAL", "DART"];

export type PEMissingInfoSeverity = "MATERIAL" | "INFORMATIONAL";

export interface PEMissingInformationItem {
  code: string;
  domain: PEDecisionDomainKey;
  label: string;
  reason: string;
  severity: PEMissingInfoSeverity;
  /** 이 정보가 막고 있는 다운스트림 도메인/집계 상태 키 */
  blocks: string[];
}

export interface PEBlockingCondition {
  code: string;
  domain: PEDecisionDomainKey;
  label: string;
  detail: string;
}

/** 같은 (기간, metric, 통화)에 서로 다른 값을 가진 line item이 있을 때의 모순 기록.
 * financial-normalization.ts의 findLineItem()은 Array.find()로 첫 항목만
 * 조용히 쓰므로(PR-B, 수정하지 않음) 이 엔진이 대신 그 모순 존재 여부를
 * 명시적으로 검출해 BLOCKED로 표시한다 — 값을 대신 골라주지 않는다(§16). */
export interface PEFinancialFactConflict {
  financialPeriodId: string;
  metric: string;
  currency: string;
  conflictingValues: Array<{ lineItemId: string; value: number; source: string }>;
}

export interface PEDecisionDomainResult {
  domain: PEDecisionDomainKey;
  status: ReadinessState;
  reason: string;
  missingItems: string[];
  blockingItems: string[];
  /** 도메인별로 의미 있을 때만 채우는 참고 카운트(예: 조정 건수) */
  counts?: Record<string, number>;
}

export interface PEDecisionReadiness {
  overall: ReadinessState;
  domains: PEDecisionDomainResult[];
  missingInformation: PEMissingInformationItem[];
  blockers: PEBlockingCondition[];
  factConflicts: PEFinancialFactConflict[];
  /** §7에서 요구한 대로, 지어내는 대신 명시하는 데이터 모델 한계 */
  qoeReviewTrackingLimitation: string;
  summary: string;
}

// ── 입력 계약 ──────────────────────────────────────────────────────────

export interface PEDecisionLineItemRow {
  id: string;
  lineItem: string;
  value: number;
  currency: string;
  source: string;
  sourceName?: string | null;
  sourceLocation?: string | null;
}

export interface PEDecisionAdjustmentRow {
  metric: string;
  reportedValue: number;
  adjustmentValue: number;
  reason: string;
  status: QoEAdjustmentStatus;
  adjustmentType: string;
  source: string;
  sourceName?: string | null;
  sourceLocation?: string | null;
}

export interface PEDecisionPeriod {
  id: string;
  fiscalYear: number;
  periodType: "ANNUAL" | "QUARTERLY" | "TTM";
  currency: string;
  lineItems: PEDecisionLineItemRow[];
  adjustments: PEDecisionAdjustmentRow[];
  /** 호출자가 이미 계산해 넘긴 값(financial-normalization.ts) — 여기서 다시 계산하지 않는다 */
  normalizedSummary: {
    revenue: FinancialCalcResult;
    ebitda: FinancialCalcResult;
    netDebt: FinancialCalcResult;
  };
}

export interface PEDecisionReadinessInput {
  periods: PEDecisionPeriod[];
  /** IC가 검토 중인 LBO 가정 — LBO 탭에 아직 입력이 없으면 생략(undefined) */
  lboAssumptions?: Partial<LboAssumptions>;
  /** 실제로 존재할 때만 넘긴다 — 지금은 어떤 실제 딜에도 이 값을 만들 방법이 없다(위 모듈 주석 참고) */
  ddCase?: PEDDCase;
  evidenceLineage?: PEEvidenceLineage;
  commercialCustomers?: PEDDCustomerRevenueInput[];
}

// ── 내부 변환 헬퍼(ma-deal-dashboard.ts와 동일 패턴 — 새 계산 없음) ──────

function toFinancialLineItemInputs(lineItems: PEDecisionLineItemRow[]): FinancialLineItemInput[] {
  return lineItems.map((li) => ({
    lineItem: li.lineItem as CanonicalLineItem,
    value: li.value,
    currency: li.currency,
    sourceType: li.source as MaFinancialSourceType,
    sourceName: li.sourceName ?? undefined,
    sourceLocation: li.sourceLocation ?? undefined,
  }));
}

function toQoEAdjustmentInputs(adjustments: PEDecisionAdjustmentRow[]): QoEAdjustmentInput[] {
  return adjustments.map((a) => ({
    metric: a.metric as CanonicalLineItem,
    reportedValue: a.reportedValue,
    adjustmentValue: a.adjustmentValue,
    reason: a.reason,
    adjustmentType: a.adjustmentType as QoEAdjustmentInput["adjustmentType"],
    status: a.status,
    sourceType: a.source as MaFinancialSourceType,
    sourceName: a.sourceName ?? undefined,
    sourceLocation: a.sourceLocation ?? undefined,
  }));
}

/** 같은 기간 안에서 같은 metric+통화인데 값이 다른 line item을 찾는다(§16). */
function detectFactConflicts(periods: PEDecisionPeriod[]): PEFinancialFactConflict[] {
  const conflicts: PEFinancialFactConflict[] = [];
  for (const period of periods) {
    const byMetricCurrency = new Map<string, PEDecisionLineItemRow[]>();
    for (const li of period.lineItems) {
      const key = `${li.lineItem}|${li.currency}`;
      const list = byMetricCurrency.get(key) ?? [];
      list.push(li);
      byMetricCurrency.set(key, list);
    }
    for (const [key, rows] of Array.from(byMetricCurrency.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      const distinctValues = new Set(rows.map((r) => r.value));
      if (distinctValues.size < 2) continue;
      const [metric, currency] = key.split("|");
      conflicts.push({
        financialPeriodId: period.id,
        metric,
        currency,
        conflictingValues: rows
          .map((r) => ({ lineItemId: r.id, value: r.value, source: r.source }))
          .sort((a, b) => a.lineItemId.localeCompare(b.lineItemId)),
      });
    }
  }
  return conflicts;
}

// ── FINANCIAL ──────────────────────────────────────────────────────────

function assessFinancial(
  periods: PEDecisionPeriod[],
  conflicts: PEFinancialFactConflict[]
): { result: PEDecisionDomainResult; missing: PEMissingInformationItem[]; blockers: PEBlockingCondition[] } {
  const missing: PEMissingInformationItem[] = [];
  const blockers: PEBlockingCondition[] = [];

  if (periods.length === 0) {
    missing.push({
      code: "FINANCIAL_NO_PERIOD",
      domain: "FINANCIAL",
      label: "재무 기간",
      reason: "등록된 재무 기간이 없습니다",
      severity: "MATERIAL",
      blocks: ["FINANCIAL", "QOE", "LBO"],
    });
    return {
      result: { domain: "FINANCIAL", status: "NOT_STARTED", reason: "등록된 재무 기간이 없습니다", missingItems: ["FINANCIAL_NO_PERIOD"], blockingItems: [] },
      missing,
      blockers,
    };
  }

  const latest = periods[0];
  const latestConflicts = conflicts.filter((c) => c.financialPeriodId === latest.id);
  if (latestConflicts.length > 0) {
    for (const c of latestConflicts) {
      blockers.push({
        code: `FINANCIAL_FACT_CONFLICT_${c.metric}`,
        domain: "FINANCIAL",
        label: `${c.metric} 값 불일치`,
        detail: `같은 기간(${latest.id})의 ${c.metric}(${c.currency})에 서로 다른 값이 존재합니다: ${c.conflictingValues.map((v) => v.value).join(", ")}`,
      });
    }
    return {
      result: {
        domain: "FINANCIAL",
        status: "BLOCKED",
        reason: "같은 재무기간에 동일 계정의 값이 서로 달라 신뢰할 수 없습니다",
        missingItems: [],
        blockingItems: latestConflicts.map((c) => `FINANCIAL_FACT_CONFLICT_${c.metric}`),
      },
      missing,
      blockers,
    };
  }

  const revenue = latest.normalizedSummary.revenue;
  const ebitda = latest.normalizedSummary.ebitda;

  if (revenue.status === "currency_mismatch" || ebitda.status === "currency_mismatch") {
    const bad = revenue.status === "currency_mismatch" ? "REVENUE" : "EBITDA";
    blockers.push({
      code: `FINANCIAL_CURRENCY_MISMATCH_${bad}`,
      domain: "FINANCIAL",
      label: `${bad} 통화 불일치`,
      detail: revenue.status === "currency_mismatch" ? revenue.detail : ebitda.status === "currency_mismatch" ? ebitda.detail : "",
    });
    return {
      result: { domain: "FINANCIAL", status: "BLOCKED", reason: "계정 통화가 기간 통화와 달라 계산을 신뢰할 수 없습니다", missingItems: [], blockingItems: [`FINANCIAL_CURRENCY_MISMATCH_${bad}`] },
      missing,
      blockers,
    };
  }

  const revenueOk = revenue.status === "ok";
  const ebitdaOk = ebitda.status === "ok";

  if (!revenueOk && !ebitdaOk) {
    missing.push({
      code: "FINANCIAL_CORE_METRICS_MISSING",
      domain: "FINANCIAL",
      label: "매출·EBITDA",
      reason: "최근 재무기간에서 매출과 EBITDA를 모두 계산할 수 없습니다(필요 계정 누락)",
      severity: "MATERIAL",
      blocks: ["FINANCIAL", "QOE", "LBO"],
    });
    return {
      result: { domain: "FINANCIAL", status: "MISSING", reason: "매출·EBITDA를 계산할 수 없습니다", missingItems: ["FINANCIAL_CORE_METRICS_MISSING"], blockingItems: [] },
      missing,
      blockers,
    };
  }

  if (!revenueOk || !ebitdaOk) {
    const which = !revenueOk ? "매출" : "EBITDA";
    const code = !revenueOk ? "FINANCIAL_REVENUE_MISSING" : "FINANCIAL_EBITDA_MISSING";
    missing.push({
      code,
      domain: "FINANCIAL",
      label: which,
      reason: `최근 재무기간에서 ${which}를 계산할 수 없습니다(필요 계정 누락)`,
      severity: "MATERIAL",
      blocks: which === "EBITDA" ? ["QOE", "LBO"] : [],
    });
    return {
      result: { domain: "FINANCIAL", status: "PARTIAL", reason: `${which} 계정이 없어 일부 지표만 확인 가능합니다`, missingItems: [code], blockingItems: [] },
      missing,
      blockers,
    };
  }

  return {
    result: { domain: "FINANCIAL", status: "READY", reason: "매출·EBITDA를 계산할 수 있는 최근 재무기간이 있습니다", missingItems: [], blockingItems: [] },
    missing,
    blockers,
  };
}

// ── QOE ────────────────────────────────────────────────────────────────

function assessQoe(
  periods: PEDecisionPeriod[],
  financialBlocked: boolean
): { result: PEDecisionDomainResult; qoe: QoEResult | null; missing: PEMissingInformationItem[]; blockers: PEBlockingCondition[] } {
  const missing: PEMissingInformationItem[] = [];
  const blockers: PEBlockingCondition[] = [];

  if (periods.length === 0) {
    return {
      result: { domain: "QOE", status: "NOT_STARTED", reason: "등록된 재무 기간이 없습니다", missingItems: [], blockingItems: [] },
      qoe: null,
      missing,
      blockers,
    };
  }

  if (financialBlocked) {
    blockers.push({
      code: "QOE_BLOCKED_BY_FINANCIAL",
      domain: "QOE",
      label: "재무 데이터 모순",
      detail: "재무 데이터 자체가 BLOCKED 상태라 QoE를 신뢰할 수 없습니다",
    });
    return {
      result: { domain: "QOE", status: "BLOCKED", reason: "상위 재무 데이터가 BLOCKED 상태입니다", missingItems: [], blockingItems: ["QOE_BLOCKED_BY_FINANCIAL"] },
      qoe: null,
      missing,
      blockers,
    };
  }

  const latest = periods[0];
  const qoe = calculateAdjustedEbitda(
    latest.currency,
    toFinancialLineItemInputs(latest.lineItems),
    toQoEAdjustmentInputs(latest.adjustments)
  );

  if (qoe.baseEbitda.status === "currency_mismatch" || qoe.adjustedEbitda.status === "currency_mismatch") {
    blockers.push({
      code: "QOE_CURRENCY_MISMATCH",
      domain: "QOE",
      label: "QoE 통화 불일치",
      detail: qoe.baseEbitda.status === "currency_mismatch" ? qoe.baseEbitda.detail : "",
    });
    return {
      result: { domain: "QOE", status: "BLOCKED", reason: "EBITDA 계정 통화가 기간 통화와 달라 QoE 계산을 신뢰할 수 없습니다", missingItems: [], blockingItems: ["QOE_CURRENCY_MISMATCH"] },
      qoe,
      missing,
      blockers,
    };
  }

  if (qoe.baseEbitda.status !== "ok") {
    missing.push({
      code: "QOE_EBITDA_MISSING",
      domain: "QOE",
      label: "Reported EBITDA",
      reason: "EBITDA 계정이 없어 QoE를 계산할 수 없습니다",
      severity: "MATERIAL",
      blocks: ["LBO"],
    });
    return {
      result: { domain: "QOE", status: "MISSING", reason: "EBITDA가 없어 QoE를 계산할 수 없습니다", missingItems: ["QOE_EBITDA_MISSING"], blockingItems: [] },
      qoe,
      missing,
      blockers,
    };
  }

  const counts = {
    total: latest.adjustments.length,
    approved: latest.adjustments.filter((a) => a.status === "APPROVED").length,
    proposed: latest.adjustments.filter((a) => a.status === "PROPOSED").length,
    draft: latest.adjustments.filter((a) => a.status === "DRAFT").length,
    rejected: latest.adjustments.filter((a) => a.status === "REJECTED").length,
  };

  // adjustedEbitda.status는 baseEbitda가 ok면 항상 ok다(qoe.ts 계약) — READY.
  // "조정 0건"을 PARTIAL로 낮추지 않는다(§7 — 검토 여부를 지어내지 않음).
  return {
    result: {
      domain: "QOE",
      status: "READY",
      reason: "승인된 조정만 반영한 Adjusted EBITDA를 계산할 수 있습니다",
      missingItems: [],
      blockingItems: [],
      counts,
    },
    qoe,
    missing,
    blockers,
  };
}

// ── LBO ────────────────────────────────────────────────────────────────

const REQUIRED_LBO_ASSUMPTION_KEYS: Array<{ key: keyof LboAssumptions; label: string }> = [
  { key: "entryMultiple", label: "인수 배수" },
  { key: "debtToEbitda", label: "레버리지" },
  { key: "interestRate", label: "이자율" },
  { key: "ebitdaGrowthRate", label: "EBITDA 성장률" },
  { key: "fcfConversionRate", label: "FCF 전환율" },
  { key: "cashSweepRate", label: "캐시 스윕 비율" },
  { key: "exitMultiple", label: "Exit 배수" },
  { key: "holdPeriodYears", label: "보유 기간" },
];

function assessLbo(
  periods: PEDecisionPeriod[],
  qoe: QoEResult | null,
  qoeBlocked: boolean,
  lboAssumptions: Partial<LboAssumptions> | undefined
): { result: PEDecisionDomainResult; missing: PEMissingInformationItem[]; blockers: PEBlockingCondition[] } {
  const missing: PEMissingInformationItem[] = [];
  const blockers: PEBlockingCondition[] = [];

  if (periods.length === 0) {
    return {
      result: { domain: "LBO", status: "NOT_STARTED", reason: "등록된 재무 기간이 없습니다", missingItems: [], blockingItems: [] },
      missing,
      blockers,
    };
  }

  if (qoeBlocked || !qoe) {
    blockers.push({ code: "LBO_BLOCKED_BY_QOE", domain: "LBO", label: "QoE 모순", detail: "상위 QoE가 BLOCKED 상태라 LBO Entry EBITDA를 신뢰할 수 없습니다" });
    return {
      result: { domain: "LBO", status: "BLOCKED", reason: "상위 QoE 데이터가 BLOCKED 상태입니다", missingItems: [], blockingItems: ["LBO_BLOCKED_BY_QOE"] },
      missing,
      blockers,
    };
  }

  const latest = periods[0];
  const identity: QoEToLboBridgePeriodIdentity = { financialPeriodId: latest.id, fiscalYear: latest.fiscalYear, periodType: latest.periodType };
  const bridge: QoEToLboBridgeResult = bridgeQoEToLboEntryEbitda(identity, latest.currency, qoe);

  if (bridge.status === "missing_input") {
    missing.push({
      code: "LBO_ENTRY_EBITDA_MISSING",
      domain: "LBO",
      label: "Entry EBITDA",
      reason: "QoE Adjusted EBITDA를 계산할 수 없어 LBO Entry EBITDA를 구할 수 없습니다",
      severity: "MATERIAL",
      blocks: ["LBO"],
    });
    return {
      result: { domain: "LBO", status: "MISSING", reason: "Entry EBITDA를 계산할 수 없습니다", missingItems: ["LBO_ENTRY_EBITDA_MISSING"], blockingItems: [] },
      missing,
      blockers,
    };
  }
  if (bridge.status !== "ok") {
    const code = `LBO_BRIDGE_${bridge.status.toUpperCase()}`;
    const detail = bridge.status === "invalid_qoe_result" ? bridge.detail : bridge.status === "unsupported_currency" ? `통화: ${bridge.currency}` : bridge.status === "invalid_period" ? bridge.detail : "";
    blockers.push({ code, domain: "LBO", label: "LBO 브릿지 오류", detail });
    return {
      result: { domain: "LBO", status: "BLOCKED", reason: "QoE→LBO 브릿지가 실패했습니다(" + bridge.status + ")", missingItems: [], blockingItems: [code] },
      missing,
      blockers,
    };
  }

  // 여기부터 Entry EBITDA는 확보됨(bridge.status === "ok"). 나머지 LBO
  // 가정(진입배수·레버리지 등)은 절대 자동으로 채우지 않는다(§8) — IC가
  // 명시적으로 넘긴 값만 인정한다.
  const missingAssumptionKeys = REQUIRED_LBO_ASSUMPTION_KEYS.filter(
    ({ key }) => lboAssumptions?.[key] === undefined
  );

  if (missingAssumptionKeys.length > 0) {
    for (const { key, label } of missingAssumptionKeys) {
      missing.push({
        code: `LBO_ASSUMPTION_MISSING_${key.toUpperCase()}`,
        domain: "LBO",
        label,
        reason: `LBO 가정 중 ${label}이(가) 아직 입력되지 않았습니다(IC가 직접 입력해야 함, 자동 산정 안 함)`,
        severity: "MATERIAL",
        blocks: [],
      });
    }
    return {
      result: {
        domain: "LBO",
        status: "PARTIAL",
        reason: `Entry EBITDA는 확보됐으나 LBO 가정 ${missingAssumptionKeys.length}개가 아직 입력되지 않았습니다`,
        missingItems: missingAssumptionKeys.map(({ key }) => `LBO_ASSUMPTION_MISSING_${key.toUpperCase()}`),
        blockingItems: [],
      },
      missing,
      blockers,
    };
  }

  // 가정이 전부 채워졌다 — lbo-model.ts(PR #90, 수정하지 않음)를 그대로
  // 호출해 구조적 유효성만 확인한다. MOIC/IRR 숫자는 이 엔진 출력에
  // 절대 포함하지 않는다(§8) — "계산 가능한가"만 boolean으로 판단한다.
  const assumptions: LboAssumptions = {
    entryEbitda: bridge.lbo.entryEbitdaInEok,
    entryMultiple: lboAssumptions!.entryMultiple!,
    debtToEbitda: lboAssumptions!.debtToEbitda!,
    interestRate: lboAssumptions!.interestRate!,
    ebitdaGrowthRate: lboAssumptions!.ebitdaGrowthRate!,
    fcfConversionRate: lboAssumptions!.fcfConversionRate!,
    cashSweepRate: lboAssumptions!.cashSweepRate!,
    exitMultiple: lboAssumptions!.exitMultiple!,
    holdPeriodYears: lboAssumptions!.holdPeriodYears!,
  };
  const canCompute = calculateLboModel(assumptions).moic !== null;

  if (!canCompute) {
    blockers.push({
      code: "LBO_ASSUMPTIONS_INVALID",
      domain: "LBO",
      label: "LBO 가정 구조적 오류",
      detail: "입력된 가정으로는 LBO 엔진이 계산할 수 없습니다(0 이하 값 등)",
    });
    return {
      result: { domain: "LBO", status: "BLOCKED", reason: "LBO 가정이 구조적으로 유효하지 않습니다", missingItems: [], blockingItems: ["LBO_ASSUMPTIONS_INVALID"] },
      missing,
      blockers,
    };
  }

  return {
    result: { domain: "LBO", status: "READY", reason: "Entry EBITDA와 필요한 LBO 가정이 모두 유효합니다(계산 가능 — 투자 매력도 판단 아님)", missingItems: [], blockingItems: [] },
    missing,
    blockers,
  };
}

// ── DD ─────────────────────────────────────────────────────────────────

function assessDD(ddCase: PEDDCase | undefined): { result: PEDecisionDomainResult; missing: PEMissingInformationItem[]; blockers: PEBlockingCondition[] } {
  const missing: PEMissingInformationItem[] = [];
  const blockers: PEBlockingCondition[] = [];

  if (!ddCase) {
    missing.push({
      code: "DD_NOT_CONNECTED",
      domain: "DD",
      label: "실사(DD)",
      reason: "DD finding 데이터 적재 파이프라인이 아직 연결되지 않았습니다 — \"검토했지만 이슈 없음\"이 아니라 \"아직 데이터가 없음\"입니다",
      severity: "INFORMATIONAL",
      blocks: [],
    });
    return {
      result: { domain: "DD", status: "NOT_STARTED", reason: "DD finding 데이터가 연결되지 않았습니다(파이프라인 부재)", missingItems: ["DD_NOT_CONNECTED"], blockingItems: [] },
      missing,
      blockers,
    };
  }

  const validation = validatePEDDCase(ddCase);
  if (validation.status === "invalid") {
    blockers.push({ code: "DD_CASE_INVALID", domain: "DD", label: "DD 데이터 무결성 오류", detail: validation.issues.map((i) => i.rule).join(", ") });
    return {
      result: { domain: "DD", status: "BLOCKED", reason: "DD 데이터에 무결성 오류가 있습니다", missingItems: [], blockingItems: ["DD_CASE_INVALID"] },
      missing,
      blockers,
    };
  }

  if (ddCase.findings.length === 0) {
    missing.push({
      code: "DD_NO_FINDINGS_RECORDED",
      domain: "DD",
      label: "DD finding",
      reason: "기록된 DD finding이 없습니다",
      severity: "INFORMATIONAL",
      blocks: [],
    });
    return {
      result: { domain: "DD", status: "NOT_STARTED", reason: "기록된 DD finding이 없습니다", missingItems: ["DD_NO_FINDINGS_RECORDED"], blockingItems: [] },
      missing,
      blockers,
    };
  }

  const unsupported = findUnsupportedFindings(ddCase);
  const counts = { total: ddCase.findings.length, unsupported: unsupported.length };
  // "완료"를 자동으로 판정하지 않는다 — finding이 존재한다는 사실만 PARTIAL로 표시한다.
  return {
    result: { domain: "DD", status: "PARTIAL", reason: `DD finding ${ddCase.findings.length}건이 기록돼 있습니다(전체 완료 여부는 이 엔진이 판정하지 않음)`, missingItems: [], blockingItems: [], counts },
    missing,
    blockers,
  };
}

// ── EVIDENCE ───────────────────────────────────────────────────────────

function assessEvidence(lineage: PEEvidenceLineage | undefined): { result: PEDecisionDomainResult; missing: PEMissingInformationItem[]; blockers: PEBlockingCondition[] } {
  const missing: PEMissingInformationItem[] = [];
  const blockers: PEBlockingCondition[] = [];

  if (!lineage) {
    missing.push({
      code: "EVIDENCE_NOT_CONNECTED",
      domain: "EVIDENCE",
      label: "근거 추적",
      reason: "evidence lineage 데이터 적재 파이프라인이 아직 연결되지 않았습니다",
      severity: "INFORMATIONAL",
      blocks: [],
    });
    return {
      result: { domain: "EVIDENCE", status: "NOT_STARTED", reason: "evidence lineage 데이터가 연결되지 않았습니다(파이프라인 부재)", missingItems: ["EVIDENCE_NOT_CONNECTED"], blockingItems: [] },
      missing,
      blockers,
    };
  }

  const validation = validatePEEvidenceLineage(lineage);
  if (validation.status === "invalid") {
    blockers.push({ code: "EVIDENCE_LINEAGE_INVALID", domain: "EVIDENCE", label: "근거 그래프 무결성 오류", detail: validation.issues.map((i) => i.rule).join(", ") });
    return {
      result: { domain: "EVIDENCE", status: "BLOCKED", reason: "evidence lineage 그래프에 무결성 오류가 있습니다", missingItems: [], blockingItems: ["EVIDENCE_LINEAGE_INVALID"] },
      missing,
      blockers,
    };
  }

  if (lineage.claims.length === 0) {
    missing.push({ code: "EVIDENCE_NO_CLAIMS", domain: "EVIDENCE", label: "근거", reason: "기록된 claim이 없습니다", severity: "INFORMATIONAL", blocks: [] });
    return {
      result: { domain: "EVIDENCE", status: "NOT_STARTED", reason: "기록된 claim이 없습니다", missingItems: ["EVIDENCE_NO_CLAIMS"], blockingItems: [] },
      missing,
      blockers,
    };
  }

  const unsupported = findUnsupportedClaims(lineage);
  const counts = { totalClaims: lineage.claims.length, unsupportedClaims: unsupported.length };
  const status: ReadinessState = unsupported.length === 0 ? "READY" : "PARTIAL";
  return {
    result: {
      domain: "EVIDENCE",
      status,
      reason: unsupported.length === 0 ? "기록된 claim이 모두 근거(evidence)를 가지고 있습니다" : `claim ${lineage.claims.length}건 중 ${unsupported.length}건이 근거 없이 남아 있습니다`,
      missingItems: [],
      blockingItems: [],
      counts,
    },
    missing,
    blockers,
  };
}

// ── COMMERCIAL ─────────────────────────────────────────────────────────

function assessCommercial(
  customers: PEDDCustomerRevenueInput[] | undefined,
  latestPeriodId: string | undefined
): { result: PEDecisionDomainResult; missing: PEMissingInformationItem[]; blockers: PEBlockingCondition[] } {
  const missing: PEMissingInformationItem[] = [];
  const blockers: PEBlockingCondition[] = [];

  if (!customers || customers.length === 0) {
    missing.push({
      code: "COMMERCIAL_NOT_CONNECTED",
      domain: "COMMERCIAL",
      label: "상업 데이터",
      reason: "고객 매출 데이터가 아직 적재되지 않았습니다",
      severity: "INFORMATIONAL",
      blocks: [],
    });
    return {
      result: { domain: "COMMERCIAL", status: "NOT_STARTED", reason: "고객 매출 데이터가 없습니다", missingItems: ["COMMERCIAL_NOT_CONNECTED"], blockingItems: [] },
      missing,
      blockers,
    };
  }

  const issues = findCustomerDatasetIssues(customers);
  if (issues.length > 0) {
    blockers.push({ code: "COMMERCIAL_DATASET_INVALID", domain: "COMMERCIAL", label: "고객 데이터셋 오류", detail: issues.join("; ") });
    return {
      result: { domain: "COMMERCIAL", status: "BLOCKED", reason: "고객 데이터셋이 구조적으로 유효하지 않습니다", missingItems: [], blockingItems: ["COMMERCIAL_DATASET_INVALID"] },
      missing,
      blockers,
    };
  }

  // 최근 재무기간에 대한 고객 데이터가 없으면(다른 기간 데이터만 있으면)
  // "있긴 하지만 IC가 지금 보는 기간엔 없다" — PARTIAL로 구분한다(DART의
  // 기간별 커버리지 판정과 같은 원칙).
  if (latestPeriodId && !customers.some((c) => c.financialPeriodId === latestPeriodId)) {
    missing.push({
      code: "COMMERCIAL_LATEST_PERIOD_COVERAGE_MISSING",
      domain: "COMMERCIAL",
      label: "최근 기간 고객 데이터",
      reason: "최근 재무기간에 대한 고객 매출 데이터가 없습니다(다른 기간 데이터만 존재)",
      severity: "INFORMATIONAL",
      blocks: [],
    });
    return {
      result: {
        domain: "COMMERCIAL",
        status: "PARTIAL",
        reason: "고객 데이터셋은 유효하지만 최근 재무기간을 커버하지 않습니다",
        missingItems: ["COMMERCIAL_LATEST_PERIOD_COVERAGE_MISSING"],
        blockingItems: [],
        counts: { customerCount: customers.length },
      },
      missing,
      blockers,
    };
  }

  // 집중도(top1Share 등)는 별도의 명시적 totalRevenue 단언이 필요한 계산이라
  // (dd-commercial.ts calculateCustomerConcentration 시그니처 참고) 이
  // readiness 판정에서는 계산하지 않는다 — "데이터셋이 구조적으로 유효한가"만
  // 판정하고, 실제 지표 계산은 그 지표를 실제로 쓰는 화면의 책임으로 남긴다.
  return {
    result: {
      domain: "COMMERCIAL",
      status: "READY",
      reason: "고객 매출 데이터셋이 구조적으로 유효합니다(분석 가능 — 상업적 매력도 판단 아님)",
      missingItems: [],
      blockingItems: [],
      counts: { customerCount: customers.length },
    },
    missing,
    blockers,
  };
}

// ── DART ───────────────────────────────────────────────────────────────

function assessDart(periods: PEDecisionPeriod[]): { result: PEDecisionDomainResult; missing: PEMissingInformationItem[] } {
  const missing: PEMissingInformationItem[] = [];
  const dartPeriods = periods.filter((p) => p.lineItems.some((li) => li.source === "DART"));

  if (dartPeriods.length === 0) {
    missing.push({
      code: "DART_NOT_IMPORTED",
      domain: "DART",
      label: "DART 공시",
      reason: "DART 공시 데이터가 아직 연동되지 않았습니다(비상장이면 정상일 수 있음)",
      severity: "INFORMATIONAL",
      blocks: [],
    });
    return {
      result: { domain: "DART", status: "NOT_STARTED", reason: "DART 데이터가 없습니다", missingItems: ["DART_NOT_IMPORTED"], blockingItems: [] },
      missing,
    };
  }

  if (dartPeriods.length < periods.length) {
    missing.push({
      code: "DART_PARTIAL_COVERAGE",
      domain: "DART",
      label: "DART 공시(일부 기간)",
      reason: `전체 ${periods.length}개 재무기간 중 ${dartPeriods.length}개만 DART로 확인됐습니다`,
      severity: "INFORMATIONAL",
      blocks: [],
    });
    return {
      result: { domain: "DART", status: "PARTIAL", reason: "일부 재무기간만 DART로 확인됐습니다", missingItems: ["DART_PARTIAL_COVERAGE"], blockingItems: [], counts: { dartPeriods: dartPeriods.length, totalPeriods: periods.length } },
      missing,
    };
  }

  return {
    result: { domain: "DART", status: "READY", reason: "모든 재무기간이 DART로 확인됐습니다", missingItems: [], blockingItems: [], counts: { dartPeriods: dartPeriods.length, totalPeriods: periods.length } },
    missing,
  };
}

// ── 집계(IC_COMPLETENESS) ─────────────────────────────────────────────

/**
 * 전체 집계 규칙(§13, 결정론적으로 문서화):
 * - 필수 도메인(FINANCIAL/QOE/LBO) 중 하나라도 BLOCKED → 전체 BLOCKED
 *   (모순이 있으면 나머지가 뭐든 신뢰할 수 없다).
 * - 필수 도메인이 전부 NOT_STARTED → 전체 NOT_STARTED.
 * - 필수 도메인이 전부 READY → 전체 READY(정보성 도메인은 게이트하지 않음, §13).
 * - 그 외 → PARTIAL.
 */
function aggregateOverall(domains: PEDecisionDomainResult[]): ReadinessState {
  const mandatory = domains.filter((d) => MANDATORY_DOMAINS.includes(d.domain));
  if (mandatory.some((d) => d.status === "BLOCKED")) return "BLOCKED";
  if (mandatory.every((d) => d.status === "NOT_STARTED")) return "NOT_STARTED";
  if (mandatory.every((d) => d.status === "READY")) return "READY";
  return "PARTIAL";
}

// ── 메인 진입점 ────────────────────────────────────────────────────────

export function buildPEDecisionReadiness(input: PEDecisionReadinessInput): PEDecisionReadiness {
  const periods = input.periods;
  const factConflicts = detectFactConflicts(periods);

  const financial = assessFinancial(periods, factConflicts);
  const qoe = assessQoe(periods, financial.result.status === "BLOCKED");
  const lbo = assessLbo(periods, qoe.qoe, qoe.result.status === "BLOCKED", input.lboAssumptions);
  const dd = assessDD(input.ddCase);
  const evidence = assessEvidence(input.evidenceLineage);
  const commercial = assessCommercial(input.commercialCustomers, periods[0]?.id);
  const dart = assessDart(periods);

  // 도메인 순서는 PE_DECISION_DOMAINS 선언 순서로 고정한다(§18 — 결정론적 정렬).
  const domains: PEDecisionDomainResult[] = [
    financial.result,
    qoe.result,
    lbo.result,
    dd.result,
    evidence.result,
    commercial.result,
    dart.result,
  ];

  const missingInformation = [
    ...financial.missing,
    ...qoe.missing,
    ...lbo.missing,
    ...dd.missing,
    ...evidence.missing,
    ...commercial.missing,
    ...dart.missing,
  ].sort((a, b) => a.code.localeCompare(b.code));

  const blockers = [...financial.blockers, ...qoe.blockers, ...lbo.blockers, ...dd.blockers, ...evidence.blockers, ...commercial.blockers].sort((a, b) =>
    a.code.localeCompare(b.code)
  );

  const overall = aggregateOverall(domains);

  const materialMissingCount = missingInformation.filter((m) => m.severity === "MATERIAL").length;
  const summary =
    overall === "BLOCKED"
      ? `${blockers.length}건의 데이터 모순으로 분석 신뢰도가 확보되지 않았습니다`
      : overall === "READY"
        ? "필수 분석 영역(재무/QoE/LBO)의 최소 데이터 패키지가 갖춰졌습니다"
        : overall === "NOT_STARTED"
          ? "아직 의미 있는 분석 입력이 없습니다"
          : `필수 영역 중 ${materialMissingCount}건의 중요 정보가 아직 없습니다`;

  return {
    overall,
    domains,
    missingInformation,
    blockers,
    factConflicts,
    qoeReviewTrackingLimitation:
      "현재 데이터 모델은 \"조정 0건\"과 \"QoE 검토를 아직 하지 않음\"을 구분할 수 없습니다 — QOE 상태는 Adjusted EBITDA 계산 성공 여부만 반영하며, 조정 존재 여부로 상태를 낮추지 않습니다.",
    summary,
  };
}
