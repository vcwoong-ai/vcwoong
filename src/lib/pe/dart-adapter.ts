/**
 * DART → PE 재무 정규화 계층 어댑터.
 *
 * 기존 src/lib/dart.ts를 수정하지 않고 그대로 재사용한다. 이 파일은
 * DART의 출력(DartFinancials)을 PR-B의 canonical 입력(FinancialLineItemInput[])
 * 으로 "매핑"만 한다 — DB 호출·네트워크 호출·LLM 호출이 전혀 없는 순수
 * 함수다.
 *
 * ## dart.ts가 실제로 제공하는 계정(감사 결과, 2026-09-22 확인)
 *
 * `src/lib/dart.ts`의 `fetchDartFinancials()`는 DART의 "단일회사 주요계정"
 * 엔드포인트(`fnlttSinglAcnt.json`)만 호출하며, `ACCOUNT_MAP`이 실제로
 * 매핑하는 계정은 **6개뿐**이다:
 *
 *   매출액/영업수익 → revenue
 *   영업이익        → operatingProfit
 *   당기순이익      → netIncome
 *   자산총계        → totalAssets
 *   부채총계        → totalLiabilities
 *   자본총계        → totalEquity
 *
 * COGS/SG&A/R&D/D&A/이자비용/법인세/현금/매출채권/재고자산/유형자산/
 * 무형자산/매입채무/단기·장기차입금/영업현금흐름/Capex 등은 dart.ts가
 * 아예 조회하지 않는다(더 상세한 계정별 재무제표 엔드포인트를 쓰지 않음).
 * 이 어댑터는 **실제로 존재하지 않는 계정을 만들어내지 않는다** — 즉
 * EBITDA(=EBIT+D&A)·Net Debt·FCF는 DART import만으로는 계산할 수 없고,
 * PR-B의 정규화 엔진이 그대로 missing_input을 반환한다(정상 동작).
 *
 * ## "영업이익 → EBIT" 매핑에 대해
 *
 * 이것은 추정이 아니라 정의상 동일한 값의 재명명이다 — 한국 회계기준상
 * "영업이익"(매출-매출원가-판관비)은 이자·법인세 차감 전 영업손익으로,
 * 국제적으로 통용되는 EBIT(Earnings Before Interest and Tax)와 개념이
 * 같다. DART가 보고한 숫자를 그대로 옮길 뿐, 새 숫자를 계산하지 않는다.
 *
 * ## 금액 단위
 *
 * dart.ts의 `unit: "원"`은 원화 최소 단위(raw KRW won) — 억원 환산이나
 * 다른 배율 변환을 하지 않는다. financial-types.ts의 "원본 최소 단위
 * 저장" 원칙과 이미 정확히 일치한다.
 *
 * ## 회계기간
 *
 * dart.ts는 `reprt_code=11011`(사업보고서, 연간)만 조회하므로 이 어댑터가
 * 만드는 기간은 항상 ANNUAL이다. 분기 지원은 dart.ts 확장이 필요해 이번
 * PR 범위 밖이다. dart.ts는 회계연도의 시작/종료일을 직접 제공하지
 * 않으므로, 관행대로 역년(1/1~12/31)으로 가정한다(대부분의 국내 상장사
 * 회계연도와 일치) — 이 가정은 명시적으로 문서화해 둔다.
 */

import type { DartFinancials } from "../dart";
import type { CanonicalLineItem, FinancialLineItemInput } from "./financial-types";

export const DART_PERIOD_TYPE = "ANNUAL" as const;
export const DART_CURRENCY = "KRW" as const;

const DART_FIELD_TO_CANONICAL: ReadonlyArray<{
  dartField: keyof Omit<DartFinancials, "year" | "unit">;
  lineItem: CanonicalLineItem;
}> = [
  { dartField: "revenue", lineItem: "REVENUE" },
  { dartField: "operatingProfit", lineItem: "EBIT" },
  { dartField: "netIncome", lineItem: "NET_INCOME" },
  { dartField: "totalAssets", lineItem: "TOTAL_ASSETS" },
  { dartField: "totalLiabilities", lineItem: "TOTAL_LIABILITIES" },
  { dartField: "totalEquity", lineItem: "EQUITY" },
];

/**
 * DART 재무제표 1개년치를 PE canonical line item 배열로 변환한다.
 *
 * - null인 계정은 건너뛴다(0으로 만들지 않는다 — missing은 missing 그대로).
 * - 값이 유한하지 않으면(malformed) 건너뛴다 — dart.ts가 이미
 *   `Number.isFinite`로 걸러 보내지만, 어댑터 스스로도 방어적으로 확인한다.
 * - dart.ts가 실제로 제공하지 않는 계정(COGS/D&A/Cash/Debt/Capex 등)은
 *   추정해서 채우지 않는다.
 */
export function adaptDartFinancialsToPE(
  dart: DartFinancials
): FinancialLineItemInput[] {
  const items: FinancialLineItemInput[] = [];

  for (const { dartField, lineItem } of DART_FIELD_TO_CANONICAL) {
    const raw = dart[dartField];
    if (raw === null || raw === undefined) continue;
    if (!Number.isFinite(raw)) continue;

    items.push({
      lineItem,
      value: raw,
      currency: DART_CURRENCY,
      sourceType: "DART",
      // 계정별 상세 위치(페이지 등)는 dart.ts의 현재 응답에 없으므로
      // 지어내지 않는다 — sourceLocation은 비워둔다("알 때만 채운다").
      sourceName: "OpenDART 사업보고서",
    });
  }

  return items;
}

/** DartFinancials.year("2025" 형식)를 숫자 회계연도로 파싱한다. */
export function parseDartFiscalYear(dart: DartFinancials): number {
  const year = Number(dart.year);
  if (!Number.isInteger(year) || year < 1990 || year > 2100) {
    throw new Error(`유효하지 않은 DART 회계연도: ${dart.year}`);
  }
  return year;
}

/**
 * 회계연도를 역년 기간(1/1~12/31)으로 변환한다. dart.ts가 정확한 회계연도
 * 시작/종료일을 제공하지 않아서 쓰는 관행적 가정 — 코드 상단 문서 참고.
 */
export function dartFiscalYearToPeriodBounds(fiscalYear: number): {
  startDate: Date;
  endDate: Date;
} {
  return {
    startDate: new Date(Date.UTC(fiscalYear, 0, 1)),
    endDate: new Date(Date.UTC(fiscalYear, 11, 31)),
  };
}
