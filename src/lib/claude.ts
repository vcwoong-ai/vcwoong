/**
 * AI provider abstraction — backed by OpenRouter (OpenAI-compatible endpoint).
 *
 * Model switching via AI_MODEL env var:
 *   Free:  meta-llama/llama-3.3-70b-instruct:free
 *          qwen/qwen3-next-80b-a3b-instruct:free
 *   Cheap: deepseek/deepseek-v3-0324          (~$0.03/report)
 *          google/gemini-2.5-flash             (~$0.05/report)
 *   Best:  anthropic/claude-sonnet-4-5         (~$0.47/report)
 *          openai/gpt-4o                       (~$0.50/report)
 *
 * Falls back to demo/mock mode when OPENROUTER_API_KEY is not set.
 */

import OpenAI from "openai";
import { generateMockContent } from "./mock-generator";

export const MODEL =
  process.env.AI_MODEL ?? "deepseek/deepseek-v4-flash";

/** Free-tier fallback chain (tried in order when primary model is rate-limited) */
const FREE_FALLBACK_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "google/gemma-4-31b-it:free",
  "openai/gpt-oss-120b:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
];

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY ?? "",
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXTAUTH_URL ?? "http://localhost:3000",
        "X-Title": "DealSync",
      },
    });
  }
  return _client;
}

export function isAIConfigured(): boolean {
  const key = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  return key.startsWith("sk-or-") && key.length > 20;
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

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Call the OpenRouter API with automatic retry on 429.
 * For free models, falls back through FREE_FALLBACK_MODELS list.
 */
async function callWithRetry(
  model: string,
  params: Parameters<OpenAI["chat"]["completions"]["create"]>[0],
  maxRetries = 3
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const client = getClient();
  let lastError: unknown;

  // Build model priority list
  const modelsToTry = model.endsWith(":free")
    ? [model, ...FREE_FALLBACK_MODELS.filter((m) => m !== model)]
    : [model];

  for (const tryModel of modelsToTry) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await client.chat.completions.create({
          ...params,
          model: tryModel,
          stream: false,
        } as Parameters<OpenAI["chat"]["completions"]["create"]>[0]);
        return result as OpenAI.Chat.Completions.ChatCompletion;
      } catch (err: unknown) {
        lastError = err;
        const status = (err as { status?: number })?.status;
        if (status === 429) {
          const retryAfter =
            (
              err as {
                error?: { metadata?: { retry_after_seconds?: number } };
              }
            )?.error?.metadata?.retry_after_seconds ?? 5;
          const waitMs = Math.min(retryAfter * 1000, 35000);
          console.log(
            `[AI] ${tryModel} rate-limited, waiting ${waitMs / 1000}s (attempt ${attempt + 1}/${maxRetries})`
          );
          await sleep(waitMs);
          continue;
        }
        // Non-429 error — skip to next model
        break;
      }
    }
  }

  throw lastError;
}

export async function generateText(
  messages: ClaudeMessage[],
  options: ClaudeOptions = {}
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const { maxTokens = 4096, systemPrompt } = options;

  if (!isAIConfigured()) {
    const content = generateMockContent(messages);
    await sleep(400);
    return { content, inputTokens: 0, outputTokens: 0 };
  }

  const response = await callWithRetry(MODEL, {
    model: MODEL,
    max_tokens: maxTokens,
    messages: [
      ...(systemPrompt
        ? [{ role: "system" as const, content: systemPrompt }]
        : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });

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
  const { maxTokens = 4096, systemPrompt } = options;

  if (!isAIConfigured()) {
    const content = generateMockContent(messages);
    for (const chunk of content.match(/[\s\S]{1,24}/g) ?? [content]) {
      onChunk(chunk);
      await sleep(15);
    }
    return { inputTokens: 0, outputTokens: 0 };
  }

  // Stream with fallback to non-stream on free models (more reliable)
  const isFreeModel = MODEL.endsWith(":free");

  if (isFreeModel) {
    // Use non-streaming for free models to avoid partial failures
    const result = await callWithRetry(MODEL, {
      model: MODEL,
      max_tokens: maxTokens,
      messages: [
        ...(systemPrompt
          ? [{ role: "system" as const, content: systemPrompt }]
          : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });
    const content = result.choices[0]?.message?.content ?? "";
    // Simulate streaming for UX
    for (const chunk of content.match(/[\s\S]{1,30}/g) ?? [content]) {
      onChunk(chunk);
      await sleep(10);
    }
    return {
      inputTokens: result.usage?.prompt_tokens ?? 0,
      outputTokens: result.usage?.completion_tokens ?? 0,
    };
  }

  const client = getClient();
  const stream = await client.chat.completions.create({
    model: MODEL,
    max_tokens: maxTokens,
    stream: true,
    messages: [
      ...(systemPrompt
        ? [{ role: "system" as const, content: systemPrompt }]
        : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
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
