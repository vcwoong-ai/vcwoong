import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { ReportStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dealScope } from "@/lib/team";
import { generateReportDOCX } from "@/lib/docx-export";
import { generateTemplateBasedDOCX } from "@/lib/template/template-generator";
import { reconstructDOCX } from "@/lib/template/template-reconstructor";
import { reconstructPPTX } from "@/lib/template/pptx-reconstructor";
import { readFileByUrl } from "@/lib/storage";
import type { TemplateSectionMap } from "@/lib/template/template-mapper";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const bodySchema = z.object({
  /** exact = 원본 양식 1:1 재현, styled = 기존 방식 재생성 */
  mode: z.enum(["exact", "styled"]).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const report = await prisma.report.findFirst({
    where: { id: params.id, ...(await dealScope(session.user.id)) },
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

  const parsedBody = bodySchema.safeParse(await request.json().catch(() => ({})));
  const mode = parsedBody.success ? parsedBody.data.mode ?? "exact" : "exact";

  try {
    const template = report.template;
    const sectionMap =
      (template?.sectionMap as unknown as TemplateSectionMap | null) ?? null;

    let buffer: Buffer | null = null;
    let mime = DOCX_MIME;
    let extension = "docx";

    // 1순위 — 업로드된 원본 파일을 열어 본문만 교체 (폰트·색상·레이아웃 보존)
    if (mode === "exact" && template?.status === "READY") {
      const original = await readFileByUrl(template.fileUrl);
      if (original) {
        if (template.fileType === "PPTX") {
          const result = await reconstructPPTX(original, report.sections, sectionMap, {
            companyName: report.deal.companyName,
            reportDate: new Date(),
          });
          if (result) {
            buffer = result.buffer;
            mime = PPTX_MIME;
            extension = "pptx";
            console.log(
              `[Export] PPTX 재현: 채운 슬라이드 ${result.filledSections.length} / 미매칭 ${result.untouchedSlides.length}`
            );
          }
        } else {
          const result = await reconstructDOCX(original, report.sections, sectionMap, {
            companyName: report.deal.companyName,
            investRound: report.deal.investRound,
            investAmount: report.deal.investAmount,
            valuation: report.deal.valuation,
            sector: report.deal.sector,
            reportDate: new Date(),
          });
          if (result) {
            buffer = result.buffer;
            console.log(
              `[Export] DOCX 재현: 채운 섹션 ${result.filledSections.length} / 덧붙임 ${result.appendedSections.length} / 플레이스홀더 ${result.placeholdersReplaced}`
            );
          }
        }
      }
    }

    // 2순위 — 양식 순서만 반영한 재생성
    if (!buffer && sectionMap && template?.status === "READY") {
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
    }

    // 3순위 — 기본 DOCX
    if (!buffer) {
      buffer = await generateReportDOCX(
        report as Parameters<typeof generateReportDOCX>[0]
      );
    }

    await prisma.report.update({
      where: { id: params.id },
      data: { status: ReportStatus.EXPORTED },
    });

    const filename = `${report.deal.companyName}_투자심의보고서_${new Date().toISOString().slice(0, 10)}.${extension}`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "보고서 내보내기 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
