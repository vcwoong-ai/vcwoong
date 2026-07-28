import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateReportDOCX } from "@/lib/docx-export";
import { generateReportPPTX } from "@/lib/pptx-export";
import { generateTemplateBasedDOCX } from "@/lib/template/template-generator";
import { reconstructDOCX } from "@/lib/template/template-reconstructor";
import { readStoredFile } from "@/lib/storage";
import { hasFeature } from "@/lib/plans";
import { getUserPlanKey } from "@/lib/subscription";
import { ReportStatus } from "@prisma/client";
import type { TemplateSectionMap } from "@/lib/template/template-mapper";
import { getUserTeamContext, reportReadWhere } from "@/lib/team-access";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId } = await getUserTeamContext(session.user.id);
  const format = new URL(request.url).searchParams.get("format") ?? "docx";

  const report = await prisma.report.findFirst({
    where: { id: params.id, ...reportReadWhere(session.user.id, teamId) },
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
    // PPTX 내보내기
    if (format === "pptx") {
      const buffer = await generateReportPPTX(report.sections, {
        companyName: report.deal.companyName,
        reportDate: new Date(),
      });

      await prisma.report.update({
        where: { id: params.id },
        data: { status: ReportStatus.EXPORTED },
      });

      const filename = `${report.deal.companyName}_투자심의보고서_${new Date().toISOString().slice(0, 10)}.pptx`;

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "Content-Length": buffer.length.toString(),
          "X-Export-Mode": "pptx-generated",
        },
      });
    }

    let buffer: Buffer | null = null;
    // 어떤 경로로 만들어졌는지 클라이언트가 알 수 있게 헤더로 알린다
    let mode = "default";

    const templateReady =
      report.template?.sectionMap && report.template.status === "READY";
    const canUseEngine =
      templateReady && hasFeature(await getUserPlanKey(session.user.id), "templateEngine");

    if (canUseEngine && report.template) {
      const sectionMap = report.template
        .sectionMap as unknown as TemplateSectionMap;

      // 1순위: 원본 파일에 본문만 갈아끼워 서식을 1:1로 유지
      if (report.template.fileType === "DOCX") {
        const original = await readStoredFile(report.template.fileUrl);
        if (original) {
          try {
            const result = await reconstructDOCX({
              originalBuffer: original,
              sectionMap,
              reportSections: report.sections.map((s) => ({
                sectionKey: s.sectionKey,
                title: s.title,
                content: s.content,
              })),
              replacements: {
                기업명: report.deal.companyName,
                회사명: report.deal.companyName,
                작성일: new Date().toLocaleDateString("ko-KR"),
                투자라운드: report.deal.investRound ?? "",
              },
            });
            buffer = result.buffer;
            mode = `reconstructed:${result.filledSections}/${result.detectedHeadings}`;
          } catch (err) {
            console.warn(
              "[Export] 양식 재현 실패 — 템플릿 생성기로 폴백:",
              err instanceof Error ? err.message : err
            );
          }
        }
      }

      // 2순위: 섹션 순서만 반영한 신규 DOCX
      if (!buffer) {
        buffer = await generateTemplateBasedDOCX(report.sections, sectionMap, {
          companyName: report.deal.companyName,
          dealInfo: {
            investRound: report.deal.investRound,
            investAmount: report.deal.investAmount,
            valuation: report.deal.valuation,
            sector: report.deal.sector,
          },
          reportDate: new Date(),
        });
        mode = "template-ordered";
      }
    }

    // 3순위: 기본 양식
    if (!buffer) {
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
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": buffer.length.toString(),
        "X-Export-Mode": mode,
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
