import mammoth from "mammoth";

export async function extractText(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase();

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  if (
    mimeType === "application/pdf" ||
    ext === "pdf"
  ) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    return data.text.trim();
  }

  if (mimeType === "text/plain" || ext === "txt") {
    return buffer.toString("utf-8").trim();
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    ext === "xlsx"
  ) {
    return "[Excel 파일 - 텍스트 추출 미지원. AI 분석을 위해 주요 내용을 DOCX로 변환해 주세요.]";
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    ext === "pptx"
  ) {
    return "[PPT 파일 - 기본 텍스트만 추출됩니다. 더 정확한 분석을 위해 PDF로 변환해 주세요.]";
  }

  return "[지원되지 않는 파일 형식입니다]";
}
