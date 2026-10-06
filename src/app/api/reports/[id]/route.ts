import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReportStatus, SectionStatus } from "@prisma/client";
import { reportReviewVersion } from "@/lib/report-review-version";
import { publicGenerationReport } from "@/lib/report-generation-lease";
import {
  getUserTeamContext,
  reportReadWhere,
  reportWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

const patchSchema = z.object({
  status: z.nativeEnum(ReportStatus).optional(),
  approveAllSections: z.boolean().optional(),
  expectedReviewVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
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

  return NextResponse.json({ data: publicGenerationReport(report) });
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
  const { status, approveAllSections, expectedReviewVersion } = parsed.data;
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.report.findFirst({
        where: { id: params.id, ...reportWriteWhere(session.user.id, teamId, role) },
        include: { sections: { orderBy: { order: "asc" } } },
      });
      if (!current) throw new Error("REPORT_REVIEW_CONFLICT");
      const locked = await tx.report.updateMany({
        where: { id: current.id, updatedAt: current.updatedAt, status: current.status },
        data: { updatedAt: current.updatedAt },
      });
      if (locked.count !== 1) throw new Error("REPORT_REVIEW_CONFLICT");
      if (approveAllSections || status === ReportStatus.FINAL) {
        if (!current.sections.length || expectedReviewVersion !== await reportReviewVersion(current.sections)) {
          throw new Error("REPORT_REVIEW_CONFLICT");
        }
        if (!approveAllSections && current.sections.some((section) => section.status !== SectionStatus.APPROVED)) {
          throw new Error("REPORT_REVIEW_CONFLICT");
        }
      }
      if (approveAllSections) {
        for (const section of current.sections) {
          const saved = await tx.reportSection.updateMany({
            where: { id: section.id, reportId: current.id, updatedAt: section.updatedAt,
              status: section.status, content: section.content, title: section.title,
              sectionKey: section.sectionKey, order: section.order },
            data: { status: SectionStatus.APPROVED },
          });
          if (saved.count !== 1) throw new Error("REPORT_REVIEW_CONFLICT");
        }
      }
      const saved = await tx.report.updateMany({
        where: { id: current.id, updatedAt: current.updatedAt, status: current.status },
        data: {
          ...(status ? { status } : {}),
          ...(status === ReportStatus.FINAL ? { generatedAt: current.generatedAt ?? new Date() } : {}),
          updatedAt: new Date(),
        },
      });
      if (saved.count !== 1) throw new Error("REPORT_REVIEW_CONFLICT");
      return tx.report.findFirst({ where: { id: current.id }, include: { sections: { orderBy: { order: "asc" } } } });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ data: updated ? publicGenerationReport(updated) : null });
  } catch (error) {
    if ((error instanceof Error && error.message === "REPORT_REVIEW_CONFLICT") ||
        (typeof error === "object" && error !== null && "code" in error && error.code === "P2034")) {
      return NextResponse.json({ error: "본문이 변경되었거나 승인 상태가 달라졌습니다. 새로고침 후 내용을 확인하고 다시 승인해 주세요." }, { status: 409 });
    }
    // Never log the report body or Prisma query diagnostics.
    console.error("Report update failed");
    return NextResponse.json({ error: "보고서 수정 중 오류가 발생했습니다" }, { status: 500 });
  }
}
