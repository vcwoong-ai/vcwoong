import { callClaudeJSON } from "@/lib/claude";
import type { StructuredData } from "@/lib/structurize";

export interface CoreAnalysisResult {
  sectionId: string;
  content: Record<string, unknown>;
  confidence: number;
  missingFields: string[];
  warnings: string[];
}

async function analyzeWithClaude<T>(
  sectionId: string,
  system: string,
  userContent: string,
  fallback: T
): Promise<CoreAnalysisResult> {
  try {
    const { data } = await callClaudeJSON<{
      result: T;
      confidence: number;
      missingFields: string[];
      warnings: string[];
    }>({
      system,
      messages: [{ role: "user", content: userContent }],
      maxTokens: 2048,
      temperature: 0.2,
    });
    return {
      sectionId,
      content: data.result as Record<string, unknown>,
      confidence: data.confidence ?? 0.5,
      missingFields: data.missingFields ?? [],
      warnings: data.warnings ?? [],
    };
  } catch {
    return {
      sectionId,
      content: fallback as Record<string, unknown>,
      confidence: 0,
      missingFields: [],
      warnings: ["분석 실패 - AI 응답 오류"],
    };
  }
}

export async function analyzeCompanyInfo(
  data: StructuredData
): Promise<CoreAnalysisResult> {
  return analyzeWithClaude(
    "company-info",
    "당신은 한국 VC 심사역입니다. 회사 기본 정보를 분석합니다.",
    `다음 회사 정보를 분석하고 요약하세요:\n${JSON.stringify(data.companyInfo)}\n사업 개요: ${data.business?.summary ?? ""}\n\nJSON:\n{ "result": { "summary": "...", "stage": "...", "keyStrengths": ["..."] }, "confidence": 0.8, "missingFields": ["..."], "warnings": ["..."] }`,
    {}
  );
}

export async function analyzeTeam(
  data: StructuredData
): Promise<CoreAnalysisResult> {
  return analyzeWithClaude(
    "team-analysis",
    "당신은 한국 VC 심사역입니다. 창업팀을 평가합니다.",
    `팀 정보를 분석하세요:\n${JSON.stringify(data.team)}\n\n평가 항목: 도메인 전문성, 실행력, 팀 완성도\n\nJSON:\n{ "result": { "domainFit": "...", "executionCapability": "...", "teamCompleteness": "...", "keyRisk": "..." }, "confidence": 0.8, "missingFields": [], "warnings": [] }`,
    {}
  );
}

export async function analyzeFinancials(
  data: StructuredData
): Promise<CoreAnalysisResult> {
  return analyzeWithClaude(
    "financials",
    "당신은 한국 VC 심사역입니다. 재무 현황을 분석합니다.",
    `재무 정보를 분석하세요:\n${JSON.stringify(data.financials)}\n투자 조건: ${JSON.stringify(data.ask)}\n\nJSON:\n{ "result": { "revenueGrowth": "...", "burnRate": "...", "runway": "...", "fundingHistory": "...", "financialHealth": "양호/보통/위험" }, "confidence": 0.8, "missingFields": [], "warnings": [] }`,
    {}
  );
}

export async function analyzeRisks(
  data: StructuredData
): Promise<CoreAnalysisResult> {
  return analyzeWithClaude(
    "risks",
    "당신은 한국 VC 심사역입니다. 투자 리스크를 식별하고 평가합니다.",
    `다음 정보를 바탕으로 5대 리스크를 도출하세요:\n${JSON.stringify({ business: data.business, market: data.market, financials: data.financials })}\n\nJSON:\n{ "result": { "marketRisk": { "level": "상/중/하", "description": "..." }, "teamRisk": { "level": "상/중/하", "description": "..." }, "financialRisk": { "level": "상/중/하", "description": "..." }, "competitionRisk": { "level": "상/중/하", "description": "..." }, "regulatoryRisk": { "level": "상/중/하", "description": "..." } }, "confidence": 0.8, "missingFields": [], "warnings": [] }`,
    {}
  );
}
