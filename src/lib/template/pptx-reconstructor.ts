/**
 * PPTX 양식 1:1 재현 엔진.
 * 원본 PPTX 슬라이드 레이아웃·테마·마스터를 유지하고 본문 placeholder만 교체한다.
 */

import type { SectionKey } from "@prisma/client";
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
  };
}
