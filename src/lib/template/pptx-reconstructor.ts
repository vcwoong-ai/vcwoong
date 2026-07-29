/**
 * PPTX 양식 1:1 재현 엔진.
 * 원본 PPTX 슬라이드 레이아웃·테마·마스터를 유지하고 본문 placeholder만 교체한다.
 */

import { SectionKey } from "@prisma/client";
import type { TemplateSectionMap } from "./template-mapper";
import {
  extractSlideTitle,
  markdownToSlideLines,
  normalizeTitle,
  replaceBodyContent,
  replacePlaceholders,
  sortedSlidePaths,
} from "./pptx-xml";
import type { ReconstructInput, ReconstructResult } from "./template-reconstructor";
import { ReconstructError } from "./template-reconstructor";

export type ReconstructPptxInput = ReconstructInput;

/** 매핑표에 없는 슬라이드 제목도 키워드로 SectionKey를 추정한다 (DOCX 엔진과 동일 원칙) */
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

function resolveByKeyword(title: string): SectionKey | null {
  for (const { pattern, key } of KEYWORD_FALLBACK) {
    if (pattern.test(title)) return key;
  }
  return null;
}

function buildSlideIndex(
  slideTitles: string[],
  sectionMap: TemplateSectionMap
): Map<number, SectionKey> {
  const titleToKey = new Map<string, SectionKey>();
  for (const m of sectionMap.mappings) {
    if (!m.sectionKey) continue;
    titleToKey.set(normalizeTitle(m.templateSection), m.sectionKey);
  }

  const result = new Map<number, SectionKey>();
  const used = new Set<SectionKey>();

  slideTitles.forEach((title, idx) => {
    const norm = normalizeTitle(title);
    if (!norm) return;

    let key = titleToKey.get(norm) ?? null;
    if (!key) {
      titleToKey.forEach((k, t) => {
        if (!key && t.length >= 2 && (norm.includes(t) || t.includes(norm))) key = k;
      });
    }
    if (!key) key = resolveByKeyword(title);
    if (!key || used.has(key)) return;
    used.add(key);
    result.set(idx, key);
  });

  return result;
}

export async function reconstructPPTX(
  input: ReconstructPptxInput
): Promise<ReconstructResult> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(input.originalBuffer);

  const slidePaths = sortedSlidePaths(zip.files);
  if (slidePaths.length === 0) {
    throw new ReconstructError("ppt/slides/*.xml을 찾을 수 없습니다");
  }

  const slideXmls: string[] = [];
  const slideTitles: string[] = [];

  for (const path of slidePaths) {
    const xml = await zip.file(path)!.async("text");
    slideXmls.push(xml);
    slideTitles.push(extractSlideTitle(xml));
  }

  const slideMap = buildSlideIndex(slideTitles, input.sectionMap);
  if (slideMap.size === 0) {
    throw new ReconstructError("원본 슬라이드에서 매핑된 섹션 제목을 찾지 못했습니다");
  }

  const contentByKey = new Map<string, { title: string; content: string }>();
  for (const s of input.reportSections) {
    contentByKey.set(s.sectionKey, { title: s.title, content: s.content });
  }

  const missedSections: string[] = [];
  let filledSections = 0;

  slideMap.forEach((key, idx) => {
    const section = contentByKey.get(key);
    if (!section) {
      missedSections.push(key);
      return;
    }
    const lines = markdownToSlideLines(section.content);
    slideXmls[idx] = replaceBodyContent(slideXmls[idx], lines);
    filledSections += 1;
  });

  const matchedKeys = new Set<string>();
  slideMap.forEach((k) => matchedKeys.add(k));
  for (const m of input.sectionMap.mappings) {
    if (!m.sectionKey) continue;
    if (!matchedKeys.has(m.sectionKey) && contentByKey.has(m.sectionKey)) {
      missedSections.push(m.sectionKey);
    }
  }

  for (let i = 0; i < slidePaths.length; i++) {
    let xml = slideXmls[i];
    xml = replacePlaceholders(xml, input.replacements ?? {});
    zip.file(slidePaths[i], xml);
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  return {
    buffer,
    filledSections,
    detectedHeadings: slideMap.size,
    missedSections: missedSections.filter((v, i) => missedSections.indexOf(v) === i),
    // 슬라이드는 문단과 달리 새 슬라이드 삽입에 presentation.xml·rels·레이아웃 등록이 함께 필요해
    // DOCX처럼 안전하게 끝에 덧붙일 수 없다. 매핑 안 된 섹션은 missedSections로만 보고한다.
    appendedSections: [],
  };
}
