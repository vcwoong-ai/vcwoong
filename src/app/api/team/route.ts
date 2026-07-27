import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { InviteStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/plan-gates";

const createSchema = z.object({
  name: z.string().min(1).max(60),
});

/** 내 팀 정보 (멤버·초대·공유 현황) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true },
  });

  if (!me?.teamId) {
    return NextResponse.json({ data: { team: null } });
  }

  const team = await prisma.team.findUnique({
    where: { id: me.teamId },
    include: {
      users: {
        select: { id: true, name: true, email: true, role: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      invites: {
        where: { status: InviteStatus.PENDING },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!team) return NextResponse.json({ data: { team: null } });

  const [sharedDeals, sharedTemplates] = await Promise.all([
    prisma.deal.count({ where: { teamId: team.id } }),
    prisma.template.count({ where: { teamId: team.id } }),
  ]);

  return NextResponse.json({
    data: {
      team: {
        id: team.id,
        name: team.name,
        ownerId: team.ownerId,
        isOwner: team.ownerId === session.user.id,
        members: team.users,
        invites: team.invites.map((i) => ({
          id: i.id,
          email: i.email,
          code: i.code,
          expiresAt: i.expiresAt,
        })),
        sharedDeals,
        sharedTemplates,
      },
    },
  });
}

/** 팀 생성 — 생성자가 소유자가 된다 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const locked = await requireFeature(session.user.id, "teamCollaboration");
  if (locked) return locked;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "팀 이름을 입력하세요" }, { status: 400 });
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true },
  });
  if (me?.teamId) {
    return NextResponse.json(
      { error: "이미 팀에 속해 있습니다. 새 팀을 만들려면 먼저 탈퇴하세요." },
      { status: 409 }
    );
  }

  const team = await prisma.$transaction(async (tx) => {
    const created = await tx.team.create({
      data: { name: parsed.data.name, ownerId: session.user.id },
    });
    await tx.user.update({
      where: { id: session.user.id },
      data: { teamId: created.id },
    });
    return created;
  });

  return NextResponse.json({ data: { team } }, { status: 201 });
}

/** 팀 탈퇴 — 소유자는 팀 자체를 해산한다 */
export async function DELETE() {
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
  if (!team) {
    return NextResponse.json({ error: "팀을 찾을 수 없습니다" }, { status: 404 });
  }

  if (team.ownerId === session.user.id) {
    // 해산 — 공유 딜·양식은 각 소유자 개인 소유로 되돌린다
    await prisma.$transaction([
      prisma.deal.updateMany({ where: { teamId: team.id }, data: { teamId: null } }),
      prisma.template.updateMany({ where: { teamId: team.id }, data: { teamId: null } }),
      prisma.user.updateMany({ where: { teamId: team.id }, data: { teamId: null } }),
      prisma.team.delete({ where: { id: team.id } }),
    ]);
    return NextResponse.json({ data: { disbanded: true } });
  }

  // 일반 멤버 탈퇴 — 본인이 공유한 리소스는 공유 해제
  await prisma.$transaction([
    prisma.deal.updateMany({
      where: { teamId: team.id, userId: session.user.id },
      data: { teamId: null },
    }),
    prisma.template.updateMany({
      where: { teamId: team.id, userId: session.user.id },
      data: { teamId: null },
    }),
    prisma.user.update({
      where: { id: session.user.id },
      data: { teamId: null },
    }),
  ]);

  return NextResponse.json({ data: { disbanded: false } });
}
