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
// 타입만 가져온다 — erased되므로 위쪽 주석의 "동적 import로 번들링 회피"
// 전략과 충돌하지 않는다 (실제 모듈 로드는 여전히 함수 안 await import).
import type PptxGenJS from "pptxgenjs";
import { chartSourceTable, validReportChart, type ReportChart } from "./report-presentation";

// 앱 UI에서 실제로 쓰는 주 색상(Tailwind blue-600/700)과 통일해 브랜드 일관성을 준다.
const BRAND_COLOR = "2563EB";
const TEXT_DARK = "1F2937";
const TEXT_MUTED = "6B7280";
const FONT = "맑은 고딕";

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

/** Page every line and table row; never crop content to make a slide fit. */
export function paginateReportContent(content: string): ContentBlock[][] {
  const pages: ContentBlock[][] = [[]];
  let used = 0;
  const capacity = 16;
  const next = () => { pages.push([]); used = 0; };
  const text = (line: string) => {
    const chars = Array.from(line);
    for (let offset = 0; offset < chars.length; offset += 44) {
      if (used >= capacity) next();
      const last = pages.at(-1)!;
      const previous = last.at(-1);
      const piece = chars.slice(offset, offset + 44).join("");
      if (previous?.type === "text") previous.lines.push(piece);
      else last.push({ type: "text", lines: [piece] });
      used++;
    }
  };
  for (const block of splitContentBlocks(content)) {
    if (block.type === "text") { for (const line of block.lines) text(line); continue; }
    const columns = Math.max(...block.rows.map(row => row.length));
    // Very wide or verbose tables become readable continued text without dropping cells.
    if (columns > 8 || block.rows.some(row => row.some(cell => Array.from(cell).length > 120))) {
      for (const row of block.rows) text(row.join(" | "));
      continue;
    }
    const header = block.rows[0];
    const rowUnits = (row: string[]) => Math.max(1, ...row.map(cell => Math.ceil(Array.from(cell).length / Math.max(4, Math.floor(52 / columns))))) + 1;
    if (rowUnits(header) > capacity) {
      for (const row of block.rows) text(row.join(" | "));
      continue;
    }
    let index = 1;
    do {
      const headerUnits = rowUnits(header);
      const upcoming = index < block.rows.length ? rowUnits(block.rows[index]) : 0;
      if (used + headerUnits + upcoming > capacity && pages.at(-1)!.length) next();
      const rows = [header];
      used += headerUnits;
      while (index < block.rows.length && used + rowUnits(block.rows[index]) <= capacity) {
        used += rowUnits(block.rows[index]); rows.push(block.rows[index++]);
      }
      // A single row taller than the slide falls back to continued text (all cells preserved).
      if (rows.length === 1 && index < block.rows.length) {
        pages.at(-1)!.push({ type: "table", rows });
        text(block.rows[index++].join(" | "));
      } else pages.at(-1)!.push({ type: "table", rows });
      if (index < block.rows.length) next();
    } while (index < block.rows.length);
  }
  return pages.filter(page => page.length);
}

interface ReportImage {
  url: string;
  mimeType: string;
  sourceName: string;
}

/**
 * 이미지를 가져와 base64 data URI로 바꾼다. pptxgenjs는 원격 URL을
 * 직접 addImage에 넘겨도 되지만, 서버 환경마다 fetch 지원이 달라 실패가
 * 조용히 빈 이미지로 남는 사례가 있어 여기서 직접 받아 확실히 넣는다.
 *
 * 개별 이미지 하나가 깨져 있거나 네트워크 오류가 나도 나머지 슬라이드
 * 생성은 계속돼야 하므로 실패하면 null을 돌려주고 호출부가 건너뛴다.
 */
async function toDataUri(image: ReportImage): Promise<string | null> {
  try {
    const { readStoredFile } = await import("@/lib/storage");
    const buf = await readStoredFile(image.url);
    if (!buf) return null;
    return `data:${image.mimeType};base64,${buf.toString("base64")}`;
  } catch {
    console.warn("[PptxExport] 이미지 로드 실패(건너뜀)");
    return null;
  }
}

