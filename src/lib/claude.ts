/**
 * AI provider abstraction — OpenRouter 단일 프로바이더.
 *
 * 호출 우선순위(모델 체인):
 *   1. AI_MODEL (기본: deepseek/deepseek-v4-flash-0731)
 *   2. AI_FALLBACK_MODELS(콤마 구분 목록) — 실패(429/5xx/타임아웃/AbortError,
 *      또는 모델 ID·인증 오류 400/401/403/404) 시 순서대로 다음 모델로 전환.
 *      미설정 시 하위호환으로 AI_FALLBACK_MODEL(단일) 사용, 그것도 없으면
 *      기본 체인(아래 DEFAULT_FALLBACK_CHAIN) 사용.
 *
 * 모든 호출은 OpenRouter(OPENROUTER_API_KEY)로 나간다 — withModelOverride로
 * 감싼 구간만 예외(아래 참고).
 */

import { AsyncLocalStorage } from "node:async_hooks";
import OpenAI from "openai";
import { generateMockContent } from "./mock-generator";
import { BRAND } from "./brand";
import { calculateEstimatedCost } from "./ai-cost";

const DEFAULT_MODEL = "deepseek/deepseek-v4-flash-0731";

/**
 * 기본 모델이 죽었을 때를 대비한 폴백 체인(순서대로 시도).
 *
 * 예전엔 무료 티어 모델(`openrouter/free` → 그 시점에 살아있는 무료 모델을
 * OpenRouter가 알아서 골라줌, 그다음 `meta-llama/llama-3.3-70b-instruct`)을
 * 기본 폴백으로 뒀다 — 가용성(모델이 안 죽는 것) 관점에서는 안전했지만,
 * "무엇이 뽑힐지 통제 불가"와 "무료 모델의 응답 품질" 자체가 투자심사보고서
 * 라는 용도에는 구조적으로 안 맞았다. 실제 프로덕션 사고(2026-09-12,
 * report=cmtycq7ne...): primary가 타임아웃 나 `openrouter/free`로 전환됐는데,
 * 그 모델이 OPINION_SUMMARY(가장 중요한 섹션)에 `"User Safety: safe"`
 * (45자, 실제 투자의견이 아닌 안전필터/메타성 문구로 추정)를 반환했고,
 * 당시엔 이를 걸러낼 generation-time validation이 없어 그대로 저장·완료
 * 처리됐다(PR #68에서 이 검증 공백 자체는 이미 고쳤다 — QualityGateError가
 * 이런 응답을 무슨 모델이 만들었든 reject하고 다음 모델로 넘긴다).
 *
 * 이 PR은 그 위에서 한 걸음 더 나간다 — "빈약한 응답이 나와도 게이트가
 * 걸러준다"에 기대는 대신, 애초에 fallback 단계에서 나올 응답의 기대 품질
 * 자체를 올린다. 기본 폴백 체인을 무료/가용성 우선에서 유료·고품질 모델
 * 우선으로 바꾼다:
 *   1. `google/gemini-2.5-pro`
 *   2. `anthropic/claude-sonnet-4.5`
 * DeepSeek(기본 모델, MODEL)는 그대로 유지한다 — 가격 대비 성능이 좋고
 * 정상 응답 시 대부분의 섹션 생성에 충분하므로, "실패했을 때만" 이
 * 체인으로 넘어간다(비용은 실패 시에만 발생 — 평소엔 호출되지 않음).
 * 두 모델 다 OpenRouter를 통해 호출한다(OPENROUTER_API_KEY 하나로 통일,
 * 별도 프로바이더 연동 없음).
 *
 * AI_FALLBACK_MODELS 환경변수로 언제든 override 가능(resolveFallbackChain
 * 참고) — 이 상수는 그 환경변수가 미설정일 때만 쓰이는 "안전 기본값"이다.
 */
export const DEFAULT_FALLBACK_CHAIN = ["google/gemini-2.5-pro", "anthropic/claude-sonnet-4.5"];

function resolveDefaultModel(): string {
  return process.env.AI_MODEL?.trim() || DEFAULT_MODEL;
}

export const MODEL = resolveDefaultModel();

