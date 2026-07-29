import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReportStatus, SectionStatus } from "@prisma/client";
import {
  getUserTeamContext,
  reportReadWhere,
  reportWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

const patchSchema = z.object({
  status: z.nativeEnum(ReportStatus).optional(),
  approveAllSections: z.boolean().optional(),
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
  const report = await prisma.report.findFirst({
    where: {
      id: params.id,
      ...reportReadWhere(session.user.id, teamId),
    },
    include: {
      deal: true,
      sections: { orderBy: { order: "asc" } },
    },
  });

  if (!report) {
    return NextResponse.json(
      { error: "보고서를 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: report });
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
  const report = await prisma.report.findFirst({
    where: {
      id: params.id,
      ...reportWriteWhere(session.user.id, teamId, role),
    },
  });

  if (!report) {
    return NextResponse.json(
      { error: permissionDeniedMessage("edit") },
      { status: 403 }
    );
  }

  const parsed = patchSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력 데이터가 올바르지 않습니다" },
      { status: 400 }
    );
  }
  const { status, approveAllSections } = parsed.data;

  if (approveAllSections) {
    await prisma.reportSection.updateMany({
      where: { reportId: params.id },
      data: { status: SectionStatus.APPROVED },
    });
  }

  const updated = await prisma.report.update({
    where: { id: params.id },
    data: {
      ...(status ? { status } : {}),
      ...(status === ReportStatus.FINAL ? { generatedAt: report.generatedAt ?? new Date() } : {}),
    },
    include: {
      sections: { orderBy: { order: "asc" } },
    },
  });

  return NextResponse.json({ data: updated });
}
