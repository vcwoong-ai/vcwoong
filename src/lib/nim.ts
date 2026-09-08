/**
 * NVIDIA NIM(build.nvidia.com) 호출 — 모델 벤치마킹 전용.
 *
 * 프로덕션 생성 파이프라인(claude.ts)과는 완전히 분리돼 있다. 목적이
 * 다르기 때문이다: claude.ts는 실제 보고서를 만드는 단일 프로바이더
 * 경로이고, 이 파일은 "다른 모델로 같은 프롬프트를 돌리면 결과가 얼마나
 * 다른가"를 사람이 직접 비교해보기 위한 도구다. tools/compare-models.ts
 * 에서만 사용한다 — report-generation.ts 등 실제 생성 경로에서 import하지
 * 말 것.
 *
 * NIM은 OpenAI 호환 API라 openai 패키지를 그대로 쓴다.
 */

import OpenAI from "openai";

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";

export function isNimConfigured(): boolean {
  return Boolean(process.env.NVIDIA_NIM_API_KEY?.trim());
}

function getNimClient(): OpenAI {
  const apiKey = process.env.NVIDIA_NIM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "NVIDIA_NIM_API_KEY가 설정되지 않았습니다. .env.local에 추가하세요."
    );
  }
  return new OpenAI({ baseURL: NIM_BASE_URL, apiKey, timeout: 60_000 });
}

export interface NimCallResult {
  model: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
}

/**
 * 시스템 프롬프트 + 유저 프롬프트로 NIM의 특정 모델을 1회 호출한다.
 * 실패해도 예외를 던진다(비교 스크립트가 어떤 모델이 실패했는지 알아야
 * 하므로, 프로덕션 코드처럼 조용히 묻지 않는다).
 */
export async function callNimModel(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  options: { maxTokens?: number; temperature?: number } = {}
): Promise<NimCallResult> {
  const client = getNimClient();
  const startedAt = Date.now();

  const result = await client.chat.completions.create({
    model,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.35,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  return {
    model,
    content: result.choices[0]?.message?.content ?? "",
    inputTokens: result.usage?.prompt_tokens ?? 0,
    outputTokens: result.usage?.completion_tokens ?? 0,
    elapsedMs: Date.now() - startedAt,
  };
}

/** NIM 계정에서 실제로 호출 가능한 모델 ID 목록을 조회한다(카탈로그는 계속 바뀐다). */
export async function listNimModels(): Promise<string[]> {
  const client = getNimClient();
  const res = await client.models.list();
  return res.data.map((m) => m.id).sort();
}