/** 콤마 구분 목록을 안전하게 파싱한다 — 빈 항목·앞뒤 공백을 정리한다 */
function parseModelList(raw: string): string[] {
  return raw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

/** 체인이 너무 길어지면(설정 실수 등) 시도 횟수·비용이 함께 늘어난다 — 상한을 둔다 */
export const MAX_FALLBACK_MODELS = 4;

/**
 * 인자를 기본값(process.env)으로 두면 프로덕션 동작 그대로고, 명시적으로
 * 넘기면 환경변수 조합별 분기(신규 목록/기존 단일값/둘 다 없음)를 실제
 * 프로세스 env를 건드리지 않고 테스트할 수 있다.
 */
export function resolveFallbackChain(
  fallbackModelsEnv: string | undefined = process.env.AI_FALLBACK_MODELS,
  fallbackModelEnv: string | undefined = process.env.AI_FALLBACK_MODEL
): string[] {
  const list = fallbackModelsEnv?.trim();
  if (list) {
    const parsed = parseModelList(list);
    if (parsed.length > 0) return parsed.slice(0, MAX_FALLBACK_MODELS);
  }
  // 하위호환: 기존 단일 AI_FALLBACK_MODEL만 설정된 환경
  const single = fallbackModelEnv?.trim();
  if (single) return [single];
  return [...DEFAULT_FALLBACK_CHAIN];
}

/** 실제 사용할 폴백 체인 — 기본 모델과 같은 항목은 의미가 없어 제외한다 */
export const FALLBACK_MODELS: string[] = resolveFallbackChain().filter((m) => m !== MODEL);

/** 하위호환용 단일 값(헬스체크 등 기존 코드가 참조) — 체인의 첫 항목 */
export const FALLBACK_MODEL = FALLBACK_MODELS[0] ?? DEFAULT_MODEL;

/**
 * FREE 플랜 전용 모델 체인 — 무료 사용자가 고가 fallback(Gemini 2.5 Pro,
 * Claude Sonnet 4.5)까지 호출해 리포트 1건에 유료 사용자와 같은 비용이
 * 나가는 것을 막는다.
 *
 * primary는 기본 모델(DeepSeek, MODEL)과 동일하게 둔다 — 어차피 primary는
 * 이미 가장 저렴한 모델이라 FREE 전용으로 더 낮출 이유가 없다(정상 응답
 * 시 fallback 자체가 호출되지 않으므로 여기서 비용 차이가 없다). 차이는
 * "primary가 실패했을 때 어디로 넘어가는가"뿐이다 — PAID는
 * DEFAULT_FALLBACK_CHAIN(Gemini→Claude)으로 넘어가지만, FREE는 저가
 * 모델로만 넘어간다.
 *
 * 모델명은 환경변수로 조정 가능하게 뒀다(AI_FALLBACK_MODELS와 같은
 * 패턴) — OpenRouter에서 실제 사용 가능한 모델·가격은 배포 환경마다
 * 다를 수 있어, 코드에 고정하기보다 운영자가 실측 후 조정할 수 있게
 * 한다. 기본값은 무료 티어 fallback으로 이미 검증된 저가 모델
 * (meta-llama/llama-3.3-70b-instruct)이다 — openrouter/free는 쓰지
 * 않는다(PR #69에서 겪은 품질 사고와 같은 이유).
 */
export const FREE_TIER_MODEL = process.env.AI_FREE_TIER_MODEL?.trim() || MODEL;

function resolveFreeTierFallbackChain(): string[] {
  const raw = process.env.AI_FREE_TIER_FALLBACK_MODELS?.trim();
  if (raw) {
    const parsed = parseModelList(raw);
    if (parsed.length > 0) return parsed.slice(0, MAX_FALLBACK_MODELS);
  }
  return ["meta-llama/llama-3.3-70b-instruct"];
}

export const FREE_TIER_FALLBACK_MODELS: string[] = resolveFreeTierFallbackChain().filter(
  (m) => m !== FREE_TIER_MODEL
);

/** FREE를 제외한, 실제로 존재하는 유료 플랜 키만 명시적으로 나열한다(quotas.ts의 PlanKey와 동일). */
const KNOWN_PAID_PLAN_KEYS = new Set([
  "solo",
  "sector_pro",
  "multi",
  "full",
  "bio_premium",
]);

/**
 * Cost-aware Model Router(요청서 item 17) — 사용자 플랜 키만 보고 이번
 * generateText 호출에 쓸 전체 모델 체인([primary, ...fallbacks])을
 * 결정한다. 새 abstraction이 아니라 이미 있는 MODEL/FALLBACK_MODELS
 * 상수 조합을 플랜별로 고르는 순수 함수다 — 호출부(report-generation.ts,
 * sections/regenerate/route.ts)가 DB에서 읽은 플랜을 여기 넘기기만
 * 하면 되고, claude.ts 자체는 구독·과금 개념을 전혀 몰라도 된다.
 *
 * "free가 아니면 전부 유료로 본다"가 아니라 실제 유료 플랜 키
 * (KNOWN_PAID_PLAN_KEYS)에 정확히 속할 때만 premium 체인을 준다 —
 * planKey를 못 읽었거나(구독 정보 누락) 오타·알 수 없는 값이면 항상
 * FREE 체인으로 fail-safe한다. "free가 아닌 모든 것을 유료로 취급"하면
 * 구독 조회가 깨졌을 때 정확히 반대 방향(저비용이 아니라 고비용)으로
 * 새어버린다.
 */
/**
 * Task 단위 비용 등급(요청서 "Cost-Performance Model Router"). 플랜 등급
 * (FREE/PAID)과는 다른 축이다 — 같은 PAID 사용자라도 섹션 성격에 따라
 * 쓸 모델 풀이 다르다:
 *   - cheap: 요약·메타데이터 추출·간단한 IC 초안 다듬기 등 최종 투자
 *     판단에 직접 쓰이지 않는 보조 작업(ic-questions-ai.ts, evidence-ai.ts,
 *     deep-dive.ts, deal-scoring.ts, sourcing.ts, template 추출 등)
 *   - balanced: 기본 보고서 섹션(투자개요/제품기술/시장분석/재무현황/
 *     리스크/투자조건/별첨 등) — 기존 PAID 기본 체인과 동일
 *   - premium: 투자의견(OPINION_SUMMARY: Investment Thesis/Bull-Base-Bear/
 *     Why Not Invest)과 복잡한 밸류에이션(VALUATION) — 최종 투자 판단에
 *     가장 직접적으로 쓰이는 섹션만 해당
 */
export type TaskTier = "cheap" | "balanced" | "premium";

/**
 * BALANCED(기본 보고서 섹션) 전용 모델 체인 — 기존 PAID 기본 체인
 * (AI_MODEL + AI_FALLBACK_MODELS) 그 자체다. PREMIUM의 기본값이 바로 이
 * 상수를 참조한다(아래) — `AI_PREMIUM_MODELS`를 설정하지 않으면
 * `PREMIUM_MODELS`가 이 배열과 **의도적으로 완전히 같다**. 실수나 버그가
 * 아니다.
 *
 * 왜 기본값을 다르게 만들지 않았나: 이 프로젝트는 "확인 안 된 모델
 * 목록을 코드에 새로 지어내지 않는다"는 원칙을 지킨다(요청서: "새 모델을
 * 임의로 추가하지 말 것"). BALANCED 전용으로 더 싼 모델을 기본값으로
 * 박아 넣으려면 그 모델이 실제로 OpenRouter에서 쓸 수 있고 투자심사
 * 보고서 품질에 충분한지 이 세션에서 검증할 방법이 없었다(네트워크 접근
 * 차단). 그래서 BALANCED와 PREMIUM 둘 다 "이미 검증된 기존 기본 체인"을
 * 기본값으로 공유하고, 실제 비용 차등은:
 *   1) `AI_PREMIUM_MODELS`를 설정해 PREMIUM만 다른(더 비싼/더 신뢰도 높은)
 *      체인으로 분리하거나,
 *   2) `AI_BALANCED_MAX_PRICE`로 BALANCED에만 provider 가격 상한을 걸어
 *      OpenRouter가 그 안에서 더 싼 provider를 우선 쓰게 하는 방법으로
 * 운영자가 실측 후 켠다. 이 PR은 그 스위치(코드 경로)를 만드는 것까지가
 * 범위이고, 기본값을 임의로 벌려놓지 않는다.
 */
export const BALANCED_MODEL_CHAIN: string[] = [MODEL, ...FALLBACK_MODELS];

/**
 * PREMIUM 전용 모델 체인 — 미설정 시 BALANCED_MODEL_CHAIN과 완전히
 * 동일하다(하위호환: 이 env가 없으면 premium/balanced 구분이 모델 목록
 * 수준에서는 동일하고, provider 라우팅 설정만 갈릴 수 있다). 위
 * BALANCED_MODEL_CHAIN 주석 참고.
 */
function resolvePremiumModelChain(): string[] {
  const raw = process.env.AI_PREMIUM_MODELS?.trim();
  if (raw) {
    const parsed = parseModelList(raw);
    if (parsed.length > 0) return parsed.slice(0, MAX_FALLBACK_MODELS + 1);
  }
  return BALANCED_MODEL_CHAIN;
}

export const PREMIUM_MODELS: string[] = resolvePremiumModelChain();

/** CHEAP 작업 전용 모델 체인 — FREE 플랜 체인과 동일한 저가 모델을 재사용한다(불필요한 신규 모델 목록을 늘리지 않음). */
export const CHEAP_MODEL_CHAIN: string[] = [FREE_TIER_MODEL, ...FREE_TIER_FALLBACK_MODELS];

/**
 * Cost-aware Model Router(요청서 item 17, 이후 3-tier로 확장) — 사용자
 * 플랜 키 + task tier를 보고 이번 generateText 호출에 쓸 전체 모델 체인
 * ([primary, ...fallbacks])을 결정한다.
 *
 * "free가 아니면 전부 유료로 본다"가 아니라 실제 유료 플랜 키
 * (KNOWN_PAID_PLAN_KEYS)에 정확히 속할 때만 balanced/premium 체인을 준다 —
 * planKey를 못 읽었거나(구독 정보 누락) 오타·알 수 없는 값이면 항상
 * FREE(=cheap) 체인으로 fail-safe한다. FREE 플랜은 taskTier가 premium이어도
 * premium 체인으로 올라가지 않는다 — "이 섹션이 중요하다"는 것이 "이
 * 사용자에게 비싼 모델을 써도 된다"는 뜻은 아니다(클라이언트가 taskTier를
 * 조작할 방법도 없지만, 서버가 스스로에게도 이 원칙을 적용한다).
 */
/** planKey가 실제 유료 플랜 키(KNOWN_PAID_PLAN_KEYS)에 정확히 속하는지 — UsageLog의 userTier 태깅 등에서 재사용(단일 소스) */
export function isPaidPlanKey(planKey: string | null | undefined): boolean {
  return Boolean(planKey && KNOWN_PAID_PLAN_KEYS.has(planKey));
}

export function resolveModelChainForTier(
  planKey: string | null | undefined,
  taskTier: TaskTier = "balanced"
): string[] {
  if (!isPaidPlanKey(planKey)) return CHEAP_MODEL_CHAIN;
  if (taskTier === "premium") return PREMIUM_MODELS;
  if (taskTier === "cheap") return CHEAP_MODEL_CHAIN;
  return BALANCED_MODEL_CHAIN;
}

function getMaxTokens(_model: string, requested?: number): number {
  return requested ?? 4096;
}

function isFreeModel(model: string): boolean {
  return model.endsWith(":free") || model === "openrouter/free";
}

/**
 * 환경변수로 받은 시간(ms) 설정을 안전하게 읽는다.
 *
 * `Number("")`는 0, `Number("30s")`는 NaN이 된다. 이 값들이 그대로 예산·
 * 타임아웃으로 쓰이면 조용히 망가진다(0이면 아무 작업도 시작 못 하고,
 * NaN이면 모든 시간 비교가 false라 자체 중단 장치가 통째로 무력화된다).
 * 유효한 양수가 아니면 기본값을 쓴다.
 */
export function envDurationMs(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * 단일 AI 호출(1회 시도) 타임아웃(ms).
 *
 * 타임아웃이 없으면 업스트림이 응답을 주지 않을 때 호출이 무한정 매달리고,
 * 섹션 루프가 통째로 멈춰 진행률이 0에서 고정된 채 함수 실행시간 제한까지
 * 흘러가 버린다.
 *
 * 함수 실행시간 상한(Hobby 60초)보다 반드시 짧아야 한다 — 이 값이 상한보다
 * 길면 느린 호출 한 번만으로 함수가 강제 종료되고, 상태 정리도 못 해서
 * 보고서가 GENERATING에 갇힌다. Pro 등 더 긴 실행시간을 쓰면
 * AI_REQUEST_TIMEOUT_MS로 올리면 된다.
 */
export const REQUEST_TIMEOUT_MS = envDurationMs(
  process.env.AI_REQUEST_TIMEOUT_MS,
  25_000
);

/**
 * fallback 모델(체인의 2번째 이후) 전용 1회 시도 타임아웃(ms).
 *
 * 예전엔 fallback도 attemptTimeout()이 "예산에서 앞선 모델이 쓰고 남은 만큼"을
 * 그대로 받는 구조였다 — primary가 REQUEST_TIMEOUT_MS(25s)를 꽉 채워
 * 실패하면 fallback#1(openrouter/free)은 남은 15s만 받고, 그마저 타임아웃
 * 나면 fallback#2(meta-llama)는 남은 시간이 0이라 "시간 예산 소진"으로
 * 호출 자체가 스킵됐다(2026-09-12 실측: report=cmtycq7ne... — primary·
 * fallback#1 둘 다 25s/15s를 꽉 채워 AbortError, fallback#2는 로그에 시도
 * 흔적조차 없음). fallback마다 "남은 걸 나눠 쓰는" 구조 대신 자기 몫으로
 * 고정된 타임아웃을 주면, 앞선 모델이 얼마나 시간을 썼는지와 무관하게
 * 다음 모델이 항상 실제로 시도된다(단, 남은 예산 자체가 이보다 적으면
 * 남은 만큼만 — 아래 AI_CALL_BUDGET_MS 참고). primary보다 짧게 잡은
 * 이유는 fallback 단계에 왔다는 것 자체가 이미 1차 지연을 겪고 있다는
 * 신호라, 매번 25초씩 기다리면 체인 전체가 길어져 REPORT_GENERATION_BUDGET_MS/
 * maxDuration 여유를 필요 이상으로 깎아먹기 때문이다.
 */
export const FALLBACK_REQUEST_TIMEOUT_MS = envDurationMs(
  process.env.AI_FALLBACK_REQUEST_TIMEOUT_MS,
  15_000
);

/**
 * generateText 한 번(체인 전체: primary + 모든 fallback 시도)이 쓸 수
 * 있는 총 시간(ms) — 재시도·백오프 대기까지 포함.
 *
 * 기본값은 "40초를 60초로 늘리는" 임의 조정이 아니라, 실제 체인 구성에서
 * 모델 각각이 자기 몫(REQUEST_TIMEOUT_MS 또는 FALLBACK_REQUEST_TIMEOUT_MS)을
 * 온전히 받을 수 있도록 역산한 값이다: primary 1개(REQUEST_TIMEOUT_MS) +
 * fallback마다(FALLBACK_REQUEST_TIMEOUT_MS) — 기본 체인(openrouter/free,
 * meta-llama 2개)이면 25s + 15s×2 = 55s. AI_FALLBACK_MODELS로 fallback을
 * 늘리면(MAX_FALLBACK_MODELS까지) 이 기본값도 그만큼 늘어나 체인 끝까지
 * 실제로 시도될 시간을 보장한다.
 *
 * 여전히 상한 역할도 한다 — attemptTimeout()이 이 예산을 넘기는 시도는
 * 절대 시작하지 않는다(모델별 고정 타임아웃보다 남은 예산이 적으면 그
 * 남은 만큼만 준다). 재시도(최대 3회, 0/5/15초 백오프)를 시간 제한 없이
 * 돌리면 호출 하나가 한참 넘길 수도 있어서, 함수 실행시간 상한에서는 자체
 * 중단 로직이 손도 못 써보고 함수가 죽는다 — 남은 예산을 넘기는 시도·대기는
 * 아예 시작하지 않는다.
 */
export const AI_CALL_BUDGET_MS = envDurationMs(
  process.env.AI_CALL_BUDGET_MS,
  REQUEST_TIMEOUT_MS + FALLBACK_REQUEST_TIMEOUT_MS * FALLBACK_MODELS.length
);

export interface OpenRouterProviderPreferences {
  sort?: "price" | "throughput" | "latency";
  allow_fallbacks?: boolean;
  max_price?: { prompt: number; completion: number };
}

const VALID_ROUTING_SORTS = new Set(["price", "throughput", "latency"]);

/** "prompt,completion" ($/1M 토큰) 형식을 파싱한다 — 형식이 틀리면 cap 없이 진행(요청 실패보다 안전) */
export function parseMaxPrice(raw: string | undefined): { prompt: number; completion: number } | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const parts = trimmed.split(",").map((s) => Number(s.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
    console.warn(`[AI] max_price 환경변수 형식 오류(무시, cap 없이 진행): "${raw}"`);
    return undefined;
  }
  return { prompt: parts[0], completion: parts[1] };
}

/**
 * OpenRouter의 provider 선택 파라미터(공식 문서
 * https://openrouter.ai/docs/guides/routing/provider-selection) — 이
 * 세션에서는 openrouter.ai로의 아웃바운드 접속이 조직 egress 정책으로
 * 차단돼 있어(WebFetch: EGRESS_BLOCKED) 문서를 직접 열어 확인하지 못했다.
 * 대신 OpenRouter 공식 블로그·서드파티 미러 여러 곳으로 교차 확인된
 * 필드만 구현한다:
 *   - sort: "price" | "throughput" | "latency" (문자열)
 *   - allow_fallbacks: boolean(기본 true — provider 하나가 막히면 다른
 *     provider로 자동 전환, OpenRouter 자체 문서 기본값과 동일)
 *   - max_price: { prompt, completion } — $/1M 토큰. 이 가격을 넘는
 *     provider가 없으면 요청 자체를 거절한다(조용히 비싼 provider로
 *     새지 않는다)
 *
 * 요청서에 있던 "provider.partition: 'none'"은 구현하지 않았다 — 교차
 * 확인한 자료들이 이를 provider 최상위 필드가 아니라 sort 하위 구조
 * (`sort: {by, partition}`)로 설명해 요청서 표기와 어긋났고, 공식 문서로
 * 직접 검증할 수 없는 상태에서 틀린 shape를 보내면 최악의 경우 400으로
 * 보고서 생성 전체가 실패할 위험이 있다 — 확인 안 된 필드를 프로덕션
 * 요청 바디에 넣기보다 비워둔다.
 *
 * sort는 모델을 바꾸지 않는다 — 이미 정해진 model(들) 뒤에서 그 모델을
 * 서빙하는 여러 provider 중 우선순위만 정한다(예: Claude Sonnet을 서빙하는
 * provider가 여럿이면 그중 가장 싼 곳부터 시도). 그래서 premium tier에도
 * 안전하게 적용할 수 있다 — 품질에 영향을 주는 "어떤 모델을 쓰는가"가
 * 아니라 "같은 모델을 어디서 싸게 받는가"만 바꾼다.
 */
export function buildProviderPreferences(tier: TaskTier): OpenRouterProviderPreferences | undefined {
  const sortEnv = (process.env.AI_ROUTING_SORT ?? "price").trim();
  if (!sortEnv) return undefined; // 빈 값으로 명시하면 provider 라우팅 자체를 끈다
  if (!VALID_ROUTING_SORTS.has(sortEnv)) {
    console.warn(`[AI] AI_ROUTING_SORT 값이 올바르지 않음("${sortEnv}") — provider 라우팅 미적용`);
    return undefined;
  }

  const maxPriceEnv =
    tier === "cheap"
      ? process.env.AI_CHEAP_MAX_PRICE
      : tier === "premium"
        ? process.env.AI_PREMIUM_MAX_PRICE
        : process.env.AI_BALANCED_MAX_PRICE;

  const maxPrice = parseMaxPrice(maxPriceEnv);

  return {
    sort: sortEnv as "price" | "throughput" | "latency",
    allow_fallbacks: true,
    ...(maxPrice ? { max_price: maxPrice } : {}),
  };
}

function getClient(timeoutMs: number = REQUEST_TIMEOUT_MS): OpenAI {
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    timeout: timeoutMs,
    // 재시도는 callWithFallback에서 직접 제어한다(폴백 모델 전환 포함).
    maxRetries: 0,
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXTAUTH_URL ?? "http://localhost:3000",
      "X-Title": BRAND.name,
    },
  });
}

