/**
 * OOXML(word/document.xml) 블록 단위 조작 유틸.
 *
 * 원본 DOCX를 새로 만들지 않고 본문 단락만 교체하기 위한 도구다.
 * styles.xml·theme·헤더/푸터·이미지를 건드리지 않으므로
 * 회사 양식의 폰트·색상·여백·표지가 그대로 보존된다.
 */

export type BlockKind = "p" | "tbl" | "sectPr" | "other";

export interface DocxBlock {
  kind: BlockKind;
  tag: string;
  xml: string;
  /** 단락/표에 들어 있는 순수 텍스트 */
  text: string;
  /** w:pStyle 값 (없으면 null) */
  styleId: string | null;
  /** 헤딩이면 1~9, 아니면 null */
  headingLevel: number | null;
}

const BLOCK_TAGS = new Set([
  "w:p",
  "w:tbl",
  "w:sdt",
  "w:sectPr",
  "w:bookmarkStart",
  "w:bookmarkEnd",
  "w:commentRangeStart",
  "w:commentRangeEnd",
  "w:proofErr",
  "w:permStart",
  "w:permEnd",
]);

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 여는 태그 위치에서 대응하는 닫는 태그 끝 인덱스를 찾는다 (같은 이름 중첩 처리) */
function findElementEnd(xml: string, openStart: number, tag: string): number {
  const openTagEnd = xml.indexOf(">", openStart);
  if (openTagEnd === -1) return xml.length;
  if (xml[openTagEnd - 1] === "/") return openTagEnd + 1;

  const openRe = new RegExp(`<${escapeRe(tag)}(?=[\\s/>])`, "g");
  const closeRe = new RegExp(`</${escapeRe(tag)}\\s*>`, "g");
  let depth = 1;
  let cursor = openTagEnd + 1;

  while (cursor < xml.length) {
    openRe.lastIndex = cursor;
    closeRe.lastIndex = cursor;
    const nextOpen = openRe.exec(xml);
    const nextClose = closeRe.exec(xml);
    if (!nextClose) return xml.length;

    if (nextOpen && nextOpen.index < nextClose.index) {
      // 자기 닫힘 태그는 깊이에 영향이 없다
      const selfEnd = xml.indexOf(">", nextOpen.index);
      if (selfEnd !== -1 && xml[selfEnd - 1] !== "/") depth += 1;
      cursor = (selfEnd === -1 ? nextOpen.index : selfEnd) + 1;
      continue;
    }

    depth -= 1;
    cursor = nextClose.index + nextClose[0].length;
    if (depth === 0) return cursor;
  }
  return xml.length;
}

/** <w:body> 안쪽 XML을 최상위 블록 배열로 나눈다 */
export function splitBlocks(bodyXml: string): DocxBlock[] {
  const blocks: DocxBlock[] = [];
  let i = 0;

  while (i < bodyXml.length) {
    const lt = bodyXml.indexOf("<", i);
    if (lt === -1) break;

    const nameMatch = /^<([a-zA-Z0-9:_.-]+)/.exec(bodyXml.slice(lt, lt + 64));
    if (!nameMatch) {
      i = lt + 1;
      continue;
    }
    const tag = nameMatch[1];
    if (!BLOCK_TAGS.has(tag)) {
      // 알 수 없는 최상위 요소도 통째로 보존한다
      const end = findElementEnd(bodyXml, lt, tag);
      blocks.push(makeBlock(tag, bodyXml.slice(lt, end)));
      i = end;
      continue;
    }

    const end = findElementEnd(bodyXml, lt, tag);
    blocks.push(makeBlock(tag, bodyXml.slice(lt, end)));
    i = end;
  }

  return blocks;
}

function makeBlock(tag: string, xml: string): DocxBlock {
  const kind: BlockKind =
    tag === "w:p" ? "p" : tag === "w:tbl" ? "tbl" : tag === "w:sectPr" ? "sectPr" : "other";
  const styleId = kind === "p" ? getParagraphStyleId(xml) : null;
  return {
    kind,
    tag,
    xml,
    text: extractText(xml),
    styleId,
    headingLevel: kind === "p" ? detectHeadingLevel(xml, styleId) : null,
  };
}

/** <w:t> 내용을 모두 이어붙인다 */
export function extractText(xml: string): string {
  const parts = xml.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) ?? [];
  return parts
    .map((p) => p.replace(/<w:t(?:\s[^>]*)?>/, "").replace(/<\/w:t>/, ""))
    .join("")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

export function getParagraphStyleId(pXml: string): string | null {
  return /<w:pStyle\s+w:val="([^"]+)"/.exec(pXml)?.[1] ?? null;
}

/**
 * 헤딩 여부 판정.
 * Word 기본 스타일(Heading1/제목1)과 outlineLvl 두 신호를 함께 본다.
 */
export function detectHeadingLevel(
  pXml: string,
  styleId: string | null
): number | null {
  if (styleId) {
    const m = /^(?:Heading|heading|제목)\s*(\d)$/.exec(styleId.trim());
    if (m) return Number(m[1]);
    if (/^(?:Title|제목)$/i.test(styleId.trim())) return 1;
  }
  const outline = /<w:outlineLvl\s+w:val="(\d)"/.exec(pXml);
  if (outline) return Number(outline[1]) + 1;
  return null;
}

/** 단락의 <w:pPr> 원본 문자열 (없으면 빈 문자열) */
export function getPPr(pXml: string): string {
  const start = pXml.indexOf("<w:pPr");
  if (start === -1) return "";
  const end = findElementEnd(pXml, start, "w:pPr");
  return pXml.slice(start, end);
}

