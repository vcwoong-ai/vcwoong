import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReportStatus, SectionStatus } from "@prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const report = await prisma.report.findFirst({
    where: {
      id: params.id,
      deal: { userId: session.user.id },
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

  const report = await prisma.report.findFirst({
    where: {
      id: params.id,
      deal: { userId: session.user.id },
    },
  });

  if (!report) {
    return NextResponse.json(
      { error: "보고서를 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  const body = await request.json();
  const { status, approveAllSections } = body as {
    status?: ReportStatus;
    approveAllSections?: boolean;
  };

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
