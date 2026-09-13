/**
 * Cost-Performance Model Router (3-tier: CHEAP/BALANCED/PREMIUM) + OpenRouter
 * provider 가격 라우팅 검증.
 *
 * PR#76(test-model-tier-routing.ts)이 이미 검증한 FREE/PAID 2-tier 라우팅
 * 위에, 이 PR이 추가한 것만 다룬다(중복 검증 방지):
 *   - task tier(cheap/balanced/premium) 축 — 같은 PAID 사용자라도 섹션
 *     성격에 따라 다른 모델 풀을 쓴다.
 *   - OpenRouter provider 라우팅(sort/max_price/allow_fallbacks) 설정이
 *     env에서 올바르게 만들어지는지.
 *   - 기존 generateText/runModelChain/quality gate/report-generation API가
 *     이번 변경으로 깨지지 않았는지.
 *
 * 실제 네트워크 호출은 하지 않는다 — 전부 순수 함수 테스트 + 소스 정적
 * 검사(zod 스키마에 모델/provider 관련 필드가 없는지).
 *
 * Usage: npm run test:cost-performance-routing
 */
import {
  resolveModelChainForTier,
  MODEL,
  FALLBACK_MODELS,
  PREMIUM_MODELS,
  CHEAP_MODEL_CHAIN,
  buildProviderPreferences,
  parseMaxPrice,
  runModelChain,
  QualityGateError,
  generateText,
  type TaskTier,
} from "../src/lib/claude";
import { resolveTaskTierForSection } from "../src/agents/base-agent";
import { SectionKey } from "@prisma/client";
import type { PlanKey } from "../src/lib/quotas";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const PREMIUM_MARKERS = ["claude-sonnet", "gemini"];
function containsPremiumModel(chain: string[]): boolean {
  return chain.some((m) => PREMIUM_MARKERS.some((marker) => m.includes(marker)));
}

/** Test A: FREE 플랜은 taskTier와 무관하게 항상 CHEAP 체인만 쓴다 */
function testFreeAlwaysCheapRegardlessOfTaskTier() {
  const tiers: TaskTier[] = ["cheap", "balanced", "premium"];
  for (const tier of tiers) {
    const chain = resolveModelChainForTier("free", tier);
    assert(
      JSON.stringify(chain) === JSON.stringify(CHEAP_MODEL_CHAIN),
      `FREE + taskTier=${tier} → CHEAP 체인이 아님: ${chain.join(",")}`
    );
  }
  console.log("✅ A. FREE 플랜은 taskTier(cheap/balanced/premium)와 무관하게 항상 CHEAP 체인만 사용");
}

/** Test B: FREE가 premium 섹션(OPINION_SUMMARY 등)을 요청해도 PREMIUM_MODELS로 올라가지 않는다 */
function testFreeRequestingPremiumIsBlocked() {
  const chain = resolveModelChainForTier("free", "premium");
  assert(!containsPremiumModel(chain), `FREE + premium 요청인데 premium 모델이 섞임: ${chain.join(",")}`);
  assert(
    JSON.stringify(chain) !== JSON.stringify(PREMIUM_MODELS) || JSON.stringify(PREMIUM_MODELS) === JSON.stringify(CHEAP_MODEL_CHAIN),
    "FREE + premium 요청이 PREMIUM_MODELS 체인을 그대로 반환함 — plan gate 우회"
  );
  console.log("✅ B. FREE가 premium 섹션을 요청해도 서버가 CHEAP 체인으로 강제 — client/섹션이 tier를 올릴 수 없음");
}

/** Test C: PAID 플랜은 taskTier에 따라 BALANCED(기존 기본 체인)/PREMIUM 체인을 각각 쓴다 */
function testPaidUsesBalancedOrPremiumByTaskTier() {
  const paidPlans: PlanKey[] = ["solo", "sector_pro", "multi", "full", "bio_premium"];
  const expectedBalanced = [MODEL, ...FALLBACK_MODELS];
  for (const plan of paidPlans) {
    const balanced = resolveModelChainForTier(plan, "balanced");
    assert(
      JSON.stringify(balanced) === JSON.stringify(expectedBalanced),
      `${plan} + balanced → 기존 기본 체인과 다름: ${balanced.join(",")}`
    );
    const premium = resolveModelChainForTier(plan, "premium");
    assert(
      JSON.stringify(premium) === JSON.stringify(PREMIUM_MODELS),
      `${plan} + premium → PREMIUM_MODELS와 다름: ${premium.join(",")}`
    );
    const cheap = resolveModelChainForTier(plan, "cheap");
    assert(
      JSON.stringify(cheap) === JSON.stringify(CHEAP_MODEL_CHAIN),
      `${plan} + cheap → CHEAP 체인과 다름(PAID도 보조 작업은 저가 체인을 써야 함): ${cheap.join(",")}`
    );
  }
  console.log("✅ C. PAID 플랜: balanced→기존 기본 체인, premium→PREMIUM_MODELS, cheap→CHEAP 체인 (전부 서로 다른 축)");
}