/** 단락 첫 런의 <w:rPr> 원본 문자열 (없으면 빈 문자열) */
export function getFirstRPr(pXml: string): string {
  const runStart = pXml.indexOf("<w:r>") >= 0 ? pXml.indexOf("<w:r>") : pXml.indexOf("<w:r ");
  if (runStart === -1) return "";
  const runEnd = findElementEnd(pXml, runStart, "w:r");
  const runXml = pXml.slice(runStart, runEnd);
  const rprStart = runXml.indexOf("<w:rPr");
  if (rprStart === -1) return "";
  const rprEnd = findElementEnd(runXml, rprStart, "w:rPr");
  return runXml.slice(rprStart, rprEnd);
}

/** rPr에 <w:b/>를 넣어 굵게 만든다 (이미 있으면 그대로) */
export function boldenRPr(rPr: string): string {
  if (!rPr) return "<w:rPr><w:b/></w:rPr>";
  if (/<w:b\s*\/>|<w:b\s+[^>]*\/>/.test(rPr)) return rPr;
  return rPr.replace(/^<w:rPr(\s[^>]*)?>/, (m) => `${m}<w:b/>`);
}

export interface ParagraphProto {
  /** 본문 단락 서식 */
  pPr: string;
  rPr: string;
}

/**
 * 본문 서식의 기준이 될 단락을 고른다.
 * 헤딩이 아니고 텍스트가 있는 단락 중 가장 흔한 스타일을 쓴다.
 */
export function pickBodyProto(blocks: DocxBlock[]): ParagraphProto {
  const candidates = blocks.filter(
    (b) => b.kind === "p" && b.headingLevel === null && b.text.length >= 10
  );
  if (candidates.length === 0) {
    return { pPr: "", rPr: "" };
  }

  const styleCount = new Map<string, number>();
  for (const c of candidates) {
    const key = c.styleId ?? "__none__";
    styleCount.set(key, (styleCount.get(key) ?? 0) + 1);
  }
  let topStyle = "__none__";
  let topN = -1;
  styleCount.forEach((n, k) => {
    if (n > topN) {
      topN = n;
      topStyle = k;
    }
  });

  const proto =
    candidates.find((c) => (c.styleId ?? "__none__") === topStyle) ?? candidates[0];

  return { pPr: getPPr(proto.xml), rPr: getFirstRPr(proto.xml) };
}

/** 프로토타입 서식을 유지한 채 텍스트만 바꾼 단락 XML을 만든다 */
export function buildParagraph(
  proto: ParagraphProto,
  text: string,
  opts: { bold?: boolean } = {}
): string {
  const rPr = opts.bold ? boldenRPr(proto.rPr) : proto.rPr;
  const safe = escapeXml(text);
  return `<w:p>${proto.pPr}<w:r>${rPr}<w:t xml:space="preserve">${safe}</w:t></w:r></w:p>`;
}

/** 빈 단락 (섹션 사이 여백) */
export function buildEmptyParagraph(proto: ParagraphProto): string {
  return `<w:p>${proto.pPr}</w:p>`;
}

/**
 * 표 XML 생성.
 * 원본 문서에 어떤 표 스타일이 있는지 알 수 없으므로 테두리를 명시해
 * 어느 양식에서든 동일하게 보이도록 한다.
 */
export function buildTable(
  proto: ParagraphProto,
  rows: string[][]
): string {
  if (rows.length === 0) return "";
  const colCount = Math.max(...rows.map((r) => r.length));
  const width = Math.floor(9000 / colCount);

  const borders = [
    "top",
    "left",
    "bottom",
    "right",
    "insideH",
    "insideV",
  ]
    .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`)
    .join("");

  const body = rows
    .map((cells, rowIdx) => {
      const tcs = Array.from({ length: colCount }, (_, i) => {
        const text = cells[i] ?? "";
        const rPr = rowIdx === 0 ? boldenRPr(proto.rPr) : proto.rPr;
        const shading =
          rowIdx === 0
            ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F4F7"/>'
            : "";
        return (
          `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shading}</w:tcPr>` +
          `<w:p>${proto.pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>` +
          `</w:tc>`
        );
      }).join("");
      return `<w:tr>${tcs}</w:tr>`;
    })
    .join("");

  return (
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>` +
    `<w:tblBorders>${borders}</w:tblBorders></w:tblPr>${body}</w:tbl>`
  );
}

/** document.xml에서 <w:body> 안쪽만 잘라낸다 */
export function extractBody(documentXml: string): {
  before: string;
  body: string;
  after: string;
} | null {
  const openMatch = /<w:body(?:\s[^>]*)?>/.exec(documentXml);
  if (!openMatch) return null;
  const bodyStart = openMatch.index + openMatch[0].length;
  const bodyEnd = documentXml.lastIndexOf("</w:body>");
  if (bodyEnd === -1 || bodyEnd < bodyStart) return null;

  return {
    before: documentXml.slice(0, bodyStart),
    body: documentXml.slice(bodyStart, bodyEnd),
    after: documentXml.slice(bodyEnd),
  };
}

/** 제목 비교용 정규화 (번호·기호·공백 제거) */
export function normalizeTitle(s: string): string {
  return s
    .replace(/[\s\u00a0]/g, "")
    .replace(/^[■□▶◆●★※·\-–—]+/, "")
    .replace(/^\(?\d+[.)]?/, "")
    .replace(/^[IVXivx]+[.)]/, "")
    .replace(/[[\]{}()<>]/g, "")
    .toLowerCase();
}
