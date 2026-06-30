import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AgentType, ReportStatus } from "@prisma/client";
import { MODEL } from "@/lib/claude";
import { getAgent, inferAgentType } from "@/agents";
import { SECTION_META } from "@/types";
import {
  initProgress,
  updateProgress,
  completeProgress,
  errorProgress,
} from "@/lib/generation-progress";

const createReportSchema = z.object({
  agentType: z.nativeEnum(AgentType).optional(),
  additionalContext: z.string().optional(),
  templateId: z.string().optional(),
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
        select: { name: true, parsedText: true },
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
        ...(validated.templateId ? { templateId: validated.templateId } : {}),
      },
    });

    // Generate sections using AI (async - don't await to return immediately)
    generateSectionsAsync(report.id, deal, agentType, validated.additionalContext, session.user.id);

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

async function generateSectionsAsync(
  reportId: string,
  deal: {
    id: string;
    companyName: string;
    sector: import("@prisma/client").DealSector;
    investRound: string | null;
    investAmount: number | null;
    valuation: number | null;
    documents: Array<{ name: string; parsedText: string | null }>;
  },
  agentType: AgentType,
  additionalContext?: string,
  userId?: string
) {
  const total = SECTION_META.length;
  initProgress(reportId, total);

  try {
    const agent = getAgent(agentType, deal.sector);
    const results = [];
    const sectionKeys = SECTION_META.map((s) => s.key);

    for (let i = 0; i < sectionKeys.length; i++) {
      const sectionKey = sectionKeys[i];
      const meta = SECTION_META.find((m) => m.key === sectionKey)!;
      updateProgress(reportId, i, meta.title);

      const result = await agent.generateSection(
        {
          dealId: deal.id,
          companyName: deal.companyName,
          sector: deal.sector,
          agentType,
          investRound: deal.investRound ?? undefined,
          investAmount: deal.investAmount ?? undefined,
          valuation: deal.valuation ?? undefined,
          documents: deal.documents,
          additionalContext,
        },
        sectionKey
      );
      results.push(result);

      // 사용량 로그 저장 (백그라운드)
      if (userId && result.tokensUsed > 0) {
        prisma.usageLog.create({
          data: {
            userId,
            dealId: deal.id,
            reportId,
            agentType,
            sectionKey: result.sectionKey,
            model: MODEL,
            inputTokens: Math.round(result.tokensUsed * 0.7),
            outputTokens: Math.round(result.tokensUsed * 0.3),
            totalTokens: result.tokensUsed,
          },
        }).catch(() => {}); // 로그 실패가 생성 실패로 이어지지 않도록

      }

      // 섹션 간 짧은 지연: Gemini 10 RPM 한도 초과 방지
      // DeepSeek 등 유료 모델은 rate limit이 높아 지연 불필요하지만, 안전을 위해 유지
      if (i < sectionKeys.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    // Save all sections
    await prisma.reportSection.createMany({
      data: results.map((result) => {
        const meta = SECTION_META.find((m) => m.key === result.sectionKey)!;
        return {
          reportId,
          sectionKey: result.sectionKey,
          title: meta.title,
          content: result.content,
          order: meta.order,
        };
      }),
    });

    await prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.DRAFT, generatedAt: new Date() },
    });

    completeProgress(reportId);
  } catch (error) {
    console.error("Section generation error:", error);
    errorProgress(reportId, String(error));
    await prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.PENDING },
    });
  }
}
