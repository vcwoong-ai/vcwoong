import { callClaudeJSON } from "./claude";

export interface StructuredData {
  companyInfo: {
    name?: string;
    foundedYear?: string;
    ceo?: string;
    address?: string;
    website?: string;
    employeeCount?: number;
  };
  business: {
    summary?: string;
    products?: string[];
    targetMarket?: string;
    revenueModel?: string;
  };
  market: {
    tam?: string;
    sam?: string;
    som?: string;
    competitors?: string[];
    marketSize?: string;
  };
  financials: {
    revenue?: { year: string; amount: string }[];
    expenses?: string;
    burnRate?: string;
    runway?: string;
    fundingHistory?: { round: string; amount: string; date: string }[];
  };
  team: {
    members?: { name: string; role: string; background?: string }[];
    totalCount?: number;
  };
  ask: {
    amount?: string;
    valuation?: string;
    purpose?: string;
  };
}

const SYSTEM = `당신은 한국 VC 심사역을 돕는 정보 추출 AI입니다.
주어진 IR 자료에서 회사 정보를 추출해 구조화된 JSON으로 반환합니다.
확인되지 않은 정보는 해당 필드를 생략하고, 절대 추측하지 마세요.`;

export async function structurizeDocument(
  rawText: string
): Promise<{ data: StructuredData; inputTokens: number; outputTokens: number }> {
  return callClaudeJSON<StructuredData>({
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `다음 IR 자료에서 정보를 추출하세요:\n\n${rawText.slice(0, 30000)}\n\n응답 형식 (JSON):\n{\n  "companyInfo": { "name": "...", "foundedYear": "...", "ceo": "...", "address": "...", "website": "...", "employeeCount": 0 },\n  "business": { "summary": "...", "products": ["..."], "targetMarket": "...", "revenueModel": "..." },\n  "market": { "tam": "...", "sam": "...", "som": "...", "competitors": ["..."], "marketSize": "..." },\n  "financials": { "revenue": [{ "year": "2023", "amount": "10억원" }], "burnRate": "...", "runway": "...", "fundingHistory": [{ "round": "Pre-A", "amount": "5억원", "date": "2023.03" }] },\n  "team": { "members": [{ "name": "...", "role": "대표", "background": "..." }], "totalCount": 0 },\n  "ask": { "amount": "...", "valuation": "...", "purpose": "..." }\n}\n\n규칙: 확인 안 된 필드는 생략, 금액은 원본 표기 그대로, 절대 추측하지 말 것`,
      },
    ],
    maxTokens: 4096,
    temperature: 0.1,
  });
}
