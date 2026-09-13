/**
 * AI 호출 비용 추정 — 모델별 단가를 이 코드에 하드코딩하지 않는다.
 *
 * OpenRouter는 매 응답의 `usage` 객체에 실제 청구 비용(`cost`, USD)을
 * 이미 포함해 돌려준다("Usage Accounting" — 예전엔 요청에
 * `usage: { include: true }`를 넣어야 했지만 현재는 항상 자동 포함되는
 *것으로 확인됨, 서드파티 자료 교차 확인. 이 세션은 openrouter.ai 문서를
 * 직접 열 수 없어(WebFetch: EGRESS_BLOCKED) 검색 결과로만 교차 확인했다).
 *
 * 그래서 이 파일은 "모델 X는 $Y/1M 토큰" 같은 표를 만들지 않는다 — 그
 * 표는 만드는 순간 실제 가격과 어긋나기 시작하고(OpenRouter 가격은
 * provider·시점별로 바뀜), Investment Quality Layer 전체가 지켜온
 * "근거 없는 수치를 사실처럼 제시하지 않는다" 원칙과도 어긋난다.
 * 대신 OpenRouter가 실제로 응답에 실어 보낸 값만 그대로 쓰고, 없으면
 * null로 남긴다 — null은 "0원"이 아니라 "모른다"는 뜻이다.
 */

/** OpenRouter 응답에서 얻을 수 있는(있을 때만) 비용 관련 정보 */
export interface ProviderUsageInfo {
  /** OpenRouter가 응답에 실은 실제 청구 비용(USD). 없으면 undefined */
  cost?: number;
}

export interface CalculateEstimatedCostInput {
  inputTokens: number;
  outputTokens: number;
  providerUsage?: ProviderUsageInfo;
}

/**
 * OpenRouter가 보고한 비용을 그대로 쓴다 — 계산도, 가정도 하지 않는다.
 *
 * null을 반환하는 경우(전부 "모른다"는 뜻, 0원으로 취급하면 안 됨):
 *   - 토큰 수가 비정상(음수·NaN·Infinity)
 *   - 입력/출력 토큰이 둘 다 0(실제 호출이 없었던 것으로 봄 — 데모 모드 등)
 *   - OpenRouter 응답에 cost 필드 자체가 없거나 숫자가 아님
 */
export function calculateEstimatedCost(
  input: CalculateEstimatedCostInput
): number | null {
  const { inputTokens, outputTokens, providerUsage } = input;

  if (
    !Number.isFinite(inputTokens) ||
    !Number.isFinite(outputTokens) ||
    inputTokens < 0 ||
    outputTokens < 0
  ) {
    return null;
  }
  if (inputTokens === 0 && outputTokens === 0) {
    return null;
  }

  const cost = providerUsage?.cost;
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) {
    return null;
  }
  return cost;
}