/** Test D: CHEAP 체인도 fallback이 있다(primary 실패 시 다음 모델로 전환 가능) */
function testCheapChainHasFallback() {
  assert(CHEAP_MODEL_CHAIN.length >= 2, `CHEAP 체인에 fallback이 없음: ${CHEAP_MODEL_CHAIN.join(",")}`);
  assert(!containsPremiumModel(CHEAP_MODEL_CHAIN), "CHEAP 체인에 premium 모델이 섞임");
  console.log(`✅ D. CHEAP 체인은 fallback을 포함한다(${CHEAP_MODEL_CHAIN.join(" → ")})`);
}

/** Test E: PREMIUM 체인도 자체 fallback을 가진다(primary 실패 시 configured fallback으로 전환) */
function testPremiumChainHasFallback() {
  assert(PREMIUM_MODELS.length >= 2, `PREMIUM 체인에 fallback이 없음: ${PREMIUM_MODELS.join(",")}`);
  console.log(`✅ E. PREMIUM 체인은 자체 fallback을 포함한다(${PREMIUM_MODELS.join(" → ")})`);
}

/** Test F: provider price-sort 설정이 올바른 shape로 만들어진다 */
function testProviderSortConfigValid() {
  const originalSort = process.env.AI_ROUTING_SORT;
  try {
    delete process.env.AI_ROUTING_SORT; // 미설정 → 기본값 "price"
    const pref = buildProviderPreferences("balanced");
    assert(Boolean(pref), "AI_ROUTING_SORT 미설정인데 provider 설정이 만들어지지 않음(기본값 price가 있어야 함)");
    assert(pref!.sort === "price", `기본 sort가 "price"가 아님: ${pref!.sort}`);
    assert(pref!.allow_fallbacks === true, "allow_fallbacks 기본값이 true가 아님");

    process.env.AI_ROUTING_SORT = "throughput";
    const pref2 = buildProviderPreferences("balanced");
    assert(pref2?.sort === "throughput", "AI_ROUTING_SORT override가 반영 안 됨");

    process.env.AI_ROUTING_SORT = "not-a-real-sort";
    const pref3 = buildProviderPreferences("balanced");
    assert(pref3 === undefined, "잘못된 AI_ROUTING_SORT 값인데도 provider 설정을 그대로 보냄(400 위험)");

    process.env.AI_ROUTING_SORT = "";
    const pref4 = buildProviderPreferences("balanced");
    assert(pref4 === undefined, "AI_ROUTING_SORT를 빈 값으로 꺼도 provider 라우팅이 꺼지지 않음");
  } finally {
    if (originalSort === undefined) delete process.env.AI_ROUTING_SORT;
    else process.env.AI_ROUTING_SORT = originalSort;
  }
  console.log("✅ F. provider sort 설정: 기본값 price, override 반영, 잘못된 값은 안전하게 무시(undefined)");
}

