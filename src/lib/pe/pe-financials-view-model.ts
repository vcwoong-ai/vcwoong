/**
 * PE Financials 탭 — 순수 뷰 모델(PR #106).
 *
 * 새 재무 계산을 하지 않는다. 이미 저장된 raw line item 값을 그대로
 * 찾아서 보여주기만 한다(계정별 조회 — 파생 지표가 아니므로 계산이 아님).
 * 모순(conflict) 개수는 `buildPEDecisionReadiness()`(pe-decision-readiness.ts,
 * PR #103, 수정 없음)가 이미 계산한 `factConflicts`를 그대로 받아서 세기만
 * 한다 — 새 contradiction engine을 만들지 않는다.
 *
 * DART가 실제로 매핑하는 6개 계정(dart-adapter.ts 확인 — REVENUE/EBIT
 * (영업이익)/NET_INCOME/TOTAL_ASSETS/TOTAL_LIABILITIES/EQUITY)을 그대로
 * 최소 표시 계정으로 쓴다. TOTAL_ASSETS/TOTAL_LIABILITIES/EQUITY는
 * `normalizeFinancialPeriod()`(PR-B)가 요약에 포함하지 않으므로(재무상태표
 * 총계는 파생 없이 그대로 쓰는 원장 계정이라 정규화 대상이 아님, dd-metrics-types.ts
 * 주석 참고) 여기서 raw line item을 직접 조회한다.
 */

import type { MaFinancialSourceType } from "@prisma/client";
import type { CanonicalLineItem } from "./financial-types";

export const CANONICAL_ACCOUNT_ROWS: Array<{ key: CanonicalLineItem; label: string }> = [
  { key: "REVENUE", label: "매출액" },
  { key: "EBIT", label: "영업이익" },
  { key: "NET_INCOME", label: "당기순이익" },
  { key: "TOTAL_ASSETS", label: "자산총계" },
  { key: "TOTAL_LIABILITIES", label: "부채총계" },
  { key: "EQUITY", label: "자본총계" },
];

export interface FinancialsLineItemLike {
  lineItem: string;
  value: number;
  currency: string;
  source: string;
  sourceName?: string | null;
}

export interface FinancialsPeriodLike {
  id: string;
  fiscalYear: number;
  lineItems: FinancialsLineItemLike[];
}

export type CanonicalAccountLookup =
  | { status: "missing" }
  | { status: "ok"; value: number; currency: string; source: MaFinancialSourceType; sourceName?: string | null }
  | { status: "conflict"; values: number[] };

/** 같은 기간·같은 계정에 line item이 여러 개면(값 또는 통화가 다르면) 값을
 * 대신 골라주지 않고 "conflict"로 정직하게 반환한다(pe-decision-readiness.ts의
 * detectFactConflicts()가 `${lineItem}|${currency}`로 묶는 것과 같은 원칙 —
 * 값이 같아도 통화가 다르면 서로 다른 사실이므로 값만으로 중복 제거하지
 * 않는다. 값을 조용히 무시하거나 하나만 골라 보여주지 않는다). */
export function lookupCanonicalAccount(
  period: FinancialsPeriodLike,
  lineItem: CanonicalLineItem
): CanonicalAccountLookup {
  const matches = period.lineItems.filter((li) => li.lineItem === lineItem);
  if (matches.length === 0) return { status: "missing" };
  const distinctValues = Array.from(new Set(matches.map((m) => `${m.value}|${m.currency}`))).map(
    (key) => Number(key.split("|")[0])
  );
  if (distinctValues.length > 1) return { status: "conflict", values: distinctValues };
  const m = matches[0];
  return {
    status: "ok",
    value: m.value,
    currency: m.currency,
    source: m.source as MaFinancialSourceType,
    sourceName: m.sourceName,
  };
}

export interface FinancialDataQuality {
  periodsCount: number;
  /** 최근 기간 기준, 6개 계정 중 실제로 값이 있는 계정 수 */
  accountsPresent: number;
  accountsTotal: number;
  /** 전체 기간에 걸쳐 source=DART인 line item 개수(중복 계정 포함, 건수) */
  dartSourcedCount: number;
  manualSourcedCount: number;
  /** 최근 기간 기준, 6개 계정 중 없는 계정 수(accountsTotal - accountsPresent와 동일하지만 명시적으로 노출) */
  missingCount: number;
  /** buildPEDecisionReadiness()의 factConflicts.length를 그대로 받는다(재계산 없음) */
  conflictsCount: number;
}

export function computeFinancialDataQuality(
  periods: FinancialsPeriodLike[],
  factConflictsCount: number
): FinancialDataQuality {
  const latest = periods[0];
  const accountsPresent = latest
    ? CANONICAL_ACCOUNT_ROWS.filter((row) => lookupCanonicalAccount(latest, row.key).status !== "missing").length
    : 0;
  const accountsTotal = CANONICAL_ACCOUNT_ROWS.length;

  let dartSourcedCount = 0;
  let manualSourcedCount = 0;
  for (const period of periods) {
    for (const li of period.lineItems) {
      if (li.source === "DART") dartSourcedCount++;
      else if (li.source === "MANUAL") manualSourcedCount++;
    }
  }

  return {
    periodsCount: periods.length,
    accountsPresent,
    accountsTotal,
    dartSourcedCount,
    manualSourcedCount,
    missingCount: accountsTotal - accountsPresent,
    conflictsCount: factConflictsCount,
  };
}
