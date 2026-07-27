import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { DealSector, DealStage, PortfolioStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/plan-gates";
import { calculatePortfolioMetrics } from "@/lib/portfolio";

const createSchema = z.object({
  companyName: z.string().min(1).max(120),
  sector: z.nativeEnum(DealSector),
  investedAt: z.string().datetime().or(z.string().min(8)),
  investAmount: z.number().positive(),
  ownershipPercent: z.number().min(0).max(100),
  entryValuation: z.number().positive(),
  currentValuation: z.number().positive().optional(),
  fundId: z.string().optional(),
  /// 심사 딜에서 승격하는 경우
  dealId: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const companies = await prisma.portfolioCompany.findMany({
    where: { userId: session.user.id },
    include: {
      kpis: true,
      milestones: { orderBy: { dueDate: "asc" } },
      updates: { orderBy: { period: "desc" }, take: 1 },
      fund: { select: { id: true, name: true } },
    },
    orderBy: { investedAt: "desc" },
  });

  return NextResponse.json({
    data: {
      companies,
      metrics: calculatePortfolioMetrics(companies),
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const locked = await requireFeature(session.user.id, "portfolio");
  if (locked) return locked;

  const parsed = createSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력 데이터가 올바르지 않습니다", details: parsed.error.issues },
      { status: 400 }
    );
  }
  const body = parsed.data;

  if (body.fundId) {
    const fund = await prisma.fund.findFirst({
      where: { id: body.fundId, userId: session.user.id },
      select: { id: true },
    });
    if (!fund) {
      return NextResponse.json({ error: "펀드를 찾을 수 없습니다" }, { status: 404 });
    }
  }

  if (body.dealId) {
    const deal = await prisma.deal.findFirst({
      where: { id: body.dealId, userId: session.user.id },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "딜을 찾을 수 없습니다" }, { status: 404 });
    }
    const existing = await prisma.portfolioCompany.findUnique({
      where: { dealId: body.dealId },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "이미 포트폴리오에 등록된 딜입니다", data: { id: existing.id } },
        { status: 409 }
      );
    }
  }

  const company = await prisma.portfolioCompany.create({
    data: {
      companyName: body.companyName,
      sector: body.sector,
      investedAt: new Date(body.investedAt),
      investAmount: body.investAmount,
      ownershipPercent: body.ownershipPercent,
      entryValuation: body.entryValuation,
      currentValuation: body.currentValuation ?? body.entryValuation,
      status: PortfolioStatus.ACTIVE,
      notes: body.notes,
      userId: session.user.id,
      ...(body.fundId ? { fundId: body.fundId } : {}),
      ...(body.dealId ? { dealId: body.dealId } : {}),
    },
  });

  // 승격된 딜은 심사 파이프라인에서 '투자 완료'로 옮긴다
  if (body.dealId) {
    await prisma.deal.update({
      where: { id: body.dealId },
      data: { stage: DealStage.CLOSED },
    });
  }

  return NextResponse.json({ data: company }, { status: 201 });
}
