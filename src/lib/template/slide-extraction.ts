/**
 * 표준 10개 섹션에 대응하지 않는 양식 슬라이드/헤딩(예: "인력 구성",
 * "주주 구성", "사업 계획")을 위한 보조 추출.
 *
 * AI가 새로 판단·서술하는 게 아니라, 업로드된 IR 자료 원문에서 해당
 * 주제에 대한 내용을 "찾아서 정리"만 한다 — 자료에 없으면 절대 지어내지
 * 않고 null을 반환해 원본 예시 내용을 그대로 둔다(엉뚱한 내용을 억지로
 *채우는 것보다 안전).
 */

import { generateText } from "@/lib/claude";

const DOC_CONTEXT_CHARS = 8000;
const NOT_FOUND_SENTINEL = "NOT_FOUND";

/** 한 번의 내보내기에서 시도할 추출 슬라이드 상한 — AI 호출·지연 시간을 제한한다 */
export const MAX_EXTRACTION_ATTEMPTS = 6;

function buildDocumentContext(
  documents: Array<{ name: string; parsedText: string | null }>
): string {
  return documents
    .filter((d) => d.parsedText)
    .map((d) => {
      const text = d.parsedText ?? "";
      const clipped =
        text.length > DOC_CONTEXT_CHARS
          ? `${text.slice(0, DOC_CONTEXT_CHARS)}\n…(이하 생략)`
          : text;
      return `### ${d.name}\n${clipped}`;
    })
    .join("\n\n");
}

/**
 * 업로드된 IR 자료에서 특정 슬라이드/헤딩 주제에 해당하는 내용을 찾아
 * 정리한다. 자료에 없으면 null (원본을 건드리지 않음).
 *
 * 마크다운 불릿 문자열("- ...")로 반환한다 — DOCX/PPTX 재현 엔진이
 * AI 생성 섹션 본문을 렌더링할 때 쓰는 것과 같은 파이프라인
 * (renderContent/markdownToSlideLines)에 그대로 흘려보낼 수 있게.
 */
export async function extractUnmappedContent(
  title: string,
  sampleContent: string,
  documents: Array<{ name: string; parsedText: string | null }>
): Promise<string | null> {
  const context = buildDocumentContext(documents);
  if (!context.trim()) return null;

  const systemPrompt =
    "너는 VC 투자심사역의 보조원이다. 주어진 자료 원문에서 특정 주제에 대한 " +
    "사실만 찾아 정리한다. 절대 추측하거나 지어내지 않는다. 자료 어디에도 " +
    `해당 내용이 없으면 다른 말 없이 정확히 "${NOT_FOUND_SENTINEL}"라고만 답한다.`;

  const prompt = `## 찾아야 할 슬라이드 주제
"${title}"
${sampleContent ? `(원본 슬라이드의 참고 문구: ${sampleContent.slice(0, 150)})` : ""}

## 업로드된 자료
${context}

위 자료에서 "${title}" 주제에 해당하는 내용을 bullet point(각 줄 "- "로 시작)로
정리해줘. 최대 6줄. 자료에 이 주제에 대한 내용이 전혀 없으면 다른 설명 없이
정확히 "${NOT_FOUND_SENTINEL}"만 답해.`;

  try {
    const result = await generateText(
      [{ role: "user", content: prompt }],
      { systemPrompt, maxTokens: 500, temperature: 0.2 }
    );

    // 데모 모드(API 키 미설정)의 목 응답은 이 추출 프롬프트 형식을 모르고
    // 항상 그럴듯한 투자개요 샘플을 돌려준다 — 실제로 자료에서 찾은 게
    // 아니므로, 엉뚱한 내용이 슬라이드에 채워지지 않게 건너뛴다.
    if (result.usedModel === "demo-mock") return null;

    const content = result.content.trim();
    if (!content || content.includes(NOT_FOUND_SENTINEL)) return null;

    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => (/^[-*]\s*/.test(l) ? l.replace(/^[-*]\s*/, "- ") : `- ${l}`));

    return lines.length > 0 ? lines.join("\n") : null;
  } catch (error) {
    console.warn(`[SlideExtraction] "${title}" 추출 실패(무시):`, error);
    return null;
  }
}
