/**
 * 문서 내장 이미지 추출(document-images.ts) + PPTX 첨부용 이미지
 * 수집(collectDocumentImages) 순수 로직 검증. 실제 zip 구조를 메모리에서
 * 만들어 검증하므로 네트워크·파일시스템이 필요 없다.
 *
 * Usage: npm run test:document-images
 */
import JSZip from "jszip";
import {
  extractImagesFromDocx,
  extractImagesFromPptx,
  extractDocumentImages,
} from "../src/lib/document-images";
import { collectDocumentImages } from "../src/lib/report-export-common";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/** 지정한 크기의 가짜 이미지 바이트를 만든다(실제 PNG일 필요 없음 — 크기/확장자만 본다) */
function fakeImage(bytes: number): Buffer {
  return Buffer.alloc(bytes, 1);
}

async function buildDocxZip(files: Record<string, Buffer>): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("word/document.xml", "<xml/>"); // 진짜 DOCX처럼 보이게
  for (const [name, buf] of Object.entries(files)) {
    zip.file(`word/media/${name}`, buf);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildPptxZip(files: Record<string, Buffer>): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("ppt/presentation.xml", "<xml/>");
  for (const [name, buf] of Object.entries(files)) {
    zip.file(`ppt/media/${name}`, buf);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

async function testFiltersTinyImages() {
  const buf = await buildDocxZip({
    "image1.png": fakeImage(20 * 1024), // 통과
    "image2.png": fakeImage(2 * 1024), // 너무 작음(로고 추정) — 제외
  });
  const images = await extractImagesFromDocx(buf);
  assert(images.length === 1, `작은 이미지가 안 걸러짐: ${images.length}개`);
  assert(images[0].name.includes("image1"), "큰 이미지가 아닌 게 남음");
  console.log("✅ 8KB 미만 이미지(로고·아이콘 추정)는 제외");
}

async function testIgnoresUnsupportedFormats() {
  const buf = await buildDocxZip({
    "image1.wmf": fakeImage(50 * 1024), // 벡터 클립아트 — 미지원
    "image2.png": fakeImage(20 * 1024),
  });
  const images = await extractImagesFromDocx(buf);
  assert(images.length === 1, `wmf가 걸러지지 않음: ${images.length}개`);
  assert(images[0].mimeType === "image/png", "지원 포맷만 남아야 함");
  console.log("✅ wmf/emf 같은 미지원 포맷은 제외");
}

async function testCapsAndSortsBySize() {
  const files: Record<string, Buffer> = {};
  for (let i = 0; i < 8; i++) {
    // 크기를 서로 다르게 줘서 정렬 확인
    files[`image${i}.png`] = fakeImage((i + 1) * 10 * 1024);
  }
  const buf = await buildPptxZip(files);
  const images = await extractImagesFromPptx(buf);
  assert(images.length === 6, `상한(6개)이 안 지켜짐: ${images.length}개`);
  for (let i = 0; i < images.length - 1; i++) {
    assert(
      images[i].sizeBytes >= images[i + 1].sizeBytes,
      "크기 내림차순 정렬이 안 됨"
    );
  }
  // 가장 큰 6개(image2~image7)가 남아야 한다 — 가장 작은 image0, image1은 제외
  assert(
    !images.some((img) => img.name.includes("image0") || img.name.includes("image1")),
    "가장 작은 이미지들이 상한 내에 잘못 포함됨"
  );
  console.log("✅ 문서당 최대 6개, 큰 이미지 우선으로 정렬·상한 적용");
}

async function testUnsupportedFileTypesReturnEmpty() {
  const pdfLike = Buffer.from("%PDF-1.4 fake");
  const images = await extractDocumentImages(pdfLike, "application/pdf", "IR.pdf");
  assert(images.length === 0, "PDF에서 이미지가 추출됨(지원 범위 밖이어야 함)");
  console.log("✅ PDF/XLSX/TXT는 지원 범위 밖이라 항상 빈 배열");
}

async function testCorruptZipNeverThrows() {
  const garbage = Buffer.from("이건 zip이 아닙니다");
  const images = await extractDocumentImages(
    garbage,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "broken.docx"
  );
  assert(images.length === 0, "손상된 zip에서 예외 대신 빈 배열이 나와야 함");
  console.log("✅ 손상된 zip이어도 예외 없이 빈 배열 (업로드 자체를 막지 않음)");
}

function testCollectDocumentImages() {
  const docs = [
    {
      name: "IR덱.pptx",
      metadata: {
        images: [
          { url: "https://x/a.png", mimeType: "image/png" },
          { url: "https://x/b.png", mimeType: "image/png" },
        ],
      },
    },
    { name: "재무제표.xlsx", metadata: { type: "xlsx" } }, // images 없음 — 건너뜀
    { name: "손상됨.docx", metadata: { images: "이건 배열이 아님" } }, // 잘못된 형태 — 건너뜀
    {
      name: "추가자료.docx",
      metadata: { images: [{ url: "https://x/c.png", mimeType: "image/png" }] },
    },
  ];

  const collected = collectDocumentImages(docs, 10);
  assert(collected.length === 3, `수집된 이미지 개수 불일치: ${collected.length}`);
  assert(collected[0].sourceName === "IR덱.pptx", "출처 문서명이 안 붙음");
  assert(collected[2].sourceName === "추가자료.docx", "여러 문서 이미지가 합쳐지지 않음");
  console.log("✅ 여러 문서의 이미지를 합치고, 형식이 잘못된 건 조용히 건너뜀");

  const capped = collectDocumentImages(docs, 2);
  assert(capped.length === 2, `maxTotal 상한이 안 지켜짐: ${capped.length}`);
  console.log("✅ maxTotal 상한 준수 (보고서가 이미지로 도배되지 않음)");
}

async function main() {
  console.log("\n=== DealMind 문서 이미지 추출 테스트 ===\n");
  await testFiltersTinyImages();
  await testIgnoresUnsupportedFormats();
  await testCapsAndSortsBySize();
  await testUnsupportedFileTypesReturnEmpty();
  await testCorruptZipNeverThrows();
  testCollectDocumentImages();
  console.log("\n✅ 문서 이미지 추출 테스트 통과\n");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
