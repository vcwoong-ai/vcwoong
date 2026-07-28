import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { DealSector, InboundStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getUserTeamContext,
  inboundWriteWhere,
  inboundOwnerWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

const patchSchema = z.object({
  status: z.nativeEnum(InboundStatus).optional(),
  sector: z.nativeEnum(DealSector).optional(),
  summary: z.string().max(4000).nullable().optional(),
});

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
    return NextResponse.json(
      { error: "입력 데이터가 올바르지 않습니다" },
      { status: 400 }
    );
  }

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const updated = await prisma.inboundDeal.updateMany({
    where: {
      id: params.id,
      ...inboundWriteWhere(session.user.id, teamId, role),
    },
    data: parsed.data,
  });
  if (updated.count === 0) {
    return NextResponse.json(
      { error: permissionDeniedMessage("edit") },
      { status: 403 }
    );
  }

  const lead = await prisma.inboundDeal.findFirst({
    where: { id: params.id },
  });
  return NextResponse.json({ data: lead });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const deleted = await prisma.inboundDeal.deleteMany({
    where: { id: params.id, ...inboundOwnerWhere(session.user.id) },
  });
  if (deleted.count === 0) {
    return NextResponse.json(
      { error: permissionDeniedMessage("delete") },
      { status: 403 }
    );
  }
  return NextResponse.json({ data: { id: params.id } });
}
