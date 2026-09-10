/**
 * OpenRouter 재시도/폴백 분류 로직 검증.
 *
 * 배경(실제로 있었던 버그): callWithFallback의 재시도 대상 판별이
 * `err.name === "APIConnectionTimeoutError"` 같은 문자열 비교였는데, OpenAI
 * SDK가 던지는 이 에러 인스턴스들은 전부 `.name`이 "Error"로 고정돼 있다
 * (서브클래스에서 따로 지정하지 않음). 즉 이 비교는 한 번도 true가 될 수
 * 없었다 — 타임아웃이 나도 폴백 모델로 못 넘어가고 그대로 실패했다는 뜻.
 *
 * 프로덕션에서 /api/reports/[id]/run이 60초 타임아웃으로 죽은 사고를
 * 조사하다 발견했다. instanceof로 판별하도록 고쳤고, 이 테스트는 그
 * 판별이 실제로 동작하는지(그리고 나중에 다시 문자열 비교로 회귀하지
 * 않는지) 고정한다.
 *
 * Usage: npm run test:openrouter-retry
 */
import OpenAI from "openai";
import { isRetryableAIError, shouldTryFallbackModel } from "../src/lib/claude";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testConnectionTimeoutIsRetryable() {
  const err = new OpenAI.APIConnectionTimeoutError();
  assert(
    isRetryableAIError(err),
    "APIConnectionTimeoutError가 재시도 대상으로 인식되지 않음 — 타임아웃 나면 폴백 모델로 못 넘어감"
  );
  assert(shouldTryFallbackModel(err), "타임아웃인데 폴백 모델 전환 대상이 아님");
  console.log("✅ APIConnectionTimeoutError(SDK 자체 타임아웃)는 재시도/폴백 대상");
}

function testUserAbortIsRetryable() {
  // callOnce()에서 명시적으로 건 AbortSignal.timeout()이 실제로 발동하면
  // SDK는 이 에러를 던진다 — 이것도 재시도 대상이어야 한다.
  const err = new OpenAI.APIUserAbortError();
  assert(
    isRetryableAIError(err),
    "APIUserAbortError(명시적 AbortSignal)가 재시도 대상으로 인식되지 않음"
  );
  console.log("✅ APIUserAbortError(명시적 AbortSignal 중단)도 재시도/폴백 대상");
}

function testConnectionErrorIsRetryable() {
  const err = new OpenAI.APIConnectionError({ message: "network down" });
  assert(isRetryableAIError(err), "APIConnectionError가 재시도 대상으로 인식되지 않음");
  console.log("✅ APIConnectionError(네트워크 연결 실패)도 재시도/폴백 대상");
}

function testRateLimitAndServerErrorsAreRetryable() {
  for (const status of [429, 500, 502, 503]) {
    const err = { status, message: "boom" };
    assert(
      isRetryableAIError(err),
      `HTTP ${status}가 재시도 대상으로 인식되지 않음`
    );
  }
  console.log("✅ 429/500/502/503은 재시도 대상");
}

function testModelOrAuthErrorsFallBackButDontRetrySameModel() {
  for (const status of [400, 401, 403, 404]) {
    const err = { status, message: "bad model or key" };
    assert(
      !isRetryableAIError(err),
      `HTTP ${status}가 같은 모델 재시도 대상으로 잘못 분류됨 — 재시도해도 소용없음`
    );
    assert(
      shouldTryFallbackModel(err),
      `HTTP ${status}일 때 폴백 모델 전환을 시도하지 않음 — 모델 ID 오타 하나로 생성 전체가 죽는다`
    );
  }
  console.log("✅ 400/401/403/404는 같은 모델 재시도는 안 하지만 폴백 모델은 시도");
}

function testUnrelatedErrorsAreNotRetryable() {
  const err = new Error("아무 관련 없는 에러");
  assert(!isRetryableAIError(err), "무관한 에러가 재시도 대상으로 잘못 분류됨");
  assert(!shouldTryFallbackModel(err), "무관한 에러인데 폴백을 시도함");
  console.log("✅ 무관한 에러는 재시도·폴백 대상 아님 (즉시 실패)");
}

function main() {
  console.log("\n=== DealMind OpenRouter 재시도/폴백 분류 테스트 ===\n");
  testConnectionTimeoutIsRetryable();
  testUserAbortIsRetryable();
  testConnectionErrorIsRetryable();
  testRateLimitAndServerErrorsAreRetryable();
  testModelOrAuthErrorsFallBackButDontRetrySameModel();
  testUnrelatedErrorsAreNotRetryable();
  console.log("\n✅ OpenRouter 재시도/폴백 분류 테스트 통과\n");
}

main();
