/**
 * PPTX 양식 1:1 재현 검증
 * Usage: npm run test:pptx-template
 */
import JSZip from "jszip";
import { SectionKey } from "@prisma/client";
import { reconstructPPTX } from "../src/lib/template/pptx-reconstructor";
import type { TemplateSectionMap } from "../src/lib/template/template-mapper";
import { extractSlideTitle, extractSlideText } from "../src/lib/template/pptx-xml";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function buildSlideXml(title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr/>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
      <p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:rPr lang="ko-KR" b="1"/><a:t>${title}</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
      <p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:rPr lang="ko-KR"/><a:t>${body}</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

async function buildFirmPptxTemplate(): Promise<Buffer> {
  const slides = [
    { title: "{{기업명}}", body: "투자심의보고서" },
    { title: "1. 투자개요", body: "(작성 요령) 투자 배경" },
    { title: "2. 회사개요", body: "(작성 요령) 설립·대표" },
    { title: "3. 시장분석", body: "(작성 요령) TAM/SAM" },
    { title: "4. 리스크", body: "(작성 요령) 주요 리스크" },
  ];

  const zip = new JSZip();
  const slideCount = slides.length;
  const sldIds = slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("");
  const rels = slides.map((_, i) =>
    `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
  ).join("");

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}
</Types>`);

  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>${sldIds}</p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000"/>
</p:presentation>`);

  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rels}
</Relationships>`);

  slides.forEach((s, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, buildSlideXml(s.title, s.body));
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  });

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function main() {
  console.log("\n=== DealMind PPTX 양식 1:1 재현 테스트 ===\n");

  const original = await buildFirmPptxTemplate();
  const origZip = await JSZip.loadAsync(original);
  const origSlide1 = await origZip.file("ppt/slides/slide2.xml")!.async("text");

  assert(extractSlideTitle(origSlide1).includes("투자개요"), "슬라이드 제목 파싱 실패");

  const sectionMap: TemplateSectionMap = {
    mappings: [
      { templateSection: "1. 투자개요", sectionKey: SectionKey.INVESTMENT_OVERVIEW, confidence: 1 },
      { templateSection: "2. 회사개요", sectionKey: SectionKey.COMPANY_OVERVIEW, confidence: 1 },
      { templateSection: "3. 시장분석", sectionKey: SectionKey.MARKET_ANALYSIS, confidence: 1 },
      { templateSection: "4. 리스크", sectionKey: SectionKey.RISK_ANALYSIS, confidence: 1 },
    ],
    unmappedSections: [],
    coverageRate: 0.4,
  };

  const reportSections = [
    { sectionKey: SectionKey.INVESTMENT_OVERVIEW, title: "투자개요", content: "- Series B 100억\n- Post 800억" },
    { sectionKey: SectionKey.COMPANY_OVERVIEW, title: "회사개요", content: "2019년 설립, 48명" },
    { sectionKey: SectionKey.MARKET_ANALYSIS, title: "시장분석", content: "TAM 12조원" },
    { sectionKey: SectionKey.RISK_ANALYSIS, title: "리스크", content: "- 임상 실패\n- 자금 조달" },
  ];

  const result = await reconstructPPTX({
    originalBuffer: original,
    sectionMap,
    reportSections,
    replacements: { 기업명: "헬스케어AI" },
  });

  console.log(`재현: 슬라이드 ${result.detectedHeadings}개 매칭 / ${result.filledSections}개 채움`);
  assert(result.filledSections === 4, `4개 섹션 기대, got ${result.filledSections}`);

  const outZip = await JSZip.loadAsync(result.buffer);
  const outSlide2 = await outZip.file("ppt/slides/slide2.xml")!.async("text");

  assert(extractSlideTitle(outSlide2).includes("투자개요"), "슬라이드 제목 유지 실패");
  assert(!extractSlideText(outSlide2).includes("작성 요령"), "안내문이 남아 있음");
  assert(extractSlideText(outSlide2).includes("Series B"), "새 본문 미삽입");
  assert(extractSlideText(outSlide2).includes("800억"), "새 본문 미삽입");

  const cover = await outZip.file("ppt/slides/slide1.xml")!.async("text");
  assert(extractSlideText(cover).includes("헬스케어AI"), "플레이스홀더 미치환");
  assert(Object.keys(outZip.files).length === Object.keys(origZip.files).length, "파일 구조 변경됨");

  console.log("\n✅ PPTX 원본 레이아웃 보존 + 본문 치환 + 플레이스홀더");
  console.log("✅ PPTX 양식 재현 테스트 통과\n");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
