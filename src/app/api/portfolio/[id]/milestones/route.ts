import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { MilestoneStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  title: z.string().min(1).max(160),
  dueDate: z.string().min(8),
  status: z.nativeEnum(MilestoneStatus).optional(),
  note: z.string().max(600).optional(),
});

const patchSchema = z.object({
  milestoneId: z.string(),
  status: z.nativeEnum(MilestoneStatus).optional(),
  title: z.string().min(1).max(160).optional(),
  dueDate: z.string().min(8).optional(),
  note: z.string().max(600).nullable().optional(),
});

async function ownedCompany(userId: string, id: string) {
  return prisma.portfolioCompany.findFirst({
    where: { id, userId },
    select: { id: true },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }
  if (!(await ownedCompany(session.user.id, params.id))) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력 데이터가 올바르지 않습니다" },
      { status: 400 }
    );
  }

  const milestone = await prisma.milestone.create({
    data: {
      companyId: params.id,
      title: parsed.data.title,
      dueDate: new Date(parsed.data.dueDate),
      status: parsed.data.status ?? MilestoneStatus.PLANNED,
      note: parsed.data.note,
    },
  });

  return NextResponse.json({ data: milestone }, { status: 201 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }
  if (!(await ownedCompany(session.user.id, params.id))) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력 데이터가 올바르지 않습니다" },
      { status: 400 }
    );
  }
  const { milestoneId, dueDate, ...rest } = parsed.data;

  // 마일스톤이 이 회사 소속인지 확인해야 타 사용자 데이터를 못 바꾼다
  const updated = await prisma.milestone.updateMany({
    where: { id: milestoneId, companyId: params.id },
    data: {
      ...rest,
      ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
    },
  });
  if (updated.count === 0) {
    return NextResponse.json(
      { error: "마일스톤을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  const milestone = await prisma.milestone.findFirst({
    where: { id: milestoneId, companyId: params.id },
  });
  return NextResponse.json({ data: milestone });
}
