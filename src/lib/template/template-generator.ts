/**
 * 템플릿 기반 DOCX 생성기.
 *
 * 업로드된 VC 양식의 섹션 구조를 따르되,
 * AI가 생성한 내용을 해당 섹션에 채워 넣는다.
 *
 * 전략:
 * 1. 템플릿 구조(sectionMap)에서 순서 결정
 * 2. 각 섹션의 AI 내용을 해당 제목 아래 삽입
 * 3. 기존 docx 스타일(색상, 폰트)을 최대한 모방
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  PageBreak,
  BorderStyle,
  Header,
  Footer,
  UnderlineType,
} from "docx";
import { SectionKey } from "@prisma/client";
import { SECTION_META } from "@/types";
import type { TemplateSectionMap } from "./template-mapper";

interface ReportSectionData {
  sectionKey: SectionKey;
  title: string;
  content: string;
  order: number;
}

interface GenerateOptions {
  companyName: string;
  dealInfo: {
    investRound?: string | null;
    investAmount?: number | null;
    valuation?: number | null;
    sector?: string;
  };
  reportDate?: Date;
  vcFirmName?: string;
}

/**
 * 마크다운을 DOCX 단락 배열로 변환
 */
function markdownToParagraphs(content: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraphs.push(new Paragraph({ spacing: { after: 80 } }));
      continue;
    }

    // ### 헤딩 3
    if (trimmed.startsWith("### ")) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed.replace(/^###\s+/, ""),
              bold: true,
              size: 22,
              color: "1F3864",
            }),
          ],
          spacing: { before: 240, after: 80 },
        })
      );
      continue;
    }

    // ## 헤딩 2
    if (trimmed.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed.replace(/^##\s+/, ""),
              bold: true,
              size: 24,
              color: "1F3864",
            }),
          ],
          spacing: { before: 300, after: 100 },
        })
      );
      continue;
    }

    // 불릿 리스트 (- 또는 *)
    if (/^[-*]\s+/.test(trimmed)) {
      const text = trimmed.replace(/^[-*]\s+/, "");
      paragraphs.push(
        new Paragraph({
          children: parseBoldText(text),
          bullet: { level: 0 },
          spacing: { after: 80 },
        })
      );
      continue;
    }

    // 들여쓰기 불릿 (  - 또는   *)
    if (/^\s{2,}[-*]\s+/.test(line)) {
      const text = line.replace(/^\s*[-*]\s+/, "");
      paragraphs.push(
        new Paragraph({
          children: parseBoldText(text),
          bullet: { level: 1 },
          spacing: { after: 60 },
        })
      );
      continue;
    }

    // | 표 행
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      // 표는 별도 처리 필요 — 일단 일반 단락으로
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed, font: "Courier New", size: 18 })],
          spacing: { after: 60 },
        })
      );
      continue;
    }

    // 일반 단락
    paragraphs.push(
      new Paragraph({
        children: parseBoldText(trimmed),
        spacing: { after: 100 },
      })
    );
  }

  return paragraphs;
}

/**
 * **굵은글씨** 패턴을 TextRun 배열로 변환
 */
function parseBoldText(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/);

  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**")) {
      runs.push(
        new TextRun({
          text: part.slice(2, -2),
          bold: true,
          size: 20,
          font: "맑은 고딕",
        })
      );
    } else if (part) {
      runs.push(
        new TextRun({
          text: part,
          size: 20,
          font: "맑은 고딕",
        })
      );
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text, size: 20, font: "맑은 고딕" })];
}

/**
 * 투자 조건 요약 테이블 생성
 */
