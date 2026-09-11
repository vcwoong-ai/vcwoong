/**
 * OpenRouter 멀티 모델 폴백 체인 테스트.
 *
 * 배경: PR #58로 DOMException(AbortError) 재시도 분류는 고쳤는데, 그 다음
 * 실제로 폴백 모델(meta-llama/llama-3.3-70b-instruct:free)이 OpenRouter에서
 * 404("This model is unavailable for free")로 죽어 있었다 — 폴백이 "하나"뿐이라
 * 그 하나가 죽으면 안전망 자체가 없었다. 이제 폴백을 체인(여러 개)으로 두고,
 * 모델 하나가 죽어도 다음 모델로 넘어간다.
 *
 * runModelChain은 실제 네트워크 호출(callOnce)을 주입받는 순수 함수라, 여기서는
 * 합성 에러만으로 재시도/전환 로직을 검증한다 — 실제 OpenRouter API를 부르지 않는다.
 *
 * Usage: npm run test:openrouter-fallback-chain
 */
import {
  runModelChain,
  resolveFallbackChain,
  DEFAULT_FALLBACK_CHAIN,
  MAX_FALLBACK_MODELS,
  type ModelChainDeps,
} from "../src/lib/claude";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/**
 * 실제 setTimeout 없이 시간 예산을 흉내낸다 — sleep()이 호출되면 그만큼
 * "시간이 흐른 것"으로 치고 즉시 resolve한다(테스트가 실제로 몇 초씩
 * 기다리지 않게 함).
 */
function fakeDeps(totalBudgetMs: number): ModelChainDeps & { elapsedMs: () => number } {
  let elapsed = 0;
  return {
    remainingMs: () => totalBudgetMs - elapsed,
    attemptTimeout: () => {
      const left = totalBudgetMs - elapsed;
      return left <= 0 ? null : left;
    },
    sleep: async (ms: number) => {
      elapsed += ms;
    },
    elapsedMs: () => elapsed,
  };
}

function timeoutError(): DOMException {
  return new DOMException("This operation was aborted", "AbortError");
}

function modelUnavailableError(): { status: number; message: string } {
  return {
    status: 404,
    message: "This model is unavailable for free. The paid version is available now.",
  };
}

function serverError(): { status: number; message: string } {
  return { status: 503, message: "upstream overloaded" };
}

/** 1. Primary 성공 → fallback 호출 없음 */
async function testPrimarySuccessNoFallback() {
  const calls: string[] = [];
  const deps = fakeDeps(60_000);
  const { result, usedModel } = await runModelChain(
    ["primary", "fallback-a", "fallback-b"],
    async (model) => {
      calls.push(model);
      return `ok:${model}`;
    },
    deps
  );
  assert(usedModel === "primary", `primary가 성공했는데 usedModel이 ${usedModel}`);
  assert(result === "ok:primary", "primary 결과가 그대로 반환 안 됨");
  assert(calls.length === 1 && calls[0] === "primary", `fallback이 불필요하게 호출됨: ${calls.join(",")}`);
  console.log("✅ Primary 성공 → fallback 호출 없음");
}

/** 2. Primary timeout → 같은 모델 retry → 성공 */
async function testPrimaryTimeoutThenRetrySucceeds() {
  const calls: string[] = [];
  const deps = fakeDeps(60_000);
  const { usedModel } = await runModelChain(
    ["primary", "fallback-a"],
    async (model) => {
      calls.push(model);
      if (calls.length === 1) throw timeoutError();
      return "ok";
    },
    deps
  );
  assert(usedModel === "primary", `재시도 성공인데 usedModel이 ${usedModel}(같은 모델이어야 함)`);
  assert(calls.join(",") === "primary,primary", `같은 모델로 재시도해야 하는데: ${calls.join(",")}`);
  console.log("✅ Primary timeout → 같은 모델 retry → 성공");
}

