/**
 * 양식 1:1 재현 엔진.
 *
 * 새 DOCX를 만들지 않고 **업로드된 원본 파일을 열어** 섹션 본문만 교체한다.
 * styles.xml / theme / numbering / 머리글·바닥글을 손대지 않으므로
 * 폰트·색상·여백·표지 레이아웃이 원본 그대로 유지된다.
 *
 * 흐름:
 *   1. 원본 word/document.xml 의 본문을 최상위 블록으로 분해
 *   2. 헤딩 단락을 찾아 SectionKey에 매핑 (업로드 시 저장된 sectionMap 우선)
 *   3. 헤딩과 다음 헤딩 사이 블록을 AI 생성 본문으로 치환
 *      — 이때 원본 단락의 pPr/rPr을 복제해 서식을 그대로 물려받는다
 *   4. 남은 단락의 {{플레이스홀더}} 를 딜 정보로 치환
 */

import { SectionKey } from "@prisma/client";
import {
  blockText,
  buildTable,
  cloneParagraph,
  extractBody,
  isBoldParagraph,
  numberingProps,
  paragraphStyleId,
  replaceParagraphText,
  splitBlocks,
  type DocxBlock,
} from "./docx-xml";
import type { TemplateSectionMap } from "./template-mapper";

export interface ReconstructSection {
  sectionKey: SectionKey;
  title: string;
  content: string;
}

export interface ReconstructOptions {
  companyName: string;
  investRound?: string | null;
  investAmount?: number | null;
  valuation?: number | null;
  sector?: string | null;
  reportDate?: Date;
  vcFirmName?: string;
}

export interface ReconstructResult {
  buffer: Buffer;
  /** 원본 헤딩 중 AI 본문으로 채워진 섹션 */
  filledSections: SectionKey[];
  /** 매핑되지 않아 원본 그대로 남은 헤딩 */
  untouchedHeadings: string[];
  /** 생성됐지만 원본에 대응 헤딩이 없어 문서 끝에 덧붙인 섹션 */
  appendedSections: SectionKey[];
  placeholdersReplaced: number;
}

// ─────────────────────────────────────────────────────
// 헤딩 판별
// ─────────────────────────────────────────────────────

const HEADING_TEXT_PATTERNS = [
  /^\d+\s*[.)]\s+\S/,
  /^[IVX]+\s*[.)]\s+\S/,
  /^[■□▶◆●★]\s*\S/,
  /^제\s*\d+\s*[조장절]/,
];

function outlineLevel(pXml: string): number | null {
  const explicit = /<w:outlineLvl\s+w:val="(\d+)"/.exec(pXml);
  if (explicit) return Number(explicit[1]);

  const styleId = paragraphStyleId(pXml);
  const heading = /^(?:Heading|heading|제목)\s*(\d)/.exec(styleId);
  if (heading) return Number(heading[1]) - 1;
  if (/^Title$/i.test(styleId)) return 0;

  return null;
}

function isHeadingBlock(block: DocxBlock): boolean {
  if (block.type !== "p") return false;

  const level = outlineLevel(block.xml);
  if (level !== null && level <= 2) return true;

  const text = blockText(block.xml);
  if (!text || text.length > 60) return false;

  if (HEADING_TEXT_PATTERNS.some((p) => p.test(text))) return true;

  // 번호는 없지만 굵고 짧은 한 줄 — 표 안이 아닐 때만 헤딩으로 본다
  return isBoldParagraph(block.xml) && text.length <= 30 && !/[.。]$/.test(text);
}

// ─────────────────────────────────────────────────────
// 헤딩 → SectionKey 매핑
// ─────────────────────────────────────────────────────

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

function normalizeHeading(text: string): string {
  return text
    .replace(/^[■□▶◆●★\s]+/, "")
    .replace(/^\d+\s*[.)]\s*/, "")
    .replace(/^[IVX]+\s*[.)]\s*/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function buildHeadingLookup(sectionMap: TemplateSectionMap | null): Map<string, SectionKey> {
  const lookup = new Map<string, SectionKey>();
  for (const mapping of sectionMap?.mappings ?? []) {
    if (!mapping.sectionKey) continue;
    lookup.set(normalizeHeading(mapping.templateSection), mapping.sectionKey);
  }
  return lookup;
}