export function isAIConfigured(): boolean {
  const openrouter = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  return openrouter.startsWith("sk-or-") && openrouter.length > 20;
}

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

/** generation-time 품질 게이트 결과(section-generation-gate.ts와 동일 shape) */
export interface ContentValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * 응답 content가 도메인 관점에서 유효한지 검증하는 콜백 — claude.ts는
 * "섹션"이라는 개념을 몰라야 하므로(다른 여러 AI 호출도 이 파일을 공유),
 * 검증 로직 자체는 호출부(base-agent.ts 등)가 주입한다. 실패하면
 * QualityGateError가 던져져 기존 재시도/폴백 체인을 그대로 탄다.
 */
export type ContentValidator = (content: string) => ContentValidationResult;

/** 구조화 로그(AI_QUALITY_GATE_FAIL 등)에 붙일 문맥 — claude.ts는 이 값의 의미를 모르고 로그 태그로만 쓴다 */
export interface AIQualityLogContext {
  reportId?: string;
  section?: string;
}

export interface ClaudeOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  validate?: ContentValidator;
  logContext?: AIQualityLogContext;
  /**
   * 이번 호출에 쓸 모델 체인([primary, ...fallbacks])을 명시적으로
   * 지정한다 — 없으면 기존과 동일하게 전역 MODEL/FALLBACK_MODELS를
   * 쓴다. resolveModelChainForTier()로 만든 플랜별 체인을 여기 넘기는
   * 용도(Cost-aware Model Router) — claude.ts는 이 배열이 어디서
   * 왔는지(플랜·과금) 전혀 몰라도 된다.
   */
  modelChain?: string[];
  /**
   * OpenRouter provider 라우팅(sort/max_price)에 쓸 task tier — 미지정 시
   * "balanced"(기존 기본 동작과 동일). modelChain(어떤 모델을 시도하는가)과
   * 독립적인 축이다: modelChain은 호출부가 이미 골라둔 모델 목록이고,
   * taskTier는 그 모델들을 어떤 provider 가격 정책으로 부를지만 정한다.
   */
  taskTier?: TaskTier;
  /**
   * 체인의 모든 시도(성공/실패 모두)를 실시간으로 통보받는 훅 —
   * UsageLog에 "최종 성공 모델만" 기록하면 실패한 시도(품질 게이트 실패,
   * 빈 응답 등 — 전부 실제 API 호출이 이미 일어나 토큰이 소모된 뒤의
   * 실패)가 비용 집계에서 누락된다. 호출부(report-generation.ts 등)가
   * 이 콜백으로 시도마다 UsageLog row를 쌓는다. claude.ts는 그 저장 방식을
   * 몰라도 되도록 순수 사실(model/성공여부/토큰/provider/비용)만 전달한다.
   * 콜백이 던지는 예외는 절대 AI 생성 자체를 실패시키지 않는다(아래
   * emitAttempt 참고 — 항상 try/catch로 감싼다).
   */
  onAttempt?: AIAttemptListener;
}

