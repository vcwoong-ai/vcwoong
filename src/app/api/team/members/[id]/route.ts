import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** 팀원 제외 — 소유자만 가능하며, 해당 멤버가 공유한 리소스는 공유 해제된다 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true },
  });
  if (!me?.teamId) {
    return NextResponse.json({ error: "속한 팀이 없습니다" }, { status: 400 });
  }

  const team = await prisma.team.findUnique({
    where: { id: me.teamId },
    select: { id: true, ownerId: true },
  });
  if (!team || team.ownerId !== session.user.id) {
    return NextResponse.json(
      { error: "팀 소유자만 팀원을 제외할 수 있습니다" },
      { status: 403 }
    );
  }
  if (params.id === session.user.id) {
    return NextResponse.json(
      { error: "소유자는 팀 해산으로만 나갈 수 있습니다" },
      { status: 400 }
    );
  }

  const member = await prisma.user.findFirst({
    where: { id: params.id, teamId: team.id },
    select: { id: true },
  });
  if (!member) {
    return NextResponse.json({ error: "팀원을 찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.deal.updateMany({
      where: { teamId: team.id, userId: member.id },
      data: { teamId: null },
    }),
    prisma.template.updateMany({
      where: { teamId: team.id, userId: member.id },
      data: { teamId: null },
    }),
    prisma.user.update({ where: { id: member.id }, data: { teamId: null } }),
  ]);

  return NextResponse.json({ data: { removed: true } });
}
