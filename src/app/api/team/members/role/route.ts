import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamContext } from "@/lib/team-access";

const schema = z.object({
  userId: z.string().min(1),
  role: z.nativeEnum(UserRole),
});

/** 팀 멤버 역할 변경 — ADMIN만 가능 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const ctx = await getUserTeamContext(session.user.id);
  if (!ctx.teamId) {
    return NextResponse.json({ error: "소속된 팀이 없습니다" }, { status: 404 });
  }

  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "역할 변경은 관리자만 가능합니다" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { userId, role } = schema.parse(body);

    if (userId === session.user.id && role !== "ADMIN") {
      return NextResponse.json(
        { error: "자신의 관리자 역할은 해제할 수 없습니다" },
        { status: 400 }
      );
    }

    const member = await prisma.user.findFirst({
      where: { id: userId, teamId: ctx.teamId },
    });
    if (!member) {
      return NextResponse.json({ error: "팀 멤버를 찾을 수 없습니다" }, { status: 404 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "역할 변경 실패" }, { status: 500 });
  }
}
