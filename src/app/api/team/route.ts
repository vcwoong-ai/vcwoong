import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/plan-gates";
import { getUserTeamContext } from "@/lib/team-access";

const createSchema = z.object({
  name: z.string().min(1, "팀 이름을 입력하세요").max(60),
});

const patchSchema = z.object({
  name: z.string().min(1).max(60),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const ctx = await getUserTeamContext(session.user.id);
  if (!ctx.teamId) {
    return NextResponse.json({ data: null });
  }

  const team = await prisma.team.findUnique({
    where: { id: ctx.teamId },
    include: {
      users: {
        select: { id: true, name: true, email: true, role: true },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { deals: true, templates: true } },
    },
  });

  return NextResponse.json({ data: team });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const gate = await requireFeature(session.user.id, "teamCollaboration");
  if (gate) return gate;

  const existing = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true },
  });
  if (existing?.teamId) {
    return NextResponse.json({ error: "이미 팀에 소속되어 있습니다" }, { status: 409 });
  }

  try {
    const body = await request.json();
    const { name } = createSchema.parse(body);

    const team = await prisma.$transaction(async (tx) => {
      const created = await tx.team.create({ data: { name } });
      await tx.user.update({
        where: { id: session.user.id },
        data: { teamId: created.id },
      });
      return created;
    });

    return NextResponse.json({ data: team }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    }
    console.error("Team create error:", error);
    return NextResponse.json({ error: "팀 생성 실패" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const ctx = await getUserTeamContext(session.user.id);
  if (!ctx.teamId) {
    return NextResponse.json({ error: "소속된 팀이 없습니다" }, { status: 404 });
  }

  if (ctx.role !== "ADMIN" && ctx.role !== "PARTNER") {
    return NextResponse.json({ error: "팀 이름 변경 권한이 없습니다" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name } = patchSchema.parse(body);

    const team = await prisma.team.update({
      where: { id: ctx.teamId },
      data: { name },
    });

    return NextResponse.json({ data: team });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "팀 수정 실패" }, { status: 500 });
  }
}