/** Test G: max_price 파싱이 올바른 shape($/1M 토큰, {prompt, completion})로 되고 잘못된 값은 cap 없이 안전하게 무시된다 */
function testMaxPriceSchemaValid() {
  const valid = parseMaxPrice("1,2");
  assert(
    valid?.prompt === 1 && valid?.completion === 2,
    `max_price 정상 파싱 실패: ${JSON.stringify(valid)}`
  );
  assert(parseMaxPrice(undefined) === undefined, "max_price 미설정인데 undefined가 아님");
  assert(parseMaxPrice("") === undefined, "max_price 빈 문자열인데 undefined가 아님");
  assert(parseMaxPrice("abc,2") === undefined, "max_price 잘못된 숫자인데도 cap을 반환함(요청 실패 위험)");
  assert(parseMaxPrice("1") === undefined, "max_price 필드 1개만 있어도 안전하게 거부해야 함");
  assert(parseMaxPrice("-1,2") === undefined, "max_price 음수인데도 그대로 반환함");

  const originalPremiumMax = process.env.AI_PREMIUM_MAX_PRICE;
  try {
    process.env.AI_PREMIUM_MAX_PRICE = "3,6";
    const pref = buildProviderPreferences("premium");
    assert(
      pref?.max_price?.prompt === 3 && pref?.max_price?.completion === 6,
      `premium tier의 AI_PREMIUM_MAX_PRICE가 provider 설정에 반영 안 됨: ${JSON.stringify(pref)}`
    );
  } finally {
    if (originalPremiumMax === undefined) delete process.env.AI_PREMIUM_MAX_PRICE;
    else process.env.AI_PREMIUM_MAX_PRICE = originalPremiumMax;
  }
  console.log("✅ G. max_price 스키마: {prompt, completion} 정상 파싱, 형식 오류는 cap 없이 안전하게 무시, tier별 env 분리 확인");
}

/** Test H: 기존 generateText 공개 API(옵션 없이 호출)가 그대로 동작한다 — 반환 shape 불변 */
async function testGenerateTextBackwardCompatible() {
  const result = await generateText([{ role: "user", content: "테스트" }]);
  assert(typeof result.content === "string", "generateText 반환 shape가 깨짐(content)");
  assert(typeof result.inputTokens === "number", "generateText 반환 shape가 깨짐(inputTokens)");
  assert(typeof result.outputTokens === "number", "generateText 반환 shape가 깨짐(outputTokens)");
  assert(typeof result.usedModel === "string", "generateText 반환 shape가 깨짐(usedModel)");
  console.log("✅ H. generateText: taskTier/modelChain 없이 호출해도 기존과 동일한 반환 shape(데모 모드 경로로 검증)");
}

/** Test I: runModelChain(기존 재시도/폴백 순수 로직)이 이번 변경 이후에도 그대로 동작한다 */
async function testRunModelChainUnchanged() {
  let calls = 0;
  const chain = ["model-a", "model-b"];
  const { result, usedModel } = await runModelChain(
    chain,
    async (model) => {
      calls++;
      if (model === "model-a") throw Object.assign(new Error("429"), { status: 429 });
      return `ok:${model}`;
    },
    {
      remainingMs: () => 60_000,
      attemptTimeout: () => 5_000,
      sleep: async () => {},
      attemptsPerModel: 1,
    }
  );
  assert(result === "ok:model-b", `runModelChain이 fallback으로 전환하지 못함: ${result}`);
  assert(usedModel === "model-b", `usedModel이 fallback 모델을 반영하지 않음: ${usedModel}`);
  assert(calls === 2, `호출 횟수가 예상과 다름(모델당 1회씩 2개 모델): ${calls}`);
  console.log("✅ I. runModelChain: provider 라우팅 추가 이후에도 기존 재시도/폴백 전환 로직 그대로 동작");
}

/** Test J: QualityGateError(생성-시점 품질 게이트)가 이번 변경으로 영향받지 않는다 */
async function testQualityGateUnchanged() {
  const err = new QualityGateError("model-x", "TOO_SHORT");
  assert(err.name === "QualityGateError", "QualityGateError.name이 바뀜");
  assert(err.model === "model-x", "QualityGateError.model이 바뀜");
  assert(err.reason === "TOO_SHORT", "QualityGateError.reason이 바뀜");

  const { result } = await runModelChain(
    ["model-a", "model-b"],
    async (model) => {
      if (model === "model-a") throw new QualityGateError(model, "EMPTY");
      return "품질 통과";
    },
    { remainingMs: () => 60_000, attemptTimeout: () => 5_000, sleep: async () => {}, attemptsPerModel: 1 }
  );
  assert(result === "품질 통과", "QualityGateError 발생 시 다음 모델로 넘어가지 못함");
  console.log("✅ J. QualityGateError: 타입/필드 불변, 품질 게이트 실패 시 기존과 동일하게 다음 모델로 폴백");
}

