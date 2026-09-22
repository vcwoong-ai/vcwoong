/**
 * PE 재무 정규화 계층 — 공통 타입.
 *
 * 계정과목(line item)은 Prisma enum으로 강하게 고정하지 않는다(향후 실제
 * 재무제표마다 계정명이 조금씩 다르고, 아직 계산 엔진이 다루지 않는
 * 계정도 원본 그대로 저장할 수 있어야 하기 때문 — CompanyKPI가 metric을
 * enum이 아니라 String으로 두는 것과 동일한 이유). 대신 여기서 "정규화
 * 엔진이 실제로 계산에 쓰는" 계정 집합만 문자열 리터럴 유니온으로 명확히
 * 하고, API 입력 검증(financial-validation.ts)에서 이 집합을 기준으로
 * 알려진 계정인지 확인한다.
 *
 * 금액 단위: 이 레이어의 모든 value는 통화의 최소 표시 단위 원본 금액
 * (예: KRW는 "원" 단위, 억원 환산 없음)이다. Deal/Fund/PortfolioCompany
 * 등 VC 쪽 화면 표시용 필드(투자금 등)는 "억원" 단위 코멘트가 붙어 있지만,
 * PE 재무제표는 원천 문서(사업보고서·DART 등)의 계정과목 단위를 그대로
 * 보존해야 손익/재무상태표 항목 간 합산·검증이 정확하다 — 화면 표시 시의
 * 환산(억원 등)은 이 레이어의 책임이 아니라 상위(UI/리포트) 책임이다.
 */

export const INCOME_STATEMENT_LINE_ITEMS = [
  "REVENUE",
  "COGS",
  "GROSS_PROFIT",
  "SGA",
  "RND",
  "EBITDA",
  "DA",
  "EBIT",
  "INTEREST_EXPENSE",
  "EBT",
  "TAX",
  "NET_INCOME",
] as const;

export const BALANCE_SHEET_LINE_ITEMS = [
  "CASH",
  "ACCOUNTS_RECEIVABLE",
  "INVENTORY",
  "OTHER_CURRENT_ASSETS",
  "PPE",
  "INTANGIBLE_ASSETS",
  "TOTAL_ASSETS",
  "ACCOUNTS_PAYABLE",
  "SHORT_TERM_DEBT",
  "OTHER_CURRENT_LIABILITIES",
  "LONG_TERM_DEBT",
  "OTHER_NON_CURRENT_LIABILITIES",
  "TOTAL_LIABILITIES",
  "EQUITY",
] as const;

export const CASH_FLOW_LINE_ITEMS = [
  "OPERATING_CASH_FLOW",
  "CAPEX",
  "FREE_CASH_FLOW",
] as const;

export const CANONICAL_LINE_ITEMS = [
  ...INCOME_STATEMENT_LINE_ITEMS,
  ...BALANCE_SHEET_LINE_ITEMS,
  ...CASH_FLOW_LINE_ITEMS,
] as const;

export type CanonicalLineItem = (typeof CANONICAL_LINE_ITEMS)[number];

export type MaFinancialStatementType =
  | "INCOME_STATEMENT"
  | "BALANCE_SHEET"
  | "CASH_FLOW";

/** 계정과목이 속한 재무제표 종류 — statementType·lineItem 조합 검증에 사용 */
export const LINE_ITEM_STATEMENT_TYPE: Record<
  CanonicalLineItem,
  MaFinancialStatementType
> = Object.fromEntries([
  ...INCOME_STATEMENT_LINE_ITEMS.map((k) => [k, "INCOME_STATEMENT"] as const),
  ...BALANCE_SHEET_LINE_ITEMS.map((k) => [k, "BALANCE_SHEET"] as const),
  ...CASH_FLOW_LINE_ITEMS.map((k) => [k, "CASH_FLOW"] as const),
]) as Record<CanonicalLineItem, MaFinancialStatementType>;

export type MaFinancialSourceType =
  | "UPLOADED_DOCUMENT"
  | "EXCEL"
  | "DART"
  | "MANUAL";

/**
 * 근거(출처) — evidence.ts의 EvidenceSource(location은 알 때만 채우는
 * 자유 문자열)와 동일한 패턴을 재사용한다. 구조화된 타입을 새로 만들지
 * 않는다.
 */
export interface FinancialSourceLineage {
  sourceType: MaFinancialSourceType;
  /** 예: "2025_사업보고서.pdf", "2025_Financials.xlsx" */
  sourceName?: string;
  /** 알 때만 채운다. 예: "23페이지", "시트: 손익계산서!B14" */
  sourceLocation?: string;
}

/** 정규화 엔진에 들어가는 계정 한 줄 — DB row와 별개로, 계산에만 쓰는 순수 입력 타입 */
export interface FinancialLineItemInput extends FinancialSourceLineage {
  lineItem: CanonicalLineItem;
  value: number;
  currency: string;
}

/** QoE 조정 1건 — PR-D가 category(일회성/런레이트/시너지 등)를 확장할 수 있도록
 * 지금은 일반적인 형태만 유지한다(금액·근거만, 분류는 PR-D 범위). */
export interface FinancialAdjustmentInput extends FinancialSourceLineage {
  metric: CanonicalLineItem;
  reportedValue: number;
  adjustmentValue: number;
  reason: string;
}

/** 한 재무기간(연/분기/TTM 1개)의 정규화 입력 — 기간을 섞을 수 없도록
 * "기간 1개 = 호출 1개"로 타입을 설계한다(다른 기간의 line item을 같은
 * 배열에 넣을 방법이 구조적으로 없음). */
export interface NormalizeFinancialPeriodInput {
  periodCurrency: string;
  lineItems: FinancialLineItemInput[];
  adjustments?: FinancialAdjustmentInput[];
}

/**
 * 계산 결과 — undefined/null을 조용히 0으로 만들지 않기 위해, 계산이
 * 불가능하면 어떤 입력이 없어서인지 명시한다("missing_input"). 계산은
 * 항상 결정적(pure)이다.
 */
export type FinancialCalcResult =
  | { status: "ok"; value: number }
  | { status: "missing_input"; missing: string[] }
  | { status: "currency_mismatch"; detail: string };
