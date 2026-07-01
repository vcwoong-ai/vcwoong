import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AgentType, ReportStatus } from "@prisma/client";
import { inferAgentType } from "@/agents";
import { generateSectionsAsync } from "@/lib/report-generation";

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
