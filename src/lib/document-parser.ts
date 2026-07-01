import { parsePPTX } from "@/lib/parsers/pptx";

/**
 * Document parsing utilities for DOCX, PDF, XLSX, and PPTX files.
 * Extracts structured text for AI processing.
 */

export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    return parseDOCX(buffer);
  }

  if (mimeType === "application/pdf" || ext === "pdf") {
    return parsePDF(buffer);
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    ext === "xlsx" ||
    ext === "xls"
  ) {
    return parseXLSX(buffer);
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    ext === "pptx"
  ) {
    return parsePPTX(buffer);
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

  // Extract HTML to preserve table structure, then convert to readable text
  const htmlResult = await mammoth.convertToHtml({ buffer });
  const rawResult = await mammoth.extractRawText({ buffer });

  // Convert HTML tables to markdown-style tables for better AI comprehension
  const textWithTables = htmlToStructuredText(htmlResult.value);

  // Use structured text if tables found, otherwise fall back to raw text
  const hasTable = htmlResult.value.includes("<table");
  const finalText = hasTable ? textWithTables : rawResult.value;

  return {
    text: finalText,
    metadata: {
      type: "docx",
      hasTables: hasTable,
      messages: rawResult.messages,
    },
  };
}

/**
 * Converts HTML (from mammoth) to plain text, preserving table structure
 * as markdown-style pipe tables for AI readability.
 */
function htmlToStructuredText(html: string): string {
  // Replace table rows with pipe-delimited rows
  const text = html
    // Table headers
    .replace(/<thead[^>]*>([\s\S]*?)<\/thead>/gi, (_, content) => {
      const row = extractCells(content, "th");
      return row ? `| ${row.join(" | ")} |\n| ${row.map(() => "---").join(" | ")} |\n` : "";
    })
    // Table body rows
    .replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_, content) => {
      const cells = extractCells(content, "td");
      return cells ? `| ${cells.join(" | ")} |\n` : "";
    })
    // Headings
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n")
    // Lists
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    // Paragraphs and line breaks
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    // Strip remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    // Clean up excess whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

function extractCells(html: string, tag: "td" | "th"): string[] | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const cells: string[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    cells.push(match[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim());
  }
  return cells.length > 0 ? cells : null;
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

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: string[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (rows.length === 0) continue;

    // Build markdown table for better AI comprehension
    const nonEmptyRows = rows.filter((row) => row.some((cell) => String(cell).trim() !== ""));
    if (nonEmptyRows.length === 0) continue;

    const colWidths = nonEmptyRows[0].map((_, ci) =>
      Math.max(...nonEmptyRows.map((r) => String(r[ci] ?? "").length), 3)
    );

    const formatRow = (row: string[]) =>
      "| " + row.map((cell, i) => String(cell ?? "").padEnd(colWidths[i])).join(" | ") + " |";

    const separator = "| " + colWidths.map((w) => "-".repeat(w)).join(" | ") + " |";

    const header = formatRow(nonEmptyRows[0].map(String));
    const dataRows = nonEmptyRows.slice(1).map((r) => formatRow(r.map(String)));

    texts.push(`## 시트: ${sheetName}\n\n${header}\n${separator}\n${dataRows.join("\n")}`);
  }

  return {
    text: texts.join("\n\n"),
    metadata: {
      type: "xlsx",
      sheets: workbook.SheetNames,
    },
  };
}