/** 모델 체인의 시도 1회(성공이든 실패든)에 대한 사실 기록 — UsageLog 등 저장 방식은 모른다 */
export interface AIAttemptRecord {
  model: string;
  /** 체인 내 위치 — 0=primary, 1 이상=fallback(몇 번째로 시도됐는지) */
  attemptIndex: number;
  success: boolean;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  /**
   * OpenRouter가 실제로 이 요청을 처리한 provider id — 이 세션은
   * openrouter.ai 문서를 직접 열 수 없어 응답의 정확한 필드명을 확정하지
   * 못했다. 있으면 쓰고, 없으면(또는 필드가 다르면) undefined로 남긴다
   * (모르는 걸 지어내지 않는다 — cost와 동일한 원칙).
   */
  provider?: string;
  /** OpenRouter가 응답에 실은 실제 비용(USD) — 없으면 null(추정 안 함) */
  estimatedCost: number | null;
  /** 실패한 시도의 에러 종류(성공이면 undefined) */
  errorKind?: string;
}

export type AIAttemptListener = (attempt: AIAttemptRecord) => void;

/** onAttempt 콜백은 호출부 로직(DB 저장 등)이라 실패할 수 있다 — 절대 AI 생성 자체를 막지 않는다 */
export function emitAttempt(listener: AIAttemptListener | undefined, record: AIAttemptRecord): void {
  if (!listener) return;
  try {
    listener(record);
  } catch (err) {
    console.warn(`[AI] onAttempt 콜백 실패(무시, 생성 자체에는 영향 없음): ${String(err)}`);
  }
}

