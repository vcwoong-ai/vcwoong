import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { PortfolioStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  currentValuation: z.number().positive().nullable().optional(),
  realizedAmount: z.number().min(0).optional(),
  status: z.nativeEnum(PortfolioStatus).optional(),
  ownershipPercent: z.number().min(0).max(100).optional(),
  notes: z.string().max(2000).nullable().optional(),
  fundId: z.string().nullable().optional(),
});

async function requireOwned(reqUserId: string, id: string) {
  return prisma.portfolioCompany.findFirst({
    where: { id, userId: reqUserId },
    select: { id: true },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const company = await prisma.portfolioCompany.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      kpis: { orderBy: { period: "asc" } },
      milestones: { orderBy: { dueDate: "asc" } },
      updates: { orderBy: { period: "desc" } },
      fund: { select: { id: true, name: true } },
      deal: { select: { id: true, name: true } },
    },
  });

  if (!company) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json({ data: company });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const owned = await requireOwned(session.user.id, params.id);
  if (!owned) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }

  const parsed = updateSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력 데이터가 올바르지 않습니다" },
      { status: 400 }
    );
  }

  if (parsed.data.fundId) {
    const fund = await prisma.fund.findFirst({
      where: { id: parsed.data.fundId, userId: session.user.id },
      select: { id: true },
    });
    if (!fund) {
      return NextResponse.json({ error: "펀드를 찾을 수 없습니다" }, { status: 404 });
    }
  }

  const company = await prisma.portfolioCompany.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return NextResponse.json({ data: company });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const owned = await requireOwned(session.user.id, params.id);
  if (!owned) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.portfolioCompany.delete({ where: { id: params.id } });
  return NextResponse.json({ data: { id: params.id } });
}
