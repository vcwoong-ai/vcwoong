import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AgentType, ReportStatus } from "@prisma/client";
import { inferAgentType } from "@/agents";
import { SECTION_META } from "@/types";
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

const createReportSchema = z.object({
  agentType: z.nativeEnum(AgentType).optional(),
  additionalContext: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const deal = await prisma.deal.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!deal) {
    return NextResponse.json({ error: "딜을 찾을 수 없습니다" }, { status: 404 });
  }

  const reports = await prisma.report.findMany({
    where: { dealId: params.id },
    include: {
      sections: { orderBy: { order: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: reports });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const deal = await prisma.deal.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      documents: {
        select: { name: true, parsedText: true, id: true },
      },
    },
  });
  if (!deal) {
    return NextResponse.json({ error: "딜을 찾을 수 없습니다" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const validated = createReportSchema.parse(body);

    const agentType = validated.agentType ?? inferAgentType(deal.sector);

    // Create report record
    const report = await prisma.report.create({
      data: {
        dealId: params.id,
        title: `${deal.companyName} 투자심의보고서`,
        agentType,
        status: ReportStatus.GENERATING,
      },
    });

    // Generate sections using AI (async - don't await to return immediately)
    generateSectionsAsync(report.id, deal, agentType, validated.additionalContext);

    return NextResponse.json({ data: report }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Report creation error:", error);
    return NextResponse.json(
      { error: "보고서 생성 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

const SECTION_TITLES: Record<string, string> = {
  INVESTMENT_OVERVIEW: "투자개요", COMPANY_OVERVIEW: "회사개요",
  PRODUCT_TECHNOLOGY: "제품/기술", MARKET_ANALYSIS: "시장분석",
  FINANCIAL_STATUS: "재무현황", VALUATION: "밸류에이션",
  RISK_ANALYSIS: "리스크분석", INVESTMENT_TERMS: "투자조건",
  OPINION_SUMMARY: "의견종합", APPENDIX: "별첨",
};

async function runSectorAgent(sector: string, structured: StructuredData) {
  switch (sector) {
    case "BIO": return runBioAnalysis(structured);
    case "IT": return runITAnalysis(structured);
    case "DEEPTECH": return runDeepTechAnalysis(structured);
    case "GENERAL": return runManufacturingAnalysis(structured);
    case "CONSUMER": return runContentAnalysis(structured);
    case "FINTECH": return runFintechAnalysis(structured);
    default: return runITAnalysis(structured);
  }
}

async function generateSectionsAsync(
  reportId: string,
  deal: {
    id: string;
    companyName: string;
    name: string;
    sector: import("@prisma/client").DealSector;
    investRound: string | null;
    investAmount: number | null;
    valuation: number | null;
    documents: Array<{ name: string; parsedText: string | null }>;
  },
  _agentType: AgentType,
  _additionalContext?: string
) {
  try {
    const rawText = deal.documents
      .map((d) => d.parsedText ?? "")
      .filter(Boolean)
      .join("\n\n---\n\n");

    const textForAnalysis = rawText || `회사명: ${deal.companyName}\n딜명: ${deal.name}`;
    const { data: structured } = await structurizeDocument(textForAnalysis);
    const sectorDetection = await detectSectors(structured, textForAnalysis);
    const sector = (deal.sector as string) || sectorDetection.primary;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentResult: any = await runSectorAgent(sector, structured);

    // Map agent results to 10 sections via AI
    const sectionKeys = Object.keys(SECTION_TITLES);
    const { data: sectionContents } = await callClaudeJSON<Record<string, string>>({
      system: "당신은 한국 VC 투자심사보고서 작성 전문가입니다. 에이전트 분석 결과를 바탕으로 각 섹션을 한국어로 작성합니다.",
      messages: [{
        role: "user",
        content: `다음 분석 결과로 투자심사보고서 10개 섹션을 작성하세요.

회사: ${deal.companyName} | 섹터: ${sector} | 라운드: ${deal.investRound ?? "미정"} | 투자금액: ${deal.investAmount ?? "미정"}억 | 밸류: ${deal.valuation ?? "미정"}억

구조화 데이터: ${JSON.stringify(structured)}
에이전트 분석: ${JSON.stringify(agentResult.analysis ?? {})}

JSON 응답 (각 섹션 300-500자):
{
  "INVESTMENT_OVERVIEW": "투자개요",
  "COMPANY_OVERVIEW": "회사개요",
  "PRODUCT_TECHNOLOGY": "제품/기술",
  "MARKET_ANALYSIS": "시장분석",
  "FINANCIAL_STATUS": "재무현황",
  "VALUATION": "밸류에이션",
  "RISK_ANALYSIS": "리스크분석",
  "INVESTMENT_TERMS": "투자조건",
  "OPINION_SUMMARY": "의견종합",
  "APPENDIX": "별첨"
}`,
      }],
      maxTokens: 6000,
      tier: "premium",
    });

    await prisma.reportSection.deleteMany({ where: { reportId } });
    for (let i = 0; i < sectionKeys.length; i++) {
      const key = sectionKeys[i];
      const meta = SECTION_META.find((m) => m.key === key);
      await prisma.reportSection.create({
        data: {
          reportId,
          sectionKey: key as import("@prisma/client").SectionKey,
          title: SECTION_TITLES[key],
          content: sectionContents[key] ?? `${SECTION_TITLES[key]} 내용 생성 중`,
          order: meta?.order ?? i + 1,
        },
      });
    }

    await prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.DRAFT, generatedAt: new Date(), agentType: sector as AgentType },
    });
  } catch (error) {
    console.error("Section generation error:", error);
    await prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.PENDING },
    });
  }
}
