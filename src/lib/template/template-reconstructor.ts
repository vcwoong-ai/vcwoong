/**
 * 양식 1:1 재현 엔진.
 *
 * 새 DOCX를 만드는 대신 **업로드된 원본 파일을 열어 본문 단락만 교체**한다.
 * styles.xml·theme·헤더/푸터·표지·이미지·번호매기기를 그대로 두므로
 * 회사 양식의 폰트·색상·여백이 원본과 동일하게 유지된다.
 *
 * 헤딩을 찾지 못하는 등 재현이 불가능하면 호출부가 기존 생성기로 폴백한다.
 */

import { SectionKey } from "@prisma/client";
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
import { extractUnmappedContent, MAX_EXTRACTION_ATTEMPTS } from "./slide-extraction";

/**
 * 매핑표에 없는 헤딩도 텍스트 키워드로 SectionKey를 추정한다.
 * 업로드 시 섹션 매핑이 불완전해도 흔한 IC 보고서 제목은 자동으로 잡힌다.
 */
const KEYWORD_FALLBACK: Array<{ pattern: RegExp; key: SectionKey }> = [
  { pattern: /투자\s*(개요|요약)|investment\s*overview/i, key: SectionKey.INVESTMENT_OVERVIEW },
  { pattern: /회사\s*(개요|소개|현황)|기업\s*(개요|소개)|company\s*overview/i, key: SectionKey.COMPANY_OVERVIEW },
  { pattern: /제품|기술|서비스|파이프라인|product|technology/i, key: SectionKey.PRODUCT_TECHNOLOGY },
  { pattern: /시장|경쟁|market/i, key: SectionKey.MARKET_ANALYSIS },
  { pattern: /재무|손익|매출|financial/i, key: SectionKey.FINANCIAL_STATUS },
  { pattern: /밸류에이션|기업가치|valuation|가치\s*평가/i, key: SectionKey.VALUATION },
  { pattern: /리스크|위험|risk/i, key: SectionKey.RISK_ANALYSIS },
  { pattern: /투자\s*조건|term\s*sheet|조건/i, key: SectionKey.INVESTMENT_TERMS },
  { pattern: /의견|결론|종합|opinion|conclusion/i, key: SectionKey.OPINION_SUMMARY },
  { pattern: /별첨|부록|appendix|참고/i, key: SectionKey.APPENDIX },
];

function resolveByKeyword(headingText: string): SectionKey | null {
  for (const { pattern, key } of KEYWORD_FALLBACK) {
    if (pattern.test(headingText)) return key;
  }
  return null;
}

export interface ReconstructInput {
  /** 사용자가 업로드한 원본 DOCX */
  originalBuffer: Buffer;
  /** 템플릿 섹션 → 표준 SectionKey 매핑 */
  sectionMap: TemplateSectionMap;
  /** 생성된 보고서 섹션 */
  reportSections: Array<{ sectionKey: string; title: string; content: string }>;
  /** 치환할 딜 정보 (플레이스홀더용) */
  replacements?: Record<string, string>;
  /**
   * 딜에 업로드된 원본 IR 자료. 표준 10개 섹션에 대응하지 않는 슬라이드/
   * 헤딩(예: "인력 구성", "주주 구성")은 AI 생성 섹션으로 못 채우지만,
   * 이 자료에서 관련 내용을 찾아 채울 수 있으면 시도한다. 생략하면
   * 이 보조 추출 없이 매핑 안 된 자리는 그대로 둔다(기존 동작).
   */
  documents?: Array<{ name: string; parsedText: string | null }>;
}

export interface ReconstructResult {
  buffer: Buffer;
  /** 실제로 내용을 채운 섹션 수 */
  filledSections: number;
  /** 원본에서 찾은 헤딩 수 */
  detectedHeadings: number;
  /** 매핑됐지만 원본에서 헤딩을 못 찾은 섹션 */
  missedSections: string[];
  /** 생성됐지만 원본에 대응 헤딩이 없어 문서 끝에 덧붙인 섹션 (내용 유실 방지) */
  appendedSections: string[];
  /** 표준 섹션에 대응하지 않아 업로드 자료에서 대신 추출해 채운 슬라이드/헤딩 제목 */
  extractedFromDocuments: string[];
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