/** 3. Primary timeout → retry도 실패 → fallback #1 성공 */
async function testPrimaryRetryExhaustedThenFallbackSucceeds() {
  const calls: string[] = [];
  const deps = fakeDeps(60_000);
  const { usedModel } = await runModelChain(
    ["primary", "fallback-a", "fallback-b"],
    async (model) => {
      calls.push(model);
      if (model === "primary") throw timeoutError();
      return "ok";
    },
    deps
  );
  assert(usedModel === "fallback-a", `fallback-a가 성공해야 하는데 usedModel=${usedModel}`);
  assert(
    calls.join(",") === "primary,primary,fallback-a",
    `primary 2회 재시도 후 fallback-a로 넘어가야 하는데: ${calls.join(",")}`
  );
  console.log("✅ Primary timeout → retry 실패 → fallback #1 성공");
}

/** 4. Primary 실패 → fallback #1 실패 → fallback #2 성공 */
async function testChainFallsThroughTwoFallbacks() {
  const calls: string[] = [];
  const deps = fakeDeps(60_000);
  const { usedModel } = await runModelChain(
    ["primary", "fallback-a", "fallback-b"],
    async (model) => {
      calls.push(model);
      if (model === "fallback-b") return "ok";
      throw timeoutError();
    },
    deps
  );
  assert(usedModel === "fallback-b", `fallback-b가 성공해야 하는데 usedModel=${usedModel}`);
  assert(
    calls.join(",") === "primary,primary,fallback-a,fallback-a,fallback-b",
    `체인이 primary→fallback-a→fallback-b 순서로 넘어가야 하는데: ${calls.join(",")}`
  );
  console.log("✅ Primary 실패 → fallback#1 실패 → fallback#2 성공");
}

/** 5. Fallback 모델 404(model unavailable) → 같은 모델 반복 재시도하지 않고 다음 fallback으로 즉시 이동 */
async function testFallbackModelUnavailableSkipsToNext() {
  const calls: string[] = [];
  const deps = fakeDeps(60_000);
  const { usedModel } = await runModelChain(
    ["primary", "fallback-a-dead", "fallback-b"],
    async (model) => {
      calls.push(model);
      if (model === "primary") throw timeoutError();
      if (model === "fallback-a-dead") throw modelUnavailableError(); // 실제 관측된 사고 재현
      return "ok";
    },
    deps
  );
  assert(usedModel === "fallback-b", `fallback-b가 성공해야 하는데 usedModel=${usedModel}`);
  // fallback-a-dead는 404라 재시도 없이 "1번만" 불려야 한다(primary는 timeout이라 2번)
  assert(
    calls.join(",") === "primary,primary,fallback-a-dead,fallback-b",
    `404 모델을 반복 재시도하지 않고 바로 다음으로 넘어가야 하는데: ${calls.join(",")}`
  );
  console.log("✅ Fallback 모델 404(model unavailable) → 같은 모델 반복 재시도 없이 다음 fallback으로 즉시 이동");
}

/** 6. 모든 모델 실패 → 최종 에러 반환 */
async function testAllModelsFailReturnsFinalError() {
  const deps = fakeDeps(60_000);
  let thrown: unknown;
  try {
    await runModelChain(
      ["primary", "fallback-a"],
      async () => {
        throw serverError();
      },
      deps
    );
  } catch (e) {
    thrown = e;
  }
  assert(Boolean(thrown), "모든 모델이 실패했는데 에러가 안 던져짐");
  assert((thrown as { status?: number }).status === 503, "마지막 에러가 그대로 전달되지 않음");
  console.log("✅ 모든 모델 실패 → 최종 에러 반환(마지막 에러 그대로)");
}

/** 7. AbortError(DOMException) → retry/fallback 대상으로 정상 분류(체인 레벨 통합 확인) */
async function testAbortErrorDrivesChainForward() {
  const calls: string[] = [];
  const deps = fakeDeps(60_000);
  const { usedModel } = await runModelChain(
    ["primary", "fallback-a"],
    async (model) => {
      calls.push(model);
      if (model === "primary") throw timeoutError();
      return "ok";
    },
    deps
  );
  assert(usedModel === "fallback-a", "DOMException(AbortError)이 체인을 다음 모델로 넘기지 못함");
  console.log("✅ AbortError(DOMException) → 체인이 정상적으로 다음 모델로 진행");
}

