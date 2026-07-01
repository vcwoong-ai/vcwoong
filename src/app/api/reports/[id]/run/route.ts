import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AgentType } from "@prisma/client";
import { structurizeDocument } from "@/lib/structurize";
import { detectSectors } from "@/agents/orchestrator/sector-detector";
import { runBioAnalysis } from "@/agents/sectors/bio";
import { runITAnalysis } from "@/agents/sectors/it-saas";
import { runDeepTechAnalysis } from "@/agents/sectors/deeptech";
import { runManufacturingAnalysis } from "@/agents/sectors/manufacturing";
import { runContentAnalysis } from "@/agents/sectors/content";
import { runFintechAnalysis } from "@/agents/sectors/fintech";
import { callClaudeJSON } from "@/lib/claude";
import type { StructuredData } from "@/lib/structurize";

type SectionKey =
  | "INVESTMENT_OVERVIEW"
  | "COMPANY_OVERVIEW"
  | "PRODUCT_TECHNOLOGY"
  | "MARKET_ANALYSIS"
  | "FINANCIAL_STATUS"
  | "VALUATION"
  | "RISK_ANALYSIS"
  | "INVESTMENT_TERMS"
  | "OPINION_SUMMARY"
  | "APPENDIX";

const SECTION_TITLES: Record<SectionKey, string> = {
  INVESTMENT_OVERVIEW: "투자개요",
  COMPANY_OVERVIEW: "회사개요",
  PRODUCT_TECHNOLOGY: "제품/기술",
  MARKET_ANALYSIS: "시장분석",
  FINANCIAL_STATUS: "재무현황",
  VALUATION: "밸류에이션",
  RISK_ANALYSIS: "리스크분석",
  INVESTMENT_TERMS: "투자조건",
  OPINION_SUMMARY: "의견종합",
  APPENDIX: "별첨",
};

async function runSectorAnalysis(sector: string, structured: StructuredData, documentContext: string, companyName: string) {
  switch (sector) {
    case "BIO":
      return runBioAnalysis(documentContext, companyName);
    case "IT":
      return runITAnalysis(structured);
    case "DEEPTECH":
      return runDeepTechAnalysis(structured);
    case "GENERAL":
      return runManufacturingAnalysis(structured);
    case "CONSUMER":
      return runContentAnalysis(structured);
    case "FINTECH":
      return runFintechAnalysis(structured);
    default:
      return runITAnalysis(structured);
  }
}

