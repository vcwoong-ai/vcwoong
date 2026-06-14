import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deals = await prisma.deal.findMany({
    where: { userId: session.user.id },
    include: {
      _count: { select: { documents: true, reports: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(deals);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { companyName, sector, stage, amount, currency, status } = body;

  if (!companyName) {
    return NextResponse.json({ error: "회사명을 입력해주세요." }, { status: 400 });
  }

  const deal = await prisma.deal.create({
    data: {
      userId: session.user.id,
      companyName,
      sector: sector || null,
      stage: stage || null,
      amount: amount ? parseFloat(amount) : null,
      currency: currency || "KRW",
      status: status || "검토중",
    },
  });

  return NextResponse.json(deal, { status: 201 });
}
