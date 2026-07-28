import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { InboundStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { screenInboundDeal } from "@/lib/sourcing";
import {
  getUserTeamContext,
  inboundWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

/** AI 1차 스크리닝 점수 산출 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const lead = await prisma.inboundDeal.findFirst({
    where: {
      id: params.id,
      ...inboundWriteWhere(session.user.id, teamId, role),
    },
  });
  if (!lead) {
    return NextResponse.json(
      { error: permissionDeniedMessage("edit") },
      { status: 403 }
    );
  }

  try {
    const result = await screenInboundDeal({
      companyName: lead.companyName,
      sector: lead.sector,
      summary: lead.summary,
      rawText: lead.rawText,
    });

    const updated = await prisma.inboundDeal.update({
      where: { id: lead.id },
      data: {
        screeningScore: result.score,
        screeningNotes: result.notes,
        sector: result.suggestedSector,
        status:
          lead.status === InboundStatus.NEW
            ? result.score >= 70
              ? InboundStatus.QUALIFIED
              : InboundStatus.REVIEWING
            : lead.status,
      },
    });

    return NextResponse.json({
      data: { lead: updated, modelUsed: result.modelUsed },
    });
  } catch (error) {
    console.error("Screening error:", error);
    return NextResponse.json(
      { error: "스크리닝 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
