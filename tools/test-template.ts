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
import { extractUnmappedContent } from "../src/lib/template/slide-extraction";

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
  console.log("\n=== DealMind 양식 1:1 재현 테스트 ===\n");

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

  // ── 유실 방지 검증: 원본에 대응 헤딩이 없는 AI 섹션도 문서 끝에 남아야 한다 ──
  const withExtra = await reconstructDOCX({
    originalBuffer: original,
    sectionMap,
    reportSections: [
      ...reportSections,
      {
        sectionKey: SectionKey.PRODUCT_TECHNOLOGY,
        title: "제품/기술",
        content: "자체 개발한 항체 스크리닝 플랫폼을 보유함.",
      },
    ],
  });
  const withExtraXml = await readDocXml(withExtra.buffer);
  assert(
    withExtra.appendedSections.includes(SectionKey.PRODUCT_TECHNOLOGY),
    "원본에 없는 섹션이 appendedSections에 기록되지 않음"
  );
  assert(
    withExtraXml.includes("자체 개발한 항체 스크리닝 플랫폼을 보유함"),
    "원본에 대응 헤딩이 없는 섹션 내용이 유실됨"
  );
  console.log("✅ 원본에 없는 섹션도 문서 끝에 덧붙여져 유실되지 않음");

  // ── 키워드 폴백 검증: 섹션맵이 엉뚱해도 실제 헤딩 스타일 + 흔한 제목 키워드로 복구되어야 한다 ──
  const rescued = await reconstructDOCX({
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
  assert(
    rescued.filledSections === 4,
    `섹션맵이 틀려도 키워드로 4개 복구 기대, got ${rescued.filledSections}`
  );
  console.log("✅ 섹션맵이 불완전해도 헤딩 키워드로 매칭 복구");

  // ── 폴백 검증: 진짜 헤딩 스타일도, 매핑도, 키워드도 전혀 없는 문서면 에러를 던져야 한다 ──
  const headinglessDoc = await Packer.toBuffer(
    new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({ children: [new TextRun({ text: "그냥 평범한 안내 문단입니다." })] }),
            new Paragraph({ children: [new TextRun({ text: "헤딩 스타일이 전혀 없는 문서." })] }),
          ],
        },
      ],
    })
  );

  let threw = false;
  try {
    await reconstructDOCX({
      originalBuffer: headinglessDoc,
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

  // ── 중복 매핑 검증: 서로 다른 헤딩 2개가 같은 SectionKey로 매핑되면
  // (예: "재무 현황"과 "손익 추정" 둘 다 FINANCIAL_STATUS) 둘 다 채워져야
  // 한다. 예전엔 먼저 나온 헤딩만 채우고 나머지는 원본 예시 회사의 실제
  // 내용이 그대로 남아있었다(실사용 버그로 발견됨).
  const dupDoc = await Packer.toBuffer(
    new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "재무 현황" })] }),
            new Paragraph({ children: [new TextRun({ text: "원본 예시회사 재무 수치 14,976" })] }),
            new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "손익 추정" })] }),
            new Paragraph({ children: [new TextRun({ text: "원본 예시회사 손익 추정치 228,328" })] }),
          ],
        },
      ],
    })
  );
  const dupResult = await reconstructDOCX({
    originalBuffer: dupDoc,
    sectionMap: {
      mappings: [
        { templateSection: "재무 현황", sectionKey: SectionKey.FINANCIAL_STATUS, confidence: 1 },
        { templateSection: "손익 추정", sectionKey: SectionKey.FINANCIAL_STATUS, confidence: 1 },
      ],
      unmappedSections: [],
      coverageRate: 0.1,
    },
    reportSections: [
      { sectionKey: SectionKey.FINANCIAL_STATUS, title: "재무현황", content: "신규 회사 재무 요약 내용." },
    ],
  });
  const dupXml = await readDocXml(dupResult.buffer);
  assert(dupResult.filledSections === 2, `같은 키로 매핑된 헤딩 2개 모두 채움 기대, got ${dupResult.filledSections}`);
  assert(!dupXml.includes("14,976"), "첫 번째 헤딩 아래 원본 회사 수치가 남아있음");
  assert(!dupXml.includes("228,328"), "두 번째 헤딩 아래 원본 회사 수치가 남아있음(중복 매핑 시 건너뛰던 버그)");
  console.log("✅ 같은 SectionKey로 매핑된 헤딩이 여러 개여도 전부 채워짐 (원본 회사 데이터 잔존 방지)");

  // ── 자료 기반 보조 추출 검증: 표준 섹션에 없는 헤딩(예: "인력 구성")도
  // documents를 넘기면 시도되고, API 키 없는 데모 모드에선 엉뚱한 내용을
  // 지어내지 않고 안전하게 건너뛰어야 한다(원본 예시 내용 그대로 유지) ──
  const withDocsButNoAI = await reconstructDOCX({
    originalBuffer: original,
    sectionMap,
    reportSections,
    replacements: { 기업명: "헬스케어AI Inc." },
    documents: [{ name: "IR.pdf", parsedText: "홍길동 대표, 임직원 30명 규모의 팀입니다." }],
  });
  assert(
    withDocsButNoAI.extractedFromDocuments.length === 0,
    "API 키 없는 데모 모드에서 추출이 시도된 것으로 기록됨(엉뚱한 내용 주입 위험)"
  );
  assert(
    withDocsButNoAI.filledSections === 4,
    `documents를 넘겨도 표준 섹션 채움 개수는 그대로여야 함, got ${withDocsButNoAI.filledSections}`
  );
  console.log("✅ documents를 넘겨도 데모 모드(API 키 없음)에선 추측성 내용을 주입하지 않음");

  const noDocsResult = await extractUnmappedContent("인력 구성", "", []);
  assert(noDocsResult === null, "자료가 없으면 AI 호출 없이 바로 null이어야 함");
  console.log("✅ 참고할 자료가 없으면 AI 호출 없이 즉시 건너뜀");

  console.log("\n✅ 양식 재현 테스트 통과\n");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
