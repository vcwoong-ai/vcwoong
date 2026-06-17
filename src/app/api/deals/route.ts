import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DealSector, DealStage } from "@prisma/client";

const createDealSchema = z.object({
  name: z.string().min(1, "딜 이름을 입력해주세요"),
  companyName: z.string().min(1, "기업명을 입력해주세요"),
  sector: z.nativeEnum(DealSector),
  stage: z.nativeEnum(DealStage).optional(),
  description: z.string().optional(),
  investAmount: z.number().positive().optional(),
  investRound: z.string().optional(),
  valuation: z.number().positive().optional(),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const pageSize = parseInt(searchParams.get("pageSize") ?? "10");
  const sector = searchParams.get("sector") as DealSector | null;
  const stage = searchParams.get("stage") as DealStage | null;
  const search = searchParams.get("search");

  const where = {
    userId: session.user.id,
    ...(sector ? { sector } : {}),
    ...(stage ? { stage } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { companyName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      include: {
        documents: { select: { id: true, name: true, type: true } },
        reports: { select: { id: true, status: true, agentType: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.deal.count({ where }),
  ]);

  return NextResponse.json({
    data: deals,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = createDealSchema.parse(body);

    const deal = await prisma.deal.create({
      data: {
        ...validated,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ data: deal }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.issues },
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