export interface GenerateTextResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  usedModel: string;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * generateText가 실제로 OpenRouter를 부르는 대신 이 함수로 대체되도록
 * 하는 훅. 8개 섹터 에이전트(bio-agent.ts 등)는 전부 이 파일의
 * generateText를 직접 import해서 호출하는 구조라, 에이전트 각각을 고치지
 * 않고도 "같은 프롬프트를 다른 모델로 호출"을 가능하게 하려면 이 함수
 * 자체에 훅을 둬야 한다 — 그래야 각 에이전트의 섹터 특화 프롬프트(BIO의
 * rNPV, IT의 SaaS 지표 등)가 그대로 재사용된다.
 *
 * AsyncLocalStorage를 쓰는 이유: 요청마다(그리고 같은 요청 안에서 여러
 * 모델을 병렬로 부를 때도) 서로 다른 override가 섞이지 않아야 한다.
 * Node의 AsyncLocalStorage는 각 run() 호출의 비동기 실행 흐름에만
 * store를 노출하므로, Promise.allSettled로 여러 모델을 동시에 돌려도
 * 각자 자기 override만 보게 된다(동시 요청 간에도 마찬가지).
 *
 * 현재 유일한 사용처: 보고서 화면의 "다른 모델로 비교" 기능
 * (src/app/api/reports/[id]/sections/compare/route.ts) — 실제 보고서
 * 저장 경로(report-generation.ts)는 이 훅을 쓰지 않는다.
 */
type ModelCallOverride = (
  messages: ClaudeMessage[],
  options: ClaudeOptions
) => Promise<GenerateTextResult>;

const modelOverrideStorage = new AsyncLocalStorage<ModelCallOverride>();

export function withModelOverride<T>(
  override: ModelCallOverride,
  fn: () => Promise<T>
): Promise<T> {
  return modelOverrideStorage.run(override, fn);
}

/**
 * OpenRouter가 HTTP 200 + 정상 형태의 response를 주고도 실제 본문(content)이
 * 비어 있을 때 던진다(업스트림 일시 장애, 특정 모델의 빈 completion 등 —
 * 실제로 관측된 적 있는 실패 모드). 이걸 그냥 통과시키면 "AI 호출 성공"과
 * "섹션 성공"이 갈라져, 빈 섹션이 조용히 COMPLETE로 저장된다. isRetryableAIError가
 * 이 타입도 재시도/폴백 대상으로 인식하게 해서, 기존 재시도·폴백 경로를
 * 그대로 태운다(별도 처리 경로를 새로 만들지 않음).
 */
export class EmptyAIResponseError extends Error {
  constructor(model: string) {
    super(`${model}이(가) 빈 응답을 반환함`);
    this.name = "EmptyAIResponseError";
  }
}

/**
 * HTTP 200 + 비어있지 않은 응답이어도, 호출부가 지정한 최소 품질 조건
 * (section-generation-gate.ts 등)을 통과하지 못하면 던진다. 실제 프로덕션
 * 사고(2026-09-12): OPINION_SUMMARY가 "User Safety: safe"(45자)로 저장돼
 * 보고서가 완료 처리됨 — EmptyAIResponseError는 "비어있지 않음"만 보므로
 * 이 케이스를 잡지 못했다. isRetryableAIError가 이 타입도 재시도/폴백
 * 대상으로 인식하게 해서, 기존 재시도·폴백 경로를 그대로 태운다(빈 응답과
 * 동일한 설계 원칙 — 별도 처리 경로를 새로 만들지 않음).
 */
export class QualityGateError extends Error {
  constructor(
    public readonly model: string,
    public readonly reason: string
  ) {
    super(`${model}의 응답이 품질 게이트를 통과하지 못함 (${reason})`);
    this.name = "QualityGateError";
  }
}

/**
 * OpenRouter 응답(ChatCompletion)에서 토큰/provider/비용을 뽑아낸다 —
 * 순수 함수로 분리해 실제 네트워크 호출 없이(합성 응답 객체로) 단위
 * 테스트할 수 있게 한다(runModelChain을 순수 함수로 분리한 이유와 동일).
 *
 * - inputTokens/outputTokens: usage가 없으면 0(호출 자체가 비정상이었단 뜻)
 * - provider: OpenRouter 응답의 provider 필드 위치를 이 세션에서 공식
 *   문서로 확정하지 못했다 — 있으면 쓰고 없으면 undefined(지어내지 않음)
 * - estimatedCost: calculateEstimatedCost 참고 — OpenRouter가 실제로
 *   보고한 usage.cost가 없으면 null
 */
export function extractUsageAndCost(result: OpenAI.Chat.Completions.ChatCompletion): {
  inputTokens: number;
  outputTokens: number;
  provider?: string;
  estimatedCost: number | null;
} {
  const usage = result.usage as
    | (OpenAI.CompletionUsage & { cost?: number })
    | undefined;
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  const provider = (result as { provider?: string }).provider;
  const estimatedCost = calculateEstimatedCost({
    inputTokens,
    outputTokens,
    providerUsage: { cost: usage?.cost },
  });
  return { inputTokens, outputTokens, provider, estimatedCost };
}

