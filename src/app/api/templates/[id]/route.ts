import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const template = await prisma.template.findFirst({
    where: { id: params.id, userId: session.user.id },
  });

  if (!template) {
    return NextResponse.json({ error: "템플릿을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json({ data: template });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const template = await prisma.template.findFirst({
    where: { id: params.id, userId: session.user.id },
  });

  if (!template) {
    return NextResponse.json({ error: "템플릿을 찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.template.delete({ where: { id: params.id } });

  return NextResponse.json({ message: "삭제됐습니다" });
}
