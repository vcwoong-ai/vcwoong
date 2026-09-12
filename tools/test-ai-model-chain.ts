/**
 * DeepSeek → Gemini 2.5 Pro → Claude Sonnet 4.5 모델 체인 회귀 테스트.
 *
 * 배경: Production fallback 기본값이 무료 티어(openrouter/free,
 * meta-llama/llama-3.3-70b-instruct)에서 유료·고품질 모델(google/gemini-2.5-pro,
 * anthropic/claude-sonnet-4.5)로 바뀌었다(claude.ts의 DEFAULT_FALLBACK_CHAIN
 * 참고) — DeepSeek는 primary로 그대로 유지한다(가격 대비 성능이 좋고 정상
 * 응답 시 충분하므로, 실패했을 때만 비용이 더 드는 모델로 넘어간다).
 *
 * 이 파일은 claude.ts/section-generation-gate.ts의 일반화된 로직
 * (runModelChain, checkGenerationGate)이 이미 다른 테스트 파일에서
 * 검증돼 있다는 전제 위에서, "실제 모델 정체성"으로 그 로직을 다시
 * 확인한다 — MODEL/FALLBACK_MODELS를 직접 import해서 "환경변수를
 * 아무것도 안 건드리면 정말로 deepseek→gemini→claude 순서가 되는가"를
 * 실측한다(다른 test:* 스크립트들처럼 --env-file 없이 실행되므로
 * AI_MODEL/AI_FALLBACK_MODELS가 비어있다고 가정한다 — test:runtime-budget
 * 등도 같은 전제로 REQUEST_TIMEOUT_MS 등 기본값을 직접 검증한다).
 *
 * Usage: npm run test:ai-model-chain
 */
import {
  MODEL,
  FALLBACK_MODELS,
  runModelChain,
  QualityGateError,
  EmptyAIResponseError,
  type ModelChainDeps,
} from "../src/lib/claude";
import { checkGenerationGate } from "../src/lib/section-generation-gate";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const DEEPSEEK = "deepseek/deepseek-v4-flash-0731";
const GEMINI = "google/gemini-2.5-pro";
const CLAUDE = "anthropic/claude-sonnet-4.5";

function assertRealChainIdentity() {
  assert(
    MODEL === DEEPSEEK,
    `primary 모델이 예상과 다름(AI_MODEL이 테스트 환경에 설정돼 있을 수 있음): ${MODEL}`
  );
  assert(
    FALLBACK_MODELS.join(",") === `${GEMINI},${CLAUDE}`,
    `fallback 체인이 예상과 다름(AI_FALLBACK_MODELS가 테스트 환경에 설정돼 있을 수 있음): ${FALLBACK_MODELS.join(",")}`
  );
  console.log(`✅ 실제 체인 확인: ${MODEL} → ${FALLBACK_MODELS.join(" → ")}`);
}

function fakeDeps(totalBudgetMs = 60_000): ModelChainDeps {
  let elapsed = 0;
  return {
    remainingMs: () => totalBudgetMs - elapsed,
    attemptTimeout: (_modelIdx: number) => {
      const left = totalBudgetMs - elapsed;
      return left <= 0 ? null : left;
    },
    sleep: async (ms: number) => {
      elapsed += ms;
    },
  };
}

function timeoutError(): DOMException {
  return new DOMException("This operation was aborted", "AbortError");
}

const chain = [MODEL, ...FALLBACK_MODELS];

/** 1. DeepSeek 정상 응답 → DeepSeek만 호출(비용 추가 발생 안 함) */
async function testDeepSeekSuccessCallsOnlyDeepSeek() {
  const calls: string[] = [];
  const { usedModel } = await runModelChain(
    chain,
    async (model) => {
      calls.push(model);
      return "ok";
    },
    fakeDeps()
  );
  assert(usedModel === DEEPSEEK, `DeepSeek 성공인데 usedModel=${usedModel}`);
  assert(calls.join(",") === DEEPSEEK, `DeepSeek 성공인데 다른 모델도 호출됨: ${calls.join(",")}`);
  console.log("✅ 1. DeepSeek 정상 응답 → DeepSeek만 호출, 추가 비용 없음");
}

