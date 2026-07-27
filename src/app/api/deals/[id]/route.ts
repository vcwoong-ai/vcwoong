import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DealSector, DealStage, DealStatus } from "@prisma/client";
import { getAccessScope, ownedOrShared } from "@/lib/team";

const updateDealSchema = z.object({
  name: z.string().min(1).optional(),
  companyName: z.string().min(1).optional(),
  sector: z.nativeEnum(DealSector).optional(),
  stage: z.nativeEnum(DealStage).optional(),
  status: z.nativeEnum(DealStatus).optional(),
  description: z.string().optional(),
  investAmount: z.number().positive().optional(),
  investRound: z.string().optional(),
  valuation: z.number().positive().optional(),
  /** 팀 공유 토글 — 소유자만 바꿀 수 있다 */
  shared: z.boolean().optional(),
});

async function getAuthorizedDeal(dealId: string, userId: string) {
  const scope = await getAccessScope(userId);
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, ...ownedOrShared(scope) },
    include: {
      documents: true,
      reports: {
        include: { sections: { orderBy: { order: "asc" } } },
      },
    },
  });
  return deal;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const deal = await getAuthorizedDeal(params.id, session.user.id);
  if (!deal) {
    return NextResponse.json({ error: "딜을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json({ data: deal });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const scope = await getAccessScope(session.user.id);
  const deal = await prisma.deal.findFirst({
    where: { id: params.id, ...ownedOrShared(scope) },
  });
  if (!deal) {
    return NextResponse.json({ error: "딜을 찾을 수 없습니다" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { shared, ...validated } = updateDealSchema.parse(body);

    if (shared !== undefined && deal.userId !== session.user.id) {
      return NextResponse.json(
        { error: "딜 소유자만 공유 설정을 바꿀 수 있습니다" },
        { status: 403 }
      );
    }
    if (shared === true && !scope.teamId) {
      return NextResponse.json(
        { error: "먼저 팀을 만들거나 팀에 합류하세요" },
        { status: 400 }
      );
    }

    const updated = await prisma.deal.update({
      where: { id: params.id },
      data: {
        ...validated,
        ...(shared === undefined ? {} : { teamId: shared ? scope.teamId : null }),
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Deal update error:", error);
    return NextResponse.json(
      { error: "딜 수정 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

  await prisma.deal.delete({ where: { id: params.id } });
  return NextResponse.json({ message: "딜이 삭제되었습니다" });
}
