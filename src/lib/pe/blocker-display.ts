/**
 * PE 차단 요인 문구의 "표시용" 다듬기.
 *
 * `buildPEDecisionReadiness()`가 만든 차단 요인 문구(label/detail)에는 개발용 식별자가
 * 섞여 있다 — 재무기간 내부 id(`같은 기간(cmuo7r…)`), 계정 코드(`REVENUE`), 원 단위 정수
 * (`120000000000`). 엔진 문구를 바꾸면 위원회 자료 fingerprint가 달라져 이미 끝낸 검토가
 * "재검토 필요"로 뒤집히므로(review semantics 변경), 엔진은 그대로 두고 화면에서만
 * 읽기 좋게 옮긴다.
 *
 * 규칙은 네 가지뿐이고 모두 문자열 치환이다 — 값을 계산하거나 고르지 않는다.
 *  1) `(cuid)` 형태의 내부 id 제거
 *  2) 알려진 계정 코드를 한국어 이름으로
 *  3) 준비 상태 영문 코드(BLOCKED)를 "차단됨"으로
 *  4) 1억 이상 정수를 `1,200억원`으로(원 단위 → 억원, 소수 첨자 없이 정확히 나누어 떨어질 때만 소수 1자리)
 * 패턴에 맞지 않는 문구는 그대로 통과한다.
 */

const LINE_ITEM_KO: Record<string, string> = {
  REVENUE: "매출액",
  COGS: "매출원가",
  GROSS_PROFIT: "매출총이익",
  SGA: "판매관리비",
  RND: "연구개발비",
  EBITDA: "EBITDA",
  DA: "감가상각비",
  EBIT: "영업이익",
  INTEREST_EXPENSE: "이자비용",
  EBT: "세전이익",
  TAX: "법인세",
  NET_INCOME: "당기순이익",
  CASH: "현금성자산",
  ACCOUNTS_RECEIVABLE: "매출채권",
  INVENTORY: "재고자산",
  PPE: "유형자산",
  INTANGIBLE_ASSETS: "무형자산",
  TOTAL_ASSETS: "자산총계",
  ACCOUNTS_PAYABLE: "매입채무",
  SHORT_TERM_DEBT: "단기차입금",
  LONG_TERM_DEBT: "장기차입금",
  TOTAL_LIABILITIES: "부채총계",
  EQUITY: "자본총계",
  OPERATING_CASH_FLOW: "영업활동현금흐름",
  CAPEX: "설비투자",
  FREE_CASH_FLOW: "잉여현금흐름",
};

const CUID_IN_PARENS = /\((?:c[a-z0-9]{20,})\)/g;
const CODE_PATTERN = new RegExp(`\\b(${Object.keys(LINE_ITEM_KO).sort((a, b) => b.length - a.length).join("|")})\\b`, "g");
const BIG_INTEGER = /(?<![\d,.])(\d{9,})(?!\d|[,.]\d|억)/g;

export function formatWonAsEok(won: number): string {
  const eok = won / 100_000_000;
  const exact = Number.isInteger(eok);
  return `${exact ? eok.toLocaleString("ko-KR") : eok.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}억원`;
}

export function presentBlockerLabel(label: string): string {
  return label.replace(CODE_PATTERN, (code) => LINE_ITEM_KO[code] ?? code);
}

export function presentBlockerDetail(detail: string): string {
  return detail
    .replace(CUID_IN_PARENS, "")
    .replace(/같은 기간\s+의/g, "같은 기간의")
    .replace(CODE_PATTERN, (code) => LINE_ITEM_KO[code] ?? code)
    .replace(/\bBLOCKED\b/g, "차단됨")
    .replace(BIG_INTEGER, (digits) => formatWonAsEok(Number(digits)))
    .replace(/\s{2,}/g, " ")
    .trim();
}
