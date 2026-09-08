/**
 * Document parsing utilities for DOCX, PDF, and XLSX files.
 * Extracts plain text for AI processing.
 */

/**
 * 추출된 텍스트가 이 길이 미만이면 "이미지/스캔 위주라 AI가 내용을 거의
 * 인식하지 못했을 가능성"을 사용자에게 알린다. PPTX/PDF는 텍스트 레이어
 * 없이 이미지로만 채워진 슬라이드·스캔본인 경우가 흔한데, 그 경우 파싱
 * 자체는 "성공"하지만 결과물이 사실상 비어 있어 이후 AI 보고서 품질이
 * 크게 떨어진다 — 업로드 단계에서 바로 알아챌 수 있어야 한다.
 */
const LOW_TEXT_THRESHOLD = 300;

function buildLowTextWarning(
  text: string,
  kind: "pptx" | "pdf" | "docx" | "xlsx" | "text"
): string | undefined {
  const len = text.trim().length;
  if (len >= LOW_TEXT_THRESHOLD) return undefined;

  const imageHint =
    kind === "pptx" || kind === "pdf"
      ? " 이미지·스캔 위주 자료일 가능성이 높습니다. 가능하면 텍스트가 포함된 원본을 함께 업로드해주세요."
      : "";
  return `추출된 텍스트가 매우 적습니다 (${len}자).${imageHint} AI가 내용을 충분히 인식하지 못할 수 있습니다.`;
}

/**
 * 저장하는 추출 텍스트의 상한(자).
 *
 * 지금까지 상한이 없어서, 텍스트가 아주 많은 파일(대형 엑셀 등)은 수 MB짜리
 * parsedText가 그대로 DB에 들어가고 보고서를 만들 때마다 문서 전체가 메모리로
 * 올라왔다 — 함수 메모리·실행시간을 갉아먹는다.
 *
 * 다만 근거 추적(evidence.ts)은 보고서의 숫자를 문서 "전문"과 대조하는 게
 * 핵심이라 함부로 짧게 자르면 제품의 핵심 기능이 약해진다. 그래서 실제 IR
 * 자료(보통 5천~5만 자)보다 훨씬 넉넉하게 잡아, 비정상적으로 큰 파일만
 * 걸리도록 한다.
 */
const MAX_PARSED_TEXT_CHARS = 500_000;

function clampParsedText(result: {
  text: string;
  metadata: Record<string, unknown>;
  warning?: string;
}) {
  if (result.text.length <= MAX_PARSED_TEXT_CHARS) return result;

  const truncatedNote =
    `자료가 매우 길어 앞부분 ${MAX_PARSED_TEXT_CHARS.toLocaleString()}자만 저장했습니다. ` +
    "뒷부분 수치는 근거 추적에서 '확인 필요'로 표시될 수 있습니다.";
  return {
    text: result.text.slice(0, MAX_PARSED_TEXT_CHARS),
    metadata: {
      ...result.metadata,
      truncated: true,
      originalLength: result.text.length,
    },
    warning: result.warning ? `${result.warning} ${truncatedNote}` : truncatedNote,
  };
}

export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ text: string; metadata: Record<string, unknown>; warning?: string }> {
  return clampParsedText(await parseDocumentRaw(buffer, mimeType, filename));
}

async function parseDocumentRaw(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ text: string; metadata: Record<string, unknown>; warning?: string }> {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    return parseDOCX(buffer);
  }

  if (mimeType === "application/pdf" || ext === "pdf") {
    return parsePDF(buffer);
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    ext === "xlsx" ||
    ext === "xls"
  ) {
    return parseXLSX(buffer);
  }

  if (mimeType === "text/plain" || ext === "txt") {
    return {
      text: buffer.toString("utf-8"),
      metadata: { type: "text" },
    };
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mimeType === "application/vnd.ms-powerpoint" ||
    ext === "pptx" ||
    ext === "ppt"
  ) {
    return parsePPTX(buffer);
  }

  throw new Error(`지원하지 않는 파일 형식입니다: ${mimeType}`);
}

async function parseDOCX(
  buffer: Buffer
): Promise<{ text: string; metadata: Record<string, unknown>; warning?: string }> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return {
    text: result.value,
    metadata: {
      type: "docx",
      messages: result.messages,
    },
    warning: buildLowTextWarning(result.value, "docx"),
  };
}

async function parsePDF(
  buffer: Buffer
): Promise<{ text: string; metadata: Record<string, unknown>; warning?: string }> {
  // pdf-parse v2는 API가 전면 개편되어 기본 함수 export가 없고, 클래스
  // (PDFParse)를 생성해 getText()를 호출하는 방식이다. 동적 require는
  // Next.js가 정적 import 시 시도하는 클라이언트 번들링을 피하기 위함.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require("pdf-parse") as {
    PDFParse: new (opts: { data: Buffer }) => {
      getText: () => Promise<{ text: string; total: number }>;
      destroy: () => Promise<void>;
    };
  };
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return {
      text: result.text,
      metadata: {
        type: "pdf",
        numPages: result.total,
      },
      warning: buildLowTextWarning(result.text, "pdf"),
    };
  } finally {
    await parser.destroy();
  }
}

/** XML에서 <a:t> 텍스트 런을 모두 뽑아 하나의 문자열로 합친다 */
function extractTextRuns(xmlContent: string): string {
  const textMatches = xmlContent.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? [];
  return textMatches
    .map((m) => m.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean)
    .join(" ");
}

async function parsePPTX(
  buffer: Buffer
): Promise<{ text: string; metadata: Record<string, unknown>; warning?: string }> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] ?? "0");
      const numB = parseInt(b.match(/\d+/)?.[0] ?? "0");
      return numA - numB;
    });

  // 발표자 노트(ppt/notesSlides/notesSlideN.xml)에도 슬라이드에 없는 수치·
  // 설명이 담기는 경우가 많다 — 슬라이드 텍스트가 적을수록 보완 효과가 크다.
  const notesFiles = new Map(
    Object.keys(zip.files)
      .filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name))
      .map((name) => [parseInt(name.match(/\d+/)?.[0] ?? "0"), name])
  );

  const slideTexts: string[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const xmlContent = await zip.files[slideFiles[i]].async("text");
    const slideText = extractTextRuns(xmlContent);

    if (slideText) {
      slideTexts.push(`[슬라이드 ${i + 1}]\n${slideText}`);
    }

    const notesFile = notesFiles.get(i + 1);
    if (notesFile) {
      const notesXml = await zip.files[notesFile].async("text");
      const notesText = extractTextRuns(notesXml);
      if (notesText) {
        slideTexts.push(`[슬라이드 ${i + 1} 발표자 노트]\n${notesText}`);
      }
    }
  }

  const text = slideTexts.join("\n\n");

  return {
    text,
    metadata: {
      type: "pptx",
      slideCount: slideFiles.length,
    },
    warning: buildLowTextWarning(text, "pptx"),
  };
}

async function parseXLSX(
  buffer: Buffer
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  const xlsx = await import("xlsx");
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const texts: string[] = [];
  const sheetNames = workbook.SheetNames;

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = xlsx.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      texts.push(`[시트: ${sheetName}]\n${csv}`);
    }
  }

  return {
    text: texts.join("\n\n"),
    metadata: {
      type: "xlsx",
      sheets: sheetNames,
    },
  };
}
