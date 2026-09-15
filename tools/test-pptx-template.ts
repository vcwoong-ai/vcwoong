/**
 * PPTX 양식 1:1 재현 검증
 * Usage: npm run test:pptx-template
 */
import JSZip from "jszip";
import { SectionKey } from "@prisma/client";
import { reconstructPPTX } from "../src/lib/template/pptx-reconstructor";
import type { TemplateSectionMap } from "../src/lib/template/template-mapper";
import {
  extractSlideTitle,
  extractSlideText,
  replaceBodyContent,
  markdownToSlideLines,
} from "../src/lib/template/pptx-xml";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/**
 * Production 사고 재현용: 본문 상자보다 XML 순서상 앞서는 작은 라벨
 * 도형(예: 섹션 번호 배지, 0.3인치 높이)이 있는 슬라이드. 예전엔 "제목이
 * 아닌 첫 번째 텍스트 도형"을 그대로 본문으로 써서 이 작은 라벨에 긴
 * 섹션 내용이 통째로 들어가 다른 도형 위로 흘러넘쳤다.
 */
function buildSlideXmlWithDecorativeLabel(title: string): string {
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
      <p:nvSpPr><p:cNvPr id="3" name="Label"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9078578" cy="365757"/></a:xfrm></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:rPr lang="ko-KR"/><a:t>라벨</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="4" name="Body"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="0" y="500000"/><a:ext cx="7286546" cy="3093924"/></a:xfrm></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:rPr lang="ko-KR"/><a:t>(작성 요령) 원본 예시 본문</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
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

  console.log("✅ PPTX 원본 레이아웃 보존 + 본문 치환 + 플레이스홀더");

  // Production 사고 재현: 작은 라벨 도형이 본문 상자보다 앞서 나오는 슬라이드.
  const decorativeSlide = buildSlideXmlWithDecorativeLabel("주요 투자 조건");
  const longContent = [
    "1. 투자 구조",
    "청산우선순위, 1x Non-participating 여부: 확인 필요",
    "Anti-dilution 조항(광의의 가중평균 등): 확인 필요",
    "전환·상환·배당 조건 및 Refixing/YTM: 확인 필요",
  ];
  const decorativeResult = replaceBodyContent(decorativeSlide, longContent);
  const decorativeSpBlocks = decorativeResult.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? [];
  const labelBlock = decorativeSpBlocks[1];
  const bodyBlock = decorativeSpBlocks[2];

  assert(!labelBlock.includes("Non-participating"), "작은 라벨 도형에 긴 본문이 들어감(오버플로 재발)");
  assert(labelBlock.includes("라벨"), "작은 라벨 도형의 원본 텍스트가 사라짐");
  assert(bodyBlock.includes("Non-participating"), "실제로 더 큰 본문 상자에 내용이 들어가지 않음");
  assert(!bodyBlock.includes("원본 예시 본문"), "본문 상자가 교체되지 않음");

  console.log("✅ 작은 라벨 도형 대신 실제 본문 상자(면적 최대)를 채움 — 오버플로 회귀 방지");

  // 마크다운 표 행이 파이프·구분선 그대로 남지 않는지 확인
  const tableMarkdown = `| 항목 | 내용 |
|------|------|
| 수단 | 확인 필요 |`;
  const tableLines = markdownToSlideLines(tableMarkdown);
  assert(!tableLines.some((l) => /^-{2,}/.test(l) || l.includes("------")), "표 구분선이 그대로 남음");
  assert(tableLines.some((l) => l.includes("항목") && l.includes("내용")), "표 헤더 행이 변환되지 않음");
  assert(tableLines.some((l) => l.includes("수단") && l.includes("확인 필요")), "표 데이터 행이 변환되지 않음");

  console.log("✅ 마크다운 표 행이 파이프 문자 없이 텍스트로 변환됨");
  console.log("✅ PPTX 양식 재현 테스트 통과\n");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
