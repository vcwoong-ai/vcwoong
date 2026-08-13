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

interface MetricPoint {
  label: string;
  value: number;
}

/**
 * "ARR: 45억원", "NRR: 118%" 같은 "라벨: 숫자(단위)" 줄을 뽑아 막대차트용
 * 데이터로 변환한다. 텍스트 불릿만 나열하는 것보다 핵심 수치 몇 개는
 * 그래프로 보여주는 게 훨씬 보고서답게 읽힌다.
 */
function extractMetricPoints(lines: string[]): MetricPoint[] {
  const re =
    /^([^:：]{1,16}?)\s*[:：]\s*([\d][\d,]*(?:\.\d+)?)\s*(?:%|억원|억|조원|조|만원|명|원|배|점|x)?\s*$/;
  const points: MetricPoint[] = [];
  for (const line of lines) {
    const m = re.exec(line.trim());
    if (!m) continue;
    const label = m[1].trim();
    const value = Number(m[2].replace(/,/g, ""));
    if (!label || !Number.isFinite(value) || value <= 0) continue;
    points.push({ label, value });
  }
  return points.slice(0, 6);
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
    const res = await fetch(image.url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${image.mimeType};base64,${buf.toString("base64")}`;
  } catch (error) {
    console.warn(`[PptxExport] 이미지 로드 실패(건너뜀): ${image.url}`, error);
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
  images: ReportImage[] = []
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

  const CONTENT_TOP = 1.25;
  const CONTENT_BOTTOM = 7.05;
  const LINE_HEIGHT = 0.32;
  const TABLE_ROW_HEIGHT = 0.32;

  for (const section of sections) {
    const slide = pptx.addSlide({ masterName: "AXIOM_SLIDE" });
    slide.addText(section.title, {
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
              color: rowIdx === 0 ? "FFFFFF" : TEXT_DARK,
              fill: rowIdx === 0 ? { color: BRAND_COLOR } : undefined,
              fontSize: 12,
              fontFace: FONT,
            },
          }))
        );
        slide.addTable(tableRows, {
          x: 0.5,
          y,
          w: 9,
          h,
          border: { type: "solid", color: "E5E7EB", pt: 0.5 },
          autoPage: false,
        });
        y += h + 0.2;
      } else {
        const lines = block.lines.slice(0, 10);
        const metrics = extractMetricPoints(block.lines);
        const showChart = metrics.length >= 2;
        const textW = showChart ? 4.5 : 9;
        const h = Math.min(lines.length * LINE_HEIGHT + 0.15, remaining);

        slide.addText(
          lines.map((line) => ({
            text: line.slice(0, 200),
            options: { bullet: true, breakLine: true },
          })),
          {
            x: 0.5,
            y,
            w: textW,
            h,
            fontSize: 16,
            valign: "top",
            color: TEXT_DARK,
            fontFace: FONT,
          }
        );

        if (showChart) {
          slide.addChart(
            pptx.ChartType.bar,
            [
              {
                name: section.title,
                labels: metrics.map((m) => m.label),
                values: metrics.map((m) => m.value),
              },
            ],
            {
              x: 5.3,
              y,
              w: 4.2,
              h: Math.min(h, 3.2),
              barDir: "bar",
              chartColors: [BRAND_COLOR],
              showLegend: false,
              showValue: true,
              dataLabelColor: TEXT_DARK,
              dataLabelFontSize: 10,
              catAxisLabelFontSize: 10,
              valAxisLabelFontSize: 9,
              catAxisLabelColor: TEXT_MUTED,
              valAxisLabelColor: TEXT_MUTED,
              fontFace: FONT,
            }
          );
        }

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
        color: TEXT_MUTED,
        fontFace: FONT,
      });
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
