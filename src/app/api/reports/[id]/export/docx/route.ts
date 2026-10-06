import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PRIVATE_RESPONSE_HEADERS } from "@/lib/private-response-headers";
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
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401, headers: PRIVATE_RESPONSE_HEADERS });
    }

    const result = await loadReportForExport(session.user.id, params.id);
    if ("error" in result) {
      const errorResponse = result.error;
      if (!errorResponse) throw new Error("Export result unavailable");
      const headers = new Headers(errorResponse.headers);
      const vary = headers.get("Vary")?.split(",").map(value => value.trim()).filter(Boolean) ?? [];
      if (!vary.some(value => value.toLowerCase() === "cookie")) vary.push("Cookie");
      for (const [name, value] of Object.entries(PRIVATE_RESPONSE_HEADERS)) {
        if (name !== "Vary") headers.set(name, value);
      }
      headers.set("Vary", vary.join(", "));
      return new NextResponse(errorResponse.body, { status: errorResponse.status, statusText: errorResponse.statusText, headers });
    }
    const { report, canUseEngine, decisionMemoSections, exportState } = result;

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
              // PR-L.1: 1순위(원본 파일 1:1 재현)에도 Decision-First memo를
              // 표지 보존 + 첫 매핑 섹션 직전 삽입 방식으로 전달한다.
              decisionMemoSections,
            });
            buffer = result.buffer;
            mode = `reconstructed:${result.filledSections}/${result.detectedHeadings}` +
              (result.extractedFromDocuments.length
                ? `+extracted:${result.extractedFromDocuments.length}`
                : "");
          } catch {
            console.warn("[Export] DOCX reconstruction fallback");
          }
        }
      }

      // 2순위: 섹션 순서만 반영한 신규 DOCX
      if (!buffer) {
        buffer = await generateTemplateBasedDOCX(
          report.sections,
          sectionMap,
          {
            companyName: report.deal.companyName,
            dealInfo: {
              investRound: report.deal.investRound,
              investAmount: report.deal.investAmount,
              valuation: report.deal.valuation,
              sector: report.deal.sector,
            },
            reportDate: new Date(),
          },
          // PR-L.1: 2순위(docx 라이브러리 기반 신규 생성)에도 표지/요약표
          // 다음, 기존 섹션 앞에 삽입한다.
          decisionMemoSections
        );
        mode = "template-ordered";
      }
    }

    // 3순위: 기본 양식(PR-K: Decision-First memo). PR-L.1부터는 1/2순위
    // (회사가 업로드한 자체 템플릿 기반 export)에도 memo가 삽입된다 — 위
    // 두 분기의 decisionMemoSections 전달 참고.
    if (!buffer) {
      buffer = await generateReportDOCX(
        report as Parameters<typeof generateReportDOCX>[0],
        decisionMemoSections
      );
    }

    await markExported(params.id, exportState);

    const filename = exportFilename(report.deal.companyName, "docx");

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...PRIVATE_RESPONSE_HEADERS,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": buffer.length.toString(),
        "X-Export-Mode": mode,
      },
    });
  } catch {
    console.error("[Export] DOCX export failed");
    return NextResponse.json(
      { error: "보고서 내보내기 중 오류가 발생했습니다" },
      { status: 500, headers: PRIVATE_RESPONSE_HEADERS }
    );
  }
}
