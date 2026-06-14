"use client";

import { useEffect, useState } from "react";

interface ReportContentProps {
  content: string;
  dealName: string;
}

export function ReportContent({ content, dealName }: ReportContentProps) {
  const [htmlContent, setHtmlContent] = useState("");

  useEffect(() => {
    // Convert markdown to HTML
    const converted = markdownToHtml(content);
    setHtmlContent(converted);
  }, [content]);

  return (
    <div className="p-8 lg:p-12">
      <div
        className="prose prose-gray max-w-none report-content"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
        style={{
          fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
          lineHeight: "1.8",
          color: "#111827",
        }}
      />
      <style>{`
        .report-content h1 {
          font-size: 1.75rem;
          font-weight: 800;
          color: #111827;
          margin-bottom: 0.5rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid #2563eb;
        }
        .report-content h2 {
          font-size: 1.25rem;
          font-weight: 700;
          color: #1d4ed8;
          margin-top: 2rem;
          margin-bottom: 1rem;
          padding: 0.5rem 0.75rem;
          background: #eff6ff;
          border-left: 4px solid #2563eb;
          border-radius: 0 0.5rem 0.5rem 0;
        }
        .report-content h3 {
          font-size: 1rem;
          font-weight: 600;
          color: #374151;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .report-content p {
          font-size: 0.9375rem;
          color: #374151;
          margin-bottom: 1rem;
          line-height: 1.8;
        }
        .report-content strong {
          font-weight: 700;
          color: #111827;
        }
        .report-content ul {
          list-style: none;
          padding: 0;
          margin-bottom: 1rem;
        }
        .report-content ul li {
          position: relative;
          padding-left: 1.25rem;
          margin-bottom: 0.5rem;
          font-size: 0.9375rem;
          color: #374151;
        }
        .report-content ul li::before {
          content: "•";
          position: absolute;
          left: 0;
          color: #2563eb;
          font-weight: bold;
        }
        .report-content ol {
          padding-left: 1.5rem;
          margin-bottom: 1rem;
        }
        .report-content ol li {
          margin-bottom: 0.5rem;
          font-size: 0.9375rem;
          color: #374151;
        }
        .report-content table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1.5rem;
          font-size: 0.875rem;
        }
        .report-content table th {
          background: #f3f4f6;
          padding: 0.625rem 0.875rem;
          text-align: left;
          font-weight: 600;
          border: 1px solid #e5e7eb;
        }
        .report-content table td {
          padding: 0.625rem 0.875rem;
          border: 1px solid #e5e7eb;
        }
        .report-content table tr:nth-child(even) td {
          background: #f9fafb;
        }
        .report-content hr {
          border: none;
          border-top: 1px solid #e5e7eb;
          margin: 2rem 0;
        }
        .report-content blockquote {
          border-left: 4px solid #2563eb;
          padding: 0.75rem 1rem;
          margin: 1rem 0;
          background: #eff6ff;
          border-radius: 0 0.5rem 0.5rem 0;
          font-style: italic;
        }
        .report-content .meta-info {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          padding: 1rem 1.25rem;
          margin-bottom: 2rem;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.5rem;
        }
        .report-content .meta-info p {
          margin: 0;
          font-size: 0.875rem;
        }
        @media print {
          .report-content h1 { font-size: 1.5rem; }
          .report-content h2 { font-size: 1.125rem; }
          .report-content p { font-size: 0.875rem; }
        }
      `}</style>
    </div>
  );
}

function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Escape potential XSS
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr>");

  // Tables
  html = html.replace(/^\|(.+)\|$/gm, (match) => {
    const cells = match
      .split("|")
      .filter((c) => c.trim() !== "")
      .map((c) => c.trim());
    return "<tr>" + cells.map((c) => `<td>${c}</td>`).join("") + "</tr>";
  });
  // Wrap consecutive rows in table
  html = html.replace(/(<tr>.*<\/tr>\n?)+/g, (match) => {
    const rows = match.trim().split("\n");
    const firstRow = rows[0];
    if (firstRow.includes("------") || firstRow.includes("----")) {
      return match; // Skip separator rows
    }
    const tableRows = rows
      .filter((r) => !r.match(/^\|[-\s|]+\|$/))
      .join("\n");
    return `<table>${tableRows}</table>`;
  });
  // Fix header row (first row in table)
  html = html.replace(
    /<table><tr>(.*?)<\/tr>/,
    (match, cells) => {
      const headerCells = cells.replace(/<td>/g, "<th>").replace(/<\/td>/g, "</th>");
      return `<table><thead><tr>${headerCells}</tr></thead><tbody>`;
    }
  );
  html = html.replace(/<\/table>/g, "</tbody></table>");

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  // Line breaks and paragraphs
  const lines = html.split("\n");
  const result: string[] = [];
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed === "" ||
      trimmed.startsWith("<h") ||
      trimmed.startsWith("<ul") ||
      trimmed.startsWith("<ol") ||
      trimmed.startsWith("<li") ||
      trimmed.startsWith("<table") ||
      trimmed.startsWith("<tr") ||
      trimmed.startsWith("<hr") ||
      trimmed.startsWith("<blockquote") ||
      trimmed.startsWith("</")
    ) {
      if (inParagraph) {
        result.push("</p>");
        inParagraph = false;
      }
      if (trimmed !== "") result.push(trimmed);
    } else {
      if (!inParagraph) {
        result.push("<p>");
        inParagraph = true;
      }
      result.push(trimmed);
    }
  }

  if (inParagraph) result.push("</p>");

  return result.join("\n");
}
