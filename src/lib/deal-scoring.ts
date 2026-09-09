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
 *
 * 상수·파서·데모 점수(AI 호출 없음)는 deal-scoring-shared.ts에 있다 — 클라이언트
 * 컴포넌트는 이 파일이 아니라 그 파일에서 바로 import해야 한다(자세한 이유는
 * 그 파일 상단 주석 참고). 이 파일은 재-export만 하므로 기존 서버 쪽 import는
 * 그대로 동작한다.
 */
import { generateText, isAIConfigured } from "@/lib/claude";
import {
  SCORE_DIMENSIONS,
  type DealScoreResult,
  type DealScoringInput,
  parseScoreResponse,
  demoScore,
} from "@/lib/deal-scoring-shared";

export {
  SCORE_DIMENSIONS,
  type ScoreDimensionKey,
  type DealScoreResult,
  type DealScoringInput,
  parseScoreResponse,
  demoScore,
  scoreLabel,
} from "@/lib/deal-scoring-shared";

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