function createInvestmentTable(options: GenerateOptions): Table {
  const rows = [
    ["투자 라운드", options.dealInfo.investRound ?? "N/A"],
    ["투자 금액", options.dealInfo.investAmount ? `${options.dealInfo.investAmount.toLocaleString()}억원` : "N/A"],
    ["Post-money 밸류에이션", options.dealInfo.valuation ? `${options.dealInfo.valuation.toLocaleString()}억원` : "N/A"],
    ["섹터", options.dealInfo.sector ?? "N/A"],
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "2E75B6" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "2E75B6" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "2E75B6" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "2E75B6" },
    },
    rows: rows.map(([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: label, bold: true, size: 20, color: "1F3864" })],
              }),
            ],
            width: { size: 35, type: WidthType.PERCENTAGE },
            shading: { fill: "E8F0FE" },
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: value, size: 20 })],
              }),
            ],
            width: { size: 65, type: WidthType.PERCENTAGE },
          }),
        ],
      })
    ),
  });
}

/**
 * 템플릿 구조에 따라 DOCX 생성.
 *
 * @param sections     AI가 생성한 보고서 섹션들
 * @param sectionMap   템플릿 매핑 정보 (없으면 기본 순서 사용)
 * @param options      회사/딜 정보
 */
export async function generateTemplateBasedDOCX(
  sections: ReportSectionData[],
  sectionMap: TemplateSectionMap | null,
  options: GenerateOptions
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  // ── 표지 ──────────────────────────────────────────
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "투 자 심 의 보 고 서",
          bold: true,
          size: 52,
          color: "1F3864",
          font: "맑은 고딕",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 2000, after: 400 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: options.companyName,
          bold: true,
          size: 36,
          color: "2E75B6",
          font: "맑은 고딕",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: options.vcFirmName ?? "DealSync",
          size: 24,
          color: "595959",
          font: "맑은 고딕",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: (options.reportDate ?? new Date()).toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
          size: 20,
          color: "808080",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "[ 대외비 ]", bold: true, size: 20, color: "FF0000" })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ children: [new PageBreak()] })
  );

  // ── 투자 조건 요약 테이블 ──────────────────────────
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "■ 투자 조건 요약", bold: true, size: 24, color: "1F3864" })],
      spacing: { before: 400, after: 200 },
    }),
    createInvestmentTable(options),
    new Paragraph({ spacing: { after: 400 } })
  );

  // ── 섹션 내용 ──────────────────────────────────────
  // 템플릿 매핑이 있으면 매핑 순서대로, 없으면 기본 순서
  let orderedSections = [...sections].sort((a, b) => a.order - b.order);

  if (sectionMap && sectionMap.mappings.length > 0) {
    // 매핑된 순서로 재정렬
    const mappedOrder = sectionMap.mappings
      .filter((m) => m.sectionKey !== null)
      .map((m) => m.sectionKey as SectionKey);

    const mappedSections = mappedOrder
      .map((key) => sections.find((s) => s.sectionKey === key))
      .filter(Boolean) as ReportSectionData[];

    const unmappedSections = sections.filter(
      (s) => !mappedOrder.includes(s.sectionKey)
    );

    orderedSections = [...mappedSections, ...unmappedSections];
  }

  for (let i = 0; i < orderedSections.length; i++) {
    const section = orderedSections[i];
    const meta = SECTION_META.find((m) => m.key === section.sectionKey);

    // 섹션 헤딩
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${i + 1}. ${section.title || meta?.title || section.sectionKey}`,
            bold: true,
            size: 28,
            color: "1F3864",
            font: "맑은 고딕",
            underline: { type: UnderlineType.SINGLE, color: "2E75B6" },
          }),
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 600, after: 200 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: "2E75B6" },
        },
      })
    );

    // 섹션 내용
    const contentParagraphs = markdownToParagraphs(section.content);
    children.push(...contentParagraphs);

    // 섹션 구분선
    if (i < orderedSections.length - 1) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "" })],
          border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" } },
          spacing: { before: 300, after: 0 },
        })
      );
    }
  }

  const doc = new Document({
    creator: "DealSync",
    title: `${options.companyName} 투자심의보고서`,
    description: "AI 생성 투자심의보고서",
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${options.companyName} 투자심의보고서`,
                    size: 16,
                    color: "808080",
                  }),
                  new TextRun({ text: "  |  ", size: 16, color: "CCCCCC" }),
                  new TextRun({ text: options.vcFirmName ?? "DealSync", size: 16, color: "808080" }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "대외비", size: 16, color: "808080" }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
