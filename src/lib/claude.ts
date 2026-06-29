/**
 * AI provider abstraction — multi-provider (Gemini + OpenRouter).
 *
 * Routing logic:
 *   gemini-*  →  Google AI Studio endpoint (GEMINI_API_KEY)
 *   others    →  OpenRouter endpoint        (OPENROUTER_API_KEY)
 *
 * Model recommendations:
 *   Primary:   gemini-2.5-flash   (Google, best quality, ~$0.02/report)
 *   Fallback:  deepseek/deepseek-v4-flash  (OpenRouter, ~$0.001/report)
 *   Premium:   gemini-2.5-pro     (Google, best quality, ~$0.20/report)
 *              anthropic/claude-sonnet-4.5 (OpenRouter, ~$0.47/report)
 *
 * Configuration (.env.local):
 *   GEMINI_API_KEY=AIza...
 *   OPENROUTER_API_KEY=sk-or-...
 *   AI_MODEL=gemini-2.5-flash
 *   AI_FALLBACK_MODEL=deepseek/deepseek-v4-flash
 */

import OpenAI from "openai";
import { generateMockContent } from "./mock-generator";

export const MODEL =
  process.env.AI_MODEL ?? "gemini-2.5-flash";

export const FALLBACK_MODEL =
  process.env.AI_FALLBACK_MODEL ?? "deepseek/deepseek-v4-flash";

// Gemini 2.5 uses thinking tokens internally, so needs a higher max_tokens budget
const DEFAULT_MAX_TOKENS = MODEL.startsWith("gemini-2.5") ? 8192 : 4096;

function isGeminiModel(model: string): boolean {
  return model.startsWith("gemini-") || model.startsWith("models/gemini-");
}

function getGeminiClient(): OpenAI {
  return new OpenAI({
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKey: process.env.GEMINI_API_KEY ?? "",
  });
}

function getOpenRouterClient(): OpenAI {
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXTAUTH_URL ?? "http://localhost:3000",
      "X-Title": "DealSync",
    },
  });
}

function getClientForModel(model: string): OpenAI {
  return isGeminiModel(model) ? getGeminiClient() : getOpenRouterClient();
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

async function callModel(
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  maxTokens: number,
  attempt = 0
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const client = getClientForModel(model);
  try {
    const result = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages,
      stream: false,
    } as Parameters<OpenAI["chat"]["completions"]["create"]>[0]);
    return result as OpenAI.Chat.Completions.ChatCompletion;
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;

    // Rate limit — retry with backoff (up to 3 times)
    if (status === 429 && attempt < 3) {
      const retryAfter =
        (err as { error?: { metadata?: { retry_after_seconds?: number } } })
          ?.error?.metadata?.retry_after_seconds ?? 10;
      const wait = Math.min(retryAfter * 1000, 35_000);
      console.log(`[AI] ${model} rate-limited, retrying in ${wait / 1000}s...`);
      await sleep(wait);
      return callModel(model, messages, maxTokens, attempt + 1);
    }

    // Primary model failed — try fallback if it's different
    if (model !== FALLBACK_MODEL && !isGeminiModel(FALLBACK_MODEL) !== !isGeminiModel(model)) {
      console.log(`[AI] ${model} failed (${status}), falling back to ${FALLBACK_MODEL}`);
      return callModel(FALLBACK_MODEL, messages, maxTokens, 0);
    }

    throw err;
  }
}

export async function generateText(
  messages: ClaudeMessage[],
  options: ClaudeOptions = {}
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const { systemPrompt } = options;

  if (!isAIConfigured()) {
    const content = generateMockContent(messages);
    await sleep(400);
    return { content, inputTokens: 0, outputTokens: 0 };
  }

  const builtMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const response = await callModel(MODEL, builtMessages, maxTokens);
  const content = response.choices[0]?.message?.content ?? "";
  const usage = response.usage;

  return {
    content,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  };
}

export async function generateStream(
  messages: ClaudeMessage[],
  options: ClaudeOptions = {},
  onChunk: (text: string) => void
): Promise<{ inputTokens: number; outputTokens: number }> {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const { systemPrompt } = options;

  if (!isAIConfigured()) {
    const content = generateMockContent(messages);
    for (const chunk of content.match(/[\s\S]{1,24}/g) ?? [content]) {
      onChunk(chunk);
      await sleep(15);
    }
    return { inputTokens: 0, outputTokens: 0 };
  }

  const builtMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // Gemini 2.5 thinking models: use non-streaming (more reliable) + simulate chunks
  const useNonStreaming = isGeminiModel(MODEL) && MODEL.includes("2.5");
  if (useNonStreaming) {
    const result = await callModel(MODEL, builtMessages, maxTokens);
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

  // Standard streaming for other models
  const client = getClientForModel(MODEL);
  const stream = await client.chat.completions.create({
    model: MODEL,
    max_tokens: maxTokens,
    stream: true,
    messages: builtMessages,
  });

  let inputTokens = 0;
  let outputTokens = 0;
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) onChunk(delta);
    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens ?? 0;
      outputTokens = chunk.usage.completion_tokens ?? 0;
    }
  }
  return { inputTokens, outputTokens };
}
