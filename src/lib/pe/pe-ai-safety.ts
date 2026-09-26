/**
 * PE AI Safety — 투자 추천 어휘 필터(PR-I.1, adversarial review Finding #2/#3).
 *
 * PR-I의 원래 구현(`containsUnquotedRecommendationWord`, pe-dd-synthesis.ts)은
 * 따옴표로 감싼 구간을 검사에서 제외했다 — 감사 결과 AI가 스스로 지어낸
 * 인용문("Management said: \"BUY this company.\"")으로 이 필터를 우회할 수
 * 있음이 실증됐다(quote가 실제 evidence 발췌와 대조되지 않기 때문). 이
 * 파일의 `containsForbiddenRecommendationLanguage`는 그 신뢰를 걷어낸다 —
 * 따옴표 여부와 무관하게 금지 어휘가 있으면 항상 걸린다.
 *
 * 이 필터는 의도적으로 "완벽한 의미 분류기"가 아니다 — 결정론적 어휘
 * 목록 매칭일 뿐이다. 우회(indirect phrasing)를 전부 막는다고 주장하지
 * 않는다. Synthesis narrative(pe-dd-synthesis.ts)와 QoE adjustment의
 * `reason` 필드(pe-fact-extraction.ts) 양쪽에서 동일하게 재사용해, 필터가
 * "narrative에서만 적용되고 다른 AI 원천 텍스트는 새는" 문제(Finding #3)를
 * 없앤다.
 */

const FORBIDDEN_RECOMMENDATION_WORDS = [
  "BUY",
  "PASS",
  "DO NOT INVEST",
  "INVEST",
  "RECOMMEND",
  "ATTRACTIVE",
  "UNATTRACTIVE",
  "BEST",
  "WORST",
] as const;

/**
 * 따옴표 유무와 무관하게 금지 어휘가 텍스트 어디에든 있으면 true.
 * "완벽한 의미 분류기"가 아니라 결정론적 문자열 포함 검사임을 명시한다 —
 * 간접적 표현("the transaction appears compelling" 등)까지 막지는 못한다.
 */
export function containsForbiddenRecommendationLanguage(text: string): boolean {
  const upper = text.toUpperCase();
  return FORBIDDEN_RECOMMENDATION_WORDS.some((w) => upper.includes(w));
}

export { FORBIDDEN_RECOMMENDATION_WORDS };
