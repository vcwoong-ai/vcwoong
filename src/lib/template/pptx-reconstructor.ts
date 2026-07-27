/**
 * PPTX 양식 재현 엔진.
 *
 * DOCX와 같은 원칙 — 원본 슬라이드 XML을 열어 텍스트만 교체한다.
 * 슬라이드 마스터·레이아웃·테마·도형 위치는 건드리지 않으므로 디자인이 보존된다.
 *
 * 슬라이드 ↔ 섹션 매칭은 슬라이드 제목 플레이스홀더 텍스트로 한다.
 */

import { SectionKey } from "@prisma/client";
import { escapeXml } from "./docx-xml";
import type { TemplateSectionMap } from "./template-mapper";

export interface PptxSection {
  sectionKey: SectionKey;
  title: string;
  content: string;
}

export interface PptxReconstructOptions {
  companyName: string;
  reportDate?: Date;
  /** 슬라이드 한 장에 넣을 최대 불릿 수 — 넘치면 잘라낸다 */
  maxBulletsPerSlide?: number;
}

export interface PptxReconstructResult {
  buffer: Buffer;
  filledSections: SectionKey[];
  untouchedSlides: string[];
}

const KEYWORD_MAP: Array<{ pattern: RegExp; key: SectionKey }> = [
  { pattern: /투자\s*(개요|요약)|investment\s*overview/i, key: SectionKey.INVESTMENT_OVERVIEW },
  { pattern: /회사\s*(개요|소개|현황)|기업\s*(개요|소개)|company/i, key: SectionKey.COMPANY_OVERVIEW },
  { pattern: /제품|기술|서비스|파이프라인|product|technology/i, key: SectionKey.PRODUCT_TECHNOLOGY },
  { pattern: /시장|경쟁|market/i, key: SectionKey.MARKET_ANALYSIS },
  { pattern: /재무|손익|매출|financial/i, key: SectionKey.FINANCIAL_STATUS },
  { pattern: /밸류에이션|기업가치|valuation/i, key: SectionKey.VALUATION },
  { pattern: /리스크|위험|risk/i, key: SectionKey.RISK_ANALYSIS },
  { pattern: /투자\s*조건|term/i, key: SectionKey.INVESTMENT_TERMS },
  { pattern: /의견|결론|종합|opinion/i, key: SectionKey.OPINION_SUMMARY },
  { pattern: /별첨|부록|appendix/i, key: SectionKey.APPENDIX },
];

function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

function resolveKey(
  title: string,
  lookup: Map<string, SectionKey>
): SectionKey | null {
  const mapped = lookup.get(normalize(title));
  if (mapped) return mapped;
  for (const { pattern, key } of KEYWORD_MAP) {
    if (pattern.test(title)) return key;
  }
  return null;
}

/** 슬라이드에서 제목 플레이스홀더 텍스트를 뽑는다 */
function slideTitle(xml: string): string {
  const shapes = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? [];
  for (const shape of shapes) {
    if (!/<p:ph[^>]*type="(?:title|ctrTitle)"/.test(shape)) continue;
    return shapeText(shape);
  }
  return "";
}

function shapeText(shapeXml: string): string {
  return (shapeXml.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? [])
    .map((t) => t.replace(/<\/?a:t>/g, ""))
    .join("")
    .trim();
}

/**
 * 마크다운 본문을 슬라이드 불릿 줄로 압축한다.
 * 표·긴 문단은 슬라이드에 맞지 않으므로 핵심 줄만 남긴다.
 */
export function toBulletLines(markdown: string, maxBullets: number): string[] {
  const lines: string[] = [];

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("|")) continue;

    const heading = /^#{2,4}\s+(.*)$/.exec(line);
    if (heading) {
      lines.push(heading[1].replace(/\*\*/g, "").trim());
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const text = (bullet ? bullet[1] : line).replace(/\*\*/g, "").trim();
    if (text.length < 4) continue;
    lines.push(text.length > 110 ? `${text.slice(0, 108)}…` : text);
  }

  return lines.slice(0, maxBullets);
}

/**
 * 본문 플레이스홀더(body/제목 아닌 텍스트 도형)의 문단을 새 불릿으로 교체한다.
 * 첫 문단의 서식(a:pPr / a:rPr)을 복제해 글꼴·크기를 유지한다.
 */