function resolveSectionKey(
  headingText: string,
  lookup: Map<string, SectionKey>
): SectionKey | null {
  const normalized = normalizeHeading(headingText);
  const mapped = lookup.get(normalized);
  if (mapped) return mapped;

  for (const { pattern, key } of KEYWORD_FALLBACK) {
    if (pattern.test(headingText)) return key;
  }
  return null;
}

// ─────────────────────────────────────────────────────
// 서식 기증 단락 (donor) 선택
// ─────────────────────────────────────────────────────

interface Donors {
  body: string;
  bullet: string | null;
  subHeading: string | null;
}

const FALLBACK_BODY_PARAGRAPH = "<w:p><w:pPr/></w:p>";

function pickDonors(blocks: DocxBlock[], fallback?: Donors): Donors {
  const paragraphs = blocks.filter((b) => b.type === "p");
  const bodyCandidate = paragraphs.find(
    (b) => !isHeadingBlock(b) && blockText(b.xml).length >= 10
  );
  const bulletCandidate = paragraphs.find((b) => numberingProps(b.xml) !== "");
  const subHeadingCandidate = paragraphs.find((b) => {
    const level = outlineLevel(b.xml);
    return level !== null && level >= 1 && level <= 3;
  });

  return {
    body:
      bodyCandidate?.xml ??
      fallback?.body ??
      paragraphs[0]?.xml ??
      FALLBACK_BODY_PARAGRAPH,
    bullet: bulletCandidate?.xml ?? fallback?.bullet ?? null,
    subHeading: subHeadingCandidate?.xml ?? fallback?.subHeading ?? null,
  };
}

// ─────────────────────────────────────────────────────
// 마크다운 → 원본 서식 블록
// ─────────────────────────────────────────────────────

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:-]*-[-\s|:]*\|?\s*$/.test(line) && line.includes("-");
}

export function renderMarkdownBlocks(markdown: string, donors: Donors): string[] {
  const out: string[] = [];
  const lines = markdown.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) continue;

    // 표 — 연속된 | 행을 모아서 한 번에 처리
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length) {
        const current = lines[i].trim();
        if (!current.startsWith("|") || !current.endsWith("|")) break;
        if (!isTableSeparator(current)) rows.push(parseTableRow(current));
        i++;
      }
      i--;
      if (rows.length > 0) out.push(buildTable(rows, donors.body));
      continue;
    }

    // 소제목
    const heading = /^(#{2,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const donor = donors.subHeading ?? donors.body;
      out.push(
        cloneParagraph(donor, heading[2].replace(/\*\*/g, ""), {
          bold: true,
          numbering: null,
        })
      );
      continue;
    }

    // 불릿
    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      if (donors.bullet) {
        out.push(cloneParagraph(donors.bullet, bullet[1]));
      } else {
        out.push(cloneParagraph(donors.body, `• ${bullet[1]}`, { numbering: null }));
      }
      continue;
    }

    out.push(cloneParagraph(donors.body, trimmed, { numbering: null }));
  }

  return out;
}

// ─────────────────────────────────────────────────────
// 플레이스홀더
// ─────────────────────────────────────────────────────

const PLACEHOLDER_SOURCE = /\{\{\s*([^}]{1,40}?)\s*\}\}|\[\s*([^\]]{2,30}?)\s*\]/;
const PLACEHOLDER_RE = new RegExp(PLACEHOLDER_SOURCE.source, "g");

