import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/plans";
import { getUserPlanKey } from "@/lib/subscription";
import { ReportStatus } from "@prisma/client";
import { getUserTeamContext, reportReadWhere } from "@/lib/team-access";

export async function loadReportForExport(userId: string, reportId: string) {
  const { teamId } = await getUserTeamContext(userId);

  const report = await prisma.report.findFirst({
    where: { id: reportId, ...reportReadWhere(userId, teamId) },
    include: {
      deal: true,
      template: true,
      sections: { orderBy: { order: "asc" } },
    },
  });

  if (!report) {
    return {
      error: NextResponse.json({ error: "보고서를 찾을 수 없습니다" }, { status: 404 }),
    } as const;
  }

  if (report.sections.length === 0) {
    return {
      error: NextResponse.json(
        { error: "보고서 섹션이 없습니다. 먼저 보고서를 생성해주세요." },
        { status: 400 }
      ),
    } as const;
  }

  const templateReady =
    report.template?.sectionMap && report.template.status === "READY";
  const canUseEngine =
    templateReady && hasFeature(await getUserPlanKey(userId), "templateEngine");

  return { report, canUseEngine } as const;
}

export async function markExported(reportId: string) {
  await prisma.report.update({
    where: { id: reportId },
    data: { status: ReportStatus.EXPORTED },
  });
}

export function exportFilename(companyName: string, ext: "docx" | "pptx"): string {
  return `${companyName}_투자심의보고서_${new Date().toISOString().slice(0, 10)}.${ext}`;
}
