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
      deal: {
        include: {
          // PPTX 내보내기의 첨부 이미지 슬라이드용 — 문서 업로드 시
          // 추출해둔 이미지 URL만 가볍게 가져온다(parsedText 전체는 불필요).
          documents: { select: { name: true, metadata: true } },
        },
      },
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

export interface AttachedImage {
  url: string;
  mimeType: string;
  /** 어느 업로드 문서에서 나왔는지 — 첨부 슬라이드 캡션에 쓴다 */
  sourceName: string;
}

/**
 * 문서 업로드 시 metadata.images에 저장해둔 이미지 목록을 꺼낸다.
 * 형식이 예상과 다르면(오래된 문서 등) 그냥 건너뛴다 — 이미지 하나
 * 잘못됐다고 내보내기 전체가 죽으면 안 된다.
 */
export function collectDocumentImages(
  documents: Array<{ name: string; metadata: unknown }>,
  maxTotal = 8
): AttachedImage[] {
  const images: AttachedImage[] = [];
  for (const doc of documents) {
    const raw = doc.metadata;
    if (!raw || typeof raw !== "object" || !("images" in raw)) continue;
    const list = (raw as { images?: unknown }).images;
    if (!Array.isArray(list)) continue;

    for (const item of list) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as { url?: unknown }).url === "string" &&
        typeof (item as { mimeType?: unknown }).mimeType === "string"
      ) {
        images.push({
          url: (item as { url: string }).url,
          mimeType: (item as { mimeType: string }).mimeType,
          sourceName: doc.name,
        });
        if (images.length >= maxTotal) return images;
      }
    }
  }
  return images;
}
