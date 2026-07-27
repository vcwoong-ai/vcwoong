import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { SectionKey } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readFileByUrl } from "@/lib/storage";
import { dealScope, getAccessScope, ownedOrShared } from "@/lib/team";
import { analyzeDocxOutline } from "@/lib/template/template-reconstructor";
import { analyzePptxOutline } from "@/lib/template/pptx-reconstructor";
import type { TemplateSectionMap } from "@/lib/template/template-mapper";

export type CompareStatus = "filled" | "unmapped" | "missing-content";

interface CompareRow {
  heading: string;
  sectionKey: SectionKey | null;
  originalPreview: string;
  generatedPreview: string | null;
  status: CompareStatus;
}

/**
 * 원본 양식과 생성 결과를 나란히 비교할 데이터를 만든다.
 * 파일을 변형하지 않고 헤딩 구조만 읽는다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const template = await prisma.template.findFirst({
    where: { id: params.id, ...ownedOrShared(await getAccessScope(session.user.id)) },
  });
  if (!template) {
    return NextResponse.json({ error: "양식을 찾을 수 없습니다" }, { status: 404 });
  }

  const original = await readFileByUrl(template.fileUrl);
  if (!original) {
    return NextResponse.json(
      { error: "원본 파일을 읽을 수 없습니다. 양식을 다시 업로드해주세요." },
      { status: 404 }
    );
  }

  const sectionMap =
    (template.sectionMap as unknown as TemplateSectionMap | null) ?? null;

  const outline =
    template.fileType === "PPTX"
      ? await analyzePptxOutline(original, sectionMap)
      : await analyzeDocxOutline(original, sectionMap);

  if (!outline) {
    return NextResponse.json(
      { error: "원본에서 섹션 구조를 찾지 못했습니다" },
      { status: 422 }
    );
  }

  // 보고서를 지정하면 실제 생성 본문을 붙여 비교한다
  const reportId = request.nextUrl.searchParams.get("reportId");
  const report = reportId
    ? await prisma.report.findFirst({
        where: { id: reportId, ...(await dealScope(session.user.id)) },
        include: {
          deal: { select: { companyName: true } },
          sections: { orderBy: { order: "asc" } },
        },
      })
    : null;

  const contentByKey = new Map(
    (report?.sections ?? []).map((s) => [s.sectionKey, s.content])
  );

  const rows: CompareRow[] = outline.map((entry) => {
    const content = entry.sectionKey ? contentByKey.get(entry.sectionKey) : undefined;
    const status: CompareStatus = !entry.sectionKey
      ? "unmapped"
      : content
        ? "filled"
        : "missing-content";

    return {
      heading: entry.heading,
      sectionKey: entry.sectionKey,
      originalPreview: entry.originalPreview,
      generatedPreview: content ? content.slice(0, 600) : null,
      status,
    };
  });

  const usedKeys = new Set(
    rows.filter((r) => r.status === "filled").map((r) => r.sectionKey)
  );
  const appendedSections = (report?.sections ?? [])
    .filter((s) => !usedKeys.has(s.sectionKey))
    .map((s) => ({ sectionKey: s.sectionKey, title: s.title }));

  return NextResponse.json({
    data: {
      template: {
        id: template.id,
        name: template.name,
        fileType: template.fileType,
        originalName: template.originalName,
      },
      report: report
        ? { id: report.id, title: report.title, companyName: report.deal.companyName }
        : null,
      rows,
      appendedSections,
      coverage: rows.length
        ? Math.round((rows.filter((r) => r.status === "filled").length / rows.length) * 100)
        : 0,
    },
  });
}