/** 2. DeepSeek timeout → Gemini 호출 */
async function testDeepSeekTimeoutFallsBackToGemini() {
  const calls: string[] = [];
  const { usedModel } = await runModelChain(
    chain,
    async (model) => {
      calls.push(model);
      if (model === DEEPSEEK) throw timeoutError();
      return "ok";
    },
    fakeDeps()
  );
  assert(usedModel === GEMINI, `DeepSeek timeout 후 Gemini가 성공해야 하는데 usedModel=${usedModel}`);
  assert(calls.join(",") === `${DEEPSEEK},${GEMINI}`, `호출 순서가 다름: ${calls.join(",")}`);
  console.log("✅ 2. DeepSeek timeout → Gemini 호출");
}

/** 3. DeepSeek 품질 게이트 실패("User Safety: safe" 등) → Gemini 호출 */
async function testDeepSeekQualityFailureFallsBackToGemini() {
  const calls: string[] = [];
  const { usedModel } = await runModelChain(
    chain,
    async (model) => {
      calls.push(model);
      if (model === DEEPSEEK) throw new QualityGateError(model, "BOILERPLATE_REFUSAL");
      return "ok";
    },
    fakeDeps()
  );
  assert(usedModel === GEMINI, `DeepSeek 품질 실패 후 Gemini가 성공해야 하는데 usedModel=${usedModel}`);
  console.log("✅ 3. DeepSeek 품질 게이트 실패 → Gemini 호출");
}

/** 4. DeepSeek HTTP 404(모델 사용 불가) → Gemini 호출 */
async function testDeepSeek404FallsBackToGemini() {
  const { usedModel } = await runModelChain(
    chain,
    async (model) => {
      if (model === DEEPSEEK) throw { status: 404, message: "model not found" };
      return "ok";
    },
    fakeDeps()
  );
  assert(usedModel === GEMINI, `DeepSeek 404 후 Gemini가 성공해야 하는데 usedModel=${usedModel}`);
  console.log("✅ 4. DeepSeek HTTP 404 → Gemini 호출");
}

/** 5. DeepSeek HTTP 429(레이트리밋) → Gemini 호출 */
async function testDeepSeek429FallsBackToGemini() {
  const { usedModel } = await runModelChain(
    chain,
    async (model) => {
      if (model === DEEPSEEK) throw { status: 429, message: "rate limited" };
      return "ok";
    },
    fakeDeps()
  );
  assert(usedModel === GEMINI, `DeepSeek 429 후 Gemini가 성공해야 하는데 usedModel=${usedModel}`);
  console.log("✅ 5. DeepSeek HTTP 429 → Gemini 호출");
}

/** 6. Gemini 정상 응답 → Gemini 결과 저장(Claude는 호출 안 됨) */
async function testGeminiSuccessIsUsed() {
  const calls: string[] = [];
  const { usedModel } = await runModelChain(
    chain,
    async (model) => {
      calls.push(model);
      if (model === DEEPSEEK) throw timeoutError();
      return "ok";
    },
    fakeDeps()
  );
  assert(usedModel === GEMINI, `usedModel=${usedModel}`);
  assert(!calls.includes(CLAUDE), `Gemini가 성공했는데 Claude까지 호출됨: ${calls.join(",")}`);
  console.log("✅ 6. Gemini 정상 응답 → Gemini 결과 사용, Claude 미호출");
}

/** 7. Gemini도 품질 게이트 실패 → Claude 호출 */
async function testGeminiQualityFailureFallsBackToClaude() {
  const calls: string[] = [];
  const { usedModel } = await runModelChain(
    chain,
    async (model) => {
      calls.push(model);
      if (model === CLAUDE) return "ok";
      throw new QualityGateError(model, "MISSING_RECOMMENDATION_LABEL");
    },
    fakeDeps()
  );
  assert(usedModel === CLAUDE, `Gemini까지 품질 실패했으면 Claude가 성공해야 하는데 usedModel=${usedModel}`);
  assert(calls.join(",") === `${DEEPSEEK},${GEMINI},${CLAUDE}`, `호출 순서가 다름: ${calls.join(",")}`);
  console.log("✅ 7. Gemini도 품질 게이트 실패 → Claude 호출");
}

