/**
 * 양식 1:1 재현 엔진.
 *
 * 새 DOCX를 만드는 대신 **업로드된 원본 파일을 열어 본문 단락만 교체**한다.
 * styles.xml·theme·헤더/푸터·표지·이미지·번호매기기를 그대로 두므로
 * 회사 양식의 폰트·색상·여백이 원본과 동일하게 유지된다.
 *
 * 헤딩을 찾지 못하는 등 재현이 불가능하면 호출부가 기존 생성기로 폴백한다.
 */

import type { SectionKey } from "@prisma/client";
import {
  buildEmptyParagraph,
  buildParagraph,
  buildTable,
  extractBody,
  normalizeTitle,
  pickBodyProto,
  splitBlocks,
  type DocxBlock,
  type ParagraphProto,
} from "./docx-xml";
import type { TemplateSectionMap } from "./template-mapper";

export interface ReconstructInput {
  /** 사용자가 업로드한 원본 DOCX */
  originalBuffer: Buffer;
  /** 템플릿 섹션 → 표준 SectionKey 매핑 */
  sectionMap: TemplateSectionMap;
  /** 생성된 보고서 섹션 */
  reportSections: Array<{ sectionKey: string; title: string; content: string }>;
  /** 치환할 딜 정보 (플레이스홀더용) */
  replacements?: Record<string, string>;
}

export interface ReconstructResult {
  buffer: Buffer;
  /** 실제로 내용을 채운 섹션 수 */
  filledSections: number;
  /** 원본에서 찾은 헤딩 수 */
  detectedHeadings: number;
  /** 매핑됐지만 원본에서 헤딩을 못 찾은 섹션 */
  missedSections: string[];
}

export class ReconstructError extends Error {}

/** 문단 블록으로 변환할 마크다운 조각 */
type ContentBlock =
  | { type: "heading"; text: string }
  | { type: "bullet"; text: string }
  | { type: "para"; text: string }
  | { type: "table"; rows: string[][] };

/** 마크다운 본문을 DOCX 블록 단위로 파싱 */
export function markdownToBlocks(markdown: string): ContentBlock[] {
  const out: ContentBlock[] = [];
  const lines = markdown.split("\n");
  let tableBuf: string[] = [];

  const flushTable = () => {
    if (tableBuf.length === 0) return;
    const rows = tableBuf
      .filter((l) => !/^\|[\s|:-]+\|?$/.test(l.replace(/\s/g, "")))
      .map((l) =>
        l
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim().replace(/\*\*/g, ""))
      );
    tableBuf = [];
    if (rows.length > 0) out.push({ type: "table", rows });
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith("|")) {
      tableBuf.push(line);
      continue;
    }
    flushTable();

    if (!line) continue;
    // 품질 점수 메모 같은 구분선은 버린다
    if (/^-{3,}$/.test(line)) continue;

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      out.push({ type: "heading", text: clean(heading[2]) });
      continue;
    }

    // 인용(>)은 Word에 표기할 방법이 마땅치 않아 일반 문단으로 낮춘다
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      const inner = clean(quote[1]);
      if (inner) out.push({ type: "para", text: inner });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      out.push({ type: "bullet", text: clean(bullet[1]) });
      continue;
    }

    const numbered = /^(\d+)\.\s+(.*)$/.exec(line);
    if (numbered) {
      out.push({ type: "bullet", text: `${numbered[1]}. ${clean(numbered[2])}` });
      continue;
    }

    out.push({ type: "para", text: clean(line) });
  }
  flushTable();

  return out;
}