async function callOnce(
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  maxTokens: number,
  temperature?: number,
  timeoutMs?: number,
  validate?: ContentValidator,
  tier: TaskTier = "balanced",
  attemptIndex = 0,
  onAttempt?: AIAttemptListener
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const effectiveTimeout = timeoutMs ?? REQUEST_TIMEOUT_MS;
  const client = getClient(effectiveTimeout);
  const provider = buildProviderPreferences(tier);
  const startedAt = Date.now();
  // OpenAI SDK의 client-level timeout 옵션에만 의존하지 않는다 — 실제
  // 프로덕션 타임아웃 장애에서, 재시도/폴백 로직이 남기는 경고 로그가 전혀
  // 없이 함수가 통째로 60초 만에 강제 종료된 사례가 있었다. SDK 옵션이
  // 조용히 아무 효과가 없었을 가능성을 배제할 수 없어(NIM 연동에서도 같은
  // 증상을 AbortSignal로 고친 전례가 있음), 명시적 AbortSignal을 이중으로
  // 건다 — 둘 중 하나만 동작해도 요청이 멈추지 않는 사고를 막는다.
  let result: OpenAI.Chat.Completions.ChatCompletion;
  try {
    result = (await client.chat.completions.create(
      {
        model,
        max_tokens: maxTokens,
        messages,
        stream: false,
        ...(typeof temperature === "number" ? { temperature } : {}),
        // provider는 OpenAI Chat Completions 표준 필드가 아니라 OpenRouter
        // 전용 확장이다 — 이 파일이 이미 쓰는 타입 캐스트(아래 as Parameters<...>)로
        // 얹는다. 모델을 바꾸지 않고 같은 모델을 서빙하는 provider 중
        // 우선순위만 정하므로, 실패 시 기존 재시도/폴백 로직과 독립적으로 동작한다.
        ...(provider ? { provider } : {}),
      } as Parameters<OpenAI["chat"]["completions"]["create"]>[0],
      { signal: AbortSignal.timeout(effectiveTimeout) }
    )) as OpenAI.Chat.Completions.ChatCompletion;
  } catch (err) {
    // 응답 자체를 못 받은 실패(네트워크·타임아웃·401/404 등) — usage가
    // 없으므로 토큰/비용은 0/null. 그래도 "이 모델이 이 시점에 실패했다"는
    // 사실 자체는 기록해야 retryCount·attempt별 추적이 끊기지 않는다.
    emitAttempt(onAttempt, {
      model,
      attemptIndex,
      success: false,
      durationMs: Date.now() - startedAt,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: null,
      errorKind: err instanceof Error ? err.constructor.name : "Error",
    });
    throw err;
  }

  const durationMs = Date.now() - startedAt;
  const { inputTokens, outputTokens, provider: providerName, estimatedCost } =
    extractUsageAndCost(result);

  // HTTP 200 + 정상 JSON이어도 content가 비어 있으면(공백만 포함해도) 성공이
  // 아니다 — 여기서 걸러야 report-generation.ts가 빈 섹션을 "성공"으로 저장하지
  // 않는다. JSON 파싱이 필요한 게 아니라 이미 파싱된 값의 최소 유효성만 본다.
  const content = result.choices?.[0]?.message?.content;
  if (!content || content.trim().length === 0) {
    // 응답은 받았으므로(빈 completion이어도) usage가 있을 수 있다 — 실제로
    // 토큰이 소모됐다면(가능성 있음) 비용 집계에서 누락되지 않게 기록한다.
    emitAttempt(onAttempt, {
      model,
      attemptIndex,
      success: false,
      durationMs,
      inputTokens,
      outputTokens,
      provider: providerName,
      estimatedCost,
      errorKind: "EmptyAIResponseError",
    });
    throw new EmptyAIResponseError(model);
  }

  if (validate) {
    const v = validate(content);
    if (!v.ok) {
      // 품질 게이트 실패 — 실제 API 호출·토큰 소모는 이미 일어난 뒤다.
      // "최종 성공 모델만 기록"하면 이런 실패 시도의 비용이 조용히
      // 누락되므로(과소계상), 실패해도 반드시 기록한다.
      emitAttempt(onAttempt, {
        model,
        attemptIndex,
        success: false,
        durationMs,
        inputTokens,
        outputTokens,
        provider: providerName,
        estimatedCost,
        errorKind: "QualityGateError",
      });
      throw new QualityGateError(model, v.reason ?? "UNKNOWN");
    }
  }

  emitAttempt(onAttempt, {
    model,
    attemptIndex,
    success: true,
    durationMs,
    inputTokens,
    outputTokens,
    provider: providerName,
    estimatedCost,
  });

  return result;
}

/**
 * 재시도 가능한 에러 판별 (네트워크·타임아웃·업스트림 과부하).
 *
 * 예전엔 `err.name === "APIConnectionTimeoutError"` 같은 문자열 비교였는데,
 * OpenAI SDK가 던지는 이 에러들은 전부 인스턴스의 `.name`이 "Error"로
 * 고정돼 있어(서브클래스에서 따로 지정하지 않음 — 실측 확인함) 이 비교는
 * 한 번도 true가 될 수 없었다. 즉 타임아웃이 나도 폴백 모델로 못 넘어가고
 * 그대로 실패했다는 뜻이다. instanceof로 판별해야 실제로 동작한다.
 */
export function isRetryableAIError(err: unknown): boolean {
  const e = err as { status?: number };
  if (e?.status === 429 || e?.status === 503 || e?.status === 502 || e?.status === 500) {
    return true;
  }
  // callOnce()가 거는 명시적 AbortSignal.timeout()이 실제로 발동하면, OpenAI
  // SDK가 이걸 APIUserAbortError로 감싸줄 거라 가정했었다(테스트도 그렇게
  // 짜여 있었음) — 그런데 실제 프로덕션 로그를 보면 SDK를 거치지 않고 raw
  // DOMException(name="AbortError")이 그대로 던져진다. 이 케이스를 놓치면
  // 타임아웃이 나도 폴백 모델로 못 넘어가고 1차 시도에서 바로 실패한다
  // (report generation 전체가 섹션 0개에서 죽는 사고로 이어짐).
  if (err instanceof DOMException && err.name === "AbortError") {
    return true;
  }
  // 빈 응답(EmptyAIResponseError)도 같은 모델 재시도 → 폴백 전환 대상이다 —
  // 일시적 업스트림 문제일 수도 있고, 그 모델이 계속 비어 있으면 다음
  // 모델로 넘어가는 게 맞다(모델 ID/인증 문제와 달리 "이 모델 자체가
  // 못 쓴다"고 단정할 근거는 없어 완전히 건너뛰지 않고 먼저 재시도한다).
  if (err instanceof EmptyAIResponseError) {
    return true;
  }
  // 품질 게이트 실패(EmptyAIResponseError와 같은 이유로 재시도/폴백 대상 —
  // "이 모델이 이번엔 못 썼다"일 뿐 다음 모델로 넘어가면 살아날 수 있다)
  if (err instanceof QualityGateError) {
    return true;
  }
  return (
    err instanceof OpenAI.APIConnectionTimeoutError ||
    err instanceof OpenAI.APIConnectionError ||
    err instanceof OpenAI.APIUserAbortError
  );
}

/**
 * 모델 ID 오타·미지원 모델(400/404)이나 키 문제(401/403)는 같은 모델로
 * 재시도해봐야 소용없지만, 폴백 모델로는 살릴 수 있다. 이걸 구분하지 않으면
 * 모델 ID 하나 잘못 넣었을 때 보고서 생성 전체가 죽는다.
 */
export function shouldTryFallbackModel(err: unknown): boolean {
  const s = (err as { status?: number })?.status;
  return isRetryableAIError(err) || s === 400 || s === 401 || s === 403 || s === 404;
}

/** 에러 종류 + 상태코드 + 메시지를 로그용 한 줄로 (constructor.name 사용 이유는 isRetryableAIError 주석 참고) */
function describeAIError(err: unknown): string {
  const e = err as { status?: number; message?: string };
  const kind = err instanceof Error ? err.constructor.name : "Error";
  return `${kind}${e?.status ? ` ${e.status}` : ""}: ${e?.message ?? String(err)}`;
}

