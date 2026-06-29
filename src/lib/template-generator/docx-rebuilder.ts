import { Document, Paragraph, TextRun, HeadingLevel, Packer } from "docx";

export type DocxSection = {
  heading: string;
  content: string;
};

export async function rebuildDOCX(
  sections: DocxSection[],
  meta: { companyName: string; reviewerName: string; reviewDate: string }
): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      text: `${meta.companyName} 투자심사보고서`,
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `작성일: ${meta.reviewDate}  |  심사역: ${meta.reviewerName}`, size: 20 }),
      ],
    }),
    new Paragraph({ text: "" }),
    ...sections.flatMap((sec) => [
      new Paragraph({ text: sec.heading, heading: HeadingLevel.HEADING_1 }),
      new Paragraph({
        children: [new TextRun({ text: sec.content, size: 22 })],
      }),
      new Paragraph({ text: "" }),
    ]),
  ];

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return await Packer.toBuffer(doc);
}
