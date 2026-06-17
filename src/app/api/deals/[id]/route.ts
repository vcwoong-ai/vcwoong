import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DealSector, DealStage, DealStatus } from "@prisma/client";

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
});

async function getAuthorizedDeal(dealId: string, userId: string) {
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId },
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

  const deal = await prisma.deal.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!deal) {
    return NextResponse.json({ error: "딜을 찾을 수 없습니다" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const validated = updateDealSchema.parse(body);

    const updated = await prisma.deal.update({
      where: { id: params.id },
      data: validated,
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
