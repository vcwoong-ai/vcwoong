/**
 * AI API Cost Optimization — FREE/PAID 모델 라우팅 검증.
 *
 * 목표: 무료 사용자가 고가 fallback(Gemini 2.5 Pro, Claude Sonnet 4.5)을
 * 직접 호출해 유료 사용자와 같은 비용을 발생시키지 않는지, 그리고 그
 * 결정이 항상 서버 측(DB에 저장된 subscriptionPlan)에서만 이뤄지고
 * 클라이언트가 보낸 값으로 우회할 수 없는지 검증한다.
 *
 * 실제 네트워크 호출은 하지 않는다 — resolveModelChainForTier()는 순수
 * 함수이고, 클라이언트 입력 스키마(zod)는 정적으로 검사한다.
 *
 * Usage: npm run test:model-tier-routing
 */
import {
  resolveModelChainForTier,
  MODEL,
  FALLBACK_MODELS,
  FREE_TIER_MODEL,
  FREE_TIER_FALLBACK_MODELS,
} from "../src/lib/claude";
import type { PlanKey } from "../src/lib/quotas";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const PREMIUM_MARKERS = ["claude-sonnet", "gemini"];

function containsPremiumModel(chain: string[]): boolean {
  return chain.some((m) => PREMIUM_MARKERS.some((marker) => m.includes(marker)));
}

/** Test A: FREE 플랜은 premium model(Gemini/Claude)이 체인에 전혀 없다 */
function testFreeTierNeverIncludesPremiumModels() {
  const chain = resolveModelChainForTier("free");
  assert(!containsPremiumModel(chain), `FREE 체인에 premium model이 섞여 있음: ${chain.join(",")}`);
  assert(chain[0] === FREE_TIER_MODEL, `FREE 체인의 primary가 FREE_TIER_MODEL이 아님: ${chain[0]}`);
  console.log(`✅ A. FREE 플랜 → premium model 없이 저가 체인만 사용 (${chain.join(" → ")})`);
}

/** Test B: PAID 플랜(6개 실제 플랜 중 FREE 제외 전부)은 기존 기본 체인을 그대로 쓴다(품질 유지) */
function testPaidTiersUseExistingDefaultChain() {
  const paidPlans: PlanKey[] = ["solo", "sector_pro", "multi", "full", "bio_premium"];
  const expected = [MODEL, ...FALLBACK_MODELS];
  for (const plan of paidPlans) {
    const chain = resolveModelChainForTier(plan);
    assert(
      JSON.stringify(chain) === JSON.stringify(expected),
      `${plan}: 기존 기본 체인과 다름 — got ${chain.join(",")}, expected ${expected.join(",")}`
    );
  }
  console.log(`✅ B. PAID 6개 플랜 전부(solo/sector_pro/multi/full/bio_premium) → 기존 기본 체인 그대로(${expected.join(" → ")})`);
}

/**
 * Test C: FREE 사용자의 fallback도 premium model로 넘어가지 않는다 — primary
 * (DeepSeek) 실패 시 체인의 다음 항목(FREE_TIER_FALLBACK_MODELS)도 저가
 * 모델이어야 한다(전체 체인을 이미 A에서 확인했지만, "fallback 단계"를
 * 명시적으로 짚어 회귀를 막는다).
 */
function testFreeTierFallbackStaysLowCost() {
  assert(
    !containsPremiumModel(FREE_TIER_FALLBACK_MODELS),
    `FREE fallback 자체에 premium model이 들어있음: ${FREE_TIER_FALLBACK_MODELS.join(",")}`
  );
  assert(
    !FREE_TIER_FALLBACK_MODELS.some((m) => m === "openrouter/free" || m.endsWith(":free")),
    "FREE fallback에 openrouter/free류 무료 모델이 들어있음 — PR #69에서 겪은 품질 사고와 같은 위험"
  );
  console.log(`✅ C. FREE fallback(${FREE_TIER_FALLBACK_MODELS.join(",")})도 premium/무료-품질모델 아님`);
}

/** Test D: PAID 사용자의 fallback은 기존 그대로(Gemini→Claude) 유지된다 — 품질 저하 없음 */
function testPaidTierFallbackUnchanged() {
  const chain = resolveModelChainForTier("full");
  assert(
    JSON.stringify(chain.slice(1)) === JSON.stringify(FALLBACK_MODELS),
    "PAID fallback이 기존 FALLBACK_MODELS와 달라짐 — 품질 저하 위험"
  );
  console.log("✅ D. PAID fallback은 기존 FALLBACK_MODELS 그대로 유지(품질 저하 없음)");
}

/**
 * Test E: client가 model을 지정해 premium model을 우회할 방법이 구조적으로
 * 없다 — 보고서 생성/재생성 API의 zod 입력 스키마에 model 관련 필드가
 * 아예 존재하지 않는다(허용 목록에 없는 필드는 애초에 전달할 방법이
 * 없음). 소스 파일을 직접 읽어 스키마 문자열에 "model"이 없는지 확인한다
 * (런타임에 실제 HTTP 요청을 보내지 않고도 회귀를 잡기 위함).
 */
function testNoClientModelOverridePath() {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const files = [
    "src/app/api/deals/[id]/reports/route.ts",
    "src/app/api/reports/[id]/sections/regenerate/route.ts",
  ];
  for (const rel of files) {
    const source = fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");
    const schemaMatch = source.match(/z\.object\(\{[\s\S]*?\}\)/);
    assert(Boolean(schemaMatch), `${rel}: zod 입력 스키마를 찾지 못함`);
    assert(
      !/\bmodel\s*:/i.test(schemaMatch![0]),
      `${rel}: 입력 스키마에 model 필드가 있음 — client가 모델을 지정할 수 있는 경로가 생김`
    );
  }
  console.log("✅ E. 보고서 생성/재생성 API의 입력 스키마에 model 필드 없음 — client override 경로 자체가 없음");
}

/** Test F: 구독 정보가 없거나(null/undefined) 알 수 없는 값이면 안전한(저비용) 기본 정책으로 fail-safe한다 */
function testUnknownOrMissingPlanFailsSafeToFreeChain() {
  const expected = [FREE_TIER_MODEL, ...FREE_TIER_FALLBACK_MODELS];
  for (const bad of [null, undefined, "", "not-a-real-plan"]) {
    const chain = resolveModelChainForTier(bad as PlanKey | null | undefined);
    assert(
      JSON.stringify(chain) === JSON.stringify(expected),
      `구독 정보 누락/오류(${JSON.stringify(bad)})가 FREE 체인으로 fail-safe하지 않음: ${chain.join(",")}`
    );
    assert(!containsPremiumModel(chain), `구독 정보 누락 시에도 premium model로 새면 안 됨: ${chain.join(",")}`);
  }
  console.log("✅ F. 구독 정보 누락/오류 → 항상 FREE(저비용) 체인으로 fail-safe, premium으로 새지 않음");
}

function main() {
  console.log("\n=== DealMind AI Cost Optimization — FREE/PAID 모델 라우팅 테스트 ===\n");
  testFreeTierNeverIncludesPremiumModels();
  testPaidTiersUseExistingDefaultChain();
  testFreeTierFallbackStaysLowCost();
  testPaidTierFallbackUnchanged();
  testNoClientModelOverridePath();
  testUnknownOrMissingPlanFailsSafeToFreeChain();
  console.log("\n✅ AI Cost Optimization 모델 라우팅 테스트 통과\n");
}

main();