/**
 * 모델 하나당 시도 횟수. 예전엔 2(같은 모델로 1회 재시도 후 폴백)였는데,
 * 실제 프로덕션 사고로 이게 구조적 결함임이 드러났다: attemptTimeout()이
 * "남은 예산 전부"를 다음 시도에 그대로 넘겨주기 때문에, 1차 모델이
 * REQUEST_TIMEOUT_MS(25s)로 타임아웃 나면 재시도가 남은 예산(AI_CALL_BUDGET_MS
 * 40s 기준 약 12s)을 전부 써버리고, 그 다음 실제 폴백 모델(openrouter/free
 * 등)에는 시도할 시간이 0으로 남아 단 한 번도 호출되지 못한 채 섹션
 * 전체가 실패했다(2026-09-11, report=cmtx2vv9s... 로그로 실측 확인 —
 * duration=40.0s 전부가 primary 재시도에 소진, "openrouter/free로 전환"
 * 로그만 찍히고 실제 호출은 없었음). 폴백 체인을 만든 취지 자체(1차
 * 모델에 문제가 있을 때 다른 모델로 살리기)가 같은 모델 재시도 때문에
 * 무력화된 것 — 그래서 모델당 시도를 1로 줄여, 실패 시 재시도 대신
 * 곧바로 다음 모델(실제로 다른 모델)에 남은 예산을 준다.
 */
export const MODEL_ATTEMPTS = 1;
export const CHAIN_BACKOFF_MS = [0, 3_000];

export interface ModelChainDeps {
  /** 남은 예산(ms) — 0 이하면 더 이상 어떤 시도도 시작하지 않는다 */
  remainingMs: () => number;
  /**
   * 다음 시도 1회에 줄 타임아웃(ms) — 예산이 없으면 null.
   *
   * modelIdx(체인 내 위치, 0=primary, 1 이상=fallback)를 받아 모델마다
   * 다른 상한(REQUEST_TIMEOUT_MS vs FALLBACK_REQUEST_TIMEOUT_MS)을 줄 수
   * 있게 한다 — "남은 예산을 그대로 물려주는" 방식이면 앞선 모델이 시간을
   * 다 써버렸을 때 뒤 모델이 아예 호출되지 못하는 문제가 있었다(claude.ts의
   * FALLBACK_REQUEST_TIMEOUT_MS 주석 참고).
   */
  attemptTimeout: (modelIdx: number) => number | null;
  sleep: (ms: number) => Promise<void>;
  /** 모델 하나당 최대 시도 횟수(같은 모델 재시도 포함) */
  attemptsPerModel?: number;
  /** 재시도 사이 대기시간(ms) — 인덱스가 넘치면 마지막 값을 반복 */
  backoffMs?: number[];
}

/**
 * 모델 체인([기본 모델, ...폴백들])을 순서대로 시도하는 순수 로직.
 *
 * 실제 네트워크 호출(`callModel`)을 주입받기 때문에, 합성 에러(DOMException
 * AbortError, 404 등)로 재시도/폴백 전환을 네트워크 없이 검증할 수 있다
 * (tools/test-openrouter-retry.ts 참고) — improve-weak-orchestration.ts와
 * 같은 이유로 순수 함수로 분리했다.
 *
 * 모델 하나당 최대 attemptsPerModel번(같은 모델 재시도, 짧은 백오프)까지
 * 시도하고,
 * - 재시도 가능한 에러(타임아웃/AbortError/네트워크/429/5xx)면 같은 모델을
 *   계속 재시도하다가 소진되면 다음 모델로 넘어간다.
 * - 재시도해도 소용없는 에러(400/401/403/404 — 모델 ID·인증 문제)면 같은
 *   모델은 바로 포기하고 다음 모델로 넘어간다(예: 폴백 모델 슬러그 자체가
 *   404일 때 그 모델만 헛되이 반복하지 않는다).
 * - 그 외 무관한 에러는 체인을 더 시도하지 않고 즉시 실패한다.
 *
 * 체인 전체(모델 수 × 재시도)에 걸쳐 하나의 시간 예산(deps로 주입)을
 * 공유한다 — 폴백이 몇 개든 총 소요시간·호출 수는 그 예산으로 항상
 * 상한이 걸린다(AI_CALL_BUDGET_MS 초과 시 추가 모델 호출 금지).
 */
export async function runModelChain<T>(
  chain: string[],
  callModel: (model: string, timeoutMs: number, modelIdx: number) => Promise<T>,
  deps: ModelChainDeps,
  /** 구조화 로그(AI_QUALITY_GATE_FAIL/AI_SECTION_GENERATION_PENDING)에 붙일 문맥 — 없으면 로그에 "?"로 표시 */
  logContext?: AIQualityLogContext
): Promise<{ result: T; usedModel: string }> {
  const attemptsPerModel = deps.attemptsPerModel ?? MODEL_ATTEMPTS;
  const backoffMs = deps.backoffMs ?? CHAIN_BACKOFF_MS;
  let lastErr: unknown;

  for (let modelIdx = 0; modelIdx < chain.length; modelIdx++) {
    const currentModel = chain[modelIdx];
    const label = modelIdx === 0 ? "primary" : `fallback#${modelIdx}`;

    for (let attempt = 0; attempt < attemptsPerModel; attempt++) {
      if (attempt > 0) {
        const waitMs = backoffMs[attempt] ?? backoffMs[backoffMs.length - 1];
        // 대기까지 하고 나면 호출할 시간이 안 남는 경우엔 대기 자체가 낭비다.
        if (deps.remainingMs() <= waitMs) {
          console.warn(
            `[AI] ${label} ${currentModel} 시간 예산 소진 — 재시도 중단(남은 ${Math.max(0, deps.remainingMs())}ms)`
          );
          throw lastErr ?? new Error("AI 호출 시간 예산 초과");
        }
        console.log(
          `[AI] ${label} ${currentModel} 재시도 ${attempt}/${attemptsPerModel - 1}, ${waitMs / 1000}초 대기...`
        );
        await deps.sleep(waitMs);
      }

      const timeout = deps.attemptTimeout(modelIdx);
      if (timeout === null) {
        console.warn(`[AI] 시간 예산 소진 — 추가 호출 중단`);
        throw lastErr ?? new Error("AI 호출 시간 예산 초과");
      }

      try {
        const result = await callModel(currentModel, timeout, modelIdx);
        return { result, usedModel: currentModel };
      } catch (err) {
        lastErr = err;
        console.warn(`[AI] ${label} ${currentModel} 실패 — ${describeAIError(err)}`);
        if (err instanceof QualityGateError) {
          // "이 모델이 다음으로 넘어갈 수 있는가"는 이 시점에만 정확히 알 수 있다 —
          // 그래서 이 로그도 여기서 남긴다(claude.ts는 reportId/section의 의미를
          // 모르지만, 호출부가 넘겨준 태그를 그대로 실어 나른다).
          const hasNext = Boolean(chain[modelIdx + 1]);
          console.warn(
            `[AI_QUALITY_GATE_FAIL] reportId=${logContext?.reportId ?? "?"} section=${logContext?.section ?? "?"} model=${currentModel} reason=${err.reason} fallback=${hasNext}`
          );
        }
        if (!isRetryableAIError(err)) {
          // 같은 모델을 반복해봐야 소용없다(모델 불가·인증 오류 등) — 재시도 중단하고 다음 모델로
          break;
        }
        // 재시도 가능한 에러(타임아웃/네트워크/5xx/429)면 같은 모델을 계속 재시도한다.
      }
    }

    if (!shouldTryFallbackModel(lastErr)) {
      throw lastErr;
    }
    const next = chain[modelIdx + 1];
    if (next) {
      const freeNote = isFreeModel(currentModel) ? "무료 모델 " : "";
      console.log(`[AI] ${freeNote}${currentModel} 실패 → ${next}로 전환`);
    }
  }

  if (lastErr instanceof QualityGateError) {
    console.warn(
      `[AI_SECTION_GENERATION_PENDING] reportId=${logContext?.reportId ?? "?"} section=${logContext?.section ?? "?"} reason=ALL_MODELS_QUALITY_FAILED`
    );
  }
  throw lastErr ?? new Error("AI 호출 시간 예산 초과");
}