  // 같은 SectionKey로 매핑되는 헤딩이 여러 개일 수 있다(예: "재무 현황"과
  // "손익 추정"이 둘 다 FINANCIAL_STATUS). 예전엔 먼저 나온 헤딩만 채우고
  // 나머지는 건너뛰어서, 뒤 헤딩 자리엔 원본 예시 기업의 실제 내용이 그대로
  // 남았다(대신 문서 끝에 같은 내용이 중복 첨부됨) — 자리에 맞게 채우는 쪽이
  // 엉뚱한 회사 데이터를 그 자리에 남겨두는 것보다 낫다.
  blocks.forEach((b, idx) => {
    if (b.kind !== "p" || !b.text) return;
    const norm = normalizeTitle(b.text);
    if (!norm) return;

    // 정확히 일치하는 제목은 헤딩 스타일이 없어도 안전하게 받아들인다
    // ("작성 요령) 리스크..." 같은 안내문이 우연히 "리스크"를 완전히
    // 통째로 담는 경우는 사실상 없다).
    let key = titleToKey.get(norm);

    // 부분 일치·키워드 추정은 오탐 위험이 있다 — "(작성 요령) 주요 리스크와
    // 완화 방안을 기재한다" 같은 본문 문장도 "리스크"를 부분 문자열로 담고
    // 있어서, 실제 헤딩 스타일이 있는 블록에만 적용해 본문이 헤딩으로
    // 오인되지 않게 한다.
    if (!key && b.headingLevel !== null) {
      // 부분 일치 (원본 헤딩에 번호·부제가 덧붙은 경우)
      titleToKey.forEach((k, t) => {
        if (!key && t.length >= 2 && (norm.includes(t) || t.includes(norm))) {
          key = k;
        }
      });
      // 매핑표에 없어도 흔히 쓰는 제목 키워드면 잡는다 (섹션맵이 불완전한 경우 대비)
      if (!key) key = resolveByKeyword(b.text) ?? undefined;
    }

    // 헤딩 스타일이 없더라도 매핑표에 정확히 일치하는 짧은 줄이면 제목으로 본다
    const looksLikeHeading = b.headingLevel !== null || b.text.length <= 40;
    if (!looksLikeHeading) return;
    if (!key) return;

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
  const globalProto = pickBodyProto(blocks);
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
  const consumedKeys = new Set<string>();
  let filledSections = 0;

  headingMap.forEach((key, idx) => {
    const section = contentByKey.get(key);
    if (!section) {
      missedSections.push(key);
      return;
    }
    const end = findSectionEnd(blocks, idx, headingIdx);
    // 서식은 이 섹션의 원본 본문 범위에서 우선 빌려오고, 없으면 문서 전체 기준을 쓴다
    const localProto = pickBodyProto(blocks.slice(idx + 1, end));
    const proto = localProto.pPr || localProto.rPr ? localProto : globalProto;
    replacedRanges.push({
      from: idx + 1,
      to: end,
      xml: renderContent(proto, section.content) + buildEmptyParagraph(proto),
    });
    consumedKeys.add(key);
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

  // 표준 섹션에 대응하지 않는 헤딩(인력 구성·주주 구성 등)은 AI 생성
  // 섹션으로 못 채우지만, 업로드된 IR 자료에 관련 내용이 있으면 대신
  // 채운다 — 없으면 원본 예시 내용을 그대로 둔다(지어내지 않음).
  const extractedFromDocuments: string[] = [];
  if (input.documents && input.documents.length > 0) {
    let attempts = 0;
    for (let idx = 0; idx < blocks.length; idx++) {
      if (attempts >= MAX_EXTRACTION_ATTEMPTS) break;
      const b = blocks[idx];
      if (b.kind !== "p" || b.headingLevel === null || !b.text?.trim()) continue;
      if (headingMap.has(idx)) continue;

      attempts += 1;
      const end = findSectionEnd(blocks, idx, headingIdx);
      const sample = blocks
        .slice(idx + 1, end)
        .map((bb) => (bb.kind === "p" ? bb.text ?? "" : ""))
        .join(" ");
      const extracted = await extractUnmappedContent(b.text, sample, input.documents);
      if (!extracted) continue;

      const localProto = pickBodyProto(blocks.slice(idx + 1, end));
      const proto = localProto.pPr || localProto.rPr ? localProto : globalProto;
      replacedRanges.push({
        from: idx + 1,
        to: end,
        xml: renderContent(proto, extracted) + buildEmptyParagraph(proto),
      });
      extractedFromDocuments.push(b.text);
      filledSections += 1;
    }
  }

  replacedRanges.sort((a, b) => a.from - b.from);

  // 원본에 자리가 없어 통째로 유실될 뻔한 섹션은 문서 끝(sectPr 앞)에 덧붙인다
  const appendedSections: string[] = [];
  const leftovers = input.reportSections.filter((s) => !consumedKeys.has(s.sectionKey));
  let tailXml = "";
  for (const s of leftovers) {
    tailXml +=
      buildParagraph(globalProto, s.title, { bold: true }) +
      renderContent(globalProto, s.content) +
      buildEmptyParagraph(globalProto);
    appendedSections.push(s.sectionKey);
  }

  const sectPrBlockIdx = blocks.findIndex((b) => b.kind === "sectPr");

  let rebuilt = "";
  let cursor = 0;
  for (const r of replacedRanges) {
    for (let i = cursor; i < r.from; i++) rebuilt += blocks[i].xml;
    rebuilt += r.xml;
    cursor = r.to;
  }
  for (let i = cursor; i < blocks.length; i++) {
    if (tailXml && i === sectPrBlockIdx) rebuilt += tailXml;
    rebuilt += blocks[i].xml;
  }
  if (tailXml && sectPrBlockIdx === -1) rebuilt += tailXml;

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
    appendedSections,
    extractedFromDocuments,
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
