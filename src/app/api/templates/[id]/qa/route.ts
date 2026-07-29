import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { SectionKey } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { reconstructDOCX } from "@/lib/template/template-reconstructor";
import { reconstructPPTX } from "@/lib/template/pptx-reconstructor";
import { compareTemplateStructure } from "@/lib/template/structure-qa";
import type { TemplateSectionMap } from "@/lib/template/template-mapper";
import { getUserTeamContext, templateReadWhere } from "@/lib/team-access";

const SAMPLE_SECTIONS = [
  {
    sectionKey: SectionKey.INVESTMENT_OVERVIEW,
    title: "투자개요",
    content: "- Series B 100억\n- Post 800억\n\n핵심 요약입니다.",
  },
  {
    sectionKey: SectionKey.COMPANY_OVERVIEW,
    title: "회사개요",
    content: "2019년 설립, 임직원 48명.",
  },
  {
    sectionKey: SectionKey.MARKET_ANALYSIS,
    title: "시장분석",
    content: "TAM 12조원, CAGR 10%.",
  },
  {
    sectionKey: SectionKey.PRODUCT_TECHNOLOGY,
    title: "제품/기술",
    content: "- 핵심 기술 A\n- 파이프라인 B",
  },
  {
    sectionKey: SectionKey.RISK_ANALYSIS,
    title: "리스크",
    content: "- 임상 실패\n- 자금 조달",
  },
  {
    sectionKey: SectionKey.FINANCIAL_STATUS,
    title: "재무현황",
    content: "매출 50억, 영업이익 -10억.",
  },
  {
    sectionKey: SectionKey.VALUATION,
    title: "밸류에이션",
    content: "Post-money 800억원.",
  },
  {
    sectionKey: SectionKey.INVESTMENT_TERMS,
    title: "투자조건",
    content: "| 항목 | 내용 |\n|------|------|\n| 수단 | RCPS |",
  },
  {
    sectionKey: SectionKey.OPINION_SUMMARY,
    title: "의견종합",
    content: "**권고** — 투자 진행을 권고합니다.",
  },
];

/**
 * 원본 양식에 샘플 본문을 채워 넣고, 구조 보존 점수를 계산한다.
 * 렌더 이미지 비교 대신 OOXML 패키지/헤딩/테마 보존을 검증한다.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId } = await getUserTeamContext(session.user.id);
  const template = await prisma.template.findFirst({
    where: { id: params.id, ...templateReadWhere(session.user.id, teamId) },
  });
  if (!template) {
    return NextResponse.json({ error: "양식을 찾을 수 없습니다" }, { status: 404 });
  }

  const original = await readStoredFile(template.fileUrl);
  if (!original) {
    return NextResponse.json({ error: "원본 파일을 읽을 수 없습니다" }, { status: 404 });
  }

  if (template.status !== "READY" || !template.sectionMap) {
    return NextResponse.json(
      { error: "양식 분석이 완료되지 않았습니다" },
      { status: 400 }
    );
  }

  const sectionMap = template.sectionMap as unknown as TemplateSectionMap;
  const replacements = {
    기업명: "샘플기업",
    회사명: "샘플기업",
    작성일: new Date().toLocaleDateString("ko-KR"),
  };

  try {
    const fileType = template.fileType === "PPTX" ? "PPTX" : "DOCX";
    const reconstructed =
      fileType === "PPTX"
        ? await reconstructPPTX({
            originalBuffer: original,
            sectionMap,
            reportSections: SAMPLE_SECTIONS,
            replacements,
          })
        : await reconstructDOCX({
            originalBuffer: original,
            sectionMap,
            reportSections: SAMPLE_SECTIONS,
            replacements,
          });

    const qa = await compareTemplateStructure(
      original,
      reconstructed.buffer,
      fileType
    );

    return NextResponse.json({
      data: {
        ...qa,
        filledSections: reconstructed.filledSections,
        detectedHeadings: reconstructed.detectedHeadings,
        missedSections: reconstructed.missedSections,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "구조 비교에 실패했습니다. 섹션 매핑을 확인해 주세요.",
      },
      { status: 422 }
    );
  }
}