function replaceBodyShape(shapeXml: string, bullets: string[]): string {
  const txBodyMatch = /<p:txBody>([\s\S]*?)<\/p:txBody>/.exec(shapeXml);
  if (!txBodyMatch) return shapeXml;

  const txBody = txBodyMatch[1];
  const bodyPr = /<a:bodyPr[\s\S]*?(?:\/>|<\/a:bodyPr>)/.exec(txBody)?.[0] ?? "<a:bodyPr/>";
  const listStyle = /<a:lstStyle[\s\S]*?(?:\/>|<\/a:lstStyle>)/.exec(txBody)?.[0] ?? "";

  const firstPara = /<a:p>[\s\S]*?<\/a:p>/.exec(txBody)?.[0] ?? "";
  const paraPr = /<a:pPr[\s\S]*?(?:\/>|<\/a:pPr>)/.exec(firstPara)?.[0] ?? "";
  const runPr = /<a:rPr[\s\S]*?(?:\/>|<\/a:rPr>)/.exec(firstPara)?.[0] ?? '<a:rPr lang="ko-KR" dirty="0"/>';

  const paragraphs = bullets
    .map(
      (line) =>
        `<a:p>${paraPr}<a:r>${runPr}<a:t>${escapeXml(line)}</a:t></a:r></a:p>`
    )
    .join("");

  const newTxBody = `<p:txBody>${bodyPr}${listStyle}${paragraphs || "<a:p/>"}</p:txBody>`;
  return shapeXml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, newTxBody);
}

/** 슬라이드의 본문 도형(제목이 아닌 텍스트 도형) 중 가장 큰 것을 채운다 */
function fillSlide(slideXml: string, bullets: string[]): string {
  const shapes = slideXml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? [];

  const bodyShape = shapes
    .filter((shape) => /<p:txBody>/.test(shape))
    .filter((shape) => !/<p:ph[^>]*type="(?:title|ctrTitle)"/.test(shape))
    .sort((a, b) => shapeText(b).length - shapeText(a).length)[0];

  if (!bodyShape) return slideXml;
  return slideXml.replace(bodyShape, replaceBodyShape(bodyShape, bullets));
}

export interface PptxOutlineEntry {
  heading: string;
  sectionKey: SectionKey | null;
  originalPreview: string;
}

/** 파일을 바꾸지 않고 슬라이드 제목·매핑만 읽어온다 (비교 UI용) */
export async function analyzePptxOutline(
  originalBuffer: Buffer,
  sectionMap: TemplateSectionMap | null
): Promise<PptxOutlineEntry[] | null> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(originalBuffer);

  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0));

  if (slideNames.length === 0) return null;

  const lookup = new Map<string, SectionKey>();
  for (const mapping of sectionMap?.mappings ?? []) {
    if (mapping.sectionKey) lookup.set(normalize(mapping.templateSection), mapping.sectionKey);
  }

  const entries: PptxOutlineEntry[] = [];
  for (let i = 0; i < slideNames.length; i++) {
    const xml = await zip.files[slideNames[i]].async("text");
    const title = slideTitle(xml) || `슬라이드 ${i + 1}`;
    const allText = (xml.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? [])
      .map((t) => t.replace(/<\/?a:t>/g, ""))
      .join(" ")
      .trim();

    entries.push({
      heading: title,
      sectionKey: resolveKey(title, lookup),
      originalPreview: allText.slice(0, 220),
    });
  }

  return entries;
}

/**
 * 원본 PPTX를 열어 슬라이드 본문을 AI 내용으로 채운다.
 * 슬라이드 제목을 하나도 못 찾으면 null (호출부에서 폴백).
 */
export async function reconstructPPTX(
  originalBuffer: Buffer,
  sections: PptxSection[],
  sectionMap: TemplateSectionMap | null,
  options: PptxReconstructOptions
): Promise<PptxReconstructResult | null> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(originalBuffer);

  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)?.[0] ?? 0);
      const nb = Number(b.match(/\d+/)?.[0] ?? 0);
      return na - nb;
    });

  if (slideNames.length === 0) return null;

  const lookup = new Map<string, SectionKey>();
  for (const mapping of sectionMap?.mappings ?? []) {
    if (mapping.sectionKey) lookup.set(normalize(mapping.templateSection), mapping.sectionKey);
  }

  const contentByKey = new Map(sections.map((s) => [s.sectionKey, s]));
  const maxBullets = options.maxBulletsPerSlide ?? 8;
  const filledSections: SectionKey[] = [];
  const untouchedSlides: string[] = [];
  let matchedAnyTitle = false;

  for (const name of slideNames) {
    const xml = await zip.files[name].async("text");
    const title = slideTitle(xml);
    if (title) matchedAnyTitle = true;

    const key = title ? resolveKey(title, lookup) : null;
    const section = key ? contentByKey.get(key) : undefined;

    if (!section) {
      if (title) untouchedSlides.push(title);
      continue;
    }

    const bullets = toBulletLines(section.content, maxBullets);
    if (bullets.length === 0) continue;

    zip.file(name, fillSlide(xml, bullets));
    filledSections.push(section.sectionKey);
    contentByKey.delete(section.sectionKey);
  }

  if (!matchedAnyTitle) return null;

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  return { buffer, filledSections, untouchedSlides };
}
