import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, TextBlock } from "@anthropic-ai/sdk/resources/messages";
import { generateMockContent } from "./mock-generator";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

/**
 * Returns true when a usable Anthropic API key is configured.
 * The placeholder value ("sk-ant-...") and empty strings are treated as unset,
 * so the platform falls back to demo-mode generation.
 */
export function isAIConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  return key.startsWith("sk-ant-") && key.length > 20 && !key.includes("...");
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

export async function generateText(
  messages: ClaudeMessage[],
  options: ClaudeOptions = {}
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const { maxTokens = 4096, systemPrompt } = options;

  if (!isAIConfigured()) {
    const content = generateMockContent(messages);
    // Small delay to emulate generation latency for a realistic demo UX.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { content, inputTokens: 0, outputTokens: 0 };
  }

  const response = await client.messages.create({
    model: MODEL,
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

export async function callClaudeJSON<T>(params: {
  system: string;
  messages: MessageParam[];
  maxTokens?: number;
  temperature?: number;
  retries?: number;
}): Promise<{ data: T; inputTokens: number; outputTokens: number }> {
  const { system, messages, maxTokens = 4096, temperature = 0.3, retries = 2 } = params;

  if (!isAIConfigured()) {
    return { data: {} as T, inputTokens: 0, outputTokens: 0 };
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        temperature,
        system,
        messages,
      });

      const text = response.content
        .filter((b): b is TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      const cleaned = text
        .replace(/^```json\s*/m, "")
        .replace(/```\s*$/, "")
        .trim();

      return {
        data: JSON.parse(cleaned) as T,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error("Unreachable");
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
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    return { inputTokens: 0, outputTokens: 0 };
  }

  const stream = await client.messages.stream({
    model: MODEL,
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
