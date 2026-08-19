/**
 * 업로드된 DOCX·PPTX에서 내장 이미지를 추출한다.
 *
 * DOCX·PPTX는 둘 다 OOXML(zip) 구조라 이미지가 `word/media/*`,
 * `ppt/media/*`에 그대로 파일로 들어있다 — 별도 렌더링·OCR 없이 zip만
 * 열면 바로 꺼낼 수 있다.
 *
 * PDF는 지원하지 않는다. pdf-parse는 텍스트 레이어만 뽑고, 이미지까지
 * 꺼내려면 pdfjs-dist 같은 무거운 렌더링 의존성이 추가로 필요해서
 * 범위를 DOCX·PPTX로 좁혔다 — IR 자료 대부분이 이 두 형식이라 실사용
 * 커버리지는 크게 안 줄어든다.
 */

export interface ExtractedImage {
  /** zip 안 원래 파일명 (image3.png 등) — 확장자 판별용 */
  name: string;
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
}

/** 이 크기 미만은 로고·불릿·구분선 아이콘일 가능성이 높아 제외한다 */
const MIN_IMAGE_BYTES = 8 * 1024;

/** 문서 하나에서 너무 많은 이미지를 꺼내면 보고서가 부록으로 도배된다 */
const MAX_IMAGES_PER_DOCUMENT = 6;

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  // wmf/emf(벡터 클립아트)는 브라우저·pptxgenjs가 못 읽어 제외
};

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/**
 * 크든 작든 미디어 파일을 전부 모은 뒤, 너무 작은 것(로고·아이콘 추정)을
 * 걸러내고 큰 순서로 상한만큼 남긴다 — 실제 사진·차트·스크린샷일수록
 * 용량이 크고, 반복되는 로고·구분선은 작다는 경험칙을 이용한다.
 */
async function extractFromZipMediaFolder(
  buffer: Buffer,
  mediaPrefix: string
): Promise<ExtractedImage[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);

  const mediaFiles = Object.keys(zip.files).filter(
    (name) => name.startsWith(mediaPrefix) && !zip.files[name].dir
  );

  const images: ExtractedImage[] = [];
  for (const name of mediaFiles) {
    const ext = extOf(name);
    const mimeType = EXT_MIME[ext];
    if (!mimeType) continue; // 지원 안 하는 포맷(wmf/emf 등)은 건너뜀

    const content = await zip.files[name].async("nodebuffer");
    if (content.length < MIN_IMAGE_BYTES) continue;

    images.push({ name, buffer: content, mimeType, sizeBytes: content.length });
  }

  return images
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, MAX_IMAGES_PER_DOCUMENT);
}

export async function extractImagesFromDocx(
  buffer: Buffer
): Promise<ExtractedImage[]> {
  return extractFromZipMediaFolder(buffer, "word/media/");
}

export async function extractImagesFromPptx(
  buffer: Buffer
): Promise<ExtractedImage[]> {
  return extractFromZipMediaFolder(buffer, "ppt/media/");
}

/**
 * 파일 형식에 맞춰 자동으로 추출한다. 지원하지 않는 형식(PDF·XLSX·TXT)은
 * 조용히 빈 배열 — 호출부가 형식을 미리 분기할 필요가 없다.
 */
export async function extractDocumentImages(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ExtractedImage[]> {
  const ext = filename.split(".").pop()?.toLowerCase();
  const isDocx =
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx";
  const isPptx =
    mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    ext === "pptx";

  try {
    if (isDocx) return await extractImagesFromDocx(buffer);
    if (isPptx) return await extractImagesFromPptx(buffer);
  } catch (error) {
    // 손상되었거나 예상 밖 구조인 zip이어도 업로드 자체는 계속돼야 한다 —
    // 이미지는 보너스지, 문서 등록을 막을 이유가 아니다.
    console.warn("[DocumentImages] 이미지 추출 실패(무시):", error);
  }
  return [];
}
