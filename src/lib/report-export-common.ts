import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/plans";
import { getUserPlanKey } from "@/lib/subscription";
import { ReportStatus } from "@prisma/client";
import { getUserTeamContext, reportReadWhere } from "@/lib/team-access";
import { traceReportEvidence } from "@/lib/evidence";
import { verdictsToMap } from "@/lib/evidence-ai";
import type { ScoreEvidenceAssessment } from "@/lib/deal-scoring-evidence";
import type { ScoreDimensionKey } from "@/lib/deal-scoring-shared";
import type { IcQuestion } from "@/lib/ic-questions";
import { buildInvestmentDecision } from "@/lib/vc-decision";
import { buildDecisionMemoSectionRefs, buildDecisionMemoSections } from "@/lib/vc-decision-memo";

export async function loadReportForExport(userId: string, reportId: string) {
  const { teamId } = await getUserTeamContext(userId);

  const report = await prisma.report.findFirst({
    where: { id: reportId, ...reportReadWhere(userId, teamId) },
    include: {
      deal: {
        include: {
          // metadata: PPTX 첨부 이미지 슬라이드용(문서 업로드 시 추출해둔 이미지 URL).
          // parsedText: 양식 재현 시 표준 섹션에 대응 안 되는 슬라이드/헤딩
          // (인력 구성·주주 구성 등)을 원본 IR 자료에서 대신 채우기 위해 필요.
          documents: { select: { name: true, metadata: true, parsedText: true } },
          // PR-K: Decision-First memo(vc-decision-memo.ts)가 필요로 하는 값 —
          // 새 AI 호출이 아니라 이미 계산·저장된 값을 추가로 select만 한다.
          score: true,
        },
      },
      template: true,
      sections: { orderBy: { order: "asc" } },
      evidenceCheck: { select: { verdicts: true } },
      icQuestions: { select: { questions: true } },
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

  // PR-K: Decision-First memo — /api/reports/[id]/evidence GET(traceReportEvidence)·
  // /api/deals/[id]/score(evidenceAssessment)·IC Questions 패널이 이미 화면에서
  // 쓰는 것과 정확히 같은 함수·같은 캐시만 재사용한다(evidence-ai.ts의
  // verdictsToMap도 새 AI 호출이 아니라 캐시 조회다). vc-decision.ts는 여기서도
  // 순수 함수로만 호출된다 — export 전용 새 생성 파이프라인이 아니다.
  const evidence = traceReportEvidence(
    report.sections.map((s) => ({ sectionKey: s.sectionKey, content: s.content })),
    report.deal.documents,
    { investAmount: report.deal.investAmount, valuation: report.deal.valuation },
    verdictsToMap(report.evidenceCheck?.verdicts)
  );
  const assessment = (report.deal.score?.evidenceAssessment ?? null) as unknown as
    | ScoreEvidenceAssessment
    | null;
  const rationale = (report.deal.score?.rationale ?? {}) as unknown as Partial<
    Record<ScoreDimensionKey, string>
  >;
  const questions = (report.icQuestions?.questions ?? null) as unknown as IcQuestion[] | null;
  const decision = buildInvestmentDecision(
    report.deal.score?.overall ?? 0,
    assessment,
    rationale,
    evidence.claims,
    questions,
    { investAmount: report.deal.investAmount, valuation: report.deal.valuation }
  );
  const sectionRefs = buildDecisionMemoSectionRefs(
    report.sections.map((s) => ({ sectionKey: s.sectionKey, title: s.title }))
  );
  const decisionMemoSections = buildDecisionMemoSections(decision, sectionRefs);

  return { report, canUseEngine, decisionMemoSections } as const;
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
