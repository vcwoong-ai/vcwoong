import { callClaudeJSON } from "@/lib/claude";
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
      .map((e) => ({
        slide: s.slideNum,
        id: e.id,
        pos: e.position,
        text: (e.textContent ?? "").slice(0, 100),
      }))
  );

  if (textBoxes.length === 0) return [];

  const { data } = await callClaudeJSON<{ mappings: FieldMapping[] }>({
    system: `당신은 투자심사보고서 PPT 양식 분석 전문가입니다. 텍스트 박스의 내용과 위치를 보고 어떤 보고서 필드에 해당하는지 추론합니다.`,
    messages: [
      {
        role: "user",
        content: `다음 PPT 텍스트 박스들의 보고서 필드를 매핑하세요:

${textBoxes.map((tb) => `슬라이드 ${tb.slide}, ID:${tb.id}, 위치:(${tb.pos.x},${tb.pos.y},w=${tb.pos.w},h=${tb.pos.h}), 내용:"${tb.text}"`).join("\n")}

가능한 필드:
- 섹션 company_overview: company_name, founded_year, business_summary, investment_amount, ceo_name
- 섹션 investment_points: point_1, point_2, point_3
- 섹션 market_analysis: tam, sam, som, market_description, competitors
- 섹션 financials: revenue_current, revenue_growth, burn_rate, runway
- 섹션 risk_analysis: risk_1, risk_2, risk_3, mitigation
- 섹션 recommendation: opinion, valuation_opinion, conditions
- 섹션 meta: report_title, report_date, reviewer_name
- 섹션 skip: 장식, 페이지 번호, 배경 텍스트

JSON:
{ "mappings": [{ "slideNum": 1, "elementId": "...", "originalText": "...", "position": { "x": 0, "y": 0, "w": 0, "h": 0 }, "mappedField": "company_name", "mappedSection": "company_overview", "confidence": 0.95 }] }`,
      },
    ],
    maxTokens: 4096,
    temperature: 0.1,
  });

  return data.mappings ?? [];
}
