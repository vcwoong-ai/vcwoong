/**
 * 양식 1:1 재현 엔진 라운드트립 테스트 (API 키 불필요)
 * Usage: npm run test:template
 *
 * 서식이 뚜렷한 DOCX/PPTX를 만들어 재현 엔진에 통과시킨 뒤,
 * 원본 서식이 살아있고 본문만 교체됐는지 검사한다.
 */
import JSZip from "jszip";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from "docx";
import { reconstructDOCX } from "../src/lib/template/template-reconstructor";
import { reconstructPPTX, toBulletLines } from "../src/lib/template/pptx-reconstructor";
import { splitBlocks, blockText, extractBody } from "../src/lib/template/docx-xml";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const DONOR_FONT = "바탕체";
const DONOR_COLOR = "C00000";

async function buildTemplateDocx(): Promise<Buffer> {
  const body = (text: string) =>
    new Paragraph({
      children: [
        new TextRun({ text, font: DONOR_FONT, color: DONOR_COLOR, size: 21 }),
      ],
    });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: "{{회사명}} 투자심의보고서", bold: true, size: 40 }),
            ],
          }),
          new Paragraph({
            children: [new TextRun({ text: "작성일: {{작성일}}", size: 20 })],
          }),
          new Paragraph({
            text: "1. 투자개요",
            heading: HeadingLevel.HEADING_1,
          }),
          body("원본 투자개요 자리표시 문장입니다."),
          body("두 번째 자리표시 문장입니다."),
          new Paragraph({
            text: "2. 시장분석",
            heading: HeadingLevel.HEADING_1,
          }),
          body("원본 시장분석 자리표시 문장입니다."),
          new Paragraph({
            text: "3. 준법감시인 확인사항",
            heading: HeadingLevel.HEADING_1,
          }),
          body("본 보고서는 내부 규정에 따라 작성되었습니다."),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

function buildTemplatePptx(): Promise<Buffer> {
  const slide = (title: string, body: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree>
<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="ko-KR" sz="2800"/><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/><a:p><a:pPr lvl="0"/><a:r><a:rPr lang="ko-KR" sz="1600" dirty="0"/><a:t>${body}</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:sld>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file("ppt/slides/slide1.xml", slide("투자개요", "원본 슬라이드 본문"));
  zip.file("ppt/slides/slide2.xml", slide("시장분석", "원본 시장 본문"));
  zip.file("ppt/theme/theme1.xml", "<theme/>");
  return zip.generateAsync({ type: "nodebuffer" });
}

async function readDocumentXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file("word/document.xml")!.async("text");
}

