import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateReportDOCX } from "@/lib/docx-export";
import { generateTemplateBasedDOCX } from "@/lib/template/template-generator";
import { reconstructDOCX } from "@/lib/template/template-reconstructor";
import { readStoredFile } from "@/lib/storage";
import type { TemplateSectionMap } from "@/lib/template/template-mapper";
import {
  loadReportForExport,
  markExported,
  exportFilename,
} from "@/lib/report-export-common";

// 표준 섹션에 없는 헤딩은 업로드 자료에서 최대 6번까지 순차 AI 호출로
// 채운다(slide-extraction.ts) — 기본 함수 실행시간(플랫폼 기본값, Hobby
// 플랜은 10초)로는 부족해 vercel.json의 다른 AI 호출 라우트와 동일하게
// 60초로 맞춰둔다.
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const result = await loadReportForExport(session.user.id, params.id);
  if ("error" in result) return result.error;
  const { report, canUseEngine } = result;

  try {
    let buffer: Buffer | null = null;
    // 어떤 경로로 만들어졌는지 클라이언트가 알 수 있게 헤더로 알린다
    let mode = "default";

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
              documents: report.deal.documents,
            });
            buffer = result.buffer;
            mode = `reconstructed:${result.filledSections}/${result.detectedHeadings}` +
              (result.extractedFromDocuments.length
                ? `+extracted:${result.extractedFromDocuments.length}`
                : "");
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

    await markExported(params.id);

    const filename = exportFilename(report.deal.companyName, "docx");

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
