import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/plans";
import { getUserPlanKey } from "@/lib/subscription";
import { ReportStatus, type Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { reportReviewVersion } from "@/lib/report-review-version";
import { getUserTeamContext, reportReadWhere } from "@/lib/team-access";
import { computeReportDecision } from "@/lib/vc-decision-loader";
import { buildReportPresentation } from "@/lib/report-presentation";
import { REPORT_MEETING_REFERENCE_INCLUDE } from "@/lib/decision-context";

// Both initial file inputs and final state admission read exactly the same DB projection.
const REPORT_EXPORT_INCLUDE = {
  deal: {
    include: {
      // metadata: PPTX 첨부 이미지 슬라이드용(문서 업로드 시 추출해둔 이미지 URL).
      // parsedText: 양식 재현 시 표준 섹션에 대응 안 되는 슬라이드/헤딩
      // (인력 구성·주주 구성 등)을 원본 IR 자료에서 대신 채우기 위해 필요.
      documents: { select: { id: true, name: true, metadata: true, parsedText: true, createdAt: true }, orderBy: { id: "asc" } },
      // PR-K: Decision-First memo(vc-decision-memo.ts)가 필요로 하는 값 —
      // 새 AI 호출이 아니라 이미 계산·저장된 값을 추가로 select만 한다.
      score: true,
      ...REPORT_MEETING_REFERENCE_INCLUDE,
    },
  },
  template: true,
  sections: { orderBy: [{ order: "asc" }, { id: "asc" }] },
  evidenceCheck: { select: { verdicts: true } },
  icQuestions: { select: { questions: true } },
  deepDive: { select: { claims: true, computedAt: true, updatedAt: true, modelUsed: true } },
} satisfies Prisma.ReportInclude;

type ReportExportInput = Prisma.ReportGetPayload<{ include: typeof REPORT_EXPORT_INCLUDE }>;
export interface ReportExportState {
  eligible: boolean;
  updatedAt: Date;
  contentVersion: string;
  artifactVersion: string;
}

function artifactVersion(report: ReportExportInput): string {
  // Server-only comparison, including memo evidence, score, template and document inputs.
  // This does not attest to external bytes behind a stored URL or later AI output.
  return createHash("sha256").update(JSON.stringify(["dealmind-export-input-v1", report])).digest("hex");
}

export async function loadReportForExport(userId: string, reportId: string) {
  const { teamId } = await getUserTeamContext(userId);

  const report = await prisma.report.findFirst({
    where: { id: reportId, ...reportReadWhere(userId, teamId) },
    include: REPORT_EXPORT_INCLUDE,
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

  // Decision-First memo — 화면(GET /api/reports/[id]/decision)과 같은 조립 함수
  // (vc-decision-loader.ts)를 쓴다. export 전용 파이프라인이 아니다.
  const decisionResult = computeReportDecision(report);
  const presentation = buildReportPresentation(decisionResult, report.deal.companyName);
  const decisionMemoSections = presentation.sections;

  const exportState: ReportExportState = {
    eligible: report.status === ReportStatus.FINAL && report.sections.length > 0 && report.sections.every(section => section.status === "APPROVED"),
    updatedAt: report.updatedAt,
    contentVersion: await reportReviewVersion(report.sections),
    artifactVersion: artifactVersion(report),
  };
  return { report, canUseEngine, decisionMemoSections, presentation, exportState } as const;
}

export async function markExported(reportId: string, expected: ReportExportState): Promise<boolean> {
  // Bytes from the original snapshot may still be downloaded, but may never mark
  // a subsequently edited/reapproved report or changed memo inputs as exported.
  if (!expected?.eligible) return false;
  try {
    return await prisma.$transaction(async tx => {
      const current = await tx.report.findUnique({ where: { id: reportId }, include: REPORT_EXPORT_INCLUDE });
      if (!current || current.status !== ReportStatus.FINAL || !current.sections.length ||
          current.sections.some(section => section.status !== "APPROVED") ||
          current.updatedAt.getTime() !== expected.updatedAt.getTime() ||
          await reportReviewVersion(current.sections) !== expected.contentVersion ||
          artifactVersion(current) !== expected.artifactVersion) return false;
      const changed = await tx.report.updateMany({
        where: {
          id: reportId,
          updatedAt: expected.updatedAt,
          status: ReportStatus.FINAL,
          sections: { some: {}, every: { status: "APPROVED" } },
        },
        data: { status: ReportStatus.EXPORTED },
      });
      return changed.count === 1;
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") return false;
    throw new Error("Export state could not be recorded");
  }
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
