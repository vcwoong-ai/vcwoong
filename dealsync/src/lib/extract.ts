import mammoth from "mammoth";
import * as pdfParseModule from "pdf-parse";

type PdfParseFunction = (buffer: Buffer) => Promise<{ text: string }>;

const pdfParseAny = pdfParseModule as unknown as
  | PdfParseFunction
  | { default: PdfParseFunction };

const pdfParse: PdfParseFunction =
  typeof pdfParseAny === "function"
    ? pdfParseAny
    : (pdfParseAny as { default: PdfParseFunction }).default;

// Converts an HTML table element into a pipe-delimited text table,
// preserving cell content for IR documents (financial summaries, KPI tables, etc.)
function htmlTableToText(tableHtml: string): string {
  const rows: string[][] = [];

  // Extract <tr> blocks
  const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trPattern.exec(tableHtml)) !== null) {
    const rowHtml = trMatch[1];
    const cells: string[] = [];

    // Extract <th> and <td> cells
    const cellPattern = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
      // Strip remaining HTML tags and decode common HTML entities
      const cellText = cellMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&#[0-9]+;/g, "")
        .trim();
      cells.push(cellText);
    }

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  if (rows.length === 0) return "";

  // Compute column widths for aligned pipe table
  const colCount = Math.max(...rows.map((r) => r.length));
  const colWidths = Array.from({ length: colCount }, (_, ci) =>
    Math.max(...rows.map((r) => (r[ci] ?? "").length), 3)
  );

  const padCell = (text: string, width: number) =>
    text.padEnd(width, " ");

  const renderRow = (row: string[]) =>
    "| " +
    Array.from({ length: colCount }, (_, ci) =>
      padCell(row[ci] ?? "", colWidths[ci])
    ).join(" | ") +
    " |";

  const separator =
    "| " + colWidths.map((w) => "-".repeat(w)).join(" | ") + " |";

  const lines: string[] = [];
  rows.forEach((row, idx) => {
    lines.push(renderRow(row));
    // Insert separator after header row (first row)
    if (idx === 0) lines.push(separator);
  });

  return lines.join("\n");
}

// Converts mammoth HTML output to readable plain text,
// turning <table> blocks into aligned pipe tables and stripping other tags.
function htmlToTextPreservingTables(html: string): string {
  const segments: string[] = [];
  let lastIndex = 0;

  // Match complete <table>…</table> blocks (including nested tags)
  const tablePattern = /<table[\s\S]*?<\/table>/gi;
  let match: RegExpExecArray | null;

  while ((match = tablePattern.exec(html)) !== null) {
    // Text before this table
    const before = html.slice(lastIndex, match.index);
    if (before.trim()) {
      segments.push(stripHtmlTags(before));
    }

    // Convert the table to pipe-delimited text
    const tableText = htmlTableToText(match[0]);
    if (tableText) {
      segments.push("\n" + tableText + "\n");
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last table
  const tail = html.slice(lastIndex);
  if (tail.trim()) {
    segments.push(stripHtmlTags(tail));
  }

  return segments.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#[0-9]+;/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: [
        "p[style-name='Table Contents'] => p",
        "p[style-name='Table Heading'] => p:fresh",
      ],
    }
  );

  if (result.messages.length > 0) {
    const warnings = result.messages
      .filter((m) => m.type === "warning")
      .map((m) => m.message);
    if (warnings.length > 0) {
      console.warn("[extract] DOCX warnings:", warnings.join("; "));
    }
  }

  return htmlToTextPreservingTables(result.value);
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text.replace(/\n{3,}/g, "\n\n").trim();
}

export type SupportedFileType = "docx" | "pdf" | "txt";

export function detectFileType(
  fileName: string,
  mimeType: string
): SupportedFileType | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".docx") || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return "docx";
  }
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") {
    return "pdf";
  }
  if (lower.endsWith(".txt") || mimeType === "text/plain") {
    return "txt";
  }
  return null;
}

export async function extractText(
  buffer: Buffer,
  fileType: SupportedFileType
): Promise<string> {
  switch (fileType) {
    case "docx":
      return extractTextFromDocx(buffer);
    case "pdf":
      return extractTextFromPdf(buffer);
    case "txt":
      return buffer.toString("utf-8").replace(/\n{3,}/g, "\n\n").trim();
    default:
      return "";
  }
}
