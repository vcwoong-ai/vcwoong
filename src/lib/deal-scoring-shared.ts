/**
 * deal-scoring.ts의 클라이언트 안전 부분만 분리한 파일.
 *
 * deal-scoring.ts는 최상단에서 `@/lib/claude`(generateText)를 import하는데,
 * 이 파일 안의 상수·표시용 헬퍼(SCORE_DIMENSIONS, scoreLabel 등)는 클라이언트
 * 컴포넌트(deal-score-radar.tsx, deals-compare-client.tsx)에서도 쓰인다.
 * 같은 파일에서 가져오면 webpack이 claude.ts(및 그 안의 Node 전용 API)까지
 * 클라이언트 번들에 끌고 들어가려 하다가 빌드가 깨진다 — 그래서 AI 호출이
 * 필요 없는 부분만 이 파일로 뽑아뒀다. 서버 쪽 코드는 그대로 deal-scoring.ts를
 * 쓰면 된다(이 파일의 내용을 재-export함).
 */

export const SCORE_DIMENSIONS = [
  { key: "marketSize", label: "시장성", desc: "시장 규모·성장성·타이밍" },
  { key: "team", label: "팀 역량", desc: "창업팀 경력·실행력·완결성" },
  { key: "product", label: "제품·기술력", desc: "제품 완성도·기술 진입장벽" },
  { key: "businessModel", label: "사업모델", desc: "수익모델·유닛이코노믹스" },
  { key: "financials", label: "재무 건전성", desc: "매출·성장률·런웨이" },
  { key: "moat", label: "경쟁 우위", desc: "경쟁사 대비 해자·차별성" },
] as const;

export type ScoreDimensionKey = (typeof SCORE_DIMENSIONS)[number]["key"];

export interface DealScoreResult {
  overall: number;
  marketSize: number;
  team: number;
  product: number;
  businessModel: number;
  financials: number;
  moat: number;
  rationale: Record<ScoreDimensionKey, string>;
  modelUsed: string;
}

function clampScore(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.round(Math.max(0, Math.min(100, v)));
}

/**
 * AI 응답 텍스트에서 JSON 블록만 추출해 파싱한다.
 * 모델이 ```json 코드펜스나 설명 문장을 앞뒤에 붙이는 경우가 많아
 * 첫 `{`부터 마지막 `}`까지만 잘라낸다.
 */
function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** 파싱 실패·필드 누락에도 항상 유효한 점수 객체를 반환한다 (spec 밖 값은 clamp) */
export function parseScoreResponse(
  raw: string,
  modelUsed: string
): DealScoreResult {
  const json = extractJson(raw) ?? {};
  const scores = (json.scores ?? json) as Record<string, unknown>;
  const rationaleRaw = (json.rationale ?? {}) as Record<string, unknown>;

  const rationale = {} as Record<ScoreDimensionKey, string>;
  for (const { key } of SCORE_DIMENSIONS) {
    const v = rationaleRaw[key];
    rationale[key] = typeof v === "string" ? v.slice(0, 200) : "";
  }

  const dims = {} as Record<ScoreDimensionKey, number>;
  for (const { key } of SCORE_DIMENSIONS) {
    dims[key] = clampScore(scores[key]);
  }

  // 종합점수는 AI가 준 값보다 6개 차원 평균을 신뢰한다 — AI가 종합만
  // 별도로 후하게/박하게 매기는 경우가 있어 차원별 점수와 어긋나면
  // 레이더(차원)와 배지(종합)가 모순돼 보인다.
  const overall = Math.round(
    SCORE_DIMENSIONS.reduce((sum, { key }) => sum + dims[key], 0) /
      SCORE_DIMENSIONS.length
  );

  return { overall, ...dims, rationale, modelUsed };
}

