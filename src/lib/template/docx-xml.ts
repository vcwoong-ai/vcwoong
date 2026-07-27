/**
 * WordprocessingML 저수준 유틸.
 *
 * 원본 DOCX의 XML을 그대로 재사용해 폰트·색상·여백을 보존하기 위한 도구들.
 * 새 문서를 만드는 대신 원본 단락을 복제하고 텍스트만 교체하는 방식을 쓴다.
 */

export type BlockType = "p" | "tbl" | "other";

export interface DocxBlock {
  type: BlockType;
  xml: string;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** `<w:body>` 안쪽 내용을 꺼낸다 (sectPr 포함) */
export function extractBody(documentXml: string): { before: string; body: string; after: string } | null {
  const open = /<w:body(?:\s[^>]*)?>/.exec(documentXml);
  const closeIndex = documentXml.lastIndexOf("</w:body>");
  if (!open || closeIndex < 0) return null;

  const start = open.index + open[0].length;
  return {
    before: documentXml.slice(0, start),
    body: documentXml.slice(start, closeIndex),
    after: documentXml.slice(closeIndex),
  };
}

/**
 * 본문을 최상위 블록(단락·표·그 외)으로 나눈다.
 * 표 안의 단락이 따로 잡히지 않도록 깊이를 세며 순차 스캔한다.
 */
export function splitBlocks(body: string): DocxBlock[] {
  const blocks: DocxBlock[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    const next = /<w:(p|tbl)(?=[\s/>])/.exec(body.slice(cursor));
    if (!next) break;

    const startIndex = cursor + next.index;
    if (startIndex > cursor) {
      blocks.push({ type: "other", xml: body.slice(cursor, startIndex) });
    }

    const tag = next[1] as "p" | "tbl";
    const end = findBlockEnd(body, startIndex, tag);
    blocks.push({ type: tag, xml: body.slice(startIndex, end) });
    cursor = end;
  }

  if (cursor < body.length) {
    blocks.push({ type: "other", xml: body.slice(cursor) });
  }

  return blocks;
}

/** startIndex의 여는 태그에 대응하는 닫는 태그 끝 위치를 찾는다 */
function findBlockEnd(body: string, startIndex: number, tag: "p" | "tbl"): number {
  const openTag = new RegExp(`<w:${tag}(?=[\\s/>])`, "g");
  const closeTag = `</w:${tag}>`;

  // 자기닫힘 태그 (<w:p/>)
  const firstTagEnd = body.indexOf(">", startIndex);
  if (firstTagEnd >= 0 && body[firstTagEnd - 1] === "/") return firstTagEnd + 1;

  let depth = 0;
  let cursor = startIndex;

  while (cursor < body.length) {
    openTag.lastIndex = cursor;
    const open = openTag.exec(body);
    const close = body.indexOf(closeTag, cursor);

    if (close < 0) return body.length;

    if (open && open.index < close) {
      const tagEnd = body.indexOf(">", open.index);
      // 자기닫힘은 깊이에 영향 없음
      if (tagEnd < 0 || body[tagEnd - 1] !== "/") depth += 1;
      cursor = tagEnd < 0 ? close : tagEnd + 1;
      continue;
    }

    depth -= 1;
    cursor = close + closeTag.length;
    if (depth === 0) return cursor;
  }

  return body.length;
}

/** 단락(또는 표)의 표시 텍스트 */
export function blockText(xml: string): string {
  const runs = xml.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) ?? [];
  return runs
    .map((r) => unescapeXml(r.replace(/<w:t(?:\s[^>]*)?>/, "").replace(/<\/w:t>/, "")))
    .join("")
    .trim();
}

/** 단락의 pPr(단락 서식) 원본 XML */
export function paragraphProps(pXml: string): string {
  const match = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(pXml);
  return match?.[0] ?? "";
}

/** 단락 첫 런의 rPr(문자 서식) 원본 XML */
export function runProps(pXml: string): string {
  const firstRun = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/.exec(pXml);
  if (!firstRun) return "";
  return /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(firstRun[0])?.[0] ?? "";
}

export function paragraphStyleId(pXml: string): string {
  return /<w:pStyle\s+w:val="([^"]*)"/.exec(pXml)?.[1] ?? "";
}

/** pPr에서 번호매기기(불릿) 정의만 뽑는다 */
export function numberingProps(pXml: string): string {
  return /<w:numPr>[\s\S]*?<\/w:numPr>/.exec(pXml)?.[0] ?? "";
}

export function isBoldParagraph(pXml: string): boolean {
  return /<w:b\s*\/>|<w:b\s+w:val="(?:1|true|on)"/.test(pXml);
}

