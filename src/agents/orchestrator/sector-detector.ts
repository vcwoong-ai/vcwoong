import { callClaudeJSON } from "@/lib/claude";
import type { StructuredData } from "@/lib/structurize";

export type DealSectorStr = "BIO" | "IT" | "DEEPTECH" | "GENERAL" | "CONSUMER" | "FINTECH" | "CLIMATE";

const SECTOR_KEYWORDS: Record<string, string[]> = {
  BIO: ["임상", "신약", "바이오", "제약", "의약품", "FDA", "파이프라인", "치료제", "NDA", "IND", "항체", "백신", "헬스케어", "의료기기"],
  IT: ["SaaS", "구독", "MRR", "ARR", "API", "클라우드", "B2B", "CRM", "ERP", "소프트웨어", "PaaS", "Churn", "LTV"],
  DEEPTECH: ["AI", "인공지능", "LLM", "머신러닝", "딥러닝", "GPU", "Transformer", "파운데이션", "fine-tuning", "추론", "모델", "반도체", "소재"],
  GENERAL: ["제조", "공장", "양산", "하드웨어", "센서", "부품", "BOM", "품질", "GMP", "특허"],
  CONSUMER: ["콘텐츠", "웹툰", "게임", "엔터", "크리에이터", "IP", "미디어", "스트리밍", "구독자", "팬덤", "OTT", "이커머스"],
  FINTECH: ["핀테크", "금융", "결제", "대출", "보험", "투자", "자산관리", "마이데이터", "전자금융", "암호화폐", "블록체인"],
};

export interface SectorDetectionResult {
  primary: DealSectorStr;
  secondary: DealSectorStr[];
  confidence: number;
  reasoning: string;
}

export async function detectSectors(
  structured: StructuredData,
  rawText: string
): Promise<SectorDetectionResult> {
  const combinedText = (rawText + " " + JSON.stringify(structured)).toLowerCase();

  const scores: Record<string, number> = {};
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    scores[sector] = keywords.filter((kw) => combinedText.includes(kw.toLowerCase())).length;
  }

  const top3 = Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([s]) => s);

  const businessSummary = structured.business?.summary ?? "";
  const products = structured.business?.products?.join(", ") ?? "";

  const { data } = await callClaudeJSON<{
    primary: string;
    secondary: string[];
    confidence: number;
    reasoning: string;
  }>({
    system: "당신은 한국 스타트업 투자 전문가입니다. 주어진 정보를 바탕으로 스타트업을 정확히 분류합니다.",
    messages: [
      {
        role: "user",
        content: `다음 스타트업을 분류하세요.\n\n사업 요약: ${businessSummary}\n제품/서비스: ${products}\n키워드 기반 후보 섹터: ${top3.join(", ")}\n\n가능한 섹터: BIO, IT, DEEPTECH, GENERAL, CONSUMER, FINTECH, CLIMATE\n\nJSON으로 응답:\n{ "primary": "BIO", "secondary": ["DEEPTECH"], "confidence": 0.85, "reasoning": "..." }\n\n참고: 융합 산업(예: AI 신약개발)은 secondary에 추가. confidence는 0~1 범위.`,
      },
    ],
    maxTokens: 512,
    temperature: 0.1,
  });

  const toSectorStr = (s: string): DealSectorStr => {
    const valid: DealSectorStr[] = ["BIO", "IT", "DEEPTECH", "GENERAL", "CONSUMER", "FINTECH", "CLIMATE"];
    const upper = s.toUpperCase() as DealSectorStr;
    return valid.includes(upper) ? upper : "GENERAL";
  };

  return {
    primary: toSectorStr(data.primary),
    secondary: (data.secondary ?? []).map(toSectorStr),
    confidence: data.confidence ?? 0.5,
    reasoning: data.reasoning ?? "",
  };
}
