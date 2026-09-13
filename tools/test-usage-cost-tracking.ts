/**
 * UsageLog 비용 계측 검증 — PR #77 Final Review가 FAIL로 지적한 부분
 * (provider/duration/retryCount/estimatedCost/userTier/taskTier 계측)을
 * 채운 코드를 검증한다.
 *
 * 실제 OpenRouter 네트워크 호출·실제 Prisma DB 연결은 하지 않는다 — 이
 * 세션은 openrouter.ai 접속이 막혀 있고 프로덕션 DB에도 접근할 수 없다.
 * 대신 순수 함수(calculateEstimatedCost/extractUsageAndCost/
 * buildUsageLogRows/emitAttempt)를 합성 입력으로 검증한다 — claude.ts가
 * runModelChain을 순수 함수로 분리해 네트워크 없이 재시도/폴백을
 * 검증하는 것과 동일한 방법론이다.
 *
 * Usage: npm run test:usage-cost-tracking
 */
import OpenAI from "openai";
import {
  extractUsageAndCost,
  emitAttempt,
  runModelChain,
  type AIAttemptRecord,
} from "../src/lib/claude";
import { calculateEstimatedCost } from "../src/lib/ai-cost";
import { buildUsageLogRows } from "../src/lib/usage-log";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function fakeChatCompletion(overrides: {
  content?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  provider?: string;
} = {}): OpenAI.Chat.Completions.ChatCompletion {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: Date.now(),
    model: "test-model",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        logprobs: null,
        message: { role: "assistant", content: overrides.content ?? "정상 응답", refusal: null },
      },
    ],
    usage: overrides.usage
      ? {
          prompt_tokens: overrides.usage.prompt_tokens ?? 0,
          completion_tokens: overrides.usage.completion_tokens ?? 0,
          total_tokens: (overrides.usage.prompt_tokens ?? 0) + (overrides.usage.completion_tokens ?? 0),
          ...(overrides.usage.cost !== undefined ? { cost: overrides.usage.cost } : {}),
        }
      : undefined,
    ...(overrides.provider ? { provider: overrides.provider } : {}),
  } as unknown as OpenAI.Chat.Completions.ChatCompletion;
}

/** Test 1: token usage가 정상적으로 기록됨 */
function testTokenUsageExtracted() {
  const result = fakeChatCompletion({ usage: { prompt_tokens: 1200, completion_tokens: 340 } });
  const { inputTokens, outputTokens } = extractUsageAndCost(result);
  assert(inputTokens === 1200, `inputTokens 추출 실패: ${inputTokens}`);
  assert(outputTokens === 340, `outputTokens 추출 실패: ${outputTokens}`);
  console.log("✅ 1. token usage(inputTokens/outputTokens)가 응답에서 정상적으로 추출됨");
}

/** Test 2: provider 기록 */
function testProviderExtracted() {
  const withProvider = fakeChatCompletion({ provider: "DeepInfra" });
  assert(extractUsageAndCost(withProvider).provider === "DeepInfra", "provider 필드가 있는데 추출 안 됨");

  const withoutProvider = fakeChatCompletion({});
  assert(
    extractUsageAndCost(withoutProvider).provider === undefined,
    "provider 필드가 없는데 값을 지어냄(undefined여야 함)"
  );
  console.log("✅ 2. provider — 응답에 있으면 그대로 추출, 없으면 undefined(지어내지 않음)");
}

