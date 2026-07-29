/**
 * PPTX 슬라이드 XML 텍스트 조작 유틸.
 * 원본 PPTX를 열어 본문 placeholder 텍스트만 교체한다.
 */

import { escapeXml, normalizeTitle } from "./docx-xml";

export { normalizeTitle };

/** 슬라이드 제목 placeholder 텍스트 */
export function extractSlideTitle(xml: string): string {
  const spBlocks = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? [];
  for (const block of spBlocks) {
    if (!/<p:ph[^>]*type="(?:title|ctrTitle)"/.test(block)) continue;
    const texts = (block.match(/<a:t>([^<]*)<\/a:t>/g) ?? [])
      .map((m) => m.replace(/<\/?a:t>/g, ""))
      .join(" ");
    if (texts.trim()) return texts.trim();
  }
  return "";
}

/** 슬라이드 전체 텍스트 (미리보기용) */
export function extractSlideText(xml: string): string {
  return (xml.match(/<a:t>([^<]*)<\/a:t>/g) ?? [])
    .map((m) => m.replace(/<\/?a:t>/g, ""))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function splitSpBlocks(xml: string): string[] {
  return xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? [];
}

function isBodyShape(block: string): boolean {
  if (/<p:ph[^>]*type="(?:title|ctrTitle|dt|ftr|hdr|sldNum)"/.test(block)) {
    return false;
  }
  return /<p:ph[^>]*type="(?:body|obj|subTitle)"/.test(block) || /<p:txBody>/.test(block);
}

/** body placeholder의 txBody 내용을 새 bullet 줄로 교체 */
export function replaceBodyContent(slideXml: string, lines: string[]): string {
  const blocks = splitSpBlocks(slideXml);
  let replaced = false;

  const newBlocks = blocks.map((block) => {
    if (replaced || !isBodyShape(block)) return block;

    const txBodyMatch = block.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/);
    if (!txBodyMatch) return block;

    const inner = txBodyMatch[1];
    const protoMatch = inner.match(/<a:p[^>]*>[\s\S]*?<\/a:p>/);
    const langMatch = protoMatch?.[0]?.match(/lang="([^"]+)"/);
    const lang = langMatch?.[1] ?? "ko-KR";

    const safeLines = lines.length > 0 ? lines : ["확인 필요"];
    const paragraphs = safeLines
      .slice(0, 12)
      .map((line) => {
        const text = escapeXml(line.replace(/^[-*•]\s*/, "").slice(0, 500));
        return `<a:p><a:pPr lvl="0"/><a:r><a:rPr lang="${lang}" dirty="0"/><a:t>${text}</a:t></a:r></a:p>`;
      })
      .join("");

    const prefix = inner.match(/^[\s\S]*?(?=<a:p)/)?.[0] ?? "";
    const header = prefix.includes("<a:bodyPr") ? prefix : "<a:bodyPr/><a:lstStyle/>";

    const newInner = header + paragraphs;
    replaced = true;
    return block.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, `<p:txBody>${newInner}</p:txBody>`);
  });

  if (!replaced) return slideXml;
  let idx = 0;
  return slideXml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, () => newBlocks[idx++] ?? "");
}

/** 마크다운 본문을 슬라이드 bullet 줄로 변환 */
export function markdownToSlideLines(markdown: string): string[] {
  const lines: string[] = [];
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line || /^-{3,}$/.test(line)) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      lines.push(heading[1].replace(/\*\*/g, ""));
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      lines.push(`• ${bullet[1].replace(/\*\*/g, "")}`);
      continue;
    }
    const numbered = /^(\d+)\.\s+(.*)$/.exec(line);
    if (numbered) {
      lines.push(`${numbered[1]}. ${numbered[2].replace(/\*\*/g, "")}`);
      continue;
    }
    lines.push(line.replace(/\*\*/g, ""));
  }
  return lines;
}

export function replacePlaceholders(
  xml: string,
  replacements: Record<string, string>
): string {
  let out = xml;
  for (const [key, value] of Object.entries(replacements)) {
    const escaped = escapeXml(value);
    for (const p of [`{{${key}}}`, `[${key}]`]) {
      out = out.split(p).join(escaped);
    }
  }
  return out;
}

/** 슬라이드 파일 경로를 번호 순으로 정렬 */
export function sortedSlidePaths(files: Record<string, unknown>): string[] {
  return Object.keys(files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
      const nb = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
      return na - nb;
    });
}
