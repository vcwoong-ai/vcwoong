import { generateText } from "@/lib/claude";
import type { TemplateAnalysis } from "./pptx-analyzer";

export type FieldMapping = {
  slideNum: number;
  elementId: string;
  originalText: string;
  position: { x: number; y: number; w: number; h: number };
  mappedField: string;
  mappedSection: string;
  confidence: number;
};

export async function mapTemplateFields(
  analysis: TemplateAnalysis
): Promise<FieldMapping[]> {
  const textBoxes = analysis.slides.flatMap((s) =>
    s.elements
      .filter((e) => e.type === "text" && e.textContent?.trim())
      .map((e) => ({ slide: s.slideNum, element: e }))
  );

  if (textBoxes.length === 0) return [];

  const result = await generateText(
    [
      {
        role: "user",
        content: `다음 PPT 텍스트 박스들이 투자심사보고서의 어떤 필드인지 매핑하세요:

${textBoxes
  .map(
    (tb) =>
      `슬라이드 ${tb.slide}, ID:${tb.element.id}, 위치:(${tb.element.position.x},${tb.element.position.y}), 내용:"${tb.element.textContent?.slice(0, 100)}"`
  )
  .join("\n")}

가능한 필드:
- company_overview: company_name, founded_year, business_summary, investment_amount
- investment_points: point_1, point_2, point_3
- market_analysis: tam, sam, som, market_description
- financials: revenue_current, revenue_growth, burn_rate, runway
- risk_analysis: risk_1, risk_2, mitigation
- recommendation: opinion, valuation_opinion, conditions, reviewer_comment
- meta: title, date, reviewer
- skip: 장식/페이지 번호 등

JSON으로만 응답:
{ "mappings": [{ "slideNum": 1, "elementId": "...", "originalText": "...", "position": {"x":0,"y":0,"w":0,"h":0}, "mappedField": "company_name", "mappedSection": "company_overview", "confidence": 0.95 }] }`,
      },
    ],
    {
      systemPrompt: "당신은 PPT 양식 분석 전문가입니다. JSON만 출력하세요.",
      maxTokens: 4096,
    }
  );

  try {
    const parsed = JSON.parse(result.content);
    return parsed.mappings || [];
  } catch {
    return [];
  }
}
