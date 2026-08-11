/**
 * 딜 스코어링 — 투자 매력도 점수.
 *
 * `report-quality.ts`와 헷갈리기 쉬워 구분해둔다:
 *   - report-quality.ts: 보고서가 잘 "쓰였는지" (분량·출처·구조) — 작문 품질
 *   - 이 파일: 딜 자체가 투자할 만한지 — 시장성·팀·제품·사업모델·재무·경쟁우위
 *     6개 차원 점수 + 레이더 비교. 회사가 아니라 "투자 판단"을 평가한다.
 *
 * AI 판단이 필요한 영역(시장 크기가 큰지, 팀이 강한지)이라 report-quality처럼
 * 정규식만으로 계산할 수 없다. AI가 구조화된 JSON을 내도록 요청하고,
 * 응답이 스펙을 벗어나면(범위 밖 숫자, 필드 누락) 서버에서 clamp·보정한다.
 */
import { generateText, isAIConfigured } from "@/lib/claude";

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

function buildPrompt(input: DealScoringInput): string {
  const facts = [
    `기업: ${input.companyName}`,
    `섹터: ${input.sector}`,
    input.stage ? `단계: ${input.stage}` : "",
    input.investRound ? `라운드: ${input.investRound}` : "",
    input.investAmount != null ? `투자금액: ${input.investAmount}억원` : "",
    input.valuation != null ? `Post-money: ${input.valuation}억원` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const material = (input.reportContent || input.documentsText || "").slice(
    0,
    12000
  );

  const dimensionList = SCORE_DIMENSIONS.map(
    (d) => `- ${d.key} (${d.label}): ${d.desc}`
  ).join("\n");

  return `## 딜 정보
${facts}

## 근거 자료
${material || "제공된 자료 없음 — 이 경우 모든 점수를 40점 이하로, rationale에 '자료 부족'이라고 명시할 것"}

## 채점 기준 (0~100점, 6개 차원)
${dimensionList}

## 출력 형식 (JSON만 출력, 다른 텍스트 금지)
{
  "scores": { "marketSize": 0, "team": 0, "product": 0, "businessModel": 0, "financials": 0, "moat": 0 },
  "rationale": { "marketSize": "한 줄 근거", "team": "...", "product": "...", "businessModel": "...", "financials": "...", "moat": "..." }
}

규칙:
- 점수는 정수(0~100). 50점은 "판단 불가/평균"이 아니라 정말 평범한 딜에만 줄 것
- 자료에 없는 내용으로 임의로 후하게 주지 말 것 — 근거 없으면 낮은 점수 + rationale에 사유
- rationale은 각 60자 이내, 왜 그 점수인지 구체적 근거(수치·사실) 포함`;
}

const SYSTEM_PROMPT = `당신은 한국 VC의 투자심사 파트너입니다. 딜의 투자 매력도를 냉정하게 평가합니다.
후한 점수를 남발하지 않고, 근거가 부족하면 낮게 평가합니다. 반드시 JSON만 출력합니다.`;

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

export async function generateDealScore(
  input: DealScoringInput
): Promise<DealScoreResult> {
  if (!isAIConfigured()) return demoScore(input);

  const result = await generateText(
    [{ role: "user", content: buildPrompt(input) }],
    { systemPrompt: SYSTEM_PROMPT, maxTokens: 1024, temperature: 0.2 }
  );
  return parseScoreResponse(result.content, result.usedModel);
}

/** 딜 목록 화면 등에서 재사용하는 표시용 헬퍼 */
export function scoreLabel(overall: number): { label: string; tone: string } {
  if (overall >= 75) return { label: "매력적", tone: "bg-green-50 text-green-700 border-green-200" };
  if (overall >= 55) return { label: "검토 가능", tone: "bg-blue-50 text-blue-700 border-blue-200" };
  if (overall >= 35) return { label: "보완 필요", tone: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: "리스크 높음", tone: "bg-red-50 text-red-700 border-red-200" };
}