function buildPlaceholderValues(options: ReconstructOptions): Map<string, string> {
  const date = options.reportDate ?? new Date();
  const values = new Map<string, string>();

  const set = (keys: string[], value: string) => {
    for (const key of keys) values.set(key.replace(/\s+/g, "").toLowerCase(), value);
  };

  set(["회사명", "기업명", "회사", "대상기업", "투자대상", "companyname", "company"], options.companyName);
  set(["섹터", "업종", "분야", "sector"], options.sector ?? "");
  set(["투자라운드", "라운드", "round", "investround"], options.investRound ?? "");
  set(
    ["투자금액", "투자액", "investamount", "amount"],
    options.investAmount != null ? `${options.investAmount.toLocaleString()}억원` : ""
  );
  set(
    ["기업가치", "밸류에이션", "valuation", "postmoney"],
    options.valuation != null ? `${options.valuation.toLocaleString()}억원` : ""
  );
  set(
    ["작성일", "날짜", "일자", "보고일", "date", "reportdate"],
    date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
  );
  set(["작성자", "심사역", "운용사", "회사이름", "vc", "firm"], options.vcFirmName ?? "");

  return values;
}

function substitutePlaceholders(
  text: string,
  values: Map<string, string>,
  counter: { count: number }
): string {
  return text.replace(PLACEHOLDER_RE, (match, curly?: string, bracket?: string) => {
    const raw = curly ?? bracket;
    if (!raw) return match;
    const value = values.get(raw.replace(/\s+/g, "").toLowerCase());
    if (value === undefined) return match;
    counter.count += 1;
    return value;
  });
}

// ─────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────

export interface TemplateOutlineEntry {
  heading: string;
  sectionKey: SectionKey | null;
  /** 원본 문서에서 이 헤딩 아래에 있던 내용 미리보기 */
  originalPreview: string;
}

/**
 * 파일을 바꾸지 않고 원본 헤딩 구조와 매핑 결과만 읽어온다.
 * 원본 대비 비교 UI에서 "무엇이 어디에 채워질지" 보여주는 데 쓴다.
 */
export async function analyzeDocxOutline(
  originalBuffer: Buffer,
  sectionMap: TemplateSectionMap | null
): Promise<TemplateOutlineEntry[] | null> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(originalBuffer);

  const documentFile = zip.file("word/document.xml");
  if (!documentFile) return null;

  const parts = extractBody(await documentFile.async("text"));
  if (!parts) return null;

  const blocks = splitBlocks(parts.body);
  const headingIndexes = blocks
    .map((block, index) => (isHeadingBlock(block) ? index : -1))
    .filter((index) => index >= 0);

  if (headingIndexes.length === 0) return null;

  const lookup = buildHeadingLookup(sectionMap);

  return headingIndexes.map((headingIndex, i) => {
    const heading = blockText(blocks[headingIndex].xml);
    const regionEnd = headingIndexes[i + 1] ?? blocks.length;
    const originalPreview = blocks
      .slice(headingIndex + 1, regionEnd)
      .filter((b) => b.type === "p" || b.type === "tbl")
      .map((b) => blockText(b.xml))
      .filter(Boolean)
      .join(" ")
      .slice(0, 220);

    return { heading, sectionKey: resolveSectionKey(heading, lookup), originalPreview };
  });
}

/**
 * 원본 DOCX 버퍼를 열어 AI 본문으로 채운 새 DOCX 버퍼를 돌려준다.
 * 원본에서 헤딩을 하나도 찾지 못하면 null을 반환한다 (호출부에서 일반 생성으로 폴백).
 */
