import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Header,
  Footer,
  PageNumber,
} from "docx";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deal = await prisma.deal.findFirst({
    where: { id: params.id, userId: session.user.id },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const { sections } = await req.json();
  if (!sections) {
    return NextResponse.json({ error: "섹션 데이터가 없습니다." }, { status: 400 });
  }

  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const children: Paragraph[] = [];

  // Title Page
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "", break: 1 })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "투자심의보고서",
          bold: true,
          size: 52,
          color: "1B4FD8",
          font: "맑은 고딕",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: deal.companyName,
          bold: true,
          size: 40,
          font: "맑은 고딕",
          color: "1F2937",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `작성일: ${today}`,
          size: 24,
          color: "6B7280",
          font: "맑은 고딕",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `[대외비]`,
          size: 22,
          color: "DC2626",
          bold: true,
          font: "맑은 고딕",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    }),
    new Paragraph({ pageBreakBefore: true, children: [] })
  );

  // Deal Info Table

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "딜 개요",
          bold: true,
          size: 28,
          color: "1B4FD8",
          font: "맑은 고딕",
        }),
      ],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 200 },
    })
  );

  children.push(
    new Paragraph({
      children: [],
      spacing: { after: 400 },
    })
  );

  // Sections
  const SECTION_ORDER = [
    "overview", "business_model", "market_analysis", "competitive_landscape",
    "technology", "team", "financials", "investment_terms", "risk_factors", "investment_opinion",
  ];

  for (const key of SECTION_ORDER) {
    const sectionData = sections[key];
    if (!sectionData) continue;

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: sectionData.title || key,
            bold: true,
            size: 30,
            color: "1B4FD8",
            font: "맑은 고딕",
          }),
        ],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 160 },
        border: {
          bottom: {
            color: "1B4FD8",
            space: 1,
            style: BorderStyle.SINGLE,
            size: 6,
          },
        },
      })
    );

    // Key points
    if (sectionData.keyPoints && sectionData.keyPoints.length > 0) {
      for (const point of sectionData.keyPoints) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `• ${point}`,
                size: 20,
                color: "1B4FD8",
                bold: true,
                font: "맑은 고딕",
              }),
            ],
            spacing: { after: 60 },
            indent: { left: 360 },
          })
        );
      }
      children.push(
        new Paragraph({ children: [], spacing: { after: 120 } })
      );
    }

    // Content
    const contentParagraphs = (sectionData.content || "").split("\n").filter(Boolean);
    for (const para of contentParagraphs) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: para,
              size: 22,
              font: "맑은 고딕",
              color: "374151",
            }),
          ],
          spacing: { after: 120, line: 340 },
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
                    text: `${deal.companyName} 투자심의보고서`,
                    size: 18,
                    color: "9CA3AF",
                    font: "맑은 고딕",
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
                    text: "[대외비] ",
                    size: 16,
                    color: "DC2626",
                    font: "맑은 고딕",
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES],
                    size: 16,
                    color: "9CA3AF",
                    font: "맑은 고딕",
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

  const buffer = await Packer.toBuffer(doc);
  const uint8Array = new Uint8Array(buffer);

  return new Response(uint8Array, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="report-${deal.companyName}-${Date.now()}.docx"`,
    },
  });
}
