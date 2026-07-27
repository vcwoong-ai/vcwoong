import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculatePortfolioMetrics } from "@/lib/portfolio";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  vintageYear: z.number().int().min(1990).max(2100),
  fundSize: z.number().positive(),
  paidIn: z.number().min(0).optional(),
  managementFee: z.number().min(0).max(10).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const funds = await prisma.fund.findMany({
    where: { userId: session.user.id },
    include: { companies: true },
    orderBy: { vintageYear: "desc" },
  });

  return NextResponse.json({
    data: funds.map((f) => ({
      id: f.id,
      name: f.name,
      vintageYear: f.vintageYear,
      fundSize: f.fundSize,
      paidIn: f.paidIn,
      managementFee: f.managementFee,
      companyCount: f.companies.length,
      metrics: calculatePortfolioMetrics(f.companies),
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력 데이터가 올바르지 않습니다", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const fund = await prisma.fund.create({
    data: {
      ...parsed.data,
      paidIn: parsed.data.paidIn ?? 0,
      managementFee: parsed.data.managementFee ?? 2,
      userId: session.user.id,
    },
  });

  return NextResponse.json({ data: fund }, { status: 201 });
}
