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
  AI_CALL_BUDGET_MS,
  REQUEST_TIMEOUT_MS,
  FALLBACK_REQUEST_TIMEOUT_MS,
  QualityGateError,
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
function fakeDeps(
  totalBudgetMs: number
): ModelChainDeps & { elapsedMs: () => number; advance: (ms: number) => void } {
  let elapsed = 0;
  return {
    remainingMs: () => totalBudgetMs - elapsed,
    // 대부분의 테스트는 모델별 타임아웃 차이를 신경 쓰지 않고 "체인이
    // 어떤 모델을 어떤 순서로 호출하는가"만 검증하므로, 여기서는 modelIdx를
    // 무시하고 남은 예산 전체를 준다 — 모델별로 다른 값을 실제로 검증하는
    // 테스트(아래 fallback 전용 타임아웃 테스트들)는 자체 deps를 직접 만든다.
    attemptTimeout: (_modelIdx: number) => {
      const left = totalBudgetMs - elapsed;
      return left <= 0 ? null : left;
    },
    sleep: async (ms: number) => {
      elapsed += ms;
    },
    elapsedMs: () => elapsed,
    // 실제 API 호출은 sleep() 없이도 벽시계 시간을 쓴다(callOnce의 fetch
    // 자체가 시간을 소비) — 이 fake 하네스는 sleep()만 시간을 흘려보내므로,
    // "호출 자체가 시간을 다 쓴다"를 재현하려는 테스트는 콜백 안에서 이
    // advance()를 직접 불러 시뮬레이션한다.
    advance: (ms: number) => {
      elapsed += ms;
    },
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

/**
 * 2. Primary timeout → 기본값(MODEL_ATTEMPTS=1)으로는 같은 모델을 재시도하지
 * 않고 곧바로 다음 모델로 넘어간다.
 *
 * 예전엔 여기서 같은 모델을 1회 더 재시도했는데, attemptTimeout()이 "남은
 * 예산 전부"를 다음 시도에 넘겨주는 구조라 실제 프로덕션에서 1차 모델이
 * 타임아웃 나면 재시도가 남은 예산을 전부 써버려 정작 폴백 모델은 단 한
 * 번도 호출되지 못하는 사고로 이어졌다(2026-09-11 실측 — claude.ts의
 * MODEL_ATTEMPTS 주석 참고). 그래서 기본 동작을 "실패하면 곧장 다음
 * 모델"로 바꿨다 — 재시도 자체가 불필요해진 게 아니라(runModelChain은
 * attemptsPerModel을 여전히 지원), 그게 기본값이 아니게 됐을 뿐이다.
 */
async function testPrimaryTimeoutSkipsRetryGoesToFallback() {
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
  assert(usedModel === "fallback-a", `fallback-a가 성공해야 하는데 usedModel=${usedModel}`);
  assert(
    calls.join(",") === "primary,fallback-a",
    `기본값(재시도 없음)으로 primary 1회 실패 후 곧장 fallback-a로 넘어가야 하는데: ${calls.join(",")}`
  );
  console.log("✅ Primary timeout → 기본값은 같은 모델 재시도 없이 곧장 fallback으로 전환");
}

/**
 * 2b. attemptsPerModel을 명시적으로 넘기면 같은 모델 재시도 자체는 여전히
 * 동작한다 — 이번 변경이 재시도 "기능"을 없앤 게 아니라 기본값만 바꿨음을
 * 증명한다.
 */
async function testExplicitAttemptsPerModelStillRetries() {
  const calls: string[] = [];
  const deps: ModelChainDeps = { ...fakeDeps(60_000), attemptsPerModel: 2 };
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
  assert(calls.join(",") === "primary,primary", `attemptsPerModel:2를 명시했는데 재시도가 없음: ${calls.join(",")}`);
  console.log("✅ attemptsPerModel을 명시하면 같은 모델 재시도 기능 자체는 여전히 동작");
}

/** 3. Primary 실패 → fallback #1 성공 (기본값: 재시도 없이 바로 다음 모델) */
async function testPrimaryFailsThenFallbackSucceeds() {
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
    calls.join(",") === "primary,fallback-a",
    `primary 1회 실패 후 곧장 fallback-a로 넘어가야 하는데: ${calls.join(",")}`
  );
  console.log("✅ Primary 실패 → fallback #1 성공");
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
    calls.join(",") === "primary,fallback-a,fallback-b",
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
  assert(
    calls.join(",") === "primary,fallback-a-dead,fallback-b",
    `어느 모델도 반복 재시도하지 않고(기본값) 순서대로 넘어가야 하는데: ${calls.join(",")}`
  );
  console.log("✅ Fallback 모델 404(model unavailable) → 같은 모델 반복 재시도 없이 다음 fallback으로 즉시 이동");
}

/**
 * 모델별 고정 타임아웃(REQUEST_TIMEOUT_MS=primary, FALLBACK_REQUEST_TIMEOUT_MS=
 * 그 이후 전부)을 실제로 구현한 deps — "남은 예산을 그대로 물려주는" 구조가
 * 아니라 앞선 모델이 자기 몫을 다 쓰고 실패해도 다음 모델이 항상 자기 몫을
 * 새로 받는지를 검증하는 아래 두 회귀 테스트 전용이다(callWithFallback의
 * attemptTimeout과 동일한 계산식 — claude.ts의 FALLBACK_REQUEST_TIMEOUT_MS
 * 주석 참고).
 */
function realisticBudgetDeps(totalBudgetMs: number) {
  let elapsed = 0;
  return {
    remainingMs: () => totalBudgetMs - elapsed,
    attemptTimeout: (modelIdx: number): number | null => {
      const left = totalBudgetMs - elapsed;
      if (left <= 0) return null;
      const perModelCap = modelIdx === 0 ? REQUEST_TIMEOUT_MS : FALLBACK_REQUEST_TIMEOUT_MS;
      return Math.min(perModelCap, left);
    },
    sleep: async (ms: number) => {
      elapsed += ms;
    },
    advance: (ms: number) => {
      elapsed += ms;
    },
  };
}

/**
 * 5b. 회귀 테스트 — 실제 프로덕션 값(AI_CALL_BUDGET_MS, REQUEST_TIMEOUT_MS,
 * FALLBACK_REQUEST_TIMEOUT_MS) 그대로, primary가 REQUEST_TIMEOUT_MS를 꽉
 * 채워 타임아웃 나도 fallback#1이 "자기 몫"(FALLBACK_REQUEST_TIMEOUT_MS)을
 * 온전히 받는지 확인한다.
 *
 * 예전엔(MODEL_ATTEMPTS=2) primary 재시도가 예산을 전부 써서 폴백이
 * attemptTimeout()=null을 받아 단 한 번도 호출되지 못했다(2026-09-11
 * 프로덕션 사고). MODEL_ATTEMPTS=1로 고친 뒤에도 "남은 예산을 그대로
 * 물려주는" 구조라, primary가 REQUEST_TIMEOUT_MS를 꽉 채우면 fallback#1은
 * 남은 시간(AI_CALL_BUDGET_MS-REQUEST_TIMEOUT_MS)만 받았다 — 그 fallback#1도
 * 타임아웃 나면 fallback#2는 남은 시간이 0이라 아예 호출되지 못했다
 * (2026-09-12 실측: report=cmtycq7ne... primary+openrouter/free 둘 다
 * 타임아웃, meta-llama는 호출 흔적 자체가 없음). 지금은 fallback마다 고정된
 * FALLBACK_REQUEST_TIMEOUT_MS를 주므로 이 문제가 없다.
 */
async function testFallbackGetsDedicatedBudgetAfterPrimaryTimesOut() {
  const deps = realisticBudgetDeps(AI_CALL_BUDGET_MS);
  const timeoutsSeen: Array<number | null> = [];
  const { usedModel } = await runModelChain(
    ["primary", "fallback-a"],
    async (model, timeout) => {
      timeoutsSeen.push(timeout);
      if (model === "primary") {
        deps.advance(REQUEST_TIMEOUT_MS); // primary가 타임아웃 꽉 채워 실패
        throw timeoutError();
      }
      return "ok";
    },
    deps
  );
  assert(usedModel === "fallback-a", `fallback-a가 성공해야 하는데 usedModel=${usedModel}`);
  const fallbackTimeout = timeoutsSeen[1];
  assert(
    fallbackTimeout !== null && fallbackTimeout > 0,
    `fallback이 시도할 시간을 못 받음(timeout=${fallbackTimeout}) — primary 재시도가 예산을 전부 태운 옛 버그 재발`
  );
  assert(
    fallbackTimeout === FALLBACK_REQUEST_TIMEOUT_MS,
    `fallback이 "남은 예산 전부"가 아니라 자기 몫(FALLBACK_REQUEST_TIMEOUT_MS=${FALLBACK_REQUEST_TIMEOUT_MS}ms)을 받아야 하는데 ${fallbackTimeout}ms를 받음`
  );
  console.log(
    `✅ primary가 REQUEST_TIMEOUT_MS(${REQUEST_TIMEOUT_MS}ms) 꽉 채워 실패해도 fallback#1이 자기 몫(${fallbackTimeout}ms)을 받음`
  );
}

/**
 * 5c. 핵심 회귀 테스트 — primary와 fallback#1이 "둘 다" 각자의 타임아웃을
 * 꽉 채워 실패해도(정확히 2026-09-12 프로덕션에서 관측된 패턴) fallback#2
 * (체인의 세 번째이자 마지막 모델)가 실제로 호출되고, 0이 아닌 의미 있는
 * 타임아웃을 받는지 확인한다. 이게 이번 작업의 핵심 목표다 — 예전 구조로는
 * primary(25s)+fallback#1(남은 15s)로 40초 예산이 이미 소진돼 fallback#2는
 * "시간 예산 소진"으로 호출조차 되지 않았다.
 */
async function testSecondFallbackAlsoGetsCalledWithRealBudget() {
  const deps = realisticBudgetDeps(AI_CALL_BUDGET_MS);
  const timeoutsSeen: Array<number | null> = [];
  const calls: string[] = [];
  const { usedModel } = await runModelChain(
    ["primary", "fallback-a", "fallback-b"],
    async (model, timeout) => {
      calls.push(model);
      timeoutsSeen.push(timeout);
      if (model === "fallback-b") return "ok";
      deps.advance(model === "primary" ? REQUEST_TIMEOUT_MS : FALLBACK_REQUEST_TIMEOUT_MS);
      throw timeoutError();
    },
    deps
  );
  assert(
    calls.join(",") === "primary,fallback-a,fallback-b",
    `primary·fallback#1이 둘 다 실패해도 fallback#2까지 순서대로 호출돼야 하는데: ${calls.join(",")}`
  );
  assert(usedModel === "fallback-b", `fallback-b가 성공해야 하는데 usedModel=${usedModel}`);
  const secondFallbackTimeout = timeoutsSeen[2];
  assert(
    secondFallbackTimeout !== null && secondFallbackTimeout > 0,
    `fallback#2(마지막 모델)가 시간을 못 받아 호출 의미가 없음(timeout=${secondFallbackTimeout}) — ` +
      "예전 버그(공유 예산 소진으로 마지막 모델 스킵)가 재발함"
  );
  assert(
    secondFallbackTimeout === FALLBACK_REQUEST_TIMEOUT_MS,
    `fallback#2도 자기 몫(FALLBACK_REQUEST_TIMEOUT_MS=${FALLBACK_REQUEST_TIMEOUT_MS}ms)을 받아야 하는데 ${secondFallbackTimeout}ms를 받음`
  );
  console.log(
    `✅ primary·fallback#1이 둘 다 타임아웃 나도 fallback#2가 실제로 호출되고 ${secondFallbackTimeout}ms의 실행 시간을 받음`
  );
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
  // 실제 API 호출 1번이 예산을 전부 써버리는 상황을 재현한다(=프로덕션에서
  // 실제로 발생한 사고 패턴 — 첫 시도가 REQUEST_TIMEOUT_MS만큼 걸려서
  // 타임아웃 나면, 남은 예산이 0이라 다음 모델은 시도조차 못 한다).
  const deps = fakeDeps(10_000);
  let thrown: unknown;
  try {
    await runModelChain(
      ["primary", "fallback-a", "fallback-b"],
      async (model) => {
        calls.push(model);
        deps.advance(10_000); // 이 호출이 예산을 전부 소비했다고 시뮬레이션
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

/** console.warn 출력을 임시로 가로채 배열로 모은다 — 구조화 로그 형식 검증용 */
async function captureWarnings(fn: () => Promise<void>): Promise<string[]> {
  const captured: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    captured.push(args.map(String).join(" "));
  };
  try {
    await fn();
  } finally {
    console.warn = original;
  }
  return captured;
}

/**
 * G/H. Primary가 HTTP 200을 반환했지만 내용이 품질 게이트를 통과하지
 * 못하면(모호한 출력이든 완전히 무관한 출력이든, 게이트 관점에서는 둘 다
 * QualityGateError) fallback으로 넘어가야 한다 — "HTTP 성공 ≠ AI 성공".
 */
async function testMalformedPrimaryOutputTriggersFallback() {
  const calls: string[] = [];
  const deps = fakeDeps(60_000);
  const { usedModel } = await runModelChain(
    ["primary", "fallback-a"],
    async (model) => {
      calls.push(model);
      if (model === "primary") {
        // HTTP 200 + 응답은 왔지만 도메인 검증(section-generation-gate.ts 등)에
        // 실패한 상황을 흉내낸다 — callOnce()가 실제로 이렇게 던진다.
        throw new QualityGateError("primary", "TOO_SHORT");
      }
      return "ok";
    },
    deps
  );
  assert(
    usedModel === "fallback-a",
    `HTTP 200 + malformed output이어도 fallback으로 넘어가야 하는데 usedModel=${usedModel}`
  );
  assert(calls.join(",") === "primary,fallback-a", `호출 순서가 예상과 다름: ${calls.join(",")}`);
  console.log("✅ Primary가 HTTP 200 + 품질 게이트 실패(malformed/unrelated 출력) → fallback 실행");
}

/** I. Primary timeout(기존 검증된 경로)도 여전히 fallback으로 이어짐 — 회귀 방지 */
async function testPrimaryTimeoutStillTriggersFallback() {
  const deps = fakeDeps(60_000);
  const { usedModel } = await runModelChain(
    ["primary", "fallback-a"],
    async (model) => {
      if (model === "primary") throw timeoutError();
      return "ok";
    },
    deps
  );
  assert(usedModel === "fallback-a", "Primary timeout인데 fallback으로 안 넘어감");
  console.log("✅ Primary timeout → fallback 실행 (회귀 없음)");
}

/** J. fallback도 품질 게이트 실패 → 다음 fallback으로 계속 전환 */
async function testFallbackQualityFailContinuesToNextFallback() {
  const calls: string[] = [];
  const deps = fakeDeps(60_000);
  const { usedModel } = await runModelChain(
    ["primary", "fallback-a", "fallback-b"],
    async (model) => {
      calls.push(model);
      if (model === "fallback-b") return "ok";
      throw new QualityGateError(model, "MISSING_RECOMMENDATION_LABEL");
    },
    deps
  );
  assert(usedModel === "fallback-b", `fallback-b까지 넘어가야 하는데 usedModel=${usedModel}`);
  assert(
    calls.join(",") === "primary,fallback-a,fallback-b",
    `체인 전체가 품질 게이트 실패를 겪고도 순서대로 넘어가야 하는데: ${calls.join(",")}`
  );
  console.log("✅ fallback도 품질 게이트 실패 → 다음 fallback으로 계속 전환");
}

/**
 * K. 모든 모델이 품질 게이트에 실패하면 QualityGateError가 그대로
 * 던져진다(report-generation.ts의 기존 catch가 이를 PENDING checkpoint로
 * 흡수한다 — 이 테스트는 claude.ts 레벨의 계약만 확인한다).
 */
async function testAllModelsQualityFailThrowsQualityGateError() {
  const deps = fakeDeps(60_000);
  let thrown: unknown;
  try {
    await runModelChain(
      ["primary", "fallback-a"],
      async (model) => {
        throw new QualityGateError(model, "TOO_SHORT");
      },
      deps
    );
  } catch (e) {
    thrown = e;
  }
  assert(thrown instanceof QualityGateError, "모든 모델이 품질 게이트에 실패했는데 QualityGateError가 아님");
  console.log("✅ 모든 모델 품질 게이트 실패 → QualityGateError 그대로 전파(→ PENDING checkpoint로 이어짐)");
}

/**
 * 구조화 로그 검증 — reportId/section이 주어지면 실제로 [AI_QUALITY_GATE_FAIL]/
 * [AI_SECTION_GENERATION_PENDING] 형태로 남는지 확인한다(사용자 요청 §13).
 */
async function testQualityGateFailureEmitsStructuredLogs() {
  const deps = fakeDeps(60_000);
  const warnings = await captureWarnings(async () => {
    try {
      await runModelChain(
        ["primary", "fallback-a"],
        async (model) => {
          throw new QualityGateError(model, "TOO_SHORT");
        },
        deps,
        { reportId: "report-abc", section: "OPINION_SUMMARY" }
      );
    } catch {
      // 의도된 최종 실패 — 로그 내용만 검증한다.
    }
  });

  const gateFailLines = warnings.filter((w) => w.includes("[AI_QUALITY_GATE_FAIL]"));
  assert(gateFailLines.length === 2, `모델 2개가 각각 실패했는데 gate-fail 로그가 ${gateFailLines.length}건`);
  assert(
    gateFailLines[0].includes("reportId=report-abc") && gateFailLines[0].includes("section=OPINION_SUMMARY"),
    `구조화 로그에 reportId/section이 없음: ${gateFailLines[0]}`
  );
  assert(gateFailLines[0].includes("fallback=true"), `첫 실패는 다음 모델이 있으니 fallback=true여야 함: ${gateFailLines[0]}`);
  assert(gateFailLines[1].includes("fallback=false"), `마지막 실패는 다음 모델이 없으니 fallback=false여야 함: ${gateFailLines[1]}`);

  const pendingLines = warnings.filter((w) => w.includes("[AI_SECTION_GENERATION_PENDING]"));
  assert(pendingLines.length === 1, `전체 실패 로그가 정확히 1건이어야 하는데 ${pendingLines.length}건`);
  assert(
    pendingLines[0].includes("reportId=report-abc") &&
      pendingLines[0].includes("section=OPINION_SUMMARY") &&
      pendingLines[0].includes("reason=ALL_MODELS_QUALITY_FAILED"),
    `최종 실패 로그 형식이 예상과 다름: ${pendingLines[0]}`
  );
  console.log("✅ 품질 게이트 실패 시 [AI_QUALITY_GATE_FAIL]/[AI_SECTION_GENERATION_PENDING] 구조화 로그 발생");
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
    `둘 다 미설정이면 기본 체인(DEFAULT_FALLBACK_CHAIN)을 써야 하는데: ${chainWithNeither.join(",")}`
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

/**
 * 회귀 방지 — Production fallback 기본값에 무료 모델(openrouter/free 등)이
 * 다시 섞여 들어가지 않는지 고정한다. 실제 사고(2026-09-12, report=
 * cmtycq7ne...)의 근본 원인 중 하나가 "무료 fallback의 응답 품질 자체가
 * 낮음"이었다 — PR #68의 품질 게이트가 나쁜 응답을 걸러내긴 하지만,
 * 애초에 fallback 후보 자체를 유료·고품질 모델로만 구성해 이 문제의
 * 발생 빈도 자체를 낮춘다.
 */
function testDefaultFallbackChainHasNoFreeModels() {
  for (const model of DEFAULT_FALLBACK_CHAIN) {
    assert(
      model !== "openrouter/free" && !model.endsWith(":free"),
      `기본 폴백 체인에 무료 모델이 들어있음(${model}) — 투자심사보고서 fallback 기본값으로 부적절`
    );
  }
  assert(
    DEFAULT_FALLBACK_CHAIN.join(",") === "google/gemini-2.5-pro,anthropic/claude-sonnet-4.5",
    `기본 폴백 체인이 예상과 다름: ${DEFAULT_FALLBACK_CHAIN.join(",")}`
  );
  console.log("✅ 기본 폴백 체인에 무료 모델 없음(google/gemini-2.5-pro → anthropic/claude-sonnet-4.5)");
}

async function main() {
  console.log("\n=== DealMind OpenRouter 멀티 폴백 체인 테스트 ===\n");
  await testPrimarySuccessNoFallback();
  await testPrimaryTimeoutSkipsRetryGoesToFallback();
  await testExplicitAttemptsPerModelStillRetries();
  await testPrimaryFailsThenFallbackSucceeds();
  await testChainFallsThroughTwoFallbacks();
  await testFallbackModelUnavailableSkipsToNext();
  await testFallbackGetsDedicatedBudgetAfterPrimaryTimesOut();
  await testSecondFallbackAlsoGetsCalledWithRealBudget();
  await testAllModelsFailReturnsFinalError();
  await testAbortErrorDrivesChainForward();
  await testBudgetExhaustionStopsFurtherCalls();
  await testMalformedPrimaryOutputTriggersFallback();
  await testPrimaryTimeoutStillTriggersFallback();
  await testFallbackQualityFailContinuesToNextFallback();
  await testAllModelsQualityFailThrowsQualityGateError();
  await testQualityGateFailureEmitsStructuredLogs();
  await testEmptyFallbackChainBehavesLikeBefore();
  testSingleFallbackEnvBackwardCompatible();
  testDefaultFallbackChainHasNoFreeModels();
  console.log("\n✅ OpenRouter 멀티 폴백 체인 테스트 통과\n");
}

main().catch((err) => {
  console.error("❌ 테스트 실패:", err);
  process.exit(1);
});
