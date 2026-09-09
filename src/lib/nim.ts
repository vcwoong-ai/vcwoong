/**
 * NVIDIA NIM(build.nvidia.com) 호출 — 모델 벤치마킹·비교 전용.
 *
 * 실제 보고서 내용을 만드는 경로는 여전히 claude.ts(OpenRouter) 단일
 * 경로뿐이다 — 이 파일이 만든 결과가 reportSection.content에 저장되는
 * 일은 없다. 두 곳에서 쓴다:
 *   1. tools/compare-models.ts — CLI로 로컬에서 여러 모델을 비교
 *   2. src/app/api/reports/[id]/sections/compare/route.ts — 보고서
 *      화면의 "다른 모델로 비교" 버튼(온디맨드, 읽기 전용 — 결과를 클릭해도
 *      섹션 내용이 바뀌지 않는다). 어떤 모델을 프로덕션에 쓸지 판단하기
 *      위한 참고 자료일 뿐이다.
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
 *
 * 항상 스트리밍(`stream: true`)으로 요청한다 — 실사용 중 확인된 것: 일부
 * 모델(kimi-k3, deepseek-v4-pro-0813)은 스트리밍 없이 부르면 응답을 끝까지
 * 만들 때까지 아무것도 안 주고 있다가 우리 쪽 타임아웃(180초)에 걸려
 * 죽는다 — 90초→180초로 늘려도 이 두 모델은 그대로 실패했다. kimi-k3의
 * NIM 공식 코드 예시도 기본값이 `stream=True`다. 나머지 모델(gpt-oss-20b,
 * nemotron 계열)은 스트리밍 여부와 무관하게 잘 되므로, 모든 모델에 대해
 * 스트리밍으로 통일해도 안전하다 — 호출부는 이 함수가 내부적으로 어떻게
 * 받아오는지 몰라도 되고(반환 타입 동일), 청크를 모아 하나의 문자열로
 * 합쳐서 돌려준다.
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
    /**
     * 이 호출 하나가 기다릴 최대 시간(ms). 기본 180초는 로컬 CLI
     * 비교(tools/compare-models.ts)용이다 — NIM 온디맨드 모델은 콜드
     * 스타트(첫 호출 시 GPU 인스턴스를 새로 띄움) 때문에 90초로는 부족한
     * 경우가 실제로 있어서 늘렸다. Vercel 함수 안에서 부르는 곳(예: 보고서
     * 화면의 온디맨드 비교)은 이 기본값을 쓰지 않고 함수 실행시간 상한
     * (Hobby 60초)보다 짧은 값을 명시적으로 넘긴다 — 거기는 건드리지 말 것.
     */
    timeoutMs?: number;
  } = {}
): Promise<NimCallResult> {
  const apiKey = resolveApiKeyForModel(model);
  const startedAt = Date.now();
  const res = await fetch(`${NIM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.35,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: true,
      // 스트리밍 마지막 청크에 usage를 함께 달라고 요청(OpenAI 호환
      // 파라미터) — 없으면 토큰 수를 알 방법이 없다.
      stream_options: { include_usage: true },
      ...options.extraBody,
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 180_000),
  });

  if (!res.ok) {
    const rawText = await res.text();
    const requestId = res.headers.get("x-request-id") ?? res.headers.get("nvcf-reqid");
    throw new Error(
      `HTTP ${res.status} ${res.statusText}` +
        (requestId ? ` (request-id: ${requestId})` : "") +
        `\n응답 본문: ${rawText.slice(0, 1000) || "(빈 응답)"}`
    );
  }

  if (!res.body) {
    throw new Error(`${model}: 스트리밍 응답 본문이 없습니다`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let content = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // 아직 안 끝난 마지막 줄은 다음 청크로 넘긴다

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;

      let json: {
        choices?: Array<{ delta?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      try {
        json = JSON.parse(data);
      } catch {
        continue; // 청크 경계에서 잘린 불완전한 JSON은 건너뛴다
      }

      const delta = json.choices?.[0]?.delta?.content;
      if (delta) content += delta;
      if (json.usage) {
        inputTokens = json.usage.prompt_tokens ?? inputTokens;
        outputTokens = json.usage.completion_tokens ?? outputTokens;
      }
    }
  }

  return {
    model,
    content,
    inputTokens,
    outputTokens,
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

/**
 * 보고서 화면의 "다른 모델로 비교" 버튼이 기본으로 돌릴 모델 목록.
 *
 * deepseek-ai/deepseek-v4-pro-0813은 한동안 계속 실패해서(타임아웃 →
 * "Function ... not found for account" 404) 계정/용량 문제로 보고 목록에서
 * 뺐었는데, 원인은 따로 있었다 — .env.local의 NIM_MODEL_KEYS JSON이
 * 문법 오류(콜론 누락)로 깨져 있어서 전 모델이 공용 키로 폴백되고 있었고,
 * 공용 키가 이 모델엔 안 맞았던 것. JSON을 고치고 나니 51초 만에 정상
 * 응답했다 — 그래서 다시 넣었다. 반대로 meta/muse-glimmer-30b는 같은
 * 조건에서 타임아웃이 나서 뺐다 — 필요하면 나중에 다시 시도해볼 것.
 *
 * 지금 기본 3개 — 전부 실제 호출로 성공 확인됨:
 *   - openai/gpt-oss-20b: 가볍고 빠름 (단, 실제 비교에서 자료에 없는
 *     수치를 지어내는 사례가 한 번 관측됨 — 출력을 그대로 신뢰하지 말 것)
 *   - nvidia/nemotron-3-super-120b-a12b: 판단이 필요한 섹션(밸류/리스크/
 *     의견종합)용 대형 MoE 모델, 지금까지 가장 빠르고 안정적
 *   - deepseek-ai/deepseek-v4-pro-0813: 프로덕션 기본값과 같은 계열의
 *     상위 모델 — 분량이 조금 김(600~1,200자 지침 대비 초과 경향)
 *
 * NIM_COMPARISON_MODELS 환경변수(콤마 구분)로 완전히 바꿀 수 있다.
 */
const DEFAULT_COMPARISON_MODELS = [
  "openai/gpt-oss-20b",
  "nvidia/nemotron-3-super-120b-a12b",
  "deepseek-ai/deepseek-v4-pro-0813",
];

export function getComparisonModels(): string[] {
  const fromEnv = (process.env.NIM_COMPARISON_MODELS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_COMPARISON_MODELS;
}
