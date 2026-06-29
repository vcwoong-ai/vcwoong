import { generateMockContent } from "./mock-generator";
import type { MessageParam, TextBlock } from "@anthropic-ai/sdk/resources/messages";

// ─── Provider 감지 ───────────────────────────────────────────────────────────

type Provider = "anthropic" | "openrouter" | "mock";

function detectProvider(): Provider {
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";

  if (anthropicKey.startsWith("sk-ant-") && anthropicKey.length > 20 && !anthropicKey.includes("...")) {
    return "anthropic";
  }
  if (openrouterKey.startsWith("sk-or-") && openrouterKey.length > 20) {
    return "openrouter";
  }
  return "mock";
}

export function isAIConfigured(): boolean {
  return detectProvider() !== "mock";
}

export const MODEL =
  process.env.ANTHROPIC_MODEL ||
  process.env.OPENROUTER_MODEL ||
  "google/gemini-2.0-flash-exp:free";

// ─── 공통 인터페이스 ──────────────────────────────────────────────────────────

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

// ─── OpenRouter 호출 ──────────────────────────────────────────────────────────

async function callOpenRouter(
  system: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
  temperature: number
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXTAUTH_URL ?? "http://localhost:3000",
      "X-Title": "DealSync",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? "google/gemini-2.0-flash-exp:free",
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: "system", content: system },
        ...messages,
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json() as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    content: data.choices[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

// ─── Anthropic 호출 ───────────────────────────────────────────────────────────

async function callAnthropic(
  system: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
  temperature: number
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
    max_tokens: maxTokens,
    temperature,
    system,
    messages: messages as MessageParam[],
  });

  const content = response.content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return {
    content,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// ─── 통합 호출 헬퍼 ──────────────────────────────────────────────────────────

async function callAI(
  system: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
  temperature: number
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const provider = detectProvider();

  if (provider === "openrouter") {
    return callOpenRouter(system, messages, maxTokens, temperature);
  }
  if (provider === "anthropic") {
    return callAnthropic(system, messages, maxTokens, temperature);
  }
  // mock
  const mockContent = generateMockContent(
    messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
  );
  await new Promise((r) => setTimeout(r, 400));
  return { content: mockContent, inputTokens: 0, outputTokens: 0 };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function generateText(
  messages: ClaudeMessage[],
  options: ClaudeOptions = {}
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const { maxTokens = 4096, temperature = 0.7, systemPrompt = "" } = options;
  return callAI(systemPrompt, messages, maxTokens, temperature);
}

export async function callClaudeJSON<T>(params: {
  system: string;
  messages: MessageParam[];
  maxTokens?: number;
  temperature?: number;
  retries?: number;
}): Promise<{ data: T; inputTokens: number; outputTokens: number }> {
  const { system, messages, maxTokens = 4096, temperature = 0.3, retries = 2 } = params;

  if (detectProvider() === "mock") {
    return { data: {} as T, inputTokens: 0, outputTokens: 0 };
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { content, inputTokens, outputTokens } = await callAI(
        system,
        messages.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        })),
        maxTokens,
        temperature
      );

      const cleaned = content
        .replace(/^```json\s*/m, "")
        .replace(/```\s*$/, "")
        .trim();

      return { data: JSON.parse(cleaned) as T, inputTokens, outputTokens };
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
  const { maxTokens = 4096, temperature = 0.7, systemPrompt = "" } = options;
  const provider = detectProvider();

  // OpenRouter / mock: 스트리밍 미지원 시 청크 분할 에뮬레이션
  if (provider !== "anthropic") {
    const { content, inputTokens, outputTokens } = await callAI(
      systemPrompt,
      messages,
      maxTokens,
      temperature
    );
    for (const chunk of content.match(/[\s\S]{1,24}/g) ?? [content]) {
      onChunk(chunk);
      await new Promise((r) => setTimeout(r, 10));
    }
    return { inputTokens, outputTokens };
  }

  // Anthropic 스트리밍
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const stream = await client.messages.stream({
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
    max_tokens: maxTokens,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      onChunk(event.delta.text);
    }
  }

  const final = await stream.finalMessage();
  return {
    inputTokens: final.usage.input_tokens,
    outputTokens: final.usage.output_tokens,
  };
}
