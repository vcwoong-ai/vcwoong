import mammoth from "mammoth";

export type DocxAnalysis = {
  fileType: "docx";
  htmlContent: string;
  textContent: string;
  headings: string[];
};

export async function analyzeDOCX(file: File | Buffer): Promise<DocxAnalysis> {
  const buffer =
    file instanceof File ? Buffer.from(await file.arrayBuffer()) : file;

  const htmlResult = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h1.heading1",
        "p[style-name='Heading 2'] => h2.heading2",
        "p[style-name='Heading 3'] => h3.heading3",
      ],
    }
  );

  const textResult = await mammoth.extractRawText({ buffer });

  const headingRegex = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/g;
  const headings: string[] = [];
  let match;
  while ((match = headingRegex.exec(htmlResult.value)) !== null) {
    headings.push(match[1].replace(/<[^>]+>/g, ""));
  }

  return {
    fileType: "docx",
    htmlContent: htmlResult.value,
    textContent: textResult.value,
    headings,
  };
}
