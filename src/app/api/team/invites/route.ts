import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { InviteStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/plan-gates";
import { generateInviteCode, inviteExpiry } from "@/lib/team";

const createSchema = z.object({
  email: z.string().email(),
});

const revokeSchema = z.object({
  inviteId: z.string().min(1),
});

async function requireOwnedTeam(userId: string) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { teamId: true },
  });
  if (!me?.teamId) return { error: "속한 팀이 없습니다", status: 400 as const };

  const team = await prisma.team.findUnique({
    where: { id: me.teamId },
    select: { id: true, ownerId: true },
  });
  if (!team) return { error: "팀을 찾을 수 없습니다", status: 404 as const };
  if (team.ownerId !== userId) {
    return { error: "팀 소유자만 초대할 수 있습니다", status: 403 as const };
  }
  return { team };
}

/** 초대 코드 발급 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const locked = await requireFeature(session.user.id, "teamCollaboration");
  if (locked) return locked;

  const guard = await requireOwnedTeam(session.user.id);
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "초대할 이메일 주소를 입력하세요" },
      { status: 400 }
    );
  }
  const email = parsed.data.email.toLowerCase();

  const alreadyMember = await prisma.user.findFirst({
    where: { email, teamId: guard.team.id },
    select: { id: true },
  });
  if (alreadyMember) {
    return NextResponse.json(
      { error: "이미 팀에 속한 사용자입니다" },
      { status: 409 }
    );
  }

  const invite = await prisma.teamInvite.create({
    data: {
      teamId: guard.team.id,
      email,
      code: generateInviteCode(),
      invitedBy: session.user.id,
      expiresAt: inviteExpiry(),
    },
  });

  return NextResponse.json(
    {
      data: {
        invite: { id: invite.id, email: invite.email, code: invite.code, expiresAt: invite.expiresAt },
      },
    },
    { status: 201 }
  );
}

/** 초대 회수 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const guard = await requireOwnedTeam(session.user.id);
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const parsed = revokeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "초대를 지정하세요" }, { status: 400 });
  }

  const result = await prisma.teamInvite.updateMany({
    where: {
      id: parsed.data.inviteId,
      teamId: guard.team.id,
      status: InviteStatus.PENDING,
    },
    data: { status: InviteStatus.REVOKED },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "초대를 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json({ data: { revoked: true } });
}