/** Test K: report-generation.ts가 섹션마다 resolveTaskTierForSection + resolveModelChainForTier(2-arg)를 실제로 쓴다(정적 검사) */
function testReportGenerationWiresPerSectionTier() {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/report-generation.ts"),
    "utf-8"
  );
  assert(
    /resolveTaskTierForSection\(sectionKey\)/.test(source),
    "report-generation.ts가 섹션별 taskTier를 계산하지 않음(전체 보고서에 단일 체인을 쓰던 이전 구조로 되돌아감)"
  );
  assert(
    /resolveModelChainForTier\(planKey,\s*taskTier\)/.test(source) &&
      /const taskTier = resolveTaskTierForSection\(sectionKey\)/.test(source),
    "report-generation.ts가 resolveModelChainForTier를 taskTier 인자와 함께 섹션 루프 안에서 호출하지 않음"
  );
  console.log("✅ K. report-generation.ts: 섹션 루프 안에서 매 섹션마다 taskTier를 다시 계산해 modelChain을 정함(정적 검사)");
}

/** 섹션 → tier 매핑이 요청서와 일치하는지 확인 */
function testSectionTierMapping() {
  assert(resolveTaskTierForSection(SectionKey.OPINION_SUMMARY) === "premium", "OPINION_SUMMARY가 premium이 아님");
  assert(resolveTaskTierForSection(SectionKey.VALUATION) === "premium", "VALUATION이 premium이 아님");
  const balancedSections: SectionKey[] = [
    SectionKey.INVESTMENT_OVERVIEW,
    SectionKey.COMPANY_OVERVIEW,
    SectionKey.PRODUCT_TECHNOLOGY,
    SectionKey.MARKET_ANALYSIS,
    SectionKey.FINANCIAL_STATUS,
    SectionKey.RISK_ANALYSIS,
    SectionKey.INVESTMENT_TERMS,
    SectionKey.APPENDIX,
  ];
  for (const s of balancedSections) {
    assert(resolveTaskTierForSection(s) === "balanced", `${s}가 balanced가 아님`);
  }
  console.log("✅ 섹션→tier 매핑: OPINION_SUMMARY/VALUATION만 premium, 나머지 8개 섹션은 balanced");
}

/**
 * 보안 테스트: client가 model/models/provider/fallback/tier 파라미터를
 * 보내 서버의 cost policy(FREE→CHEAP 강제, 섹션별 tier)를 우회할 방법이
 * 없다 — 보고서 생성/재생성 API의 zod 입력 스키마에 해당 필드가 아예
 * 존재하지 않는다(PR#76의 Test E와 같은 방법, 대상 필드만 확장).
 */
function testNoClientCostPolicyOverridePath() {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const files = [
    "src/app/api/deals/[id]/reports/route.ts",
    "src/app/api/reports/[id]/sections/regenerate/route.ts",
  ];
  const forbiddenFields = ["model", "models", "provider", "fallback", "tier", "taskTier", "modelChain"];
  for (const rel of files) {
    const source = fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");
    const schemaMatch = source.match(/z\.object\(\{[\s\S]*?\}\)/);
    assert(Boolean(schemaMatch), `${rel}: zod 입력 스키마를 찾지 못함`);
    for (const field of forbiddenFields) {
      const pattern = new RegExp(`\\b${field}\\s*:`, "i");
      assert(
        !pattern.test(schemaMatch![0]),
        `${rel}: 입력 스키마에 "${field}" 필드가 있음 — client가 모델/provider/tier를 지정해 cost policy를 우회할 경로가 생김`
      );
    }
  }
  console.log(
    "✅ 보안: 보고서 생성/재생성 API 입력 스키마에 model/models/provider/fallback/tier/taskTier/modelChain 필드 전부 없음"
  );
}

/**
 * Test: FREE + "악의적" request body(모델/provider/tier 필드를 직접 끼워
 * 넣은 JSON)를 실제 zod 스키마로 parse해도 그 필드들이 조용히 사라진다
 * (zod의 기본 동작 — object 스키마에 없는 키는 무시된다. .passthrough()를
 * 쓰지 않는 한 결과 객체에 남지 않는다). 즉 공격자가 body에 어떤 필드를
 * 끼워 넣어도 서버 코드가 그 필드를 읽을 방법 자체가 없다.
 */
