import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/plan-gates";
import { getUserTeamContext } from "@/lib/team-access";

const addSchema = z.object({
  email: z.string().email("올바른 이메일을 입력하세요"),
});

const removeSchema = z.object({
  userId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const gate = await requireFeature(session.user.id, "teamCollaboration");
  if (gate) return gate;

  const ctx = await getUserTeamContext(session.user.id);
  if (!ctx.teamId) {
    return NextResponse.json({ error: "먼저 팀을 생성하세요" }, { status: 404 });
  }

  if (ctx.role !== "ADMIN" && ctx.role !== "PARTNER") {
    return NextResponse.json({ error: "멤버 초대 권한이 없습니다" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { email } = addSchema.parse(body);

    const target = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, teamId: true },
    });

    if (!target) {
      return NextResponse.json(
        { error: "해당 이메일로 가입된 사용자가 없습니다" },
        { status: 404 }
      );
    }

    if (target.teamId && target.teamId !== ctx.teamId) {
      return NextResponse.json({ error: "다른 팀에 소속된 사용자입니다" }, { status: 409 });
    }

    if (target.teamId === ctx.teamId) {
      return NextResponse.json({ error: "이미 팀 멤버입니다" }, { status: 409 });
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { teamId: ctx.teamId },
    });

    return NextResponse.json({ data: target });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "멤버 추가 실패" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const ctx = await getUserTeamContext(session.user.id);
  if (!ctx.teamId) {
    return NextResponse.json({ error: "소속된 팀이 없습니다" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { userId } = removeSchema.parse(body);

    const isSelf = userId === session.user.id;
    const canRemoveOthers = ctx.role === "ADMIN" || ctx.role === "PARTNER";

    if (!isSelf && !canRemoveOthers) {
      return NextResponse.json({ error: "멤버 제거 권한이 없습니다" }, { status: 403 });
    }

    const member = await prisma.user.findFirst({
      where: { id: userId, teamId: ctx.teamId },
    });
    if (!member) {
      return NextResponse.json({ error: "팀 멤버를 찾을 수 없습니다" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { teamId: null },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "멤버 제거 실패" }, { status: 500 });
  }
}
