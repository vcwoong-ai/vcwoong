/**
 * AI provider abstraction — OpenRouter 단일 프로바이더.
 *
 * 호출 우선순위:
 *   1. AI_MODEL (기본: deepseek/deepseek-v4-flash-0731)
 *   2. 실패(429/5xx/타임아웃, 또는 모델 ID·인증 오류) → AI_FALLBACK_MODEL
 *
 * 모든 호출은 OpenRouter(OPENROUTER_API_KEY)로 나간다.
 */

import OpenAI from "openai";
import { generateMockContent } from "./mock-generator";
import { BRAND } from "./brand";

const DEFAULT_MODEL = "deepseek/deepseek-v4-flash-0731";
/** 기본 모델이 죽었을 때를 대비한 OpenRouter 무료 모델 */
const DEFAULT_FALLBACK_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

function resolveDefaultModel(): string {
  return process.env.AI_MODEL?.trim() || DEFAULT_MODEL;
}

export const MODEL = resolveDefaultModel();

export const FALLBACK_MODEL =
  process.env.AI_FALLBACK_MODEL?.trim() ||
  (MODEL === DEFAULT_FALLBACK_MODEL ? DEFAULT_MODEL : DEFAULT_FALLBACK_MODEL);

function getMaxTokens(_model: string, requested?: number): number {
  return requested ?? 4096;
}

function isFreeModel(model: string): boolean {
  return model.endsWith(":free");
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
 * generateText 한 번이 쓸 수 있는 총 시간(ms) — 재시도·백오프 대기까지 포함.
 *
 * 재시도(최대 3회, 0/5/15초 백오프)를 시간 제한 없이 돌리면 호출 하나가
 * 100초를 넘길 수도 있어서, 60초 상한에서는 자체 중단 로직이 손도 못 써보고
 * 함수가 죽는다. 남은 예산을 넘기는 시도·대기는 아예 시작하지 않는다.
 */
export const AI_CALL_BUDGET_MS = envDurationMs(
  process.env.AI_CALL_BUDGET_MS,
  40_000
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

export interface ClaudeOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface GenerateTextResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  usedModel: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callOnce(
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  maxTokens: number,
  temperature?: number,
  timeoutMs?: number
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const client = getClient(timeoutMs);
  const result = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages,
    stream: false,
    ...(typeof temperature === "number" ? { temperature } : {}),
  } as Parameters<OpenAI["chat"]["completions"]["create"]>[0]);
  return result as OpenAI.Chat.Completions.ChatCompletion;
}

/**
 * 메인 호출:
 * - 기본 모델 실패(429/5xx) → 폴백 모델
 * - 폴백도 실패 시 지수 백오프 재시도
 */
