import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/plan-gates";
import { getUserTeamContext, canManageTeam, lockTeamManagementContext } from "@/lib/team-access";

const addSchema = z.object({
  email: z.string().trim().toLowerCase().email("올바른 이메일을 입력하세요"),
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

  if (!canManageTeam(ctx.role, ctx.isTeamOwner)) {
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

    const result = await prisma.$transaction(async (tx) => {
      const current = await lockTeamManagementContext(tx, session.user.id, ctx.teamId!);
      if (!current || !canManageTeam(current.role, current.isTeamOwner)) return { error: "멤버 초대 권한이 없습니다", status: 403 };
      const freshTarget = await tx.user.findFirst({ where: { id: target.id, teamId: null } });
      if (!freshTarget) return { error: "이미 팀에 소속되어 있습니다", status: 409 };
      const now = new Date();
      await tx.teamInvitation.updateMany({
        where: { teamId: ctx.teamId!, targetUserId: target.id, status: "PENDING", expiresAt: { lte: now } },
        data: { status: "EXPIRED", respondedAt: now },
      });
      const pending = await tx.teamInvitation.findFirst({ where: { teamId: ctx.teamId!, targetUserId: target.id, status: "PENDING" } });
      if (pending) return { error: "이미 대기 중인 초대가 있습니다", status: 409 };
      const invitation = await tx.teamInvitation.create({ data: {
        teamId: ctx.teamId!, invitedByUserId: session.user.id, targetUserId: target.id,
        role: "ANALYST", expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      } });
      return { data: invitation, status: 201 };
    });
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ data: result.data }, { status: result.status });
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
    const canRemoveOthers = canManageTeam(ctx.role, ctx.isTeamOwner);

    if (!isSelf && !canRemoveOthers) {
      return NextResponse.json({ error: "멤버 제거 권한이 없습니다" }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const current = await lockTeamManagementContext(tx, session.user.id, ctx.teamId!);
      if (!current || (!isSelf && !canManageTeam(current.role, current.isTeamOwner))) return { error: "멤버 제거 권한이 없습니다", status: 403 };
      if (current.ownerUserId === userId) return { error: "팀 소유자는 소유권 이전 없이 나갈 수 없습니다", status: 409 };
      const member = await tx.user.findFirst({ where: { id: userId, teamId: ctx.teamId! } });
      if (!member) return { error: "팀 멤버를 찾을 수 없습니다", status: 404 };
      const memberRole = member.teamRole ?? member.role;
      if (!current.ownerUserId && canManageTeam(memberRole)) {
        const managers = await tx.user.count({ where: {
          teamId: ctx.teamId!,
          OR: [{ teamRole: { in: ["ADMIN", "PARTNER"] } }, { teamRole: null, role: { in: ["ADMIN", "PARTNER"] } }],
        } });
        if (managers <= 1) return { error: "마지막 팀 관리자는 나갈 수 없습니다", status: 409 };
      }
      const removed = await tx.user.updateMany({
        where: { id: userId, teamId: ctx.teamId! }, data: { teamId: null, teamRole: null },
      });
      return removed.count === 1 ? { status: 200 } : { error: "팀 소속이 변경되었습니다", status: 409 };
    });
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "멤버 제거 실패" }, { status: 500 });
  }
}
