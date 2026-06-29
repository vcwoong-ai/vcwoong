import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateReportDOCX } from "@/lib/docx-export";
import { generateTemplateBasedDOCX } from "@/lib/template/template-generator";
import { ReportStatus } from "@prisma/client";
import type { TemplateSectionMap } from "@/lib/template/template-mapper";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const report = await prisma.report.findFirst({
    where: { id: params.id, deal: { userId: session.user.id } },
    include: {
      deal: true,
      template: true,
      sections: { orderBy: { order: "asc" } },
    },
  });

  if (!report) {
    return NextResponse.json({ error: "보고서를 찾을 수 없습니다" }, { status: 404 });
  }

  if (report.sections.length === 0) {
    return NextResponse.json(
      { error: "보고서 섹션이 없습니다. 먼저 보고서를 생성해주세요." },
      { status: 400 }
    );
  }

  try {
    let buffer: Buffer;

    // 템플릿이 연결된 경우 → 템플릿 기반 생성
    if (report.template?.sectionMap && report.template.status === "READY") {
      buffer = await generateTemplateBasedDOCX(
        report.sections,
        report.template.sectionMap as unknown as TemplateSectionMap,
        {
          companyName: report.deal.companyName,
          dealInfo: {
            investRound: report.deal.investRound,
            investAmount: report.deal.investAmount,
            valuation: report.deal.valuation,
            sector: report.deal.sector,
          },
          reportDate: new Date(),
        }
      );
    } else {
      // 기본 DOCX 생성
      buffer = await generateReportDOCX(
        report as Parameters<typeof generateReportDOCX>[0]
      );
    }

    await prisma.report.update({
      where: { id: params.id },
      data: { status: ReportStatus.EXPORTED },
    });

    const filename = `${report.deal.companyName}_투자심의보고서_${new Date().toISOString().slice(0, 10)}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("DOCX export error:", error);
    return NextResponse.json(
      { error: "보고서 내보내기 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