export interface DealScoringInput {
  companyName: string;
  sector: string;
  stage?: string;
  investRound?: string;
  investAmount?: number;
  valuation?: number;
  /** 생성된 보고서 섹션 본문 (있으면 문서 원문보다 우선 사용) */
  reportContent?: string;
  /** 보고서가 없을 때 문서 원문으로 대체 */
  documentsText?: string;
}

/**
 * API 키 없는 데모 모드에서 쓰는 결정론적 가짜 점수.
 *
 * generateText()가 데모 모드에서 반환하는 mock 콘텐츠는 보고서 섹션용
 * 마크다운이라 이 파일의 JSON 파서로는 읽을 수 없다(파싱 실패 → 전부 0점).
 * 그러면 데모 체험이 "항상 0점"으로 보여 제품이 고장난 것처럼 보이므로,
 * 회사명 기반 해시로 매번 같은 값이 나오는 그럴듯한 점수를 대신 낸다.
 */
export function demoScore(input: DealScoringInput): DealScoreResult {
  let hash = 0;
  for (const ch of input.companyName + input.sector) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  const dims = {} as Record<ScoreDimensionKey, number>;
  const rationale = {} as Record<ScoreDimensionKey, string>;
  SCORE_DIMENSIONS.forEach(({ key }, i) => {
    hash = (hash * 1103515245 + 12345 + i) >>> 0;
    dims[key] = 40 + (hash % 51); // 40~90
    rationale[key] = "데모 모드 — 실제 API 키 연결 시 AI가 근거와 함께 평가합니다";
  });
  const overall = Math.round(
    SCORE_DIMENSIONS.reduce((sum, { key }) => sum + dims[key], 0) /
      SCORE_DIMENSIONS.length
  );
  return { overall, ...dims, rationale, modelUsed: "demo-mock" };
}

/**
 * 동일 섹터/스테이지 벤치마크.
 *
 * 외부 벤치마크 DB나 유료 API 없이, 이 계정(본인+팀 공유)이 실제로 채점한
 * 같은 섹터/스테이지 딜들과만 비교한다. 비교 대상이 적으면(3건 미만)
 * percentile이 통계적으로 의미가 없으므로, 가짜 백분위나 "시장 평균"을
 * 만들지 않고 데이터 부족을 명시한다.
 */
const MIN_BENCHMARK_SAMPLE = 3;

export interface SectorStageBenchmark {
  status: "ok" | "insufficient_data";
  comparableCount: number;
  minRequired: number;
  /** 이 딜의 overall이 비교군에서 몇 %ile인지(0~100, 낮을수록 하위) */
  percentile?: number;
  sectorStageAverage?: number;
}

export function computeSectorStageBenchmark(
  thisOverall: number,
  comparableOveralls: number[]
): SectorStageBenchmark {
  if (comparableOveralls.length < MIN_BENCHMARK_SAMPLE) {
    return {
      status: "insufficient_data",
      comparableCount: comparableOveralls.length,
      minRequired: MIN_BENCHMARK_SAMPLE,
    };
  }
  const below = comparableOveralls.filter((s) => s < thisOverall).length;
  const percentile = Math.round((below / comparableOveralls.length) * 100);
  const sectorStageAverage = Math.round(
    comparableOveralls.reduce((a, b) => a + b, 0) / comparableOveralls.length
  );
  return {
    status: "ok",
    comparableCount: comparableOveralls.length,
    minRequired: MIN_BENCHMARK_SAMPLE,
    percentile,
    sectorStageAverage,
  };
}

/** 딜 목록 화면 등에서 재사용하는 표시용 헬퍼 */
export function scoreLabel(overall: number): { label: string; tone: string } {
  if (overall >= 75) return { label: "매력적", tone: "bg-green-50 text-green-700 border-green-200" };
  if (overall >= 55) return { label: "검토 가능", tone: "bg-blue-50 text-blue-700 border-blue-200" };
  if (overall >= 35) return { label: "보완 필요", tone: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: "리스크 높음", tone: "bg-red-50 text-red-700 border-red-200" };
}