/** 8. Claude 정상 응답 → Claude 결과 저장(체인의 마지막 모델) */
async function testClaudeSuccessIsUsed() {
  const { usedModel } = await runModelChain(
    chain,
    async (model) => {
      if (model === CLAUDE) return "ok";
      throw timeoutError();
    },
    fakeDeps()
  );
  assert(usedModel === CLAUDE, `usedModel=${usedModel}`);
  console.log("✅ 8. Claude 정상 응답 → Claude 결과 사용");
}

/** 9. 세 모델 모두 실패 → 에러 전파(report-generation.ts의 기존 catch가 PENDING checkpoint로 흡수) */
async function testAllThreeModelsFailPropagatesError() {
  let thrown: unknown;
  try {
    await runModelChain(
      chain,
      async (model) => {
        throw new QualityGateError(model, "TOO_SHORT");
      },
      fakeDeps()
    );
  } catch (e) {
    thrown = e;
  }
  assert(thrown instanceof QualityGateError, "세 모델 모두 실패했는데 QualityGateError가 전파되지 않음");
  console.log("✅ 9. DeepSeek·Gemini·Claude 모두 실패 → 에러 전파(→ PENDING checkpoint로 이어짐)");
}

/**
 * 10. 실제 프로덕션 사고 재현 — DeepSeek가 "User Safety: safe"(45자)를
 * 반환하면 checkGenerationGate가 이를 reject하고, 그 결과를 callModel이
 * QualityGateError로 던지면(callOnce의 실제 동작과 동일) Gemini로 넘어간다.
 */
async function testUserSafetySafeFromDeepSeekFallsBackToGemini() {
  const calls: string[] = [];
  const { usedModel } = await runModelChain(
    chain,
    async (model) => {
      calls.push(model);
      if (model === DEEPSEEK) {
        const content = "User Safety: safe";
        const gate = checkGenerationGate("OPINION_SUMMARY", content);
        assert(!gate.ok, "'User Safety: safe'가 게이트를 통과함 — 실제 콜백 로직이 깨짐");
        throw new QualityGateError(model, gate.reason ?? "UNKNOWN");
      }
      return "정상적인 투자심사 의견";
    },
    fakeDeps()
  );
  assert(usedModel === GEMINI, `usedModel=${usedModel}`);
  assert(calls.join(",") === `${DEEPSEEK},${GEMINI}`, `호출 순서가 다름: ${calls.join(",")}`);
  console.log('✅ 10. DeepSeek의 "User Safety: safe" → 품질 게이트 FAIL → Gemini 호출(실제 프로덕션 사고 재발 방지)');
}

/** 11. 빈 응답 → fallback */
async function testEmptyResponseFallsBack() {
  const { usedModel } = await runModelChain(
    chain,
    async (model) => {
      if (model === DEEPSEEK) throw new EmptyAIResponseError(model);
      return "ok";
    },
    fakeDeps()
  );
  assert(usedModel === GEMINI, `빈 응답 후 Gemini가 성공해야 하는데 usedModel=${usedModel}`);
  console.log("✅ 11. 빈 응답(EmptyAIResponseError) → Gemini 호출");
}

/** 12. malformed(의미 없는 극단적으로 짧은) 응답 → fallback */
async function testMalformedResponseFallsBack() {
  const malformed = "asdf";
  const gate = checkGenerationGate("RISK_ANALYSIS", malformed);
  assert(!gate.ok, "의미 없는 짧은 응답이 게이트를 통과함");
  const { usedModel } = await runModelChain(
    chain,
    async (model) => {
      if (model === DEEPSEEK) throw new QualityGateError(model, gate.reason ?? "UNKNOWN");
      return "ok";
    },
    fakeDeps()
  );
  assert(usedModel === GEMINI, `usedModel=${usedModel}`);
  console.log("✅ 12. malformed 응답 → Gemini 호출");
}

/** 13. OPINION_SUMMARY인데 투자 의견 라벨 누락 → fallback */
async function testOpinionSummaryMissingRecommendationFallsBack() {
  const noLabel =
    "이 회사는 성장하고 있고 여러 지표가 긍정적이다. ".repeat(40); // 500자+, 라벨 없음
  const gate = checkGenerationGate("OPINION_SUMMARY", noLabel);
  assert(
    !gate.ok && gate.reason === "MISSING_RECOMMENDATION_LABEL",
    `라벨 없는 의견종합이 통과함: ${JSON.stringify(gate)}`
  );
  const { usedModel } = await runModelChain(
    chain,
    async (model) => {
      if (model === DEEPSEEK) throw new QualityGateError(model, gate.reason!);
      return "ok";
    },
    fakeDeps()
  );
  assert(usedModel === GEMINI, `usedModel=${usedModel}`);
  console.log("✅ 13. OPINION_SUMMARY 투자 의견 라벨 누락 → Gemini 호출");
}