/** Test 3/4: durationMs·retryCount(attemptIndex)가 runModelChain의 실제 체인 진행에 따라 기록됨 */
async function testDurationAndAttemptIndexPropagate() {
  const recorded: AIAttemptRecord[] = [];
  const chain = ["model-a", "model-b", "model-c"];

  await runModelChain(
    chain,
    async (model, _timeout, modelIdx) => {
      const startedAt = Date.now();
      await new Promise((r) => setTimeout(r, 5));
      const durationMs = Date.now() - startedAt;
      if (model !== "model-c") {
        emitAttempt(
          (a) => recorded.push(a),
          { model, attemptIndex: modelIdx, success: false, durationMs, inputTokens: 10, outputTokens: 5, estimatedCost: null, errorKind: "QualityGateError" }
        );
        throw Object.assign(new Error("품질 게이트 실패"), { status: 500 });
      }
      emitAttempt(
        (a) => recorded.push(a),
        { model, attemptIndex: modelIdx, success: true, durationMs, inputTokens: 10, outputTokens: 5, estimatedCost: null }
      );
      return "ok";
    },
    { remainingMs: () => 60_000, attemptTimeout: () => 5_000, sleep: async () => {}, attemptsPerModel: 1 }
  );

  assert(recorded.length === 3, `체인 3개 모델 전부의 시도가 기록되지 않음: ${recorded.length}건`);
  assert(
    recorded.map((r) => r.attemptIndex).join(",") === "0,1,2",
    `retryCount(attemptIndex)가 체인 위치(0,1,2)와 일치하지 않음: ${recorded.map((r) => r.attemptIndex).join(",")}`
  );
  assert(
    recorded.every((r) => typeof r.durationMs === "number" && r.durationMs >= 0),
    "durationMs가 모든 시도에 기록되지 않음"
  );
  console.log("✅ 3/4. durationMs·retryCount(attemptIndex=0,1,2)가 체인 진행에 따라 시도마다 정확히 기록됨");
}

/** Test 5/6: userTier/taskTier가 UsageLog row에 반영됨 */
function testUserTierAndTaskTierInRows() {
  const attempts: AIAttemptRecord[] = [
    { model: "m1", attemptIndex: 0, success: true, durationMs: 100, inputTokens: 10, outputTokens: 5, estimatedCost: null },
  ];
  const rows = buildUsageLogRows({
    userId: "u1",
    agentType: "GENERAL",
    userTier: "free",
    taskTier: "cheap",
    attempts,
  });
  assert(rows.length === 1, "row 개수가 attempts와 다름");
  assert(rows[0].userTier === "free", "userTier가 row에 반영 안 됨");
  assert(rows[0].taskTier === "cheap", "taskTier가 row에 반영 안 됨");
  console.log("✅ 5/6. userTier/taskTier가 UsageLog row에 그대로 반영됨");
}

/** Test 7: estimatedCost 계산(OpenRouter가 실제로 cost를 보고한 경우) */
function testEstimatedCostComputedWhenAvailable() {
  const result = fakeChatCompletion({ usage: { prompt_tokens: 1000, completion_tokens: 200, cost: 0.00123 } });
  const { estimatedCost } = extractUsageAndCost(result);
  assert(estimatedCost === 0.00123, `OpenRouter가 보고한 cost를 그대로 쓰지 않음: ${estimatedCost}`);
  console.log("✅ 7. OpenRouter 응답에 usage.cost가 있으면 그 값을 그대로 estimatedCost로 사용(직접 계산하지 않음)");
}

/** Test 8: pricing 정보 없음 → estimatedCost=null(0원이 아님) */
function testEstimatedCostNullWhenNoPricingInfo() {
  const result = fakeChatCompletion({ usage: { prompt_tokens: 1000, completion_tokens: 200 } }); // cost 없음
  const { estimatedCost } = extractUsageAndCost(result);
  assert(estimatedCost === null, `가격 정보가 없는데 0이 아닌 임의 비용을 계산함: ${estimatedCost}`);

  // calculateEstimatedCost 자체도 방어적으로 확인 — 토큰이 비정상이면 null
  assert(calculateEstimatedCost({ inputTokens: -1, outputTokens: 5, providerUsage: { cost: 1 } }) === null, "음수 토큰인데도 비용을 계산함");
  assert(calculateEstimatedCost({ inputTokens: NaN, outputTokens: 5, providerUsage: { cost: 1 } }) === null, "NaN 토큰인데도 비용을 계산함");
  assert(calculateEstimatedCost({ inputTokens: 0, outputTokens: 0, providerUsage: { cost: 1 } }) === null, "실제 토큰이 0(호출 없음)인데도 비용을 계산함");
  assert(calculateEstimatedCost({ inputTokens: 10, outputTokens: 5, providerUsage: { cost: -1 } }) === null, "음수 cost인데도 그대로 반환함");
  console.log("✅ 8. 가격 정보가 없거나 입력이 비정상이면 estimatedCost=null(0원이 아니라 '모른다'는 뜻)");
}

