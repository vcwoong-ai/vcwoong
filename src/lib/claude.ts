import Anthropic from "@anthropic-ai/sdk";
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