/** 14. 정상적인 OPINION_SUMMARY → 게이트 PASS(재현 없음) */
function testNormalOpinionSummaryPasses() {
  const good = `
조건부 투자 추천 — 성장성은 매력적이나 리스크 해소가 선행돼야 한다.

투자 이유:
1) 시장 선도 지위와 높은 점유율을 확보하고 있다.
2) 자체 기술 개발을 통한 기술 차별화가 뚜렷하다.
3) 최근 2년간 매출이 지속적으로 고성장하고 있다.

핵심 리스크:
1) 부채율이 단기간에 급등할 위험이 있다.
2) 해외 계약이 아직 확정되지 않아 불확실성이 크다.
3) 계약서상 법인명과 실제 법인명이 불일치한다.

투자 전 확인 사항:
1) 밸류에이션 산정 근거와 비교기업 선정 기준을 확인해야 한다.
2) 부채 상환 계획과 자본 조달 일정을 확인해야 한다.
3) 해외 MOU의 실제 진행 상황을 확인해야 한다.

투자조건의 적정성: 현재 밸류에이션은 매출 배수 기준으로 합리적인 수준이다.
기대수익은 IRR 30~40% 수준이며, downside는 RCPS 만기 시 원금 회수로 수렴한다.
최종적으로 실사(DD) 이후 집행을 권고하며, 위 확인 사항이 해소되지 않으면
투자 규모 조정을 검토해야 한다.

종합하면 성장성과 기술력은 충분히 검증됐으나, 재무 건전성과 계약 관계의
불확실성이 동시에 해소돼야 투자 리스크가 감내 가능한 수준으로 낮아진다.
따라서 본 건은 조건부로 투자를 추천하되, 실사를 통한 핵심 리스크 확인을
선행 조건으로 명확히 제시하며, 확인 결과에 따라 투자 조건 재협상도
배제하지 않는다.
`.trim();
  const gate = checkGenerationGate("OPINION_SUMMARY", good);
  assert(gate.ok, `정상적인 의견종합이 게이트를 통과 못함: ${JSON.stringify(gate)}`);
  console.log("✅ 14. 정상적인 OPINION_SUMMARY → 게이트 PASS");
}

async function main() {
  console.log("\n=== DealMind DeepSeek → Gemini → Claude 모델 체인 회귀 테스트 ===\n");
  assertRealChainIdentity();
  await testDeepSeekSuccessCallsOnlyDeepSeek();
  await testDeepSeekTimeoutFallsBackToGemini();
  await testDeepSeekQualityFailureFallsBackToGemini();
  await testDeepSeek404FallsBackToGemini();
  await testDeepSeek429FallsBackToGemini();
  await testGeminiSuccessIsUsed();
  await testGeminiQualityFailureFallsBackToClaude();
  await testClaudeSuccessIsUsed();
  await testAllThreeModelsFailPropagatesError();
  await testUserSafetySafeFromDeepSeekFallsBackToGemini();
  await testEmptyResponseFallsBack();
  await testMalformedResponseFallsBack();
  await testOpinionSummaryMissingRecommendationFallsBack();
  testNormalOpinionSummaryPasses();
  console.log(
    "\n(참고) 15~18번 시나리오(섹션 1개라도 실패 시 COMPLETED 금지, cron/browser resume 동일 적용)는\n" +
      "generateSectionsAsync 단일 진입점 구조에서 architecture로 보장됨 — PR #68에서 이미 코드 분석/문서화됨,\n" +
      "이 PR은 모델 이름만 바꿔 그 구조를 그대로 재사용한다(DB 통합 테스트 하네스가 이 저장소에 없어\n" +
      "이 파일에서 새로 만들지 않음).\n"
  );
  console.log("✅ DeepSeek → Gemini → Claude 모델 체인 회귀 테스트 통과\n");
}

main().catch((err) => {
  console.error("❌ 테스트 실패:", err);
  process.exit(1);
});
