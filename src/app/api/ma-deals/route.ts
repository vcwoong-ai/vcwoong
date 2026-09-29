import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MaDealType } from "@prisma/client";
import { getUserTeamContext } from "@/lib/team-access";
import { maDealReadWhere } from "@/lib/pe/ma-team-access";
import { loadMaDealListReadinessSummaries } from "@/lib/pe/ma-deal-list-readiness";

const createMaDealSchema = z.object({
  name: z.string().min(1, "딜 이름을 입력해주세요"),
  companyName: z.string().min(1, "기업명을 입력해주세요"),
  dealType: z.nativeEnum(MaDealType),
  shareWithTeam: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const pageSize = parseInt(searchParams.get("pageSize") ?? "10");
  const dealType = searchParams.get("dealType") as MaDealType | null;
  const search = searchParams.get("search");

  const { teamId } = await getUserTeamContext(session.user.id);

  const where = {
    AND: [
      maDealReadWhere(session.user.id, teamId),
      ...(dealType ? [{ dealType }] : []),
      ...(search
        ? [
            {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                {
                  companyName: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              ],
            },
          ]
        : []),
    ],
  };

  const [maDeals, total] = await Promise.all([
    prisma.mADeal.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mADeal.count({ where }),
  ]);

  // 초기 SSR 로드(page.tsx)와 정확히 같은 배치 조회 함수를 쓴다 — "더 보기"로
  // 불러온 카드가 다른 계산 경로를 타서 첫 페이지와 다른 결론을 보이면
  // 안 된다(§5 dangerous duplication 금지).
  const readiness = await loadMaDealListReadinessSummaries(
    maDeals.map((d) => d.id),
    session.user.id
  );

  return NextResponse.json({
    data: maDeals,
    readiness,
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
    const validated = createMaDealSchema.parse(body);
    const { shareWithTeam, ...maDealData } = validated;
    const { teamId } = await getUserTeamContext(session.user.id);
    const shareTeamId = shareWithTeam !== false && teamId ? teamId : null;

    const maDeal = await prisma.mADeal.create({
      data: {
        ...maDealData,
        userId: session.user.id,
        teamId: shareTeamId,
      },
    });

    return NextResponse.json({ data: maDeal }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.issues },
        { status: 400 }
      );
    }
    console.error("MADeal creation error:", error);
    return NextResponse.json(
      { error: "PE 딜 생성 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
