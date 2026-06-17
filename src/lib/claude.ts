import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODEL = "claude-sonnet-4-6";

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
