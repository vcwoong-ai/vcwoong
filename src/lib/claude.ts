import Anthropic from "@anthropic-ai/sdk";
import { generateMockContent } from "./mock-generator";

/**
 * AI provider layer.
 *
 * Two backends are supported:
 *  - Anthropic (direct API) — used when ANTHROPIC_API_KEY is set.
 *  - OpenRouter (OpenAI-compatible REST API) — used when OPENROUTER_API_KEY
 *    is set instead. OpenRouter lets the operator pick any model (Gemini
 *    Flash, DeepSeek, Qwen, etc.) purely via the OPENROUTER_MODEL env var,
 *    with no code change or redeploy needed to switch models.
 *
 * Anthropic takes priority when both are configured. With neither set, all
 * generation falls back to mock content so the product stays demoable.
 */

const anthropicClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

// Default: DeepSeek V4 Flash — $0.09/$0.18 per 1M tokens (in/out) with a
// 1M-token context window, so a full IR deck plus the section prompt fits in
// a single call at very low cost. Override via OPENROUTER_MODEL to try
// Gemini Flash/Qwen/etc. without touching code.
export const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function hasAnthropicKey(): boolean {
  const key = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  return key.startsWith("sk-ant-") && key.length > 20 && !key.includes("...");
}

function hasOpenRouterKey(): boolean {
  const key = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  return key.startsWith("sk-or-") && key.length > 20 && !key.includes("...");
}

type Provider = "anthropic" | "openrouter" | null;

function activeProvider(): Provider {
  if (hasAnthropicKey()) return "anthropic";
  if (hasOpenRouterKey()) return "openrouter";
  return null;
}

/**
 * Returns true when a usable AI API key (Anthropic or OpenRouter) is
 * configured. Placeholder values and empty strings are treated as unset,
 * so the platform falls back to demo-mode generation.
 */
export function isAIConfigured(): boolean {
  return activeProvider() !== null;
}

/** Model id actually in use, for logging/UI (e.g. quota/usage displays). */
export function getActiveModel(): string {
  return activeProvider() === "openrouter" ? OPENROUTER_MODEL : ANTHROPIC_MODEL;
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

interface GenerationResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

async function generateViaOpenRouter(
  messages: ClaudeMessage[],
  options: ClaudeOptions
): Promise<GenerationResult> {
  const { maxTokens = 4096, temperature, systemPrompt } = options;

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      // Required by OpenRouter for attribution/rate-limit purposes.
      "HTTP-Referer": process.env.NEXTAUTH_URL || "https://dealsync.vercel.app",
      "X-Title": "DealSync",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: maxTokens,
      ...(temperature !== undefined ? { temperature } : {}),
      messages: [
        ...(systemPrompt
          ? [{ role: "system" as const, content: systemPrompt }]
          : []),
        ...messages,
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `OpenRouter API error (${res.status}): ${body.slice(0, 500)}`
    );
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";

  return {
    content,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

async function generateViaAnthropic(
  messages: ClaudeMessage[],
  options: ClaudeOptions
): Promise<GenerationResult> {
  const { maxTokens = 4096, systemPrompt } = options;

  const response = await anthropicClient.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const content = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { type: "text"; text: string }).text)
    .join("");

  return {
    content,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

export async function generateText(
  messages: ClaudeMessage[],
  options: ClaudeOptions = {}
): Promise<GenerationResult> {
  const provider = activeProvider();

  if (!provider) {
    const content = generateMockContent(messages);
    // Small delay to emulate generation latency for a realistic demo UX.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { content, inputTokens: 0, outputTokens: 0 };
  }

  return provider === "openrouter"
    ? generateViaOpenRouter(messages, options)
    : generateViaAnthropic(messages, options);
}

/**
 * Streaming generation. OpenRouter also exposes an SSE streaming mode, but
 * none of the current call sites need incremental UI updates badly enough to
 * justify parsing two different SSE dialects — so OpenRouter streams are
 * generated in one shot and flushed through onChunk like the mock path does.
 * Anthropic keeps true token-by-token streaming since the SDK provides it
 * directly.
 */
export async function generateStream(
  messages: ClaudeMessage[],
  options: ClaudeOptions = {},
  onChunk: (text: string) => void
): Promise<{ inputTokens: number; outputTokens: number }> {
  const { maxTokens = 4096, systemPrompt } = options;
  const provider = activeProvider();

  if (!provider) {
    const content = generateMockContent(messages);
    for (const chunk of content.match(/[\s\S]{1,24}/g) ?? [content]) {
      onChunk(chunk);
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    return { inputTokens: 0, outputTokens: 0 };
  }

  if (provider === "openrouter") {
    const result = await generateViaOpenRouter(messages, options);
    for (const chunk of result.content.match(/[\s\S]{1,24}/g) ?? [result.content]) {
      onChunk(chunk);
    }
    return { inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  }

  const stream = await anthropicClient.messages.stream({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      onChunk(event.delta.text);
    }
  }

  const finalMessage = await stream.finalMessage();
  return {
    inputTokens: finalMessage.usage.input_tokens,
    outputTokens: finalMessage.usage.output_tokens,
  };
}