/**
 * 원본 단락의 서식을 유지한 채 텍스트만 바꾼 새 단락 XML을 만든다.
 *
 * @param donor       서식을 빌려올 원본 단락 XML
 * @param text        새 텍스트 (이스케이프 전)
 * @param overrides   pPr/rPr 를 부분 조정할 때
 */
export function cloneParagraph(
  donor: string,
  text: string,
  overrides: { bold?: boolean; numbering?: string | null; styleId?: string | null } = {}
): string {
  let pPr = paragraphProps(donor);
  const rPr = runProps(donor);

  if (overrides.numbering !== undefined) {
    pPr = pPr.replace(/<w:numPr>[\s\S]*?<\/w:numPr>/, "");
    if (overrides.numbering) {
      pPr = pPr
        ? pPr.replace("<w:pPr>", `<w:pPr>${overrides.numbering}`)
        : `<w:pPr>${overrides.numbering}</w:pPr>`;
    }
  }

  if (overrides.styleId !== undefined) {
    pPr = pPr.replace(/<w:pStyle\s+w:val="[^"]*"\s*\/>/, "");
    if (overrides.styleId) {
      pPr = pPr
        ? pPr.replace("<w:pPr>", `<w:pPr><w:pStyle w:val="${overrides.styleId}"/>`)
        : `<w:pPr><w:pStyle w:val="${overrides.styleId}"/></w:pPr>`;
    }
  }

  let effectiveRPr = rPr;
  if (overrides.bold) {
    effectiveRPr = rPr
      ? rPr.replace(/<w:b\s*\/>|<w:b\s+w:val="[^"]*"\s*\/>/g, "").replace("<w:rPr>", "<w:rPr><w:b/>")
      : "<w:rPr><w:b/></w:rPr>";
  }

  return `<w:p>${pPr}${buildRuns(text, effectiveRPr)}</w:p>`;
}

/** `**굵게**` 마크업을 런 단위로 나눠 부분 굵은 글씨를 살린다 */
export function buildRuns(text: string, rPr: string): string {
  if (!text) return "";

  const boldRPr = rPr
    ? rPr.replace(/<w:b\s*\/>|<w:b\s+w:val="[^"]*"\s*\/>/g, "").replace("<w:rPr>", "<w:rPr><w:b/>")
    : "<w:rPr><w:b/></w:rPr>";

  return text
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((part) => {
      const bold = part.startsWith("**") && part.endsWith("**") && part.length > 4;
      const content = bold ? part.slice(2, -2) : part;
      return `<w:r>${bold ? boldRPr : rPr}<w:t xml:space="preserve">${escapeXml(content)}</w:t></w:r>`;
    })
    .join("");
}

/** 단락의 모든 텍스트를 하나의 런으로 합치면서 문자열을 치환한다 (서식 유지) */
export function replaceParagraphText(pXml: string, replacer: (text: string) => string): string {
  const original = blockText(pXml);
  const replaced = replacer(original);
  if (replaced === original) return pXml;
  return cloneParagraph(pXml, replaced);
}

/**
 * 마크다운 표를 WordprocessingML 표로 만든다.
 * 글꼴은 donor 단락의 rPr을 재사용하고, 테두리만 표준값을 쓴다.
 */
export function buildTable(rows: string[][], donor: string): string {
  if (rows.length === 0) return "";
  const rPr = runProps(donor);
  const columnCount = Math.max(...rows.map((r) => r.length));
  const columnWidth = Math.floor(9360 / columnCount);

  const grid = Array.from({ length: columnCount })
    .map(() => `<w:gridCol w:w="${columnWidth}"/>`)
    .join("");

  const border = (side: string) =>
    `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`;

  const tblPr =
    `<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>` +
    ["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("") +
    `</w:tblBorders></w:tblPr>`;

  const body = rows
    .map((cells, rowIndex) => {
      const isHeader = rowIndex === 0;
      const tr = Array.from({ length: columnCount })
        .map((_, i) => {
          const text = escapeXml(cells[i] ?? "");
          const boldRPr = isHeader
            ? rPr
              ? rPr.replace("<w:rPr>", "<w:rPr><w:b/>")
              : "<w:rPr><w:b/></w:rPr>"
            : rPr;
          const shading = isHeader ? `<w:shd w:val="clear" w:fill="F2F2F2"/>` : "";
          return (
            `<w:tc><w:tcPr><w:tcW w:w="${columnWidth}" w:type="dxa"/>${shading}</w:tcPr>` +
            `<w:p><w:r>${boldRPr}<w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`
          );
        })
        .join("");
      return `<w:tr>${tr}</w:tr>`;
    })
    .join("");

  return `<w:tbl>${tblPr}<w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}
