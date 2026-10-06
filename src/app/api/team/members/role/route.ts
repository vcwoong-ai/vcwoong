import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamContext, lockTeamManagementContext } from "@/lib/team-access";

const schema = z.object({
  userId: z.string().min(1),
  role: z.nativeEnum(UserRole),
});

/** 팀 멤버 역할만 변경 — 소유자 또는 팀 ADMIN, 전역 User.role은 유지 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const ctx = await getUserTeamContext(session.user.id);
  if (!ctx.teamId) {
    return NextResponse.json({ error: "소속된 팀이 없습니다" }, { status: 404 });
  }

  if (!ctx.isTeamOwner && ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "역할 변경은 팀 소유자·관리자만 가능합니다" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { userId, role } = schema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      const current = await lockTeamManagementContext(tx, session.user.id, ctx.teamId!);
      if (!current || (!current.isTeamOwner && current.role !== "ADMIN")) return { error: "역할 변경 권한이 없습니다", status: 403 };
      if (userId === current.ownerUserId) return { error: "소유자의 관리 권한은 역할 변경으로 해제할 수 없습니다", status: 409 };
      if (userId === session.user.id && role !== "ADMIN") return { error: "자신의 관리자 역할은 해제할 수 없습니다", status: 400 };
      const member = await tx.user.findFirst({ where: { id: userId, teamId: ctx.teamId! } });
      if (!member) return { error: "팀 멤버를 찾을 수 없습니다", status: 404 };
      // legacy owner 없는 팀의 마지막 관리 권한을 제거하지 않는다.
      if (!current.ownerUserId && (member.teamRole ?? member.role) !== "ANALYST" && role === "ANALYST") {
        const managers = await tx.user.count({ where: { teamId: ctx.teamId!, OR: [
          { teamRole: { in: ["ADMIN", "PARTNER"] } }, { teamRole: null, role: { in: ["ADMIN", "PARTNER"] } },
        ] } });
        if (managers <= 1) return { error: "마지막 팀 관리자의 권한은 해제할 수 없습니다", status: 409 };
      }
      const changed = await tx.user.updateMany({ where: { id: userId, teamId: ctx.teamId! }, data: { teamRole: role } });
      if (changed.count !== 1) return { error: "팀 소속이 변경되었습니다", status: 409 };
      return { data: { id: member.id, name: member.name, email: member.email, role }, status: 200 };
    });
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ data: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "역할 변경 실패" }, { status: 500 });
  }
}
