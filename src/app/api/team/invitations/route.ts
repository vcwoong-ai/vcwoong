import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam, getUserTeamContext } from "@/lib/team-access";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  const ctx = await getUserTeamContext(session.user.id);
  const canManage = ctx.teamId && canManageTeam(ctx.role, ctx.isTeamOwner);
  const scope = { OR: [
    { targetUserId: session.user.id },
    ...(canManage ? [{ teamId: ctx.teamId! }] : []),
  ] };
  await prisma.teamInvitation.updateMany({
    where: { ...scope, status: "PENDING", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED", respondedAt: new Date() },
  });
  const base = {
    select: { id: true, role: true, status: true, expiresAt: true, team: { select: { name: true } }, invitedBy: { select: { name: true } }, target: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" as const }, take: 30,
  };
  const [incoming, outgoing] = await Promise.all([
    prisma.teamInvitation.findMany({ ...base, where: { targetUserId: session.user.id } }),
    canManage ? prisma.teamInvitation.findMany({ ...base, where: { teamId: ctx.teamId! } }) : [],
  ]);
  return NextResponse.json({ data: { incoming, outgoing } }, { headers: { "Cache-Control": "private, no-store" } });
}
