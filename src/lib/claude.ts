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

async function callOnce(
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  maxTokens: number,
  temperature?: number,
  timeoutMs?: number,
  validate?: ContentValidator
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const effectiveTimeout = timeoutMs ?? REQUEST_TIMEOUT_MS;
  const client = getClient(effectiveTimeout);
  // OpenAI SDK의 client-level timeout 옵션에만 의존하지 않는다 — 실제
  // 프로덕션 타임아웃 장애에서, 재시도/폴백 로직이 남기는 경고 로그가 전혀
  // 없이 함수가 통째로 60초 만에 강제 종료된 사례가 있었다. SDK 옵션이
  // 조용히 아무 효과가 없었을 가능성을 배제할 수 없어(NIM 연동에서도 같은
  // 증상을 AbortSignal로 고친 전례가 있음), 명시적 AbortSignal을 이중으로
  // 건다 — 둘 중 하나만 동작해도 요청이 멈추지 않는 사고를 막는다.
  const result = (await client.chat.completions.create(
    {
      model,
      max_tokens: maxTokens,
      messages,
      stream: false,
      ...(typeof temperature === "number" ? { temperature } : {}),
    } as Parameters<OpenAI["chat"]["completions"]["create"]>[0],
    { signal: AbortSignal.timeout(effectiveTimeout) }
  )) as OpenAI.Chat.Completions.ChatCompletion;

  // HTTP 200 + 정상 JSON이어도 content가 비어 있으면(공백만 포함해도) 성공이
  // 아니다 — 여기서 걸러야 report-generation.ts가 빈 섹션을 "성공"으로 저장하지
  // 않는다. JSON 파싱이 필요한 게 아니라 이미 파싱된 값의 최소 유효성만 본다.
  const content = result.choices?.[0]?.message?.content;
  if (!content || content.trim().length === 0) {
    throw new EmptyAIResponseError(model);
  }

  if (validate) {
    const v = validate(content);
    if (!v.ok) {
      throw new QualityGateError(model, v.reason ?? "UNKNOWN");
    }
  }

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
  callModel: (model: string, timeoutMs: number) => Promise<T>,
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
        const result = await callModel(currentModel, timeout);
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
  logContext?: AIQualityLogContext
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
  const chain = canUseFallback ? [model, ...FALLBACK_MODELS] : [model];

  return runModelChain(
    chain,
    (currentModel, timeout) =>
      callOnce(currentModel, messages, getMaxTokens(currentModel, maxTokens), temperature, timeout, validate),
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

  const maxTokens = getMaxTokens(MODEL, options.maxTokens);
  const { result, usedModel } = await callWithFallback(
    MODEL,
    builtMessages,
    maxTokens,
    temperature,
    options.validate,
    options.logContext
  );

  if (usedModel !== MODEL) {
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
