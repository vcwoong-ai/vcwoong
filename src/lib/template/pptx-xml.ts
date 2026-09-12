/**
 * PPTX 슬라이드 XML 텍스트 조작 유틸.
 * 원본 PPTX를 열어 본문 placeholder 텍스트만 교체한다.
 */

import { escapeXml, normalizeTitle } from "./docx-xml";

export { normalizeTitle };

/** 슬라이드 제목 placeholder 텍스트 */
export function extractSlideTitle(xml: string): string {
  const spBlocks = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? [];
  for (const block of spBlocks) {
    if (!/<p:ph[^>]*type="(?:title|ctrTitle)"/.test(block)) continue;
    const texts = (block.match(/<a:t>([^<]*)<\/a:t>/g) ?? [])
      .map((m) => m.replace(/<\/?a:t>/g, ""))
      .join(" ");
    if (texts.trim()) return texts.trim();
  }
  return "";
}

/** 슬라이드 전체 텍스트 (미리보기용) */
export function extractSlideText(xml: string): string {
  return (xml.match(/<a:t>([^<]*)<\/a:t>/g) ?? [])
    .map((m) => m.replace(/<\/?a:t>/g, ""))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function splitSpBlocks(xml: string): string[] {
  return xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? [];
}

function isBodyShape(block: string): boolean {
  if (/<p:ph[^>]*type="(?:title|ctrTitle|dt|ftr|hdr|sldNum)"/.test(block)) {
    return false;
  }
  return /<p:ph[^>]*type="(?:body|obj|subTitle)"/.test(block) || /<p:txBody>/.test(block);
}

/** 도형 자신의 xfrm에서 너비·높이(EMU)를 읽는다 (없으면 null) */
function shapeExtent(block: string): { cx: number; cy: number } | null {
  const xfrm = block.match(/<a:xfrm[^>]*>[\s\S]*?<\/a:xfrm>/);
  if (!xfrm) return null;
  const ext = xfrm[0].match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\s*\/>/);
  if (!ext) return null;
  return { cx: Number(ext[1]), cy: Number(ext[2]) };
}

const EMU_PER_INCH = 914400;
// 실제 폰트 크기를 파싱하지 않는 근사치 — 한 줄이 대략 이 높이를 차지한다고
// 가정해 상자 높이 대비 줄 수가 넘칠 때만 축소한다(안전망이지 정밀 계산은 아님).
const ASSUMED_LINE_HEIGHT_IN = 0.28;

/**
 * bodyPr의 다른 속성(anchor·inset 등)은 건드리지 않고 autofit 자식만
 * 넣거나 교체한다. 내용이 상자보다 길면 PowerPoint가 스스로 글자를
 * 줄이도록 normAutofit을 지정해, 옆·아래 도형 위로 텍스트가 흘러넘치는
 * 것을 완화한다.
 */
function applyAutofit(prefixWithBodyPr: string, fontScale: number): string {
  if (fontScale >= 100000) return prefixWithBodyPr;

  const lnSpcReduction = Math.min(20000, 100000 - fontScale);
  const autofitTag = `<a:normAutofit fontScale="${fontScale}" lnSpcReduction="${lnSpcReduction}"/>`;

  const openClose = prefixWithBodyPr.match(/<a:bodyPr([^>]*)>([\s\S]*?)<\/a:bodyPr>/);
  if (openClose) {
    const inner = openClose[2].replace(/<a:(normAutofit|noAutofit|spAutoFit)[^/]*\/>/g, "");
    return prefixWithBodyPr.replace(
      openClose[0],
      `<a:bodyPr${openClose[1]}>${inner}${autofitTag}</a:bodyPr>`
    );
  }
  const selfClosing = prefixWithBodyPr.match(/<a:bodyPr([^>]*)\/>/);
  if (selfClosing) {
    return prefixWithBodyPr.replace(
      selfClosing[0],
      `<a:bodyPr${selfClosing[1]}>${autofitTag}</a:bodyPr>`
    );
  }
  return `<a:bodyPr>${autofitTag}</a:bodyPr>${prefixWithBodyPr}`;
}

/**
 * body placeholder의 txBody 내용을 새 bullet 줄로 교체한다.
 *
 * 예전엔 "제목·꼬리말이 아닌 첫 번째 텍스트 도형"을 그대로 본문으로
 * 썼는데, 원본 양식에 작은 라벨 도형(예: 섹션 번호 배지)이 실제 본문
 * 상자보다 XML 순서상 앞에 있으면 그 작은 도형에 전체 섹션 내용이
 * 통째로 들어가 상자 밖으로 흘러넘쳐 다른 도형과 겹쳐 보이는 사고가
 * 있었다. 후보 중 실제 면적(xfrm 기준)이 가장 큰 도형을 본문으로 본다.
 */
