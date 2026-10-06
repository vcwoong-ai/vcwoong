import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReportStatus, SectionStatus } from "@prisma/client";
import { reportReviewVersion } from "@/lib/report-review-version";
import {
  getUserTeamContext,
  reportWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

const updateSectionSchema = z.object({
  sectionId: z.string(),
  content: z.string().optional(),
  status: z.nativeEnum(SectionStatus).optional(),
  feedback: z.string().optional(),
  expectedReviewVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).refine(input => input.content === undefined || !!input.expectedReviewVersion, {
  message: "편집한 원본 버전이 필요합니다", path: ["expectedReviewVersion"],
});

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

  try {
    const body = await request.json();
    const validated = updateSectionSchema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.report.updateMany({
        where: { id: report.id, updatedAt: report.updatedAt },
        data: { updatedAt: report.updatedAt },
      });
      if (locked.count !== 1) return { kind: "conflict" } as const;
      const current = await tx.reportSection.findFirst({
        where: { id: validated.sectionId, reportId: report.id },
      });
      if (!current) return { kind: "missing" } as const;
      const contentChanged = validated.content !== undefined && validated.content !== current.content;
      if ((validated.content !== undefined || (validated.status === SectionStatus.APPROVED && !contentChanged)) &&
          validated.expectedReviewVersion !== await reportReviewVersion([current])) {
        return { kind: "conflict" } as const;
      }
      // 읽은 이후 변경/승인된 섹션을 덮어쓰지 않는다. 수정된 내용은 재승인이 필요하다.
      const updated = await tx.reportSection.updateMany({
        where: { id: current.id, reportId: report.id, updatedAt: current.updatedAt, status: current.status,
          content: current.content, title: current.title, sectionKey: current.sectionKey, order: current.order },
        data: {
          ...(validated.content !== undefined ? { content: validated.content } : {}),
          ...(contentChanged ? { status: SectionStatus.DRAFT } : validated.status ? { status: validated.status } : {}),
          ...(validated.feedback !== undefined ? { feedback: validated.feedback } : {}),
        },
      });
      if (updated.count === 0) return { kind: "conflict" } as const;
      if (contentChanged) {
        await tx.report.updateMany({
          where: { id: report.id, status: { in: [ReportStatus.FINAL, ReportStatus.EXPORTED] } },
          data: { status: ReportStatus.REVIEW },
        });
        // 초안 수정도 검증 작업의 스냅샷을 만료시킨다(완료 상태는 유지하지 않는다).
        await tx.report.update({ where: { id: report.id }, data: { updatedAt: new Date() } });
        await tx.reportEvidenceCheck.deleteMany({ where: { reportId: report.id } });
      }
      const section = await tx.reportSection.findFirst({
        where: { id: current.id, reportId: report.id },
      });
      return { kind: "saved", section } as const;
    });

    if (result.kind === "missing") {
      return NextResponse.json(
        { error: "섹션을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    if (result.kind === "conflict") {
      return NextResponse.json({ error: "다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 시도해 주세요." }, { status: 409 });
    }
    return NextResponse.json({ data: result.section });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
      return NextResponse.json({ error: "다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 시도해 주세요." }, { status: 409 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Section update failed");
    return NextResponse.json(
      { error: "섹션 수정 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