/**
 * 업로드 자료에서 추출해둔 이미지를 "첨부 이미지" 슬라이드로 덧붙인다.
 * 슬라이드당 2장씩, 원본 문서명을 캡션으로 단다 — 심사역이 어느 IR
 * 자료에서 나온 이미지인지 바로 알 수 있어야 한다.
 */
async function addImageAppendix(
  pptx: InstanceType<typeof PptxGenJS>,
  images: ReportImage[]
): Promise<void> {
  if (images.length === 0) return;

  const dataUris = await Promise.all(images.map(toDataUri));
  const valid = images
    .map((img, i) => ({ img, dataUri: dataUris[i] }))
    .filter((x): x is { img: ReportImage; dataUri: string } => x.dataUri !== null);
  if (valid.length === 0) return;

  const PER_SLIDE = 2;
  for (let i = 0; i < valid.length; i += PER_SLIDE) {
    const pair = valid.slice(i, i + PER_SLIDE);
    const slide = pptx.addSlide({ masterName: "AXIOM_SLIDE" });
    if (i === 0) {
      slide.addText("첨부 이미지", {
        x: 0.5,
        y: 0.35,
        w: 8.8,
        h: 0.6,
        fontSize: 24,
        bold: true,
        color: TEXT_DARK,
        fontFace: FONT,
      });
      slide.addShape("rect", { x: 0.52, y: 0.98, w: 0.5, h: 0.05, fill: { color: BRAND_COLOR } });
    }

    const BOX_W = 4.2;
    const BOX_H = 4.6;
    const BOX_Y = i === 0 ? 1.4 : 0.6;
    pair.forEach(({ img, dataUri }, idx) => {
      const x = 0.5 + idx * (BOX_W + 0.3);
      slide.addImage({
        data: dataUri,
        x,
        y: BOX_Y,
        w: BOX_W,
        h: BOX_H,
        sizing: { type: "contain", w: BOX_W, h: BOX_H },
      });
      slide.addText(img.sourceName, {
        x,
        y: BOX_Y + BOX_H + 0.05,
        w: BOX_W,
        h: 0.3,
        fontSize: 10,
        color: TEXT_MUTED,
        align: "center",
        fontFace: FONT,
      });
    });
  }
}

