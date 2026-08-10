/**
 * generateReportPPTX가 만드는 패키지의 OOXML 필수 파트를 검증한다.
 *
 * PowerPoint는 슬라이드 마스터가 테마 파트와 관계를 맺지 않으면 zip/XML
 * 구조가 멀쩡해도 파일을 통째로 "읽을 수 없음"으로 거부한다(ECMA-376
 * Part 1, §14.2.9). python-pptx 같은 느슨한 파서는 이 누락을 못 잡아내
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

  const buf = await generateReportPPTX(
    [{ title: "투자개요", content: "- Series B 100억\n- Post 800억" }],
    { companyName: "테스트회사", reportDate: new Date() }
  );

  const zip = await JSZip.loadAsync(buf);
  const files = Object.keys(zip.files);

  assert(files.includes("ppt/theme/theme1.xml"), "테마 파트 누락");

  const contentTypes = await zip.file("[Content_Types].xml")!.async("text");
  assert(
    contentTypes.includes(
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
    ),
    "[Content_Types].xml에 테마 Content-Type 선언 누락"
  );

  const masterRels = await zip
    .file("ppt/slideMasters/_rels/slideMaster1.xml.rels")!
    .async("text");
  assert(
    /Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/theme"\s+Target="\.\.\/theme\/theme1\.xml"/.test(
      masterRels
    ),
    "슬라이드 마스터 → 테마 관계 누락"
  );

  console.log("✅ 테마 파트 포함 + Content-Type 선언 + 슬라이드 마스터 관계 확인");
  console.log("✅ PPTX 내보내기 구조 검증 통과\n");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