/**
 * 메인 호출 — 실제 OpenRouter 네트워크 호출(callOnce)을 runModelChain에
 * 주입한다. 체인 구성(모델 목록)과 시간 예산 계산만 여기서 책임진다.
 */
async function callWithFallback(
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  maxTokens: number,
  temperature?: number,
  validate?: ContentValidator,
  logContext?: AIQualityLogContext,
  /** 지정하면 이 배열을 체인으로 쓴다(플랜별 라우팅) — 없으면 model+전역 FALLBACK_MODELS */
  modelChain?: string[],
  /** provider 라우팅(sort/max_price)에 쓸 task tier — 미지정 시 balanced */
  tier: TaskTier = "balanced",
  /** 체인의 모든 시도(성공/실패)를 호출부에 통보 — ClaudeOptions.onAttempt 참고 */
  onAttempt?: AIAttemptListener
): Promise<{ result: OpenAI.Chat.Completions.ChatCompletion; usedModel: string }> {
  // 이 호출 전체(체인의 모든 모델·재시도·백오프 대기)에 허용된 마감 시각.
  // 남은 시간을 넘기는 시도는 시작하지 않는다 — 함수가 강제 종료되는 것보다
  // 일찍 실패를 돌려주는 편이 낫다(호출부가 저장·정리할 시간이 남는다).
  const budgetEndsAt = Date.now() + AI_CALL_BUDGET_MS;
  const remainingMs = () => budgetEndsAt - Date.now();
  /**
   * 모델별 고정 타임아웃(0=primary는 REQUEST_TIMEOUT_MS, 그 이후 fallback은
   * 전부 FALLBACK_REQUEST_TIMEOUT_MS)과 남은 예산 중 작은 쪽을 준다 —
   * "남은 걸 그대로 물려주는" 방식이 아니라 각 모델이 항상 자기 몫을
   * 받되, 예산이 정말 없으면(remainingMs<=0) 그때만 null을 반환해 호출
   * 자체를 막는다.
   */
  const attemptTimeout = (modelIdx: number): number | null => {
    const left = remainingMs();
    if (left <= 0) return null;
    const perModelCap = modelIdx === 0 ? REQUEST_TIMEOUT_MS : FALLBACK_REQUEST_TIMEOUT_MS;
    return Math.min(perModelCap, left);
  };

  const canUseFallback = (process.env.OPENROUTER_API_KEY?.trim() ?? "").startsWith("sk-or-");
  const chain = !canUseFallback
    ? [model]
    : modelChain && modelChain.length > 0
      ? modelChain
      : [model, ...FALLBACK_MODELS];

  return runModelChain(
    chain,
    (currentModel, timeout, modelIdx) =>
      callOnce(
        currentModel,
        messages,
        getMaxTokens(currentModel, maxTokens),
        temperature,
        timeout,
        validate,
        tier,
        modelIdx,
        onAttempt
      ),
    { remainingMs, attemptTimeout, sleep },
    logContext
  );
}

export async function generateText(
  messages: ClaudeMessage[],
  options: ClaudeOptions = {}
): Promise<GenerateTextResult> {
  const override = modelOverrideStorage.getStore();
  if (override) return override(messages, options);

  if (!isAIConfigured()) {
    const content = generateMockContent(messages);
    await sleep(400);
    return { content, inputTokens: 0, outputTokens: 0, usedModel: "demo-mock" };
  }

  const { systemPrompt, temperature } = options;
  const builtMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    ...(systemPrompt
      ? [{ role: "system" as const, content: systemPrompt }]
      : []),
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const effectivePrimary = options.modelChain?.[0] || MODEL;
  const maxTokens = getMaxTokens(effectivePrimary, options.maxTokens);
  const { result, usedModel } = await callWithFallback(
    effectivePrimary,
    builtMessages,
    maxTokens,
    temperature,
    options.validate,
    options.logContext,
    options.modelChain,
    options.taskTier ?? "balanced",
    options.onAttempt
  );

  if (usedModel !== effectivePrimary) {
    console.log(`[AI] 실제 사용 모델: ${usedModel}`);
  }

  return {
    content: result.choices[0]?.message?.content ?? "",
    inputTokens: result.usage?.prompt_tokens ?? 0,
    outputTokens: result.usage?.completion_tokens ?? 0,
    usedModel,
  };
}

export async function generateStream(
  messages: ClaudeMessage[],
  options: ClaudeOptions = {},
  onChunk: (text: string) => void
): Promise<{ inputTokens: number; outputTokens: number; usedModel: string }> {
  const result = await generateText(messages, options);
  for (const chunk of result.content.match(/[\s\S]{1,40}/g) ?? [
    result.content,
  ]) {
    onChunk(chunk);
    await sleep(8);
  }
  return {
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    usedModel: result.usedModel,
  };
}

/** JSON 응답이 필요한 섹터 분석·구조화 호출용 */
export async function callClaudeJSON<T>(params: {
  system: string;
  messages: ClaudeMessage[];
  maxTokens?: number;
  temperature?: number;
  retries?: number;
  tier?: "standard" | "premium";
}): Promise<{ data: T; inputTokens: number; outputTokens: number; usedModel: string }> {
  const {
    system,
    messages,
    maxTokens = 4096,
    temperature = 0.3,
    retries = 2,
  } = params;

  if (!isAIConfigured()) {
    return { data: {} as T, inputTokens: 0, outputTokens: 0, usedModel: "demo-mock" };
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { content, inputTokens, outputTokens, usedModel } =
        await generateText(messages, {
          systemPrompt: `${system}\n\n반드시 유효한 JSON만 출력하세요. 마크다운 코드펜스 없이 순수 JSON.`,
          maxTokens,
          temperature,
        });

      const cleaned = content
        .replace(/^```json\s*/m, "")
        .replace(/^```\s*/m, "")
        .replace(/```\s*$/m, "")
        .trim();

      // JSON 객체 부분만 추출
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      const jsonStr =
        start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;

      return {
        data: JSON.parse(jsonStr) as T,
        inputTokens,
        outputTokens,
        usedModel,
      };
    } catch (error) {
      if (attempt === retries) throw error;
      await sleep(1000 * (attempt + 1));
    }
  }

  throw new Error("Unreachable");
}
