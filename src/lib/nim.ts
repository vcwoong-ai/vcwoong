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

/**
 * 모델별 API 키를 담은 JSON 맵을 파싱한다.
 *
 * 실사용 중 확인된 것: 이 계정은 모델 하나에 키 하나씩 발급되는 구조라,
 * 계정 공용 키로 다른 모델을 호출하면 "Function ... Not found for
 * account" 404가 난다. build.nvidia.com에서 모델 페이지를 열 때마다
 * 코드 예시에 그 모델 전용 키가 나오는데, 그 키들을 여기 모아 둔다.
 *
 * .env.local에 JSON 문자열로 채운다:
 *   NIM_MODEL_KEYS={"deepseek-ai/deepseek-v4-pro-0813":"nvapi-...","nvidia/nemotron-3-ultra-550b-a55b":"nvapi-..."}
 */
function parseModelKeyMap(): Record<string, string> {
  const raw = process.env.NIM_MODEL_KEYS?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const map: Record<string, string> = {};
    for (const [model, key] of Object.entries(parsed)) {
      if (typeof key === "string" && key.trim()) map[model] = key.trim();
    }
    return map;
  } catch (err) {
    console.warn(
      `[NIM] NIM_MODEL_KEYS가 올바른 JSON이 아니라 무시함: ${err instanceof Error ? err.message : err}`
    );
    return {};
  }
}

export function isNimConfigured(): boolean {
  return Boolean(
    process.env.NVIDIA_NIM_API_KEY?.trim() || process.env.NIM_MODEL_KEYS?.trim()
  );
}

/**
 * 특정 모델을 호출할 때 쓸 키를 고른다.
 * 1순위: NIM_MODEL_KEYS에 그 모델 전용 키가 있으면 그걸 쓴다.
 * 2순위: NVIDIA_NIM_API_KEY(계정 공용 키로 등록된 경우 대비).
 */
export function resolveApiKeyForModel(model: string): string {
  const perModel = parseModelKeyMap()[model];
  if (perModel) return perModel;

  const fallback = process.env.NVIDIA_NIM_API_KEY?.trim();
  if (fallback) return fallback;

  throw new Error(
    `${model}에 쓸 API 키가 없습니다. .env.local의 NIM_MODEL_KEYS(모델별 JSON) ` +
      "또는 NVIDIA_NIM_API_KEY(공용 키)에 추가하세요."
  );
}

/** 모델 목록 조회(listNimModels)는 공용 키 기준 — 카탈로그 열람엔 모델별 키가 필요 없다. */
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
 *
 * openai 패키지 대신 직접 fetch를 쓴다 — SDK는 실패 시 상태 코드만 보여주고
 * ("404 status code (no body)") 실제 응답 본문을 정확히 보여주지 않아서,
 * 계정/권한 문제인지 모델 이름 문제인지 구분이 안 됐다. 원본 응답 텍스트를
 * 그대로 예외 메시지에 담아 진단할 수 있게 한다.
 */
export async function callNimModel(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  options: {
    maxTokens?: number;
    temperature?: number;
    /**
     * 모델별 부가 파라미터 그대로 전달(예: 추론 모델의
     * `{ chat_template_kwargs: { enable_thinking: true } }`). NIM
     * 플레이그라운드의 코드 예시가 모델마다 요구하는 파라미터가 달라서
     * 하드코딩하지 않고 호출부(NIM_MODEL_CONFIGS)에서 넘기게 한다.
     */
    extraBody?: Record<string, unknown>;
  } = {}
): Promise<NimCallResult> {
  const apiKey = resolveApiKeyForModel(model);
  const startedAt = Date.now();
  const res = await fetch(`${NIM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.35,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...options.extraBody,
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const rawText = await res.text();
  if (!res.ok) {
    const requestId = res.headers.get("x-request-id") ?? res.headers.get("nvcf-reqid");
    throw new Error(
      `HTTP ${res.status} ${res.statusText}` +
        (requestId ? ` (request-id: ${requestId})` : "") +
        `\n응답 본문: ${rawText.slice(0, 1000) || "(빈 응답)"}`
    );
  }

  const data = JSON.parse(rawText) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  return {
    model,
    content: data.choices?.[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    elapsedMs: Date.now() - startedAt,
  };
}

/** NIM 계정에서 실제로 호출 가능한 모델 ID 목록을 조회한다(카탈로그는 계속 바뀐다). */
export async function listNimModels(): Promise<string[]> {
  const client = getNimClient();
  const res = await client.models.list();
  return res.data.map((m) => m.id).sort();
}

/**
 * 모델별 필수/권장 파라미터.
 *
 * NIM은 모델마다 build.nvidia.com의 "코드 예시" 탭에 서로 다른 파라미터를
 * 요구한다 — 특히 추론(reasoning) 모델은 `chat_template_kwargs`로 사고
 * 과정 노출 여부를 켜고 꺼야 한다(모델마다 키 이름도 다르다: 일부는
 * `enable_thinking`, DeepSeek 계열은 `thinking`). 하드코딩된 단일 호출
 * 방식으로는 이런 모델을 아예 못 돌리므로, 확인된 예시를 그대로 옮겨서
 * 모델 ID로 조회할 수 있게 한다. 새 모델을 테스트하다 여기 없는 모델이
 * 필요하면 NIM 모델 페이지의 코드 예시를 보고 여기에 추가하면 된다.
 */
export const NIM_MODEL_CONFIGS: Record<
  string,
  { maxTokens?: number; extraBody?: Record<string, unknown> }
> = {
  "nvidia/nemotron-3-super-120b-a12b": {
    maxTokens: 16384,
    extraBody: { chat_template_kwargs: { enable_thinking: true } },
  },
  "nvidia/nemotron-3-ultra-550b-a55b": {
    maxTokens: 16384,
    extraBody: { chat_template_kwargs: { enable_thinking: true } },
  },
  "deepseek-ai/deepseek-v4-pro-0813": {
    maxTokens: 16384,
    extraBody: { chat_template_kwargs: { thinking: false } },
  },
  // Kimi K3는 chat_template_kwargs가 아니라 최상위 reasoning_effort로
  // 추론 강도를 조절한다(모델마다 관례가 다르다).
  "moonshotai/kimi-k3": {
    maxTokens: 16384,
    extraBody: { reasoning_effort: "max" },
  },
  "meta/muse-glimmer-30b": { maxTokens: 8192 },
  "openai/gpt-oss-20b": {},
  // google/diffusiongemma-26b-a4b-it, google/gemma-4-31b-it,
  // meta/llama-3.2-90b-vision-instruct 등은 이미지 입력 전용(vision) 모델이라
  // 텍스트 전용인 보고서 섹션 생성 비교엔 맞지 않아 여기 올리지 않는다.
};

/** 모델별 설정이 있으면 합쳐서 돌려준다(없으면 빈 값 — callNimModel 기본값 사용) */
export function getNimModelOptions(model: string): {
  maxTokens?: number;
  extraBody?: Record<string, unknown>;
} {
  return NIM_MODEL_CONFIGS[model] ?? {};
}