function clean(s: string): string {
  return s.replace(/\*\*/g, "").replace(/`/g, "").trim();
}

function renderContent(proto: ParagraphProto, markdown: string): string {
  const blocks = markdownToBlocks(markdown);
  if (blocks.length === 0) return buildParagraph(proto, "확인 필요");

  return blocks
    .map((b) => {
      switch (b.type) {
        case "heading":
          return buildParagraph(proto, b.text, { bold: true });
        case "bullet":
          return buildParagraph(proto, `• ${b.text}`);
        case "table":
          return buildTable(proto, b.rows);
        default:
          return buildParagraph(proto, b.text);
      }
    })
    .join("");
}

/**
 * 원본 헤딩 블록과 표준 SectionKey를 연결한다.
 * 매핑표의 템플릿 섹션 제목을 정규화해 원본 헤딩 텍스트와 맞춘다.
 */
function buildHeadingIndex(
  blocks: DocxBlock[],
  sectionMap: TemplateSectionMap
): Map<number, SectionKey> {
  const titleToKey = new Map<string, SectionKey>();
  for (const m of sectionMap.mappings) {
    if (!m.sectionKey) continue;
    titleToKey.set(normalizeTitle(m.templateSection), m.sectionKey);
  }

  const result = new Map<number, SectionKey>();
  const used = new Set<SectionKey>();

  blocks.forEach((b, idx) => {
    if (b.kind !== "p" || !b.text) return;
    const norm = normalizeTitle(b.text);
    if (!norm) return;

    let key = titleToKey.get(norm);
    if (!key) {
      // 부분 일치 (원본 헤딩에 번호·부제가 덧붙은 경우)
      titleToKey.forEach((k, t) => {
        if (!key && t.length >= 2 && (norm.includes(t) || t.includes(norm))) {
          key = k;
        }
      });
    }
    if (!key || used.has(key)) return;

    // 헤딩 스타일이 없더라도 매핑표에 있는 짧은 줄이면 제목으로 본다
    const looksLikeHeading = b.headingLevel !== null || b.text.length <= 40;
    if (!looksLikeHeading) return;

    used.add(key);
    result.set(idx, key);
  });

  return result;
}

/** 다음 헤딩(또는 매핑된 제목) 전까지가 해당 섹션의 본문 범위 */
function findSectionEnd(
  blocks: DocxBlock[],
  startIdx: number,
  headingIdx: Set<number>
): number {
  for (let i = startIdx + 1; i < blocks.length; i++) {
    if (blocks[i].kind === "sectPr") return i;
    if (headingIdx.has(i)) return i;
    if (blocks[i].kind === "p" && blocks[i].headingLevel !== null) return i;
  }
  return blocks.length;
}

export async function reconstructDOCX(
  input: ReconstructInput
): Promise<ReconstructResult> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(input.originalBuffer);

  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new ReconstructError("word/document.xml을 찾을 수 없습니다");
  }

  const documentXml = await docFile.async("text");
  const parts = extractBody(documentXml);
  if (!parts) {
    throw new ReconstructError("<w:body>를 파싱하지 못했습니다");
  }

  const blocks = splitBlocks(parts.body);
  const proto = pickBodyProto(blocks);
  const headingMap = buildHeadingIndex(blocks, input.sectionMap);

  if (headingMap.size === 0) {
    throw new ReconstructError("원본에서 매핑된 섹션 제목을 찾지 못했습니다");
  }

  const contentByKey = new Map<string, { title: string; content: string }>();
  for (const s of input.reportSections) {
    contentByKey.set(s.sectionKey, { title: s.title, content: s.content });
  }

  const headingIdx = new Set(headingMap.keys());
  const replacedRanges: Array<{ from: number; to: number; xml: string }> = [];
  const missedSections: string[] = [];
  let filledSections = 0;

  headingMap.forEach((key, idx) => {
    const section = contentByKey.get(key);
    if (!section) {
      missedSections.push(key);
      return;
    }
    const end = findSectionEnd(blocks, idx, headingIdx);
    replacedRanges.push({
      from: idx + 1,
      to: end,
      xml: renderContent(proto, section.content) + buildEmptyParagraph(proto),
    });
    filledSections += 1;
  });

  // 매핑됐지만 원본에 제목이 없던 섹션도 기록
  const matchedKeys = new Set<string>();
  headingMap.forEach((k) => matchedKeys.add(k));
  for (const m of input.sectionMap.mappings) {
    if (!m.sectionKey) continue;
    if (!matchedKeys.has(m.sectionKey) && contentByKey.has(m.sectionKey)) {
      missedSections.push(m.sectionKey);
    }
  }

  replacedRanges.sort((a, b) => a.from - b.from);

  let rebuilt = "";
  let cursor = 0;
  for (const r of replacedRanges) {
    for (let i = cursor; i < r.from; i++) rebuilt += blocks[i].xml;
    rebuilt += r.xml;
    cursor = r.to;
  }
  for (let i = cursor; i < blocks.length; i++) rebuilt += blocks[i].xml;

  // 플레이스홀더 치환 (표지의 {{기업명}} 등)
  let finalXml = parts.before + rebuilt + parts.after;
  for (const [k, v] of Object.entries(input.replacements ?? {})) {
    finalXml = replacePlaceholder(finalXml, k, v);
  }

  zip.file("word/document.xml", finalXml);
  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  return {
    buffer,
    filledSections,
    detectedHeadings: headingMap.size,
    missedSections: missedSections.filter((v, i) => missedSections.indexOf(v) === i),
  };
}

/**
 * {{키}} / [키] 형태 플레이스홀더 치환.
 * Word가 텍스트를 여러 런으로 쪼개는 경우가 많아 <w:t> 안에서만 안전하게 바꾼다.
 */
function replacePlaceholder(xml: string, key: string, value: string): string {
  const escapedValue = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const patterns = [`{{${key}}}`, `[${key}]`];
  let out = xml;
  for (const p of patterns) {
    out = out.split(p).join(escapedValue);
  }
  return out;
}