export function replaceBodyContent(slideXml: string, lines: string[]): string {
  const blocks = splitSpBlocks(slideXml);

  let targetIdx = -1;
  let bestArea = -1;
  blocks.forEach((block, idx) => {
    if (!isBodyShape(block)) return;
    const ext = shapeExtent(block);
    const area = ext ? ext.cx * ext.cy : 0;
    if (area > bestArea) {
      bestArea = area;
      targetIdx = idx;
    }
  });
  if (targetIdx === -1) return slideXml;

  const block = blocks[targetIdx];
  const txBodyMatch = block.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/);
  if (!txBodyMatch) return slideXml;

  const inner = txBodyMatch[1];
  const protoMatch = inner.match(/<a:p[^>]*>[\s\S]*?<\/a:p>/);
  const langMatch = protoMatch?.[0]?.match(/lang="([^"]+)"/);
  const lang = langMatch?.[1] ?? "ko-KR";

  const safeLines = lines.length > 0 ? lines : ["확인 필요"];
  const capped = safeLines.slice(0, 12);
  const paragraphs = capped
    .map((line) => {
      const text = escapeXml(line.replace(/^[-*•]\s*/, "").slice(0, 500));
      return `<a:p><a:pPr lvl="0"/><a:r><a:rPr lang="${lang}" dirty="0"/><a:t>${text}</a:t></a:r></a:p>`;
    })
    .join("");

  const prefix = inner.match(/^[\s\S]*?(?=<a:p)/)?.[0] ?? "";
  const basePrefix = prefix.includes("<a:bodyPr") ? prefix : "<a:bodyPr/><a:lstStyle/>";

  const ext = shapeExtent(block);
  let fontScale = 100000;
  if (ext) {
    const boxHeightIn = ext.cy / EMU_PER_INCH;
    const neededIn = capped.length * ASSUMED_LINE_HEIGHT_IN;
    if (neededIn > boxHeightIn && boxHeightIn > 0) {
      fontScale = Math.max(50000, Math.round((boxHeightIn / neededIn) * 100000));
    }
  }
  const header = applyAutofit(basePrefix, fontScale);

  const newInner = header + paragraphs;
  const newBlock = block.replace(
    /<p:txBody>[\s\S]*?<\/p:txBody>/,
    `<p:txBody>${newInner}</p:txBody>`
  );

  let idx = 0;
  return slideXml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (m) => (idx++ === targetIdx ? newBlock : m));
}

/** "| a | b |" 형태의 마크다운 표 행을 셀 배열로 파싱 (표가 아니면 null) */
function parseMarkdownTableRow(line: string): string[] | null {
  if (line.length < 2 || !line.startsWith("|") || !line.endsWith("|")) return null;
  return line
    .slice(1, -1)
    .split("|")
    .map((c) => c.replace(/\*\*/g, "").trim());
}

/** "| --- | --- |" 형태의 구분선 행인지 */
function isTableSeparatorCells(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

/**
 * 마크다운 본문을 슬라이드 bullet 줄로 변환.
 * 표 행("| 항목 | 내용 |")은 실제 PPTX 표로 만들지 않고 "항목: 내용" 같은
 * 한 줄 텍스트로 풀어쓴다 — 그냥 지나치면 파이프·구분선 문자가 그대로
 * 불릿 텍스트로 남아 보기 흉해진다.
 */
export function markdownToSlideLines(markdown: string): string[] {
  const lines: string[] = [];
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line || /^-{3,}$/.test(line)) continue;

    const cells = parseMarkdownTableRow(line);
    if (cells) {
      if (!isTableSeparatorCells(cells)) {
        const text = cells.filter(Boolean).join(" · ");
        if (text) lines.push(text);
      }
      continue;
    }

    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      lines.push(heading[1].replace(/\*\*/g, ""));
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      lines.push(`• ${bullet[1].replace(/\*\*/g, "")}`);
      continue;
    }
    const numbered = /^(\d+)\.\s+(.*)$/.exec(line);
    if (numbered) {
      lines.push(`${numbered[1]}. ${numbered[2].replace(/\*\*/g, "")}`);
      continue;
    }
    lines.push(line.replace(/\*\*/g, ""));
  }
  return lines;
}

export function replacePlaceholders(
  xml: string,
  replacements: Record<string, string>
): string {
  let out = xml;
  for (const [key, value] of Object.entries(replacements)) {
    const escaped = escapeXml(value);
    for (const p of [`{{${key}}}`, `[${key}]`]) {
      out = out.split(p).join(escaped);
    }
  }
  return out;
}

/** 슬라이드 파일 경로를 번호 순으로 정렬 */
export function sortedSlidePaths(files: Record<string, unknown>): string[] {
  return Object.keys(files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
      const nb = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
      return na - nb;
    });
}