export async function reconstructDOCX(
  originalBuffer: Buffer,
  sections: ReconstructSection[],
  sectionMap: TemplateSectionMap | null,
  options: ReconstructOptions
): Promise<ReconstructResult | null> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(originalBuffer);

  const documentFile = zip.file("word/document.xml");
  if (!documentFile) return null;

  const documentXml = await documentFile.async("text");
  const parts = extractBody(documentXml);
  if (!parts) return null;

  const blocks = splitBlocks(parts.body);
  const headingIndexes = blocks
    .map((block, index) => (isHeadingBlock(block) ? index : -1))
    .filter((index) => index >= 0);

  if (headingIndexes.length === 0) return null;

  // 표지 단락은 서식 기준으로 부적절하므로 첫 헤딩 이후만 본다
  const globalDonors = pickDonors(blocks.slice(headingIndexes[0] + 1));
  const lookup = buildHeadingLookup(sectionMap);
  const contentByKey = new Map(sections.map((s) => [s.sectionKey, s]));

  const filledSections: SectionKey[] = [];
  const untouchedHeadings: string[] = [];
  const placeholderCounter = { count: 0 };
  const placeholderValues = buildPlaceholderValues(options);

  const output: string[] = [];
  let cursor = 0;

  for (let h = 0; h < headingIndexes.length; h++) {
    const headingIndex = headingIndexes[h];
    const regionEnd = headingIndexes[h + 1] ?? blocks.length;

    // 헤딩 이전 블록(표지 등)은 그대로 두되 플레이스홀더만 치환
    for (; cursor < headingIndex; cursor++) {
      output.push(passthrough(blocks[cursor], placeholderValues, placeholderCounter));
    }

    const headingBlock = blocks[headingIndex];
    const headingText = blockText(headingBlock.xml);
    output.push(passthrough(headingBlock, placeholderValues, placeholderCounter));
    cursor = headingIndex + 1;

    const key = resolveSectionKey(headingText, lookup);
    const section = key ? contentByKey.get(key) : undefined;

    if (!section) {
      untouchedHeadings.push(headingText);
      for (; cursor < regionEnd; cursor++) {
        output.push(passthrough(blocks[cursor], placeholderValues, placeholderCounter));
      }
      continue;
    }

    // 원본 본문을 버리고 AI 본문으로 교체 — 단, 마지막 sectPr 은 살린다
    const preserved: string[] = [];
    for (let i = cursor; i < regionEnd; i++) {
      if (blocks[i].type === "other" && blocks[i].xml.includes("<w:sectPr")) {
        preserved.push(blocks[i].xml);
      }
    }

    // 서식은 이 섹션의 원본 본문에서 빌려온다 (없으면 문서 전체 기준)
    const donors = pickDonors(blocks.slice(cursor, regionEnd), globalDonors);
    output.push(...renderMarkdownBlocks(section.content, donors));
    output.push(...preserved);

    filledSections.push(section.sectionKey);
    contentByKey.delete(section.sectionKey);
    cursor = regionEnd;
  }

  for (; cursor < blocks.length; cursor++) {
    output.push(passthrough(blocks[cursor], placeholderValues, placeholderCounter));
  }

  // 원본에 자리가 없던 섹션은 문서 끝(sectPr 앞)에 덧붙인다
  const appendedSections: SectionKey[] = [];
  const leftovers = sections.filter((s) => contentByKey.has(s.sectionKey));
  if (leftovers.length > 0) {
    const tail: string[] = [];
    for (const section of leftovers) {
      const donor = globalDonors.subHeading ?? globalDonors.body;
      tail.push(cloneParagraph(donor, section.title, { bold: true, numbering: null }));
      tail.push(...renderMarkdownBlocks(section.content, globalDonors));
      appendedSections.push(section.sectionKey);
    }
    insertBeforeSectPr(output, tail);
  }

  zip.file("word/document.xml", `${parts.before}${output.join("")}${parts.after}`);

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  return {
    buffer,
    filledSections,
    untouchedHeadings,
    appendedSections,
    placeholdersReplaced: placeholderCounter.count,
  };
}

function passthrough(
  block: DocxBlock,
  values: Map<string, string>,
  counter: { count: number }
): string {
  if (block.type !== "p") return block.xml;
  if (!PLACEHOLDER_SOURCE.test(blockText(block.xml))) return block.xml;
  return replaceParagraphText(block.xml, (text) =>
    substitutePlaceholders(text, values, counter)
  );
}

/** 문서 마지막 sectPr 앞에 블록을 끼워 넣는다 (페이지 설정 보존) */
function insertBeforeSectPr(output: string[], additions: string[]): void {
  const sectPrIndex = output.findIndex((xml) => xml.includes("<w:sectPr"));
  if (sectPrIndex < 0) {
    output.push(...additions);
    return;
  }
  output.splice(sectPrIndex, 0, ...additions);
}