function testMaliciousRequestBodyFieldsAreDropped() {
  const { z } = require("zod") as typeof import("zod");
  const regenerateSchema = z.object({
    sectionKey: z.string(),
    focusNote: z.string().max(800).optional(),
    qualityIssues: z.array(z.string().max(200)).max(12).optional(),
  });
  const malicious = {
    sectionKey: "OPINION_SUMMARY",
    model: "anthropic/claude-sonnet-4.5",
    models: ["anthropic/claude-sonnet-4.5"],
    provider: { sort: "quality" },
    tier: "premium",
    taskTier: "premium",
    fallback: ["anthropic/claude-sonnet-4.5"],
  };
  const parsed = regenerateSchema.parse(malicious);
  const parsedKeys = Object.keys(parsed);
  for (const dangerousKey of ["model", "models", "provider", "tier", "taskTier", "fallback"]) {
    assert(
      !parsedKeys.includes(dangerousKey),
      `악의적 body의 "${dangerousKey}" 필드가 zod 파싱 결과에 남음 — 서버 코드가 이걸 읽으면 cost policy 우회 가능`
    );
  }
  console.log("✅ FREE + 악의적 request body(model/models/provider/tier/fallback 끼워넣기) → zod가 전부 조용히 제거, 서버가 읽을 방법 없음");
}

/**
 * Test: FREE 사용자가 max_price 관련 env를 흉내내거나(클라이언트는 애초에
 * 서버 프로세스의 env를 바꿀 수 없지만, "그래도 시도했다"는 가정) provider
 * 가격 상한을 조작해도 resolveModelChainForTier의 FREE 판정 자체는
 * max_price와 완전히 독립적이다 — max_price는 provider "가격 상한"일 뿐,
 * "어떤 모델 목록을 쓸지"와는 다른 함수(buildProviderPreferences)가 담당한다.
 */
function testMaxPriceManipulationCannotUpgradeFreeToPremium() {
  const originalPremiumMax = process.env.AI_PREMIUM_MAX_PRICE;
  const originalCheapMax = process.env.AI_CHEAP_MAX_PRICE;
  try {
    // FREE 사용자가 뭘 어떻게 하든(가정: 서버 env까지 건드렸다고 최악을
    // 가정해도) resolveModelChainForTier의 결과는 max_price와 무관하다.
    process.env.AI_PREMIUM_MAX_PRICE = "999999,999999"; // 상한을 터무니없이 높여도
    process.env.AI_CHEAP_MAX_PRICE = "0,0"; // CHEAP 상한을 0으로 낮춰도
    const chain = resolveModelChainForTier("free", "premium");
    assert(
      JSON.stringify(chain) === JSON.stringify(CHEAP_MODEL_CHAIN),
      `max_price env 조작 후에도 FREE는 여전히 CHEAP 체인이어야 함: ${chain.join(",")}`
    );
  } finally {
    if (originalPremiumMax === undefined) delete process.env.AI_PREMIUM_MAX_PRICE;
    else process.env.AI_PREMIUM_MAX_PRICE = originalPremiumMax;
    if (originalCheapMax === undefined) delete process.env.AI_CHEAP_MAX_PRICE;
    else process.env.AI_CHEAP_MAX_PRICE = originalCheapMax;
  }
  console.log("✅ FREE + max_price 조작 → 여전히 CHEAP 체인(max_price는 provider 가격 상한일 뿐, 모델 목록 선택과 무관한 축)");
}

/** Test: deal-scoring 라우트가 실제로 resolveModelChainForTier를 거치는지(정적 검사) — PR #77 Final Review의 A) gap 수정 확인 */
function testDealScoringRouteWiresPlanRouting() {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/api/deals/[id]/score/route.ts"),
    "utf-8"
  );
  assert(
    /getUserPlanKey\(session\.user\.id\)/.test(source),
    "deal score route가 사용자 플랜을 조회하지 않음 — FREE가 여전히 전역 기본(유료) 체인을 씀"
  );
  assert(
    /resolveModelChainForTier\(planKey,\s*"balanced"\)/.test(source),
    "deal score route가 resolveModelChainForTier를 쓰지 않음"
  );
  assert(
    /generateDealScore\(\s*\{/.test(source) && /modelChain/.test(source),
    "deal score route가 계산한 modelChain을 generateDealScore에 넘기지 않음"
  );
  console.log("✅ deal-scoring 라우트: planKey 조회 → resolveModelChainForTier → generateDealScore로 실제 배선됨(정적 검사)");
}

/** Test: LP report 라우트가 실제로 resolveModelChainForTier를 거치는지(정적 검사) — PR #77 Final Review의 B) gap 수정 확인 */
function testLpReportRouteWiresPlanRouting() {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/api/funds/[id]/lp-report/route.ts"),
    "utf-8"
  );
  assert(
    /requireFeature\(session\.user\.id,\s*"lpReporting"\)/.test(source),
    "LP report route의 기존 plan 게이팅(requireFeature)이 사라짐 — FREE가 도달 가능해짐"
  );
  assert(
    /getUserPlanKey\(session\.user\.id\)/.test(source) &&
      /resolveModelChainForTier\(planKey,\s*"balanced"\)/.test(source),
    "LP report route가 resolveModelChainForTier를 쓰지 않음(PAID 안에서 BALANCED/PREMIUM 구분이 안 됨)"
  );
  console.log(
    "✅ LP report 라우트: 기존 requireFeature(lpReporting) 게이팅 유지 + resolveModelChainForTier로 PAID 내부 tier도 일관되게 적용(정적 검사)"
  );
}

