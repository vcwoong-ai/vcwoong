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
  console.log("✅ PPTX 내보내기 구조 검증 통과\n");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
