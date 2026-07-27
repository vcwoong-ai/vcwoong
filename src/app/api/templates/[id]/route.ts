import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessScope, ownedOrShared } from "@/lib/team";

const patchSchema = z.object({
  shared: z.boolean(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const scope = await getAccessScope(session.user.id);
  const template = await prisma.template.findFirst({
    where: { id: params.id, ...ownedOrShared(scope) },
  });

  if (!template) {
    return NextResponse.json({ error: "템플릿을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json({ data: template });
}

/** 팀 공유 토글 — 소유자만 가능 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "shared 값이 필요합니다" }, { status: 400 });
  }

  const template = await prisma.template.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  });
  if (!template) {
    return NextResponse.json(
      { error: "양식 소유자만 공유 설정을 바꿀 수 있습니다" },
      { status: 404 }
    );
  }

  const scope = await getAccessScope(session.user.id);
  if (parsed.data.shared && !scope.teamId) {
    return NextResponse.json(
      { error: "먼저 팀을 만들거나 팀에 합류하세요" },
      { status: 400 }
    );
  }

  const updated = await prisma.template.update({
    where: { id: params.id },
    data: { teamId: parsed.data.shared ? scope.teamId : null },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // 삭제는 소유자만
  const template = await prisma.template.findFirst({
    where: { id: params.id, userId: session.user.id },
  });

  if (!template) {
    return NextResponse.json({ error: "템플릿을 찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.template.delete({ where: { id: params.id } });

  return NextResponse.json({ message: "삭제됐습니다" });
}
