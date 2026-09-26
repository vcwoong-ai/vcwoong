/**
 * PE Fact Unit — 통제된 단위 어휘 + currency 정합성 검증(PR-I.1, Finding #4).
 *
 * 감사 결과: 기존 PR-I는 `unit`을 자유 텍스트로만 다뤄 dedupe key에서도
 * 빠져 있었다 — "10 USD million"과 "10 USD billion"(1000배 차이)이 값만
 * 같으면 동일 fact로 취급돼 조용히 하나가 버려질 수 있음이 실증됐다. 이
 * 파일은 그 간극을 메운다: unit을 자유 텍스트가 아니라 통제된 값 집합
 * (PEUnit)으로 정규화하고, currency와의 정합성을 검증한다.
 *
 * 중요한 제약(요청사항 그대로):
 * - 여기서 "환산"은 하지 않는다 — 억원→원 변환 같은 실제 스케일 변환은
 *   여전히 하지 않는다(PR-E의 "raw KRW won → 명시적 변환 경계 → 억원"
 *   원칙을 그대로 존중 — 이 파일이 그 경계를 앞당기지 않는다).
 * - 인식되지 않는 단위 문자열은 "UNKNOWN"으로 남긴다(추측 금지) — null이
 *   아니라 명시적인 값으로 만들어서, "단위가 없음"과 "단위는 있지만
 *   해석 불가"를 구분한다.
 */

export const PE_UNITS = [
  "RAW_KRW_WON",
  "KRW_THOUSAND",
  "KRW_MILLION",
  "KRW_BILLION",
  "KRW_EOK",
  "USD",
  "USD_THOUSAND",
  "USD_MILLION",
  "USD_BILLION",
  "PERCENT",
  "COUNT",
  "UNKNOWN",
] as const;
export type PEUnit = (typeof PE_UNITS)[number];

const MONETARY_UNITS = new Set<PEUnit>([
  "RAW_KRW_WON",
  "KRW_THOUSAND",
  "KRW_MILLION",
  "KRW_BILLION",
  "KRW_EOK",
  "USD",
  "USD_THOUSAND",
  "USD_MILLION",
  "USD_BILLION",
]);

/** 화폐 단위가 어느 통화를 전제하는지 — 새 환산표가 아니라 "이 unit 문자열이
 * 주장하는 통화가 currency 필드와 일치하는가"만 확인하는 데 쓴다. */
const CURRENCY_FOR_MONETARY_UNIT: Record<string, string> = {
  RAW_KRW_WON: "KRW",
  KRW_THOUSAND: "KRW",
  KRW_MILLION: "KRW",
  KRW_BILLION: "KRW",
  KRW_EOK: "KRW",
  USD: "USD",
  USD_THOUSAND: "USD",
  USD_MILLION: "USD",
  USD_BILLION: "USD",
};

export function isMonetaryUnit(unit: PEUnit): boolean {
  return MONETARY_UNITS.has(unit);
}

/**
 * 자유 텍스트 unit을 통제된 PEUnit으로 정규화한다. 빈 문자열/undefined는
 * null(= "unit 자체가 없음", 기존 필수 검증이 처리)이고, 그 외 인식 못 하는
 * 문자열은 "UNKNOWN"이다(추측 금지 — 임의 카테고리에 끼워 넣지 않는다).
 */
export function normalizeUnitString(raw: string | undefined): PEUnit | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim().toLowerCase();
  if (/^(원|krw|krw[_\s-]?won|raw[_\s-]?krw|raw[_\s-]?krw[_\s-]?won)$/.test(s)) return "RAW_KRW_WON";
  if (/^(천원|krw[_\s-]?thousand)$/.test(s)) return "KRW_THOUSAND";
  if (/^(백만원|krw[_\s-]?million)$/.test(s)) return "KRW_MILLION";
  if (/^(십억원|krw[_\s-]?billion)$/.test(s)) return "KRW_BILLION";
  if (/^(억원|krw[_\s-]?eok)$/.test(s)) return "KRW_EOK";
  if (/^usd$/.test(s)) return "USD";
  if (/^usd[_\s-]?thousand$/.test(s)) return "USD_THOUSAND";
  if (/^usd[_\s-]?million$/.test(s)) return "USD_MILLION";
  if (/^usd[_\s-]?billion$/.test(s)) return "USD_BILLION";
  if (/^(%|percent|퍼센트)$/.test(s)) return "PERCENT";
  if (/^(count|명|건|개)$/.test(s)) return "COUNT";
  return "UNKNOWN";
}

/**
 * unit이 currency와 실제로 맞물리는지 확인한다(환산은 하지 않음 — 정합성
 * 검증만). PERCENT/COUNT는 통화와 무관하므로 항상 true. UNKNOWN은 스케일을
 * 판단할 수 없으므로 항상 false(안전한 쪽으로 실패 — 억지 통과 금지).
 */
export function isUnitCurrencyCompatible(unit: PEUnit, currency: string | undefined): boolean {
  if (unit === "PERCENT" || unit === "COUNT") return true;
  if (unit === "UNKNOWN") return false;
  if (!currency) return false;
  return CURRENCY_FOR_MONETARY_UNIT[unit] === currency;
}
