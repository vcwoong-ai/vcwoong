/**
 * 템플릿 파서 — DOCX/PPTX 파일에서 섹션 구조를 추출한다.
 *
 * DOCX: 헤딩(Heading1~3)과 단락 구조 추출
 * PPTX: 각 슬라이드 제목 + 텍스트 플레이스홀더 추출
 */

export interface TemplateSection {
  index: number;
  title: string;
  level: number;          // 헤딩 레벨 (1~3), 슬라이드 번호
  type: "heading" | "slide" | "placeholder";
  sampleContent: string;  // 기존 내용 샘플 (매핑 참고용)
  placeholders: string[]; // {{...}} 또는 [...]  패턴
}

export interface TemplateStructure {
  fileType: "DOCX" | "PPTX";
  totalSections: number;
  sections: TemplateSection[];
  metadata: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────
// DOCX 파싱
// ─────────────────────────────────────────────────────

export async function parseDOCXTemplate(buffer: Buffer): Promise<TemplateStructure> {
  const mammoth = await import("mammoth");

  // 원문 XML 추출 (스타일 정보 포함)
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value;

  // {{placeholder}} 또는 [항목명] 패턴 감지
  const placeholderRegex = /\{\{[^}]+\}\}|\[[^\]]{2,30}\]/g;

  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const sections: TemplateSection[] = [];
  let sectionIndex = 0;

  // 헤딩 패턴 감지 (번호 기반, 짧은 줄)
  const headingPatterns = [
    /^(\d+)\.\s+(.+)$/,           // "1. 투자개요"
    /^(\d+)\)\s+(.+)$/,           // "1) 투자개요"
    /^[IVX]+\.\s+(.+)$/,          // "I. 투자개요"
    /^([가-힣]{2,10})\s*$/,        // 짧은 한글 제목
    /^(제\s*\d+\s*조|제\s*[가-힣]+장)/, // 법적 문서 스타일
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const isHeading =
      line.length < 60 &&
      (headingPatterns.some((p) => p.test(line)) ||
        /^[■□▶◆●★]/.test(line));

    if (isHeading) {
      // 다음 몇 줄의 내용을 샘플로 수집
      const sampleLines = lines.slice(i + 1, i + 4).join(" ").slice(0, 200);
      const foundPlaceholders = (line + sampleLines).match(placeholderRegex) ?? [];

      sections.push({
        index: sectionIndex++,
        title: line.replace(/^[■□▶◆●★\d.)\s]+/, "").trim() || line,
        level: line.match(/^\d+\./) ? 1 : line.match(/^\d+\)/) ? 2 : 1,
        type: "heading",
        sampleContent: sampleLines.slice(0, 150),
        placeholders: foundPlaceholders,
      });
    }
  }

  // 헤딩 감지 실패 시 — 모든 줄에서 플레이스홀더만 추출
  if (sections.length === 0) {
    const allPlaceholders = text.match(placeholderRegex) ?? [];
    allPlaceholders.forEach((ph, i) => {
      sections.push({
        index: i,
        title: ph.replace(/[{}[\]]/g, ""),
        level: 1,
        type: "placeholder",
        sampleContent: "",
        placeholders: [ph],
      });
    });
  }

  return {
    fileType: "DOCX",
    totalSections: sections.length,
    sections,
    metadata: {
      charCount: text.length,
      lineCount: lines.length,
      hasPlaceholders: sections.some((s) => s.placeholders.length > 0),
    },
  };
}

// ─────────────────────────────────────────────────────
// PPTX 파싱
// ─────────────────────────────────────────────────────

export async function parsePPTXTemplate(buffer: Buffer): Promise<TemplateStructure> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] ?? "0");
      const nb = parseInt(b.match(/\d+/)?.[0] ?? "0");
      return na - nb;
    });

  const sections: TemplateSection[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async("text");

    // 제목 플레이스홀더 추출 (<p:sp> with type="title" or "ctrTitle")
    const titleMatch = xml.match(/<p:ph[^>]*type="(?:title|ctrTitle)"[^>]*>[\s\S]*?<\/p:sp>/);
    let title = "";
    if (titleMatch) {
      title = titleMatch[0].match(/<a:t>([^<]*)<\/a:t>/g)
        ?.map((m) => m.replace(/<\/?a:t>/g, ""))
        .join(" ") ?? "";
    }

    // 모든 텍스트 추출
    const allText = (xml.match(/<a:t>([^<]*)<\/a:t>/g) ?? [])
      .map((m) => m.replace(/<\/?a:t>/g, "").trim())
      .filter(Boolean)
      .join(" ");

    // 플레이스홀더 패턴
    const placeholderRegex = /\{\{[^}]+\}\}|\[[^\]]{2,30}\]/g;
    const placeholders = allText.match(placeholderRegex) ?? [];

    sections.push({
      index: i,
      title: title || `슬라이드 ${i + 1}`,
      level: i === 0 ? 0 : 1,  // 첫 슬라이드 = 표지
      type: "slide",
      sampleContent: allText.slice(0, 200),
      placeholders,
    });
  }

  return {
    fileType: "PPTX",
    totalSections: sections.length,
    sections,
    metadata: { slideCount: slideFiles.length },
  };
}

export async function parseTemplate(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<TemplateStructure> {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (
    mimeType.includes("presentation") ||
    ext === "pptx" || ext === "ppt"
  ) {
    return parsePPTXTemplate(buffer);
  }

  return parseDOCXTemplate(buffer);
}
