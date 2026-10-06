import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamContext, lockTeamManagementContext } from "@/lib/team-access";

export async function POST(request: NextRequest) {
  try {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  const parsed = z.object({ userId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "후임 소유자를 선택해 주세요" }, { status: 400 });
  if (parsed.data.userId === session.user.id) return NextResponse.json({ error: "현재 소유자에게 이전할 수 없습니다" }, { status: 400 });
  const ctx = await getUserTeamContext(session.user.id);
  if (!ctx.teamId || !ctx.isTeamOwner) return NextResponse.json({ error: "현재 팀 소유자만 이전할 수 있습니다" }, { status: 403 });
  const result = await prisma.$transaction(async (tx) => {
    const current = await lockTeamManagementContext(tx, session.user.id, ctx.teamId!);
    if (!current?.isTeamOwner) return { error: "소유권이 변경되었습니다", status: 409 };
    const successor = await tx.user.findFirst({ where: { id: parsed.data.userId, teamId: ctx.teamId! } });
    if (!successor) return { error: "같은 팀의 멤버만 소유자가 될 수 있습니다", status: 404 };
    const changed = await tx.team.updateMany({ where: { id: ctx.teamId!, ownerUserId: session.user.id }, data: { ownerUserId: successor.id } });
    return changed.count === 1 ? { data: { ownerUserId: successor.id }, status: 200 } : { error: "소유권이 변경되었습니다", status: 409 };
  });
  return NextResponse.json(result.error ? { error: result.error } : { data: result.data }, { status: result.status });
  } catch {
    return NextResponse.json({ error: "소유권 이전에 실패했습니다" }, { status: 500 });
  }
}
