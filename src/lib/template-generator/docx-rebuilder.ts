import { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType } from "docx";

export type DocxSection = {
  title: string;
  content: string;
};

export async function rebuildDOCX(
  sections: DocxSection[],
  metadata: { companyName: string; reviewerName: string; reviewDate: string }
): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      text: `${metadata.companyName} 투자심사보고서`,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `심사역: ${metadata.reviewerName}`, size: 22 }),
        new TextRun({ text: `  |  작성일: ${metadata.reviewDate}`, size: 22 }),
      ],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ text: "" }),
  ];

  for (const section of sections) {
    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_1,
      })
    );

    const lines = section.content.split("\n");
    for (const line of lines) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line, size: 22 })],
        })
      );
    }

    children.push(new Paragraph({ text: "" }));
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return await Packer.toBuffer(doc);
}
