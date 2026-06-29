import { generateMockContent } from "./mock-generator";
import type { MessageParam, TextBlock } from "@anthropic-ai/sdk/resources/messages";

// ─── Provider 감지 ───────────────────────────────────────────────────────────

type Provider = "anthropic" | "gemini" | "openrouter" | "mock";

// 작업 복잡도 티어
// "standard" → OpenRouter 무료 (빠른 처리, 간단한 추출/분류)
// "premium"  → Gemini 유료 (복잡한 분석, 보고서 생성)
export type AITier = "standard" | "premium";

function detectProvider(tier: AITier = "premium"): Provider {
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  const geminiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";

  // Anthropic은 항상 최우선
  if (anthropicKey.startsWith("sk-ant-") && anthropicKey.length > 20 && !anthropicKey.includes("...")) {
    return "anthropic";
  }

  // premium 작업 → Gemini 유료 우선
  if (tier === "premium" && geminiKey.startsWith("AIzaSy") && geminiKey.length > 20) {
    return "gemini";
  }

  // standard 작업 또는 Gemini 없을 때 → OpenRouter 무료
  if (openrouterKey.startsWith("sk-or-") && openrouterKey.length > 20) {
    return "openrouter";
  }

  // Gemini 폴백 (standard였지만 OpenRouter도 없을 때)
  if (geminiKey.startsWith("AIzaSy") && geminiKey.length > 20) {
    return "gemini";
  }

  return "mock";
}

export function isAIConfigured(): boolean {
  return detectProvider() !== "mock";
}

export const MODEL =
  process.env.ANTHROPIC_MODEL ||
  process.env.GEMINI_MODEL ||
  process.env.OPENROUTER_MODEL ||
  "gemini-2.0-flash";

// ─── 공통 인터페이스 ──────────────────────────────────────────────────────────

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  tier?: AITier;
}

// ─── OpenRouter 호출 (무료 모델) ──────────────────────────────────────────────

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

// ─── Gemini 호출 (유료, OpenAI 호환 엔드포인트) ──────────────────────────────

async function callGemini(
  system: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
  temperature: number
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: "system", content: system },
          ...messages,
        ],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err.slice(0, 200)}`);
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
  temperature: number,
  tier: AITier = "premium"
): Promise<{ content: string; inputTokens: number; outputTokens: number; provider: Provider }> {
  const provider = detectProvider(tier);

  if (provider === "anthropic") {
    const result = await callAnthropic(system, messages, maxTokens, temperature);
    return { ...result, provider };
  }
  if (provider === "gemini") {
    const result = await callGemini(system, messages, maxTokens, temperature);
    return { ...result, provider };
  }
  if (provider === "openrouter") {
    const result = await callOpenRouter(system, messages, maxTokens, temperature);
    return { ...result, provider };
  }

  // mock
  const mockContent = generateMockContent(
    messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
  );
  await new Promise((r) => setTimeout(r, 400));
  return { content: mockContent, inputTokens: 0, outputTokens: 0, provider: "mock" };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function generateText(
  messages: ClaudeMessage[],
  options: ClaudeOptions = {}
): Promise<{ content: string; inputTokens: number; outputTokens: number; provider?: string }> {
  const { maxTokens = 4096, temperature = 0.7, systemPrompt = "", tier = "premium" } = options;
  return callAI(systemPrompt, messages, maxTokens, temperature, tier);
}

export async function callClaudeJSON<T>(params: {
  system: string;
  messages: MessageParam[];
  maxTokens?: number;
  temperature?: number;
  retries?: number;
  tier?: AITier;
}): Promise<{ data: T; inputTokens: number; outputTokens: number; provider?: string }> {
  const { system, messages, maxTokens = 4096, temperature = 0.3, retries = 2, tier = "premium" } = params;

  if (detectProvider(tier) === "mock") {
    return { data: {} as T, inputTokens: 0, outputTokens: 0, provider: "mock" };
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { content, inputTokens, outputTokens, provider } = await callAI(
        system,
        messages.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        })),
        maxTokens,
        temperature,
        tier
      );

      const cleaned = content
        .replace(/^```json\s*/m, "")
        .replace(/```\s*$/, "")
        .trim();

      return { data: JSON.parse(cleaned) as T, inputTokens, outputTokens, provider };
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
): Promise<{ inputTokens: number; outputTokens: number; provider?: string }> {
  const { maxTokens = 4096, temperature = 0.7, systemPrompt = "", tier = "premium" } = options;
  const provider = detectProvider(tier);

  // Anthropic 네이티브 스트리밍
  if (provider === "anthropic") {
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
    return { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens, provider: "anthropic" };
  }

  // Gemini / OpenRouter: 청크 에뮬레이션
  const { content, inputTokens, outputTokens } = await callAI(
    systemPrompt,
    messages,
    maxTokens,
    temperature,
    tier
  );
  for (const chunk of content.match(/[\s\S]{1,24}/g) ?? [content]) {
    onChunk(chunk);
    await new Promise((r) => setTimeout(r, 10));
  }
  return { inputTokens, outputTokens, provider };
}

// ─── 현재 활성 Provider 정보 ─────────────────────────────────────────────────

export function getProviderInfo(): {
  standard: { provider: Provider; model: string };
  premium: { provider: Provider; model: string };
} {
  const modelFor = (p: Provider): string => {
    if (p === "anthropic") return process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
    if (p === "gemini") return process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
    if (p === "openrouter") return process.env.OPENROUTER_MODEL ?? "google/gemini-2.0-flash-exp:free";
    return "mock";
  };

  const sp = detectProvider("standard");
  const pp = detectProvider("premium");
  return {
    standard: { provider: sp, model: modelFor(sp) },
    premium: { provider: pp, model: modelFor(pp) },
  };
}
