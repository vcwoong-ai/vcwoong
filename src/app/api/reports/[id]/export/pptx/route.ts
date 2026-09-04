import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateReportPPTX } from "@/lib/pptx-export";
import { reconstructPPTX } from "@/lib/template/pptx-reconstructor";
import { readStoredFile } from "@/lib/storage";
import type { TemplateSectionMap } from "@/lib/template/template-mapper";
import {
  loadReportForExport,
  markExported,
  exportFilename,
  collectDocumentImages,
} from "@/lib/report-export-common";

// 표준 섹션에 없는 슬라이드 제목은 업로드 자료에서 최대 6번까지 순차 AI
// 호출로 채운다(slide-extraction.ts) — 기본 함수 실행시간(플랫폼 기본값,
// Hobby 플랜은 10초)로는 부족해 vercel.json의 다른 AI 호출 라우트와
// 동일하게 60초로 맞춰둔다.
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
    let pptxBuffer: Buffer | null = null;
    let mode = "pptx-generated";

    if (canUseEngine && report.template?.fileType === "PPTX") {
      const original = await readStoredFile(report.template.fileUrl);
      if (original) {
        try {
          const sectionMap = report.template
            .sectionMap as unknown as TemplateSectionMap;
          const result = await reconstructPPTX({
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
          pptxBuffer = result.buffer;
          mode = `pptx-reconstructed:${result.filledSections}/${result.detectedHeadings}` +
            (result.extractedFromDocuments.length
              ? `+extracted:${result.extractedFromDocuments.length}`
              : "");
        } catch (err) {
          console.warn(
            "[Export] PPTX 재현 실패 — 신규 생성으로 폴백:",
            err instanceof Error ? err.message : err
          );
        }
      }
    }

    const buffer =
      pptxBuffer ??
      (await generateReportPPTX(
        report.sections,
        { companyName: report.deal.companyName, reportDate: new Date() },
        collectDocumentImages(report.deal.documents)
      ));

    await markExported(params.id);

    const filename = exportFilename(report.deal.companyName, "pptx");

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": buffer.length.toString(),
        "X-Export-Mode": mode,
      },
    });
  } catch (error) {
    console.error("PPTX export error:", error);
    return NextResponse.json(
      { error: "보고서 내보내기 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
