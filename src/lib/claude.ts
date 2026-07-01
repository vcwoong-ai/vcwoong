/**
 * AI provider abstraction — multi-provider (OpenRouter free + Gemini paid).
 *
 * 호출 우선순위:
 *   1. AI_MODEL (기본값: OpenRouter 무료 모델)
 *      → 성공하면 그대로 사용 (비용 $0)
 *   2. 429 레이트리밋 발생 시 → AI_FALLBACK_MODEL (Gemini 유료)로 즉시 전환
 *      → 비용 발생하지만 빠르게 처리
 *
 * 라우팅:
 *   gemini-*  →  Google AI Studio (GEMINI_API_KEY)
 *   그 외      →  OpenRouter       (OPENROUTER_API_KEY)
 *
 * .env.local 설정:
 *   GEMINI_API_KEY=AIza...
 *   OPENROUTER_API_KEY=sk-or-...
 *   AI_MODEL=meta-llama/llama-3.3-70b-instruct:free   ← 무료 기본
 *   AI_FALLBACK_MODEL=gemini-2.5-flash                 ← 유료 폴백
 */

import OpenAI from "openai";
import { generateMockContent } from "./mock-generator";

export const MODEL =
  process.env.AI_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free";

export const FALLBACK_MODEL =
  process.env.AI_FALLBACK_MODEL ?? "gemini-2.5-flash";

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

function getClientForModel(model: string): OpenAI {
  if (isGeminiModel(model)) {
    return new OpenAI({
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiKey: process.env.GEMINI_API_KEY ?? "",
    });
  }
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXTAUTH_URL ?? "http://localhost:3000",
      "X-Title": "DealSync",
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 단일 모델 호출. 실패 시 에러를 throw (폴백 결정은 호출부에서).
 */
async function callOnce(
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  maxTokens: number
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const client = getClientForModel(model);
  const result = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages,
    stream: false,
  } as Parameters<OpenAI["chat"]["completions"]["create"]>[0]);
  return result as OpenAI.Chat.Completions.ChatCompletion;
}

/**
 * 메인 호출 함수:
 * - 무료 모델: 429/503 → 즉시 Gemini 폴백
 * - Gemini: 429/503 → 지수 백오프 재시도 (최대 4회)
 * - 모든 실패 시 → 마지막 에러 throw
 */
async function callWithFallback(
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  maxTokens: number
): Promise<{ result: OpenAI.Chat.Completions.ChatCompletion; usedModel: string }> {
  const isRetryable = (err: unknown) => {
    const s = (err as { status?: number })?.status;
    return s === 429 || s === 503 || s === 502 || s === 500;
  };

  // 1. 기본 모델 시도
  try {
    const result = await callOnce(model, messages, maxTokens);
    return { result, usedModel: model };
  } catch (err) {
    if (!isRetryable(err)) throw err;

    // 무료 모델 에러 → Gemini 즉시 전환
    if (isFreeModel(model) && model !== FALLBACK_MODEL) {
      console.log(`[AI] 무료 모델 레이트리밋 → Gemini(${FALLBACK_MODEL})로 전환`);
    }
  }

  // 2. 폴백 모델 (Gemini) — 지수 백오프로 최대 4회
  const fallbackTokens = getMaxTokens(FALLBACK_MODEL, maxTokens);
  let lastErr: unknown;

  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      const waitMs = Math.min(15_000 * Math.pow(2, attempt - 1), 60_000);
      console.log(`[AI] ${FALLBACK_MODEL} 재시도 ${attempt}/3, ${waitMs / 1000}초 대기...`);
      await sleep(waitMs);
    }
    try {
      const result = await callOnce(FALLBACK_MODEL, messages, fallbackTokens);
      if (attempt > 0) console.log(`[AI] 실제 사용 모델: ${FALLBACK_MODEL}`);
      return { result, usedModel: FALLBACK_MODEL };
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err)) break;
    }
  }

  throw lastErr;
}

export async function generateText(
  messages: ClaudeMessage[],
  options: ClaudeOptions = {}
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  if (!isAIConfigured()) {
    const content = generateMockContent(messages);
    await sleep(400);
    return { content, inputTokens: 0, outputTokens: 0 };
  }

  const { systemPrompt } = options;
  const builtMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const maxTokens = getMaxTokens(MODEL, options.maxTokens);
  const { result, usedModel } = await callWithFallback(MODEL, builtMessages, maxTokens);

  if (usedModel !== MODEL) {
    console.log(`[AI] 실제 사용 모델: ${usedModel}`);
  }

  return {
    content: result.choices[0]?.message?.content ?? "",
    inputTokens: result.usage?.prompt_tokens ?? 0,
    outputTokens: result.usage?.completion_tokens ?? 0,
  };
}

export async function generateStream(
  messages: ClaudeMessage[],
  options: ClaudeOptions = {},
  onChunk: (text: string) => void
): Promise<{ inputTokens: number; outputTokens: number }> {
  if (!isAIConfigured()) {
    const content = generateMockContent(messages);
    for (const chunk of content.match(/[\s\S]{1,24}/g) ?? [content]) {
      onChunk(chunk);
      await sleep(15);
    }
    return { inputTokens: 0, outputTokens: 0 };
  }

  const { systemPrompt } = options;
  const builtMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // 비스트리밍 방식으로 받은 후 청크 시뮬레이션 (Gemini 2.5 thinking 모델 대응)
  const maxTokens = getMaxTokens(MODEL, options.maxTokens);
  const { result } = await callWithFallback(MODEL, builtMessages, maxTokens);
  const content = result.choices[0]?.message?.content ?? "";

  for (const chunk of content.match(/[\s\S]{1,40}/g) ?? [content]) {
    onChunk(chunk);
    await sleep(8);
  }

  return {
    inputTokens: result.usage?.prompt_tokens ?? 0,
    outputTokens: result.usage?.completion_tokens ?? 0,
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
}): Promise<{ data: T; inputTokens: number; outputTokens: number }> {
  const { system, messages, maxTokens = 4096, temperature = 0.3, retries = 2 } = params;

  if (!isAIConfigured()) {
    return { data: {} as T, inputTokens: 0, outputTokens: 0 };
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { content, inputTokens, outputTokens } = await generateText(messages, {
        systemPrompt: system,
        maxTokens,
        temperature,
      });

      const cleaned = content
        .replace(/^```json\s*/m, "")
        .replace(/```\s*$/, "")
        .trim();

      return { data: JSON.parse(cleaned) as T, inputTokens, outputTokens };
    } catch (error) {
      if (attempt === retries) throw error;
      await sleep(1000 * (attempt + 1));
    }
  }

  throw new Error("Unreachable");
}
