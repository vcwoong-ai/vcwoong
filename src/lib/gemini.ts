/**
 * Google AI Studio(Gemini) 직접 호출 — 모델 벤치마킹·비교 전용.
 *
 * 실제 보고서 내용을 만드는 경로는 여전히 claude.ts(OpenRouter) 단일
 * 경로뿐이다 — 이 파일이 만든 결과가 reportSection.content에 저장되는
 * 일은 없다. nim.ts와 정확히 같은 역할, 다른 프로바이더일 뿐이다. 두
 * 곳에서 쓴다:
 *   1. tools/compare-models.ts — CLI로 로컬에서 여러 모델을 비교
 *   2. src/app/api/reports/[id]/sections/compare/route.ts — 보고서
 *      화면의 "다른 모델로 비교" 버튼(온디맨드, 읽기 전용)
 *
 * 참고: claude.ts의 프로덕션 폴백 체인(DEFAULT_FALLBACK_CHAIN)에도
 * google/gemini-2.5-pro가 이미 있지만, 그건 OpenRouter를 거쳐 OpenRouter
 * 계정으로 과금된다 — 이 파일은 Google AI Studio에서 직접 발급받은
 * API 키로 Gemini를 호출하는 별도 경로다(요금/쿼터가 다름).
 *
 * Google AI Studio는 OpenAI 호환 엔드포인트를 제공해서 openai 패키지를
 * 그대로 쓴다: https://ai.google.dev/gemini-api/docs/openai
 */

import OpenAI from "openai";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

function resolveApiKey(): string | undefined {
  return (
    process.env.GOOGLE_AI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || undefined
  );
}

export function isGeminiConfigured(): boolean {
  return Boolean(resolveApiKey());
}

function getGeminiClient(timeoutMs = 60_000): OpenAI {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error(
      "GOOGLE_AI_API_KEY(또는 GEMINI_API_KEY)가 설정되지 않았습니다. Google AI Studio(https://aistudio.google.com/apikey)에서 발급받아 .env.local에 추가하세요."
    );
  }
  return new OpenAI({ baseURL: GEMINI_BASE_URL, apiKey, timeout: timeoutMs });
}

export interface GeminiCallResult {
  model: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
}

/**
 * 시스템 프롬프트 + 유저 프롬프트로 Gemini 모델을 1회 호출한다.
 * NIM과 달리 스트리밍 없이도 안정적으로 응답하므로(관측된 콜드스타트
 * 타임아웃 이슈 없음) 표준 openai SDK 호출로 충분하다.
 */
export async function callGeminiModel(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  options: {
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  } = {}
): Promise<GeminiCallResult> {
  const client = getGeminiClient(options.timeoutMs ?? 60_000);
  const startedAt = Date.now();

  const res = await client.chat.completions.create({
    model,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.35,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = res.choices[0]?.message?.content ?? "";
  if (!content) {
    throw new Error(`${model}: 빈 응답 (finish_reason=${res.choices[0]?.finish_reason ?? "?"})`);
  }

  return {
    model,
    content,
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
    elapsedMs: Date.now() - startedAt,
  };
}

/** Google AI Studio 계정에서 실제로 호출 가능한 모델 ID 목록을 조회한다. */
export async function listGeminiModels(): Promise<string[]> {
  const client = getGeminiClient();
  const res = await client.models.list();
  return res.data.map((m) => m.id).sort();
}

/**
 * compare-models.ts / "다른 모델로 비교" 버튼이 기본으로 돌릴 Gemini 모델.
 * GEMINI_COMPARISON_MODELS 환경변수(콤마 구분)로 바꿀 수 있다.
 */
const DEFAULT_COMPARISON_MODELS = ["gemini-2.5-pro", "gemini-2.5-flash"];

export function getGeminiComparisonModels(): string[] {
  const fromEnv = (process.env.GEMINI_COMPARISON_MODELS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_COMPARISON_MODELS;
}
