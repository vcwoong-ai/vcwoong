/**
 * 원본 양식 vs 재현 결과 구조 비교 (렌더 이미지 대신 OOXML 구조 QA).
 */

import { extractBody, splitBlocks } from "./docx-xml";
import {
  extractSlideTitle,
  extractSlideText,
  sortedSlidePaths,
} from "./pptx-xml";

export interface StructureCompareResult {
  fileType: "DOCX" | "PPTX";
  score: number;
  checks: Array<{ name: string; pass: boolean; detail: string }>;
  preserved: string[];
  changed: string[];
}

async function compareDocx(
  original: Buffer,
  reconstructed: Buffer
): Promise<StructureCompareResult> {
  const JSZip = (await import("jszip")).default;
  const [origZip, outZip] = await Promise.all([
    JSZip.loadAsync(original),
    JSZip.loadAsync(reconstructed),
  ]);

  const checks: StructureCompareResult["checks"] = [];
  const preserved: string[] = [];
  const changed: string[] = [];

  const origNames = Object.keys(origZip.files).sort();
  const outNames = Object.keys(outZip.files).sort();

  const stylesSame =
    (await origZip.file("word/styles.xml")?.async("text")) ===
    (await outZip.file("word/styles.xml")?.async("text"));
  checks.push({
    name: "styles.xml 보존",
    pass: stylesSame,
    detail: stylesSame ? "서식 정의 동일" : "styles.xml이 변경됨",
  });
  if (stylesSame) preserved.push("styles.xml");
  else changed.push("styles.xml");

  const hasHeader = origNames.some((n) => /word\/header\d*\.xml/.test(n));
  if (hasHeader) {
    const hName = origNames.find((n) => /word\/header\d*\.xml/.test(n))!;
    const same =
      (await origZip.file(hName)?.async("text")) ===
      (await outZip.file(hName)?.async("text"));
    checks.push({
      name: "헤더 보존",
      pass: same,
      detail: same ? hName : "헤더 XML 변경",
    });
    if (same) preserved.push("header");
    else changed.push("header");
  }

  const hasFooter = origNames.some((n) => /word\/footer\d*\.xml/.test(n));
  if (hasFooter) {
    const fName = origNames.find((n) => /word\/footer\d*\.xml/.test(n))!;
    const same =
      (await origZip.file(fName)?.async("text")) ===
      (await outZip.file(fName)?.async("text"));
    checks.push({
      name: "푸터 보존",
      pass: same,
      detail: same ? fName : "푸터 XML 변경",
    });
    if (same) preserved.push("footer");
    else changed.push("footer");
  }

  const packageSame =
    origNames.filter((n) => !n.startsWith("word/document")).join("|") ===
    outNames.filter((n) => !n.startsWith("word/document")).join("|");
  checks.push({
    name: "패키지 구조",
    pass: packageSame,
    detail: packageSame
      ? `파일 ${origNames.length}개 유지`
      : "패키지 파일 목록이 달라짐",
  });

  const origDoc = await origZip.file("word/document.xml")!.async("text");
  const outDoc = await outZip.file("word/document.xml")!.async("text");
  const bodyChanged = origDoc !== outDoc;
  checks.push({
    name: "본문 교체",
    pass: bodyChanged,
    detail: bodyChanged ? "document.xml 본문 변경됨" : "본문이 변경되지 않음",
  });
  if (bodyChanged) changed.push("document.xml body");

  const origParts = extractBody(origDoc);
  const outParts = extractBody(outDoc);
  if (origParts && outParts) {
    const origBlocks = splitBlocks(origParts.body);
    const outBlocks = splitBlocks(outParts.body);
    const headingOrig = origBlocks.filter((b) => b.headingLevel !== null).length;
    const headingOut = outBlocks.filter((b) => b.headingLevel !== null).length;
    const headingsOk = headingOut >= Math.max(1, headingOrig - 1);
    checks.push({
      name: "헤딩 유지",
      pass: headingsOk,
      detail: `원본 ${headingOrig} → 재현 ${headingOut}`,
    });
  }

  const passCount = checks.filter((c) => c.pass).length;
  const score = Math.round((passCount / checks.length) * 100);

  return { fileType: "DOCX", score, checks, preserved, changed };
}

async function comparePptx(
  original: Buffer,
  reconstructed: Buffer
): Promise<StructureCompareResult> {
  const JSZip = (await import("jszip")).default;
  const [origZip, outZip] = await Promise.all([
    JSZip.loadAsync(original),
    JSZip.loadAsync(reconstructed),
  ]);

  const checks: StructureCompareResult["checks"] = [];
  const preserved: string[] = [];
  const changed: string[] = [];

  const origSlides = sortedSlidePaths(origZip.files);
  const outSlides = sortedSlidePaths(outZip.files);

  const slideCountOk = origSlides.length === outSlides.length;
  checks.push({
    name: "슬라이드 수",
    pass: slideCountOk,
    detail: `원본 ${origSlides.length} → 재현 ${outSlides.length}`,
  });

  let titlesMatch = 0;
  let bodiesChanged = 0;
  for (let i = 0; i < Math.min(origSlides.length, outSlides.length); i++) {
    const oXml = await origZip.file(origSlides[i])!.async("text");
    const nXml = await outZip.file(outSlides[i])!.async("text");
    if (extractSlideTitle(oXml) === extractSlideTitle(nXml)) titlesMatch += 1;
    if (extractSlideText(oXml) !== extractSlideText(nXml)) bodiesChanged += 1;
  }

  const titleOk = titlesMatch === Math.min(origSlides.length, outSlides.length);
  checks.push({
    name: "슬라이드 제목 보존",
    pass: titleOk,
    detail: `${titlesMatch}/${origSlides.length} 제목 유지`,
  });
  if (titleOk) preserved.push("slide titles");
  else changed.push("slide titles");

  checks.push({
    name: "본문 교체",
    pass: bodiesChanged > 0,
    detail: `${bodiesChanged}개 슬라이드 본문 변경`,
  });
  if (bodiesChanged > 0) changed.push("slide bodies");

  const hasTheme = Object.keys(origZip.files).some((n) => n.includes("theme"));
  if (hasTheme) {
    const themePath = Object.keys(origZip.files).find((n) => n.includes("theme"));
    const same =
      themePath &&
      (await origZip.file(themePath)?.async("text")) ===
        (await outZip.file(themePath)?.async("text"));
    checks.push({
      name: "테마 보존",
      pass: Boolean(same),
      detail: same ? "theme.xml 동일" : "테마 변경",
    });
    if (same) preserved.push("theme");
  }

  const passCount = checks.filter((c) => c.pass).length;
  const score = Math.round((passCount / checks.length) * 100);

  return { fileType: "PPTX", score, checks, preserved, changed };
}

export async function compareTemplateStructure(
  original: Buffer,
  reconstructed: Buffer,
  fileType: "DOCX" | "PPTX"
): Promise<StructureCompareResult> {
  return fileType === "PPTX"
    ? comparePptx(original, reconstructed)
    : compareDocx(original, reconstructed);
}
