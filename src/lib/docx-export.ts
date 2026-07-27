/**
 * DOCX export utility for IC Reports.
 * Generates a structured investment committee report in DOCX format.
 */

import { BRAND } from "@/lib/brand";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  PageBreak,
  Header,
  Footer,
  PageNumber,
} from "docx";
import { ReportWithSections } from "@/types";
import { SECTION_META } from "@/types";

export async function generateReportDOCX(
  report: ReportWithSections
): Promise<Buffer> {
  const deal = report.deal;
  const sections = [...report.sections].sort((a, b) => a.order - b.order);

  const children: (Paragraph | Table)[] = [];

  // Cover page
  children.push(
    new Paragraph({
      children: [new PageBreak()],
    })
  );

  // Title
  children.push(
    new Paragraph({
      text: "투자심의보고서",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 3000, after: 600 },
    })
  );

  children.push(
    new Paragraph({
      text: deal.companyName,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 400 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `작성일: ${new Date().toLocaleDateString("ko-KR")}`,
          size: 22,
          color: "666666",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  if (deal.investRound) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `투자 라운드: ${deal.investRound}`,
            size: 22,
            color: "666666",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    );
  }

  // Separator
  children.push(
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" },
      },
      spacing: { before: 600, after: 600 },
    })
  );

  // Investment summary table
  const summaryData = [
    ["기업명", deal.companyName],
    ["섹터", deal.sector],
    ["투자 라운드", deal.investRound ?? "미정"],
    [
      "투자 금액",
      deal.investAmount ? `${deal.investAmount.toLocaleString()}억원` : "미정",
    ],
    [
      "기업가치 (Post)",
      deal.valuation ? `${deal.valuation.toLocaleString()}억원` : "미정",
    ],
    ["보고서 유형", `${report.agentType} Agent`],
  ];

  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: summaryData.map(
      ([label, value]) =>
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: label, bold: true, size: 20 }),
                  ],
                }),
              ],
              width: { size: 30, type: WidthType.PERCENTAGE },
              shading: { fill: "F5F5F5" },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: value, size: 20 })],
                }),
              ],
              width: { size: 70, type: WidthType.PERCENTAGE },
            }),
          ],
        })
    ),
  });

  // Summary table
  children.push(summaryTable);

  // Page break before content
  children.push(
    new Paragraph({
      children: [new PageBreak()],
    })
  );

  // Sections
  for (const section of sections) {
    const meta = SECTION_META.find((m) => m.key === section.sectionKey);

    // Section heading
    children.push(
      new Paragraph({
        text: `${meta?.order ?? ""}. ${section.title}`,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 600, after: 300 },
      })
    );

    // Section content - parse markdown-like formatting
    const contentLines = section.content.split("\n");
    for (const line of contentLines) {
      if (!line.trim()) {
        children.push(new Paragraph({ text: "" }));
        continue;
      }

      if (line.startsWith("### ")) {
        children.push(
          new Paragraph({
            text: line.replace("### ", ""),
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 300, after: 100 },
          })
        );
      } else if (line.startsWith("## ")) {
        children.push(
          new Paragraph({
            text: line.replace("## ", ""),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
          })
        );
      } else if (line.startsWith("- ") || line.startsWith("• ")) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "• " + line.replace(/^[-•]\s/, ""), size: 20 }),
            ],
            indent: { left: 360 },
            spacing: { after: 100 },
          })
        );
      } else if (line.match(/^\*\*(.+)\*\*/)) {
        const parts = line.split(/\*\*(.+?)\*\*/g);
        const runs = parts.map((part, idx) =>
          idx % 2 === 1
            ? new TextRun({ text: part, bold: true, size: 20 })
            : new TextRun({ text: part, size: 20 })
        );
        children.push(
          new Paragraph({
            children: runs,
            spacing: { after: 120 },
          })
        );
      } else {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line, size: 20 })],
            spacing: { after: 120 },
          })
        );
      }
    }

    // Page break after each section (except last)
    if (section !== sections[sections.length - 1]) {
      children.push(
        new Paragraph({
          children: [new PageBreak()],
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${BRAND.name} | ${deal.companyName} 투자심의보고서`,
                    size: 18,
                    color: "999999",
                  }),
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
                  new TextRun({
                    text: "대외비 — 본 문서는 투자심의를 위한 내부 자료입니다.",
                    size: 16,
                    color: "999999",
                  }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "999999" }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

/**
 * 마크다운 본문을 그대로 DOCX로 변환한다 (LP 리포트 등 범용 문서용).
 * 헤딩·표·불릿만 처리하고 나머지는 일반 단락으로 둔다.
 */
export async function generateMarkdownDOCX(params: {
  title: string;
  subtitle?: string;
  markdown: string;
}): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      text: params.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 600, after: 200 },
    })
  );
  if (params.subtitle) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: params.subtitle, size: 22, color: "666666" }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 500 },
      })
    );
  }

  const lines = params.markdown.split("\n");
  let tableBuffer: string[] = [];

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    const rows = tableBuffer
      .filter((l) => !/^\|\s*-{2,}/.test(l.replace(/\s/g, "")))
      .map((l) =>
        l
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim())
      );
    tableBuffer = [];
    if (rows.length === 0) return;

    const colCount = Math.max(...rows.map((r) => r.length));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: rows.map(
          (cells, rowIdx) =>
            new TableRow({
              children: Array.from({ length: colCount }, (_, i) => {
                const text = cells[i] ?? "";
                return new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({ text, bold: rowIdx === 0, size: 20 }),
                      ],
                    }),
                  ],
                  shading:
                    rowIdx === 0 ? { fill: "F2F4F7", type: "clear" } : undefined,
                });
              }),
            })
        ),
      })
    );
    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trimStart().startsWith("|")) {
      tableBuffer.push(line.trim());
      continue;
    }
    flushTable();

    if (!line.trim()) {
      children.push(new Paragraph({ text: "" }));
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      children.push(
        new Paragraph({
          text: heading[2],
          heading:
            level === 1
              ? HeadingLevel.HEADING_1
              : level === 2
                ? HeadingLevel.HEADING_2
                : HeadingLevel.HEADING_3,
          spacing: { before: 280, after: 140 },
        })
      );
      continue;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      children.push(
        new Paragraph({
          text: bullet[1].replace(/\*\*/g, ""),
          bullet: { level: 0 },
          spacing: { after: 60 },
        })
      );
      continue;
    }

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: line.replace(/\*\*/g, ""), size: 22 }),
        ],
        spacing: { after: 120 },
      })
    );
  }
  flushTable();

  const doc = new Document({
    sections: [
      {
        properties: {},
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${BRAND.name} · 대외비 — `,
                    size: 16,
                    color: "999999",
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 16,
                    color: "999999",
                  }),
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

  return Packer.toBuffer(doc);
}