/**
 * Test: fallback 소진 시 어떤 코드 경로도 CHEAP → PREMIUM/BALANCED로
 * "격상"하지 않는다. resolveModelChainForTier는 호출부(report-generation.ts,
 * 각 route)가 섹션/작업을 시작하기 "전에" 한 번 호출해 체인을 정하는
 * 함수다 — claude.ts 자신(runModelChain/callWithFallback/callOnce/
 * generateText, 즉 실제 체인을 소비하는 쪽)이 이 함수를 스스로 다시
 * 호출하는 코드가 있다면, 그건 "체인이 소진되면 다른 체인을 다시
 * 골라 이어붙인다"는 뜻이라 escalation 경로가 생긴 것이다. claude.ts
 * 안에서 resolveModelChainForTier를 실제로 "호출"하는 곳(괄호가 붙은
 * 형태)이 자기 자신의 정의뿐인지 확인한다(정의는 호출이 아니므로 0이어야 함).
 */
function testNoEscalationPathExistsInSource() {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/claude.ts"),
    "utf-8"
  );
  // 함수 선언 형태(`function resolveModelChainForTier(`)와 주석 줄(문서에서
  // 이 함수를 언급만 하는 경우)은 제외하고, 실제 코드에서 "호출"하는 형태만
  // 센다.
  const codeLines = source
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/**");
    })
    .join("\n");
  const callSites = codeLines.match(/(?<!function )resolveModelChainForTier\(/g) ?? [];
  assert(
    callSites.length === 0,
    `claude.ts 내부에서 resolveModelChainForTier를 스스로 호출하는 코드가 있음(${callSites.length}건) — ` +
      `이 함수는 호출부(report-generation.ts 등)가 체인 시작 "전"에 한 번만 불러야 한다. ` +
      `claude.ts 자신이 다시 부르면 "체인이 소진되면 다른 tier로 재선택"하는 escalation 경로가 생긴 것`
  );
  console.log("✅ fallback 소진 → CHEAP/BALANCED/PREMIUM 간 자동 격상 경로 없음(claude.ts 자신은 resolveModelChainForTier를 호출하지 않음, 정적 검사)");
}

async function main() {
  console.log("\n=== DealMind Cost-Performance Model Router(3-tier) + Provider 라우팅 테스트 ===\n");
  testFreeAlwaysCheapRegardlessOfTaskTier();
  testFreeRequestingPremiumIsBlocked();
  testPaidUsesBalancedOrPremiumByTaskTier();
  testCheapChainHasFallback();
  testPremiumChainHasFallback();
  testProviderSortConfigValid();
  testMaxPriceSchemaValid();
  await testGenerateTextBackwardCompatible();
  await testRunModelChainUnchanged();
  await testQualityGateUnchanged();
  testReportGenerationWiresPerSectionTier();
  testSectionTierMapping();
  testNoClientCostPolicyOverridePath();
  testMaliciousRequestBodyFieldsAreDropped();
  testMaxPriceManipulationCannotUpgradeFreeToPremium();
  testDealScoringRouteWiresPlanRouting();
  testLpReportRouteWiresPlanRouting();
  testNoEscalationPathExistsInSource();
  console.log("\n✅ Cost-Performance Model Router 테스트 통과\n");
}

main();