async function main() {
  console.log("\n=== Axiom 양식 재현 엔진 테스트 ===\n");

  // ── DOCX ────────────────────────────────────────────
  const original = await buildTemplateDocx();
  const originalZip = await JSZip.loadAsync(original);
  const originalStyles = await originalZip.file("word/styles.xml")!.async("text");
  const originalXml = await readDocumentXml(original);

  // 원본 파싱이 헤딩 3개를 잡는지 먼저 확인
  const originalBlocks = splitBlocks(extractBody(originalXml)!.body);
  const originalTexts = originalBlocks
    .filter((b) => b.type === "p")
    .map((b) => blockText(b.xml));
  assert(
    originalTexts.includes("1. 투자개요"),
    `헤딩 파싱 실패: ${JSON.stringify(originalTexts)}`
  );

  const result = await reconstructDOCX(
    original,
    [
      {
        sectionKey: "INVESTMENT_OVERVIEW",
        title: "투자개요",
        content:
          "### 핵심 요약\n" +
          "신규 **시리즈A** 투자를 제안한다.\n" +
          "- 투자금 30억원\n" +
          "- 지분 12%\n" +
          "\n| 구분 | 값 |\n|------|-----|\n| 라운드 | Series A |\n| 밸류 | 250억 |\n",
      },
      {
        sectionKey: "MARKET_ANALYSIS",
        title: "시장분석",
        content: "국내 시장 규모는 1.2조원으로 추정된다.",
      },
      {
        sectionKey: "RISK_ANALYSIS",
        title: "리스크",
        content: "핵심 인력 이탈 위험이 존재한다.",
      },
    ],
    null,
    {
      companyName: "그린루프",
      investRound: "Series A",
      investAmount: 30,
      valuation: 250,
      sector: "CLIMATE",
      reportDate: new Date("2026-07-27"),
    }
  );

  assert(result !== null, "재현 결과가 null이면 안 됨");
  const out = result!;
  const outXml = await readDocumentXml(out.buffer);
  const outZip = await JSZip.loadAsync(out.buffer);

  // 1) 스타일 파일은 손대지 않는다 — 폰트·색상 정의 보존의 근거
  const outStyles = await outZip.file("word/styles.xml")!.async("text");
  assert(outStyles === originalStyles, "styles.xml 이 변경되면 안 됨");

  // 2) 헤딩은 원본 그대로 남는다
  assert(outXml.includes("1. 투자개요"), "원본 헤딩 텍스트 보존 필요");
  assert(outXml.includes("3. 준법감시인 확인사항"), "미매핑 헤딩 보존 필요");

  // 3) 원본 본문은 사라지고 AI 본문이 들어간다
  assert(
    !outXml.includes("원본 투자개요 자리표시"),
    "매핑된 섹션의 원본 본문은 교체되어야 함"
  );
  assert(outXml.includes("신규 "), "AI 본문이 삽입되어야 함");
  assert(outXml.includes("시리즈A"), "굵은 글씨 런이 분리 삽입되어야 함");
  assert(outXml.includes("1.2조원"), "두 번째 섹션 본문 삽입 필요");

  // 4) 미매핑 섹션의 원본 본문은 그대로 둔다
  assert(
    outXml.includes("내부 규정에 따라 작성되었습니다"),
    "미매핑 섹션 원본 본문은 보존되어야 함"
  );

  // 5) 새 본문이 원본 단락 서식(폰트·색상)을 물려받는다
  const investSectionXml = outXml.slice(
    outXml.indexOf("1. 투자개요"),
    outXml.indexOf("2. 시장분석")
  );
  assert(
    investSectionXml.includes(DONOR_FONT),
    "새 본문이 원본 폰트를 물려받아야 함"
  );
  assert(
    investSectionXml.includes(DONOR_COLOR),
    "새 본문이 원본 글자색을 물려받아야 함"
  );

  // 6) 표가 WordprocessingML 표로 변환된다
  assert(investSectionXml.includes("<w:tbl>"), "마크다운 표는 실제 표로 변환되어야 함");
  assert(investSectionXml.includes("Series A"), "표 셀 내용 필요");

  // 7) 플레이스홀더 치환
  assert(outXml.includes("그린루프 투자심의보고서"), "{{회사명}} 치환 필요");
  assert(!outXml.includes("{{회사명}}"), "치환 후 플레이스홀더가 남으면 안 됨");
  assert(!outXml.includes("{{작성일}}"), "{{작성일}} 치환 필요");
  assert(out.placeholdersReplaced >= 2, `치환 수 기대 >=2, got ${out.placeholdersReplaced}`);

  // 8) 원본에 자리가 없던 섹션은 끝에 덧붙는다
  assert(
    out.appendedSections.includes("RISK_ANALYSIS"),
    `대응 헤딩 없는 섹션은 덧붙여야 함, got ${JSON.stringify(out.appendedSections)}`
  );
  assert(outXml.includes("핵심 인력 이탈"), "덧붙인 섹션 본문 필요");

  // 9) 문서가 여전히 유효한 XML 구조인지 (태그 균형)
  const openP = (outXml.match(/<w:p(?=[\s>])/g) ?? []).length;
  const closeP = (outXml.match(/<\/w:p>/g) ?? []).length;
  assert(openP === closeP, `<w:p> 태그 불균형: ${openP} vs ${closeP}`);
  const openTbl = (outXml.match(/<w:tbl(?=[\s>])/g) ?? []).length;
  const closeTbl = (outXml.match(/<\/w:tbl>/g) ?? []).length;
  assert(openTbl === closeTbl, `<w:tbl> 태그 불균형: ${openTbl} vs ${closeTbl}`);

  console.log("✅ styles.xml 무변경 — 폰트/색상 정의 보존");
  console.log("✅ 채운 섹션:", out.filledSections.join(", "));
  console.log("✅ 원본 유지 헤딩:", out.untouchedHeadings.join(", ") || "없음");
  console.log("✅ 덧붙인 섹션:", out.appendedSections.join(", ") || "없음");
  console.log("✅ 플레이스홀더 치환:", out.placeholdersReplaced, "건");

  // ── PPTX ────────────────────────────────────────────
  const bullets = toBulletLines(
    "### 요약\n- 첫 항목\n- 두 번째 항목\n| 표 | 무시 |\n짧음\n일반 문단입니다.",
    5
  );
  assert(bullets.includes("요약"), "소제목은 불릿으로 승격");
  assert(!bullets.some((b) => b.includes("|")), "표 행은 슬라이드에서 제외");
  assert(!bullets.includes("짧음"), "너무 짧은 줄은 제외");

  const pptxOriginal = await buildTemplatePptx();
  const pptxResult = await reconstructPPTX(
    pptxOriginal,
    [
      {
        sectionKey: "INVESTMENT_OVERVIEW",
        title: "투자개요",
        content: "- 시리즈A 30억원 투자\n- 지분 12% 확보",
      },
    ],
    null,
    { companyName: "그린루프" }
  );

  assert(pptxResult !== null, "PPTX 재현 결과가 null이면 안 됨");
  const pptxZip = await JSZip.loadAsync(pptxResult!.buffer);
  const slide1 = await pptxZip.file("ppt/slides/slide1.xml")!.async("text");
  const slide2 = await pptxZip.file("ppt/slides/slide2.xml")!.async("text");

  assert(slide1.includes("투자개요"), "슬라이드 제목 보존 필요");
  assert(slide1.includes("시리즈A 30억원 투자"), "슬라이드 본문 교체 필요");
  assert(!slide1.includes("원본 슬라이드 본문"), "원본 본문은 교체되어야 함");
  assert(slide1.includes('sz="1600"'), "원본 글자 크기 서식 보존 필요");
  assert(slide2.includes("원본 시장 본문"), "미매칭 슬라이드는 그대로 두어야 함");
  assert(
    await pptxZip.file("ppt/theme/theme1.xml")!.async("text") === "<theme/>",
    "테마 파일 무변경 필요"
  );

  console.log("✅ PPTX 채운 섹션:", pptxResult!.filledSections.join(", "));
  console.log("✅ PPTX 미매칭 슬라이드:", pptxResult!.untouchedSlides.join(", ") || "없음");
  console.log("\n✅ 모든 양식 재현 테스트 통과\n");
}

main().catch((err) => {
  console.error("\n❌", err.message, "\n");
  process.exit(1);
});
