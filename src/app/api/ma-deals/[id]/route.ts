import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MaDealType, MaDealStatus } from "@prisma/client";
import { getUserTeamContext, permissionDeniedMessage } from "@/lib/team-access";
import { maDealReadWhere, maDealWriteWhere } from "@/lib/pe/ma-team-access";

const updateMaDealSchema = z.object({
  name: z.string().min(1).optional(),
  companyName: z.string().min(1).optional(),
  dealType: z.nativeEnum(MaDealType).optional(),
  status: z.nativeEnum(MaDealStatus).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId } = await getUserTeamContext(session.user.id);
  const maDeal = await prisma.mADeal.findFirst({
    where: { id: params.id, ...maDealReadWhere(session.user.id, teamId) },
  });
  if (!maDeal) {
    return NextResponse.json(
      { error: "PE 딜을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: maDeal });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId, role } = await getUserTeamContext(session.user.id);

  const maDeal = await prisma.mADeal.findFirst({
    where: { id: params.id, ...maDealWriteWhere(session.user.id, teamId, role) },
  });
  if (!maDeal) {
    return NextResponse.json(
      { error: permissionDeniedMessage("edit") },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const validated = updateMaDealSchema.parse(body);

    const updated = await prisma.mADeal.update({
      where: { id: params.id },
      data: validated,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.issues },
        { status: 400 }
      );
    }
    console.error("PE_DEAL_UPDATE_FAILED");
    return NextResponse.json(
      { error: "PE 딜 수정 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
