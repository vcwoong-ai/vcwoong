/**
 * 보고서 섹션을 PPTX 슬라이드로 변환.
 *
 * 예전엔 jszip으로 최소 OOXML을 직접 손으로 만들었는데, 슬라이드
 * 마스터↔테마 관계 같은 스펙상 필수 파트가 빠져 있어도 python-pptx 같은
 * 느슨한 파서는 통과시키는 반면 실제 PowerPoint는 파일을 통째로
 * "읽을 수 없음"으로 거부했다 — 로컬 검증으로는 못 잡고 실사용자가 직접
 * 열어봐야만 드러나는 종류의 버그. 직접 만든 XML을 계속 패치하는 대신,
 * 실사용자들이 이미 검증한 pptxgenjs로 교체해 이 클래스의 버그를 근본
 * 제거한다.
 */

import type { ReportSection } from "@prisma/client";

type ContentBlock =
  | { type: "text"; lines: string[] }
  | { type: "table"; rows: string[][] };

function cleanLine(line: string): string {
  return line
    .replace(/^[-*•]\s*/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*/g, "")
    .trim();
}

/** "| a | b |" 형태의 마크다운 표 행을 셀 배열로 파싱 (표가 아니면 null) */
function parseTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (trimmed.length < 2 || !trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return null;
  }
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((c) => c.replace(/\*\*/g, "").trim());
}

/** "| --- | --- |" 형태의 구분선 행인지 (표 헤더 다음 줄) */
function isTableSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

/**
 * 본문을 일반 텍스트 블록과 마크다운 표 블록으로 분리한다.
 * 표는 실제 PPTX 표(addTable)로 렌더링하기 위해 텍스트 블록과 구분해야
 * 한다 — 안 그러면 "| 항목 | 내용 |" 같은 줄이 그냥 불릿 텍스트로 나온다.
 */