/** 8. 시간 예산 초과 → 추가 모델 호출 금지 */
async function testBudgetExhaustionStopsFurtherCalls() {
  const calls: string[] = [];
  // 예산을 아주 짧게 잡아, 1번째 실패 이후 재시도/다음 모델을 위한 여유가 없게 한다.
  const deps = fakeDeps(1); // 1ms — 첫 시도 이후 즉시 소진
  let thrown: unknown;
  try {
    await runModelChain(
      ["primary", "fallback-a", "fallback-b"],
      async (model) => {
        calls.push(model);
        throw timeoutError();
      },
      deps
    );
  } catch (e) {
    thrown = e;
  }
  assert(Boolean(thrown), "예산 소진인데 에러 없이 끝남");
  assert(calls.length === 1, `예산이 없는데 추가 모델을 호출함: ${calls.join(",")}`);
  console.log("✅ AI_CALL_BUDGET_MS(예산) 소진 → 추가 모델 호출 금지");
}

/** 9. fallback 모델 목록이 비어 있음(체인 길이 1) → 기존 동작과 호환 */
async function testEmptyFallbackChainBehavesLikeBefore() {
  const deps = fakeDeps(60_000);
  const { usedModel } = await runModelChain(
    ["only-model"],
    async () => "ok",
    deps
  );
  assert(usedModel === "only-model", "폴백이 없어도 primary 단독 호출이 정상 동작해야 함");

  let thrown: unknown;
  try {
    await runModelChain(["only-model"], async () => {
      throw serverError();
    }, deps);
  } catch (e) {
    thrown = e;
  }
  assert(Boolean(thrown), "폴백 없이 primary만 있고 실패하면 에러가 그대로 나와야 함");
  console.log("✅ 폴백 목록이 비어 있어도(체인 길이 1) 기존 동작과 호환");
}

/** 10. 기존 AI_FALLBACK_MODEL(단일)만 설정된 환경 → backward compatibility 유지 */
function testSingleFallbackEnvBackwardCompatible() {
  const chainWithOnlySingle = resolveFallbackChain(undefined, "custom/single-fallback");
  assert(
    chainWithOnlySingle.length === 1 && chainWithOnlySingle[0] === "custom/single-fallback",
    `AI_FALLBACK_MODEL만 설정된 환경에서 단일 폴백이 유지되지 않음: ${chainWithOnlySingle.join(",")}`
  );

  const chainWithList = resolveFallbackChain("a/one, b/two ,c/three", "ignored/single");
  assert(
    chainWithList.join(",") === "a/one,b/two,c/three",
    `AI_FALLBACK_MODELS가 있으면 그걸 우선해야 하는데: ${chainWithList.join(",")}`
  );

  const chainWithNeither = resolveFallbackChain(undefined, undefined);
  assert(
    chainWithNeither.join(",") === DEFAULT_FALLBACK_CHAIN.join(","),
    `둘 다 미설정이면 기본 체인(openrouter/free 등)을 써야 하는데: ${chainWithNeither.join(",")}`
  );

  // 설정 실수로 목록이 지나치게 길어져도 상한(MAX_FALLBACK_MODELS)으로 잘린다
  const longList = Array.from({ length: 10 }, (_, i) => `model-${i}`).join(",");
  const truncated = resolveFallbackChain(longList, undefined);
  assert(
    truncated.length === MAX_FALLBACK_MODELS,
    `폴백 목록이 상한(${MAX_FALLBACK_MODELS})으로 잘리지 않음: ${truncated.length}개`
  );

  console.log("✅ AI_FALLBACK_MODEL(단일)만 설정된 환경 하위호환 유지 + AI_FALLBACK_MODELS 목록/기본값/상한 정상 동작");
}

async function main() {
  console.log("\n=== DealMind OpenRouter 멀티 폴백 체인 테스트 ===\n");
  await testPrimarySuccessNoFallback();
  await testPrimaryTimeoutThenRetrySucceeds();
  await testPrimaryRetryExhaustedThenFallbackSucceeds();
  await testChainFallsThroughTwoFallbacks();
  await testFallbackModelUnavailableSkipsToNext();
  await testAllModelsFailReturnsFinalError();
  await testAbortErrorDrivesChainForward();
  await testBudgetExhaustionStopsFurtherCalls();
  await testEmptyFallbackChainBehavesLikeBefore();
  testSingleFallbackEnvBackwardCompatible();
  console.log("\n✅ OpenRouter 멀티 폴백 체인 테스트 통과\n");
}

main().catch((err) => {
  console.error("❌ 테스트 실패:", err);
  process.exit(1);
});
