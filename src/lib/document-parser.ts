/**
 * Document parsing utilities for DOCX, PDF, and XLSX files.
 * Extracts plain text for AI processing.
 */

export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    return parseDOCX(buffer);
  }

  if (mimeType === "application/pdf" || ext === "pdf") {
    return parsePDF(buffer);
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    ext === "xlsx" ||
    ext === "xls"
  ) {
    return parseXLSX(buffer);
  }

  if (mimeType === "text/plain" || ext === "txt") {
    return {
      text: buffer.toString("utf-8"),
      metadata: { type: "text" },
    };
  }

  throw new Error(`지원하지 않는 파일 형식입니다: ${mimeType}`);
}

async function parseDOCX(
  buffer: Buffer
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return {
    text: result.value,
    metadata: {
      type: "docx",
      messages: result.messages,
    },
  };
}

async function parsePDF(
  buffer: Buffer
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  // pdf-parse requires a dynamic import to avoid test file detection in Next.js
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string; numpages: number; info: unknown }>;
  const data = await pdfParse(buffer);
  return {
    text: data.text,
    metadata: {
      type: "pdf",
      numPages: data.numpages,
      info: data.info,
    },
  };
}

async function parseXLSX(
  buffer: Buffer
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  const xlsx = await import("xlsx");
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const texts: string[] = [];
  const sheetNames = workbook.SheetNames;

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = xlsx.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      texts.push(`[시트: ${sheetName}]\n${csv}`);
    }
  }

  return {
    text: texts.join("\n\n"),
    metadata: {
      type: "xlsx",
      sheets: sheetNames,
    },
  };
}