export async function generateReportPPTX(
  sections: Pick<ReportSection, "title" | "content">[],
  meta: { companyName: string; reportDate?: Date },
  images: ReportImage[] = [],
  charts: ReportChart[] = []
): Promise<Buffer> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "AXIOM_4X3", width: 10, height: 7.5 });
  pptx.layout = "AXIOM_4X3";

  pptx.defineSlideMaster({
    title: "AXIOM_SLIDE",
    background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 0, w: 0.14, h: 7.5, fill: { color: BRAND_COLOR } } },
      {
        text: {
          text: "DealMind",
          options: {
            x: 8.2,
            y: 7.1,
            w: 1.3,
            h: 0.3,
            fontSize: 9,
            color: TEXT_MUTED,
            align: "right",
            fontFace: FONT,
          },
        },
      },
    ],
    slideNumber: { x: 9.55, y: 7.1, fontSize: 9, color: TEXT_MUTED, fontFace: FONT },
  });

  const coverTitle = `${meta.companyName} 투자심의보고서`;
  const coverDate = (meta.reportDate ?? new Date()).toLocaleDateString("ko-KR");

  const coverSlide = pptx.addSlide({ masterName: "AXIOM_SLIDE" });
  coverSlide.addShape("rect", {
    x: 0.7,
    y: 3.15,
    w: 1.1,
    h: 0.06,
    fill: { color: BRAND_COLOR },
  });
  coverSlide.addText(coverTitle, {
    x: 0.7,
    y: 2.5,
    w: 8.6,
    h: 1.0,
    fontSize: 30,
    bold: true,
    color: TEXT_DARK,
    fontFace: FONT,
  });
  coverSlide.addText(`${coverDate}  ·  DealMind 투자심의위원회 보고서`, {
    x: 0.7,
    y: 3.35,
    w: 8.6,
    h: 0.5,
    fontSize: 13,
    color: TEXT_MUTED,
    fontFace: FONT,
  });

  const addTitle = (slide: ReturnType<typeof pptx.addSlide>, title: string) => {
    slide.addText(title, { x: .5, y: .3, w: 9, h: .75, fontSize: 22, bold: true, color: TEXT_DARK, fontFace: FONT, fit: "shrink" });
    slide.addShape("rect", { x: .52, y: .98, w: .5, h: .05, fill: { color: BRAND_COLOR } });
  };
  for (const section of sections) {
    const chart = charts.find(item => item.title === section.title && validReportChart(item));
    const sourceTable = chart ? chartSourceTable(chart) : "";
    const pages = paginateReportContent(sourceTable && !section.content.includes(sourceTable)
      ? section.content + "\n\n" + sourceTable : section.content);
    if (!pages.length) pages.push([{ type: "text", lines: ["확인 필요"] }]);
    for (const [pageIndex, blocks] of Array.from(pages.entries())) {
      const slide = pptx.addSlide({ masterName: "AXIOM_SLIDE" });
      addTitle(slide, section.title + (pages.length > 1 ? " (" + (pageIndex + 1) + "/" + pages.length + ")" : ""));
      let y = 1.25;
      for (const block of blocks) {
        if (block.type === "table") {
          const columns = Math.max(...block.rows.map(row => row.length));
          const rowHeight = (row: string[]) => (Math.max(1, ...row.map(cell => Math.ceil(Array.from(cell).length / Math.max(4, Math.floor(52 / columns))))) + 1) * .32;
          const height = block.rows.reduce((sum, row) => sum + rowHeight(row), 0);
          slide.addTable(block.rows.map((row, index) => Array.from({ length: columns }, (_, column) => ({
            text: row[column] ?? "", options: { bold: index === 0, color: index === 0 ? "FFFFFF" : TEXT_DARK,
              fill: index === 0 ? { color: BRAND_COLOR } : undefined, fontSize: 11, fontFace: FONT }
          }))), { x: .5, y, w: 9, h: height, rowH: block.rows.map(rowHeight), autoPage: false,
            border: { type: "solid", color: "E5E7EB", pt: .5 }, margin: .05 });
          y += height;
        } else {
          for (const line of block.lines) {
            slide.addText(line, { x: .5, y, w: 9, h: .32, fontSize: 14, color: TEXT_DARK, fontFace: FONT,
              breakLine: false, margin: 0, valign: "top" });
            y += .32;
          }
        }
      }
    }
    if (chart) {
      const slide = pptx.addSlide({ masterName: "AXIOM_SLIDE" });
      addTitle(slide, chart.title + " · " + chart.unit);
      slide.addChart(pptx.ChartType.bar, [{ name: chart.title, labels: chart.points.map(point => point.label),
        values: chart.points.map(point => point.value) }], { x: .7, y: 1.3, w: 8.6, h: 4.5, barDir: "col",
        chartColors: [BRAND_COLOR], showLegend: false, showValue: true, dataLabelFormatCode: "0.####################",
        catAxisLabelFontSize: 10, valAxisLabelFontSize: 10, valAxisTitle: chart.unit,
        showTitle: true, title: `${chart.title} (${chart.unit})`,
        fontFace: FONT });
      slide.addText("업로드 자료 기재 수치 · 전망은 실적과 다릅니다. 기간·구분·출처와 전체 값은 앞의 표에 보존했습니다.",
        { x: .5, y: 6.15, w: 9, h: .65, fontSize: 11, color: TEXT_MUTED, fontFace: FONT });
    }
  }

  await addImageAppendix(pptx, images);

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
