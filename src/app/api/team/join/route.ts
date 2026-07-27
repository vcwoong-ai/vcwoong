import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { InviteStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const joinSchema = z.object({
  code: z.string().min(4).max(64),
});

/** 초대 코드로 팀에 합류한다 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const parsed = joinSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "초대 코드를 입력하세요" }, { status: 400 });
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true, email: true },
  });
  if (me?.teamId) {
    return NextResponse.json(
      { error: "이미 팀에 속해 있습니다. 먼저 기존 팀을 탈퇴하세요." },
      { status: 409 }
    );
  }

  const invite = await prisma.teamInvite.findUnique({
    where: { code: parsed.data.code.trim() },
    include: { team: { select: { id: true, name: true } } },
  });

  if (!invite || invite.status !== InviteStatus.PENDING) {
    return NextResponse.json(
      { error: "유효하지 않은 초대 코드입니다" },
      { status: 404 }
    );
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "만료된 초대 코드입니다" }, { status: 410 });
  }
  if (me?.email && invite.email.toLowerCase() !== me.email.toLowerCase()) {
    return NextResponse.json(
      { error: "이 초대는 다른 이메일 주소로 발급됐습니다" },
      { status: 403 }
    );
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: session.user.id },
      data: { teamId: invite.teamId },
    }),
    prisma.teamInvite.update({
      where: { id: invite.id },
      data: { status: InviteStatus.ACCEPTED },
    }),
  ]);

  return NextResponse.json({ data: { team: invite.team } });
}