function splitContentBlocks(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const lines = content.split("\n");
  let textLines: string[] = [];

  const flushText = () => {
    if (textLines.length > 0) {
      blocks.push({ type: "text", lines: textLines });
      textLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const headerRow = parseTableRow(lines[i]);
    const separatorRow =
      headerRow && i + 1 < lines.length ? parseTableRow(lines[i + 1]) : null;

    if (headerRow && separatorRow && isTableSeparatorRow(separatorRow)) {
      flushText();
      const rows: string[][] = [headerRow];
      i += 2;
      while (i < lines.length) {
        const row = parseTableRow(lines[i]);
        if (!row) {
          i -= 1;
          break;
        }
        rows.push(row);
        i += 1;
      }
      blocks.push({ type: "table", rows });
      continue;
    }

    const cleaned = cleanLine(lines[i]);
    if (cleaned && !/^-{3,}$/.test(cleaned)) {
      textLines.push(cleaned);
    }
  }
  flushText();
  return blocks;
}

export async function generateReportPPTX(
  sections: Pick<ReportSection, "title" | "content">[],
  meta: { companyName: string; reportDate?: Date }
): Promise<Buffer> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "AXIOM_4X3", width: 10, height: 7.5 });
  pptx.layout = "AXIOM_4X3";

  const coverTitle = `${meta.companyName} 투자심의보고서`;
  const coverDate = (meta.reportDate ?? new Date()).toLocaleDateString("ko-KR");

  const coverSlide = pptx.addSlide();
  coverSlide.addText(coverTitle, {
    x: 0.5,
    y: 2.8,
    w: 9,
    h: 1.2,
    fontSize: 32,
    bold: true,
    align: "center",
    fontFace: "맑은 고딕",
  });
  coverSlide.addText(`${coverDate}\nAxiom IC Report`, {
    x: 0.5,
    y: 4.1,
    w: 9,
    h: 0.8,
    fontSize: 14,
    align: "center",
    color: "666666",
    fontFace: "맑은 고딕",
  });

  const CONTENT_TOP = 1.25;
  const CONTENT_BOTTOM = 7.1;
  const LINE_HEIGHT = 0.32;
  const TABLE_ROW_HEIGHT = 0.32;

  for (const section of sections) {
    const slide = pptx.addSlide();
    slide.addText(section.title, {
      x: 0.5,
      y: 0.35,
      w: 9,
      h: 0.7,
      fontSize: 26,
      bold: true,
      fontFace: "맑은 고딕",
    });

    const blocks = splitContentBlocks(section.content);
    let y = CONTENT_TOP;
    let rendered = false;

    for (const block of blocks) {
      const remaining = CONTENT_BOTTOM - y;
      if (remaining < 0.4) break;

      if (block.type === "table") {
        const rows = block.rows.slice(0, 8);
        const colCount = Math.max(...rows.map((r) => r.length));
        const h = Math.min(rows.length * TABLE_ROW_HEIGHT, remaining);
        const tableRows = rows.map((cells, rowIdx) =>
          Array.from({ length: colCount }, (_, colIdx) => ({
            text: (cells[colIdx] ?? "").slice(0, 60),
            options: {
              bold: rowIdx === 0,
              fill: rowIdx === 0 ? { color: "F2F4F7" } : undefined,
              fontSize: 12,
              fontFace: "맑은 고딕",
            },
          }))
        );
        slide.addTable(tableRows, {
          x: 0.5,
          y,
          w: 9,
          h,
          border: { type: "solid", color: "BFBFBF", pt: 0.5 },
          autoPage: false,
        });
        y += h + 0.2;
      } else {
        const lines = block.lines.slice(0, 10);
        const h = Math.min(lines.length * LINE_HEIGHT + 0.15, remaining);
        slide.addText(
          lines.map((line) => ({
            text: line.slice(0, 200),
            options: { bullet: true, breakLine: true },
          })),
          {
            x: 0.5,
            y,
            w: 9,
            h,
            fontSize: 16,
            valign: "top",
            fontFace: "맑은 고딕",
          }
        );
        y += h + 0.15;
      }
      rendered = true;
    }

    if (!rendered) {
      slide.addText("확인 필요", {
        x: 0.5,
        y: CONTENT_TOP,
        w: 9,
        h: 1,
        fontSize: 16,
        fontFace: "맑은 고딕",
      });
    }
  }

  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}

/** 마크다운 LP 리포트를 ## 헤딩 기준으로 슬라이드 분할 */
export function markdownToPptxSections(
  markdown: string
): Array<{ title: string; content: string }> {
  const trimmed = markdown.trim();
  if (!trimmed) return [{ title: "내용", content: "" }];

  const chunks = trimmed.split(/^#{1,3}\s+/m).filter((c) => c.trim());
  if (chunks.length <= 1 && !/^#{1,3}\s+/m.test(trimmed)) {
    return [{ title: "요약", content: trimmed }];
  }

  const sections: Array<{ title: string; content: string }> = [];
  // split removes the heading marker; first chunk may be preface
  let offset = 0;
  if (!trimmed.match(/^#{1,3}\s+/)) {
    const preface = chunks[0]?.trim();
    if (preface) sections.push({ title: "서문", content: preface });
    offset = 1;
  }

  for (let i = offset; i < chunks.length; i++) {
    const block = chunks[i];
    const nl = block.indexOf("\n");
    const title = (nl === -1 ? block : block.slice(0, nl)).trim() || `섹션 ${i + 1}`;
    const content = (nl === -1 ? "" : block.slice(nl + 1)).trim();
    sections.push({ title: title.slice(0, 80), content });
  }

  return sections.length > 0 ? sections : [{ title: "요약", content: trimmed }];
}

export async function generateMarkdownPPTX(opts: {
  title: string;
  subtitle?: string;
  markdown: string;
}): Promise<Buffer> {
  const sections = markdownToPptxSections(opts.markdown);
  return generateReportPPTX(sections, {
    companyName: opts.title,
    reportDate: new Date(),
  });
}
