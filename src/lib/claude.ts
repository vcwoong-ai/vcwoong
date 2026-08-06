/**
 * AI provider abstraction — DeepSeek(OpenRouter)-first + Gemini fallback.
 *
 * 호출 우선순위:
 *   1. AI_MODEL (기본: deepseek/deepseek-v4-flash-0731 — OPENROUTER_API_KEY 있을 때)
 *      OpenRouter 없으면 GEMINI_API_KEY 있을 때 gemini-2.5-flash
 *   2. 429/5xx → AI_FALLBACK_MODEL 로 전환
 *
 * 라우팅:
 *   gemini-*  →  Google AI Studio (GEMINI_API_KEY)
 *   그 외      →  OpenRouter       (OPENROUTER_API_KEY)
 */

import OpenAI from "openai";
import { generateMockContent } from "./mock-generator";
import { BRAND } from "./brand";

function resolveDefaultModel(): string {
  if (process.env.AI_MODEL?.trim()) return process.env.AI_MODEL.trim();
  const openrouter = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (openrouter.startsWith("sk-or-")) return "deepseek/deepseek-v4-flash-0731";
  const gemini = process.env.GEMINI_API_KEY?.trim() ?? "";
  if (gemini.startsWith("AIza")) return "gemini-2.5-flash";
  return "meta-llama/llama-3.3-70b-instruct:free";
}

export const MODEL = resolveDefaultModel();

export const FALLBACK_MODEL =
  process.env.AI_FALLBACK_MODEL ??
  (MODEL.startsWith("gemini-")
    ? "meta-llama/llama-3.3-70b-instruct:free"
    : "gemini-2.5-flash");

/** Gemini 2.5는 thinking 토큰을 내부 사용하므로 max_tokens를 더 높게 설정해야 함 */
function getMaxTokens(model: string, requested?: number): number {
  if (requested) return requested;
  return model.startsWith("gemini-2.5") ? 8192 : 4096;
}

function isGeminiModel(model: string): boolean {
  return model.startsWith("gemini-") || model.startsWith("models/gemini-");
}

function isFreeModel(model: string): boolean {
  return model.endsWith(":free");
}

/**
 * 단일 AI 호출 타임아웃(ms).
 *
 * 타임아웃이 없으면 업스트림이 응답을 주지 않을 때 호출이 무한정 매달리고,
 * 섹션 루프가 통째로 멈춰 진행률이 0에서 고정된 채 함수 실행시간 제한까지
 * 흘러가 버린다. 재시도 여유를 남기도록 넉넉하되 유한한 값으로 잡는다.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 120_000);

function getClientForModel(model: string): OpenAI {
  if (isGeminiModel(model)) {
    return new OpenAI({
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiKey: process.env.GEMINI_API_KEY ?? "",
      timeout: REQUEST_TIMEOUT_MS,
      // 재시도는 callWithFallback에서 직접 제어한다(폴백 모델 전환 포함).
      maxRetries: 0,
    });
  }
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXTAUTH_URL ?? "http://localhost:3000",
      "X-Title": BRAND.name,
    },
  });
}

export function isAIConfigured(): boolean {
  const gemini = process.env.GEMINI_API_KEY?.trim() ?? "";
  const openrouter = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  return (
    gemini.startsWith("AIza") ||
    (openrouter.startsWith("sk-or-") && openrouter.length > 20)
  );
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
  temperature?: number
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const client = getClientForModel(model);
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
    const result = await callOnce(model, messages, maxTokens, temperature);
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

  // 폴백 모델이 설정되지 않았거나 키가 없으면 기본 모델만 재시도
  const fallback = FALLBACK_MODEL;
  const canUseFallback =
    fallback !== model &&
    ((isGeminiModel(fallback) &&
      (process.env.GEMINI_API_KEY?.trim() ?? "").startsWith("AIza")) ||
      (!isGeminiModel(fallback) &&
        (process.env.OPENROUTER_API_KEY?.trim() ?? "").startsWith("sk-or-")));

  const retryModel = canUseFallback ? fallback : model;
  const fallbackTokens = getMaxTokens(retryModel, maxTokens);
  let lastErr: unknown;

  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      const waitMs = Math.min(15_000 * Math.pow(2, attempt - 1), 60_000);
      console.log(
        `[AI] ${retryModel} 재시도 ${attempt}/3, ${waitMs / 1000}초 대기...`
      );
      await sleep(waitMs);
    }
    try {
      const result = await callOnce(
        retryModel,
        messages,
        fallbackTokens,
        temperature
      );
      return { result, usedModel: retryModel };
    } catch (err) {
      lastErr = err;
      console.warn(`[AI] ${retryModel} 실패 — ${describeError(err)}`);
      if (!isRetryable(err)) break;
    }
  }

  throw lastErr;
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
