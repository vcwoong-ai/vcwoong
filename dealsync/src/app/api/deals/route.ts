import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createDealSchema = z.object({
  companyName: z.string().min(1),
  companyNameKo: z.string().optional(),
  founded: z.string().optional(),
  sector: z.string().min(1),
  subSector: z.string().optional(),
  stage: z.string().min(1),
  location: z.string().optional(),
  website: z.string().optional(),
  employeeCount: z.number().optional(),
  investmentAmount: z.number().optional(),
  investmentCurrency: z.string().optional(),
  equityStake: z.number().optional(),
  preMoneyValuation: z.number().optional(),
  roundType: z.string().optional(),
  totalRoundSize: z.number().optional(),
  leadInvestor: z.string().optional(),
  businessDescription: z.string().optional(),
  productService: z.string().optional(),
  revenueModel: z.string().optional(),
  competitiveAdvantage: z.string().optional(),
  targetMarket: z.string().optional(),
  marketSize: z.string().optional(),
  ceoName: z.string().optional(),
  ceoBackground: z.string().optional(),
  teamDescription: z.string().optional(),
  advisors: z.string().optional(),
  revenueLastYear: z.number().optional(),
  revenueThisYear: z.number().optional(),
  revenueProjection: z.number().optional(),
  burnRate: z.number().optional(),
  runway: z.number().optional(),
  customers: z.string().optional(),
  keyMetrics: z.string().optional(),
  keyRisks: z.string().optional(),
  exitStrategy: z.string().optional(),
  useOfFunds: z.string().optional(),
  analystNotes: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const sector = searchParams.get("sector");

  const where: Record<string, unknown> = { userId: session.user.id };
  if (status) where.status = status;
  if (sector) where.sector = sector;

  const deals = await prisma.deal.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { report: { select: { id: true, generatedAt: true } } },
  });

  return NextResponse.json(deals);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = createDealSchema.parse(body);

    const deal = await prisma.deal.create({
      data: {
        ...data,
        userId: session.user.id,
        status: "reviewing",
      },
    });

    return NextResponse.json(deal, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Validation error" },
        { status: 400 }
      );
    }
    console.error("Deal creation error:", error);
    return NextResponse.json(
      { error: "딜 생성 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