// Map agent analysis results to 10 report sections
async function buildSections(
  structured: StructuredData,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agentResult: any,
  sector: string,
  deal: { name: string; companyName: string; investAmount?: number | null; investRound?: string | null; valuation?: number | null }
): Promise<Record<SectionKey, string>> {
  const analysis = agentResult.analysis ?? {};

  const { data: sections } = await callClaudeJSON<Record<SectionKey, string>>({
    system: `당신은 한국 VC 투자심사보고서 작성 전문가입니다. 에이전트 분석 결과를 바탕으로 투자심사보고서의 각 섹션을 작성합니다.
한국어로 작성하며, 각 섹션은 전문적이고 구체적인 내용을 담아야 합니다. 수치와 근거를 명확히 제시하세요.`,
    messages: [
      {
        role: "user",
        content: `다음 분석 결과를 바탕으로 투자심사보고서 섹션을 작성하세요.

딜 정보:
- 회사명: ${deal.companyName}
- 딜명: ${deal.name}
- 투자금액: ${deal.investAmount ? `${deal.investAmount}억원` : "미정"}
- 투자라운드: ${deal.investRound ?? "미정"}
- 기업가치: ${deal.valuation ? `${deal.valuation}억원` : "미정"}
- 섹터: ${sector}

구조화 데이터:
${JSON.stringify(structured, null, 2)}

에이전트 분석:
${JSON.stringify(analysis, null, 2)}

각 섹션을 작성하세요 (각 섹션 300-600자):

{
  "INVESTMENT_OVERVIEW": "투자개요 — 투자금액, 라운드, 기업가치, 투자 목적, 주요 조건 요약",
  "COMPANY_OVERVIEW": "회사개요 — 설립연도, 대표자, 사업 요약, 팀 구성, 주요 성과",
  "PRODUCT_TECHNOLOGY": "제품/기술 — 핵심 제품/서비스, 기술적 차별점, 특허/IP 현황",
  "MARKET_ANALYSIS": "시장분석 — TAM/SAM/SOM, 시장 트렌드, 경쟁 구도",
  "FINANCIAL_STATUS": "재무현황 — 매출, 비용, 번레이트, 런웨이, 과거 펀딩 이력",
  "VALUATION": "밸류에이션 — 밸류에이션 근거, 비교 사례, 적정성 평가",
  "RISK_ANALYSIS": "리스크분석 — 주요 리스크 항목별 분석 및 완화 방안",
  "INVESTMENT_TERMS": "투자조건 — 투자 구조, 주요 계약 조건, 우선권 등",
  "OPINION_SUMMARY": "의견종합 — 투자 의견, 핵심 투자 포인트, 조건부 사항",
  "APPENDIX": "별첨 — 참고 자료, 추가 분석, 창업자 질문 리스트"
}`,
      },
    ],
    maxTokens: 6000,
    tier: "premium",
  });

  return sections;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // Find report with deal and documents
  const report = await prisma.report.findFirst({
    where: { id: params.id, deal: { userId: session.user.id } },
    include: {
      deal: {
        include: { documents: true },
      },
    },
  });

  if (!report) {
    return NextResponse.json({ error: "보고서를 찾을 수 없습니다" }, { status: 404 });
  }

  if (report.status === "GENERATING") {
    return NextResponse.json({ error: "이미 생성 중입니다" }, { status: 409 });
  }

  // Check documents before marking as generating
  const documents = report.deal.documents;
  const rawText = documents
    .map((d: { parsedText: string | null }) => d.parsedText ?? "")
    .filter(Boolean)
    .join("\n\n---\n\n");

  if (!rawText && documents.length === 0) {
    return NextResponse.json({ error: "분석할 문서가 없습니다. 먼저 파일을 업로드해주세요." }, { status: 400 });
  }

  // Mark as generating
  await prisma.report.update({
    where: { id: params.id },
    data: { status: "GENERATING" },
  });

  try {

    // Use deal description as fallback if no documents
    const textForAnalysis = rawText || `회사명: ${report.deal.companyName}\n설명: ${report.deal.description ?? ""}`;

    // Structurize document text
    const { data: structured } = await structurizeDocument(textForAnalysis);

    // Detect sector
    const sectorDetection = await detectSectors(structured, textForAnalysis);
    const sector = report.deal.sector ?? sectorDetection.primary;

    // Run sector-specific agent analysis
    const agentResult = await runSectorAnalysis(sector, structured, textForAnalysis, report.deal.companyName);

    // Build 10 report sections
    const sectionContents = await buildSections(structured, agentResult, sector, report.deal);

    // Delete existing sections if re-running
    await prisma.reportSection.deleteMany({ where: { reportId: params.id } });

    // Save sections to DB
    const sectionKeys = Object.keys(SECTION_TITLES) as SectionKey[];
    for (let i = 0; i < sectionKeys.length; i++) {
      const key = sectionKeys[i];
      await prisma.reportSection.create({
        data: {
          reportId: params.id,
          sectionKey: key,
          title: SECTION_TITLES[key],
          content: sectionContents[key] ?? `${SECTION_TITLES[key]} 내용을 생성 중입니다.`,
          order: i + 1,
          status: "DRAFT",
        },
      });
    }

    // Mark report as DRAFT (complete)
    await prisma.report.update({
      where: { id: params.id },
      data: {
        status: "DRAFT",
        generatedAt: new Date(),
        agentType: mapSectorToAgentType(sector) as AgentType,
      },
    });

    // Return the updated report with sections
    const updatedReport = await prisma.report.findFirst({
      where: { id: params.id },
      include: { sections: { orderBy: { order: "asc" } }, deal: true },
    });

    return NextResponse.json({ data: updatedReport });
  } catch (error) {
    console.error("Report generation error:", error);
    await prisma.report.update({
      where: { id: params.id },
      data: { status: "DRAFT" },
    });
    return NextResponse.json({ error: "보고서 생성 중 오류가 발생했습니다" }, { status: 500 });
  }
}

function mapSectorToAgentType(sector: string): string {
  const map: Record<string, string> = {
    BIO: "BIO",
    IT: "IT",
    DEEPTECH: "DEEPTECH",
    GENERAL: "GENERAL",
    CONSUMER: "CONSUMER",
    FINTECH: "FINTECH",
    CLIMATE: "CLIMATE",
  };
  return map[sector] ?? "GENERAL";
}