/** Test 9: fallback 2회(model-a→model-b→model-c) 발생 시 실패한 시도 2건의 토큰·비용도 누락되지 않음 */
async function testFallbackAttemptsAllRecordedNotJustFinal() {
  const recorded: AIAttemptRecord[] = [];
  const chain = ["model-a", "model-b", "model-c"];

  await runModelChain(
    chain,
    async (model, _t, modelIdx) => {
      if (model !== "model-c") {
        // 실패했지만 실제로는 응답을 받은 뒤의 실패(품질 게이트) — 토큰이 실제로 소모됨
        emitAttempt(
          (a) => recorded.push(a),
          { model, attemptIndex: modelIdx, success: false, durationMs: 10, inputTokens: 500, outputTokens: 50, estimatedCost: 0.001, errorKind: "QualityGateError" }
        );
        throw Object.assign(new Error("품질 게이트 실패"), { status: 500 });
      }
      emitAttempt(
        (a) => recorded.push(a),
        { model, attemptIndex: modelIdx, success: true, durationMs: 10, inputTokens: 500, outputTokens: 300, estimatedCost: 0.004 }
      );
      return "최종 성공";
    },
    { remainingMs: () => 60_000, attemptTimeout: () => 5_000, sleep: async () => {}, attemptsPerModel: 1 }
  );

  assert(recorded.length === 3, `실패 2건 + 성공 1건 = 3건이어야 하는데 ${recorded.length}건만 기록됨(최종 성공만 남기면 비용 과소계상)`);
  const failedAttempts = recorded.filter((a) => !a.success);
  assert(failedAttempts.length === 2, `실패한 시도(model-a, model-b) 2건이 모두 기록돼야 함: ${failedAttempts.length}건`);
  assert(
    failedAttempts.every((a) => a.inputTokens > 0 && a.estimatedCost !== null),
    "실패한 시도의 토큰·비용이 0/null로 누락됨 — 실제로는 API 호출이 일어나 비용이 발생했음"
  );

  const rows = buildUsageLogRows({
    userId: "u1",
    agentType: "GENERAL",
    userTier: "paid",
    taskTier: "balanced",
    attempts: recorded,
  });
  assert(rows.length === 3, "UsageLog row도 3건이어야 함(최종 성공 모델 1건만 남기지 않음)");
  const totalCost = rows.reduce((sum, r) => sum + (r.estimatedCost ?? 0), 0);
  assert(totalCost > 0.004, `실패한 시도의 비용이 합계에서 누락됨(총 비용이 최종 성공분 0.004보다 커야 함): ${totalCost}`);
  console.log("✅ 9. fallback 2회 발생 → 실패한 시도까지 전부(3건) UsageLog row로 기록, 비용 합계에서 누락 없음");
}

/** Test 10: onAttempt 콜백이 던지는 예외가 AI 생성 자체를 실패시키지 않음 */
async function testLoggingFailureIsNonFatal() {
  const chain = ["model-a"];
  const { result } = await runModelChain(
    chain,
    async (model, _t, modelIdx) => {
      emitAttempt(
        () => {
          throw new Error("DB 저장 실패(시뮬레이션)");
        },
        { model, attemptIndex: modelIdx, success: true, durationMs: 1, inputTokens: 1, outputTokens: 1, estimatedCost: null }
      );
      return "생성 성공";
    },
    { remainingMs: () => 60_000, attemptTimeout: () => 5_000, sleep: async () => {}, attemptsPerModel: 1 }
  );
  assert(result === "생성 성공", "onAttempt(로깅) 콜백이 던진 예외가 AI 생성 결과 자체를 실패시킴");
  console.log("✅ 10. onAttempt(UsageLog 기록용) 콜백이 예외를 던져도 AI 생성 자체는 성공으로 처리됨(emitAttempt의 try/catch)");
}

async function main() {
  console.log("\n=== DealMind UsageLog 비용 계측 테스트 ===\n");
  testTokenUsageExtracted();
  testProviderExtracted();
  await testDurationAndAttemptIndexPropagate();
  testUserTierAndTaskTierInRows();
  testEstimatedCostComputedWhenAvailable();
  testEstimatedCostNullWhenNoPricingInfo();
  await testFallbackAttemptsAllRecordedNotJustFinal();
  await testLoggingFailureIsNonFatal();
  console.log("\n✅ UsageLog 비용 계측 테스트 통과\n");
}

main();
