/**
 * generateReportPPTX가 만드는 패키지의 OOXML 필수 파트를 검증한다.
 *
 * PowerPoint는 슬라이드 마스터가 테마 파트와 관계를 맺지 않으면 zip/XML
 * 구조가 멀쩡해도 파일을 통째로 "읽을 수 없음"으로 거부한다(ECMA-376
 * Part 1, §14.2.9). 예전 손수 작성한 OOXML 생성기는 이 파트가 아예
 * 빠져 있었는데 python-pptx 같은 느슨한 파서는 이 누락을 못 잡아내
 * 로컬 검증에서 드러나지 않았던 실제 프로덕션 버그 — 회귀 방지용.
 *
 * Usage: npm run test:pptx-export
 */
import JSZip from "jszip";
import { generateReportPPTX } from "../src/lib/pptx-export";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("\n=== Axiom PPTX 내보내기(신규 생성) 구조 검증 ===\n");

  const sections = [
    { title: "투자개요", content: "- Series B 100억\n- Post 800억" },
    { title: "회사개요", content: "2019년 설립, 48명" },
  ];
  const buf = await generateReportPPTX(sections, {
    companyName: "테스트회사",
    reportDate: new Date(),
  });

  const zip = await JSZip.loadAsync(buf);
  const files = Object.keys(zip.files);

  const themeFiles = files.filter((f) => /^ppt\/theme\/theme\d*\.xml$/.test(f));
  assert(themeFiles.length > 0, "테마 파트 누락");

  const contentTypes = await zip.file("[Content_Types].xml")!.async("text");
  assert(
    contentTypes.includes("application/vnd.openxmlformats-officedocument.theme+xml"),
    "[Content_Types].xml에 테마 Content-Type 선언 누락"
  );

  const masterRelsFile = files.find((f) =>
    /^ppt\/slideMasters\/_rels\/slideMaster\d*\.xml\.rels$/.test(f)
  );
  assert(!!masterRelsFile, "슬라이드 마스터 관계 파일 누락");
  const masterRels = await zip.file(masterRelsFile!)!.async("text");
  assert(
    masterRels.includes(
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"
    ),
    "슬라이드 마스터 → 테마 관계 누락"
  );

  // 슬라이드 수 = 표지 1장 + 섹션 수, 본문에 실제 내용이 들어갔는지 확인
  const slideFiles = files.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  assert(
    slideFiles.length === sections.length + 1,
    `슬라이드 수 불일치: ${slideFiles.length} (기대: ${sections.length + 1})`
  );
  const slide2 = await zip.file("ppt/slides/slide2.xml")!.async("text");
  assert(slide2.includes("Series B"), "본문 텍스트 미삽입");

  console.log("✅ 테마 파트 포함 + Content-Type 선언 + 슬라이드 마스터 관계 확인");

  // 마크다운 표(| a | b |)가 텍스트 불릿이 아니라 실제 PPTX 표(graphicFrame)로
  // 렌더링되는지 확인
  const tableSection = [
    {
      title: "재무현황",
      content:
        "| 구분 | FY-1 | FY |\n| --- | --- | --- |\n| 매출액 | 확인 필요 | 확인 필요 |\n\n- 핵심 포인트",
    },
  ];
  const tableBuf = await generateReportPPTX(tableSection, {
    companyName: "테스트회사",
    reportDate: new Date(),
  });
  const tableZip = await JSZip.loadAsync(tableBuf);
  const tableSlide = await tableZip.file("ppt/slides/slide2.xml")!.async("text");
  assert(tableSlide.includes("<a:tbl>"), "마크다운 표가 실제 PPTX 표로 렌더링되지 않음");
  assert(tableSlide.includes("매출액"), "표 셀 내용 누락");
  assert(tableSlide.includes("핵심 포인트"), "표 뒤 텍스트 블록 누락");
  console.log("✅ 마크다운 표 → 실제 PPTX 표 렌더링 확인");

  // "라벨: 숫자(단위)" 줄 2개 이상이면 실제 막대차트가 삽입되는지 확인
  const chartSection = [
    {
      title: "재무현황",
      content: "- ARR: 45억원\n- NRR: 118%\n- LTV/CAC: 4.5",
    },
  ];
  const chartBuf = await generateReportPPTX(chartSection, {
    companyName: "테스트회사",
    reportDate: new Date(),
  });
  const chartZip = await JSZip.loadAsync(chartBuf);
  const chartFile = Object.keys(chartZip.files).find((f) =>
    /^ppt\/charts\/chart\d*\.xml$/.test(f)
  );
  assert(!!chartFile, "핵심 지표 막대차트가 생성되지 않음");
  const chartXml = await chartZip.file(chartFile!)!.async("text");
  assert(chartXml.includes("ARR") && chartXml.includes("NRR"), "차트에 지표 라벨 누락");
  console.log("✅ 핵심 지표 2개 이상일 때 막대차트 렌더링 확인");

  console.log("✅ PPTX 내보내기 구조 검증 통과\n");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
