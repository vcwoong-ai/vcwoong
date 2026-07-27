/**
 * 양식 1:1 재현 검증 (API 키 불필요)
 * Usage: npm run test:template
 *
 * 회사 양식을 흉내 낸 DOCX를 만들고 → 재현 엔진을 돌린 뒤
 * 폰트·색상·헤더/푸터가 그대로 남고 본문만 바뀌었는지 확인한다.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Header,
  Footer,
  AlignmentType,
} from "docx";
import JSZip from "jszip";
import { SectionKey } from "@prisma/client";
import { reconstructDOCX } from "../src/lib/template/template-reconstructor";
import { parseDOCXTemplate } from "../src/lib/template/template-parser";
import type { TemplateSectionMap } from "../src/lib/template/template-mapper";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/** 특정 회사 양식처럼 보이는 원본 DOCX */
async function buildFirmTemplate(): Promise<Buffer> {
  const FIRM_FONT = "HY헤드라인M";
  const FIRM_COLOR = "1F3864";

  const heading = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({ text, font: FIRM_FONT, color: FIRM_COLOR, bold: true, size: 28 }),
      ],
    });

  const body = (text: string) =>
    new Paragraph({
      children: [new TextRun({ text, font: "바탕", size: 20 })],
      spacing: { after: 120 },
    });

  const doc = new Document({
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: "한국벤처파트너스 투자심의위원회",
                    font: FIRM_FONT,
                    color: FIRM_COLOR,
                    size: 16,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "대외비 - 사외 유출 금지", size: 14 })],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "투 자 심 의 보 고 서",
                font: FIRM_FONT,
                color: FIRM_COLOR,
                bold: true,
                size: 44,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "{{기업명}}", font: "바탕", size: 24 })],
          }),
          heading("1. 투자개요"),
          body("(작성 요령) 투자 배경과 조건을 3~5문장으로 기술한다."),
          heading("2. 회사개요"),
          body("(작성 요령) 설립일, 대표자, 주주구성을 기재한다."),
          heading("3. 시장분석"),
          body("(작성 요령) TAM/SAM/SOM과 경쟁 구도를 기술한다."),
          heading("4. 리스크"),
          body("(작성 요령) 주요 리스크와 완화 방안을 기재한다."),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

async function readDocXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file("word/document.xml")!.async("text");
}

async function main() {
  console.log("\n=== Axiom 양식 1:1 재현 테스트 ===\n");

  const original = await buildFirmTemplate();
  const originalXml = await readDocXml(original);

  // 1. 원본 구조 파싱
  const structure = await parseDOCXTemplate(original);
  console.log(
    `원본 섹션 감지: ${structure.totalSections}개 — ${structure.sections
      .map((s) => s.title)
      .join(", ")}`
  );

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
    {
      sectionKey: SectionKey.INVESTMENT_OVERVIEW,
      title: "투자개요",
      content:
        "### 1. 핵심 요약\n헬스케어AI는 Series B 100억원을 조달함.\n\n| 구분 | 값 |\n|------|-----|\n| 라운드 | Series B |\n| Post | 800억원 |\n\n- 임상 2상 진입\n- 글로벌 BD 진행",
    },
    {
      sectionKey: SectionKey.COMPANY_OVERVIEW,
      title: "회사개요",
      content: "2019년 설립, 임직원 48명. 대표는 前 삼성바이오에피스 임상개발 출신임.",
    },
    {
      sectionKey: SectionKey.MARKET_ANALYSIS,
      title: "시장분석",
      content: "글로벌 항암제 시장은 연 10% 내외 성장 중임 (출처: IR 자료).",
    },
    {
      sectionKey: SectionKey.RISK_ANALYSIS,
      title: "리스크",
      content: "- 임상 실패 리스크\n- 추가 자금 조달 필요성",
    },
  ];

  const result = await reconstructDOCX({
    originalBuffer: original,
    sectionMap,
    reportSections,
    replacements: { 기업명: "헬스케어AI Inc." },
  });

  const outXml = await readDocXml(result.buffer);

  console.log(
    `재현 결과: 헤딩 ${result.detectedHeadings}개 매칭 / ${result.filledSections}개 채움` +
      (result.missedSections.length ? ` / 누락 ${result.missedSections.join(",")}` : "")
  );

  // ── 검증 ──
  assert(result.filledSections === 4, `4개 섹션 채움 기대, got ${result.filledSections}`);

  // 회사 양식 자산 보존
  assert(outXml.includes("HY헤드라인M"), "회사 지정 폰트가 사라짐");
  assert(outXml.includes("1F3864"), "회사 지정 색상이 사라짐");
  assert(outXml.includes("투 자 심 의 보 고 서"), "표지 제목이 사라짐");

  const outZip = await JSZip.loadAsync(result.buffer);
  const names = Object.keys(outZip.files);
  assert(
    names.some((n) => /word\/header\d*\.xml/.test(n)),
    "헤더 파일이 사라짐"
  );
  assert(
    names.some((n) => /word\/footer\d*\.xml/.test(n)),
    "푸터 파일이 사라짐"
  );
  const headerName = names.find((n) => /word\/header\d*\.xml/.test(n))!;
  const headerXml = await outZip.file(headerName)!.async("text");
  assert(headerXml.includes("한국벤처파트너스"), "헤더 문구가 바뀜");

  // styles.xml 무변경 (서식 정의가 그대로여야 1:1 재현)
  const origZip = await JSZip.loadAsync(original);
  const origStyles = await origZip.file("word/styles.xml")!.async("text");
  const outStyles = await outZip.file("word/styles.xml")!.async("text");
  assert(origStyles === outStyles, "styles.xml이 변경됨 — 서식이 달라질 수 있음");

  // 헤딩은 남고 안내문은 사라지고 새 본문이 들어감
  assert(outXml.includes("1. 투자개요"), "섹션 제목이 사라짐");
  assert(!outXml.includes("(작성 요령)"), "원본 안내문이 남아 있음");
  assert(outXml.includes("Series B 100억원을 조달함"), "새 본문이 들어가지 않음");
  assert(outXml.includes("임상 실패 리스크"), "리스크 본문이 들어가지 않음");

  // 마크다운 표 → 실제 DOCX 표
  assert(outXml.includes("<w:tbl>"), "마크다운 표가 DOCX 표로 변환되지 않음");

  // 플레이스홀더 치환
  assert(outXml.includes("헬스케어AI Inc."), "플레이스홀더가 치환되지 않음");
  assert(!outXml.includes("{{기업명}}"), "플레이스홀더가 남아 있음");

  // 원본과 다른 파일이어야 함 (본문은 실제로 바뀜)
  assert(outXml !== originalXml, "문서가 전혀 변경되지 않음");

  console.log("\n✅ 원본 폰트·색상·헤더/푸터·styles.xml 보존");
  console.log("✅ 안내문 제거 + 생성 본문 삽입 + 표 변환 + 플레이스홀더 치환");

  // ── 폴백 검증: 매핑 안 되는 문서면 에러를 던져야 한다 ──
  let threw = false;
  try {
    await reconstructDOCX({
      originalBuffer: original,
      sectionMap: {
        mappings: [
          { templateSection: "존재하지않는제목", sectionKey: SectionKey.APPENDIX, confidence: 1 },
        ],
        unmappedSections: [],
        coverageRate: 0,
      },
      reportSections,
    });
  } catch {
    threw = true;
  }
  assert(threw, "매칭 실패 시 에러를 던져 폴백할 수 있어야 함");
  console.log("✅ 매칭 실패 시 폴백용 에러 발생");

  console.log("\n✅ 양식 재현 테스트 통과\n");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