async function callWithFallback(
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  maxTokens: number,
  temperature?: number
): Promise<{ result: OpenAI.Chat.Completions.ChatCompletion; usedModel: string }> {
  // 이 호출 전체(1차 + 폴백 재시도 + 백오프 대기)에 허용된 마감 시각.
  // 남은 시간을 넘기는 시도는 시작하지 않는다 — 함수가 강제 종료되는 것보다
  // 일찍 실패를 돌려주는 편이 낫다(호출부가 저장·정리할 시간이 남는다).
  const budgetEndsAt = Date.now() + AI_CALL_BUDGET_MS;
  const remainingMs = () => budgetEndsAt - Date.now();
  /** 남은 예산과 1회 타임아웃 중 짧은 쪽 — 예산이 없으면 null */
  const attemptTimeout = (): number | null => {
    const left = remainingMs();
    return left <= 0 ? null : Math.min(REQUEST_TIMEOUT_MS, left);
  };

  const describeError = (err: unknown) => {
    const e = err as { status?: number; name?: string; message?: string };
    return `${e?.name ?? "Error"}${e?.status ? ` ${e.status}` : ""}: ${e?.message ?? String(err)}`;
  };

  const isRetryable = (err: unknown) => {
    const e = err as { status?: number; name?: string };
    if (e?.status === 429 || e?.status === 503 || e?.status === 502 || e?.status === 500) {
      return true;
    }
    // 타임아웃·연결 실패도 재시도 대상 — 이걸 빼두면 업스트림이 응답하지
    // 않을 때 폴백 모델로 넘어가지도 못하고 그대로 실패한다.
    return (
      e?.name === "APIConnectionTimeoutError" ||
      e?.name === "APIConnectionError" ||
      e?.name === "AbortError"
    );
  };

  // 모델 ID 오타·미지원 모델(400/404)이나 키 문제(401/403)는 같은 모델로
  // 재시도해봐야 소용없지만, 폴백 모델로는 살릴 수 있다. 이걸 구분하지 않으면
  // 모델 ID 하나 잘못 넣었을 때 보고서 생성 전체가 죽는다.
  const shouldTryFallback = (err: unknown) => {
    const s = (err as { status?: number })?.status;
    return isRetryable(err) || s === 400 || s === 401 || s === 403 || s === 404;
  };

  try {
    const result = await callOnce(
      model,
      messages,
      maxTokens,
      temperature,
      attemptTimeout() ?? REQUEST_TIMEOUT_MS
    );
    return { result, usedModel: model };
  } catch (err) {
    console.warn(`[AI] ${model} 1차 호출 실패 — ${describeError(err)}`);
    if (!shouldTryFallback(err)) throw err;
    if (isFreeModel(model) && model !== FALLBACK_MODEL) {
      console.log(`[AI] 무료 모델 레이트리밋 → ${FALLBACK_MODEL}로 전환`);
    } else {
      console.log(`[AI] ${model} 오류 → ${FALLBACK_MODEL}로 전환`);
    }
  }

  // 폴백 모델이 같거나 키가 없으면 기본 모델로만 재시도
  const fallback = FALLBACK_MODEL;
  const canUseFallback =
    fallback !== model &&
    (process.env.OPENROUTER_API_KEY?.trim() ?? "").startsWith("sk-or-");

  const retryModel = canUseFallback ? fallback : model;
  const fallbackTokens = getMaxTokens(retryModel, maxTokens);
  let lastErr: unknown;

  // 섹션 10개를 순차 생성하는 구조라, 한 섹션이 재시도로 시간을 다 잡아먹으면
  // 나머지 섹션이 실행조차 못 한다. 재시도 횟수·대기를 짧게 유지한다.
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = [0, 5_000, 15_000];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const waitMs = BACKOFF_MS[attempt];
      // 대기까지 하고 나면 호출할 시간이 안 남는 경우엔 대기 자체가 낭비다.
      if (remainingMs() <= waitMs) {
        console.warn(
          `[AI] ${retryModel} 시간 예산 소진 — 재시도 중단(남은 ${Math.max(0, remainingMs())}ms)`
        );
        break;
      }
      console.log(
        `[AI] ${retryModel} 재시도 ${attempt}/${MAX_ATTEMPTS - 1}, ${waitMs / 1000}초 대기...`
      );
      await sleep(waitMs);
    }
    const timeout = attemptTimeout();
    if (timeout === null) {
      console.warn(`[AI] ${retryModel} 시간 예산 소진 — 재시도 중단`);
      break;
    }
    try {
      const result = await callOnce(
        retryModel,
        messages,
        fallbackTokens,
        temperature,
        timeout
      );
      return { result, usedModel: retryModel };
    } catch (err) {
      lastErr = err;
      console.warn(`[AI] ${retryModel} 실패 — ${describeError(err)}`);
      if (!isRetryable(err)) break;
    }
  }

  throw lastErr ?? new Error(`AI 호출 시간 예산(${AI_CALL_BUDGET_MS}ms) 초과`);
}

export async function generateText(
  messages: ClaudeMessage[],
  options: ClaudeOptions = {}
): Promise<GenerateTextResult> {
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
    temperature
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
