import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deal = await prisma.deal.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      documents: { orderBy: { createdAt: "desc" } },
      reports: { orderBy: { generatedAt: "desc" } },
    },
  });

  if (!deal) {
    return NextResponse.json({ error: "딜을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json(deal);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { companyName, sector, stage, amount, currency, status } = body;

  const deal = await prisma.deal.findFirst({
    where: { id: params.id, userId: session.user.id },
  });

  if (!deal) {
    return NextResponse.json({ error: "딜을 찾을 수 없습니다." }, { status: 404 });
  }

  const updated = await prisma.deal.update({
    where: { id: params.id },
    data: {
      ...(companyName && { companyName }),
      ...(sector !== undefined && { sector }),
      ...(stage !== undefined && { stage }),
      ...(amount !== undefined && { amount: amount ? parseFloat(amount) : null }),
      ...(currency && { currency }),
      ...(status && { status }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deal = await prisma.deal.findFirst({
    where: { id: params.id, userId: session.user.id },
  });

  if (!deal) {
    return NextResponse.json({ error: "딜을 찾을 수 없습니다." }, { status: 404 });
  }

  await prisma.deal.delete({ where: { id: params.id } });
  return NextResponse.json({ message: "삭제되었습니다." });
}
