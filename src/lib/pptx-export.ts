/**
 * 보고서 섹션을 PPTX 슬라이드로 변환.
 *
 * 예전엔 jszip으로 최소 OOXML을 직접 손으로 만들었는데, 슬라이드
 * 마스터↔테마 관계 같은 스펙상 필수 파트가 빠져 있어도 python-pptx 같은
 * 느슨한 파서는 통과시키는 반면 실제 PowerPoint는 파일을 통째로
 * "읽을 수 없음"으로 거부했다 — 로컬 검증으로는 못 잡고 실사용자가 직접
 * 열어봐야만 드러나는 종류의 버그. 직접 만든 XML을 계속 패치하는 대신,
 * 실사용자들이 이미 검증한 pptxgenjs로 교체해 이 클래스의 버그를 근본
 * 제거한다.
 */

import type { ReportSection } from "@prisma/client";

function splitBullets(content: string): string[] {
  return content
    .split(/\n/)
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

export async function generateReportPPTX(
  sections: Pick<ReportSection, "title" | "content">[],
  meta: { companyName: string; reportDate?: Date }
): Promise<Buffer> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "AXIOM_4X3", width: 10, height: 7.5 });
  pptx.layout = "AXIOM_4X3";

  const coverTitle = `${meta.companyName} 투자심의보고서`;
  const coverDate = (meta.reportDate ?? new Date()).toLocaleDateString("ko-KR");

  const coverSlide = pptx.addSlide();
  coverSlide.addText(coverTitle, {
    x: 0.5,
    y: 2.8,
    w: 9,
    h: 1.2,
    fontSize: 32,
    bold: true,
    align: "center",
    fontFace: "맑은 고딕",
  });
  coverSlide.addText(`${coverDate}\nAxiom IC Report`, {
    x: 0.5,
    y: 4.1,
    w: 9,
    h: 0.8,
    fontSize: 14,
    align: "center",
    color: "666666",
    fontFace: "맑은 고딕",
  });

  for (const section of sections) {
    const slide = pptx.addSlide();
    slide.addText(section.title, {
      x: 0.5,
      y: 0.35,
      w: 9,
      h: 0.7,
      fontSize: 26,
      bold: true,
      fontFace: "맑은 고딕",
    });

    const bullets = splitBullets(section.content);
    const lines = bullets.length > 0 ? bullets : ["확인 필요"];
    slide.addText(
      lines.map((line) => ({
        text: line.slice(0, 200),
        options: { bullet: true, breakLine: true },
      })),
      {
        x: 0.5,
        y: 1.25,
        w: 9,
        h: 5.8,
        fontSize: 16,
        valign: "top",
        fontFace: "맑은 고딕",
      }
    );
  }

  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}

/** 마크다운 LP 리포트를 ## 헤딩 기준으로 슬라이드 분할 */
export function markdownToPptxSections(
  markdown: string
): Array<{ title: string; content: string }> {
  const trimmed = markdown.trim();
  if (!trimmed) return [{ title: "내용", content: "" }];

  const chunks = trimmed.split(/^#{1,3}\s+/m).filter((c) => c.trim());
  if (chunks.length <= 1 && !/^#{1,3}\s+/m.test(trimmed)) {
    return [{ title: "요약", content: trimmed }];
  }

  const sections: Array<{ title: string; content: string }> = [];
  // split removes the heading marker; first chunk may be preface
  let offset = 0;
  if (!trimmed.match(/^#{1,3}\s+/)) {
    const preface = chunks[0]?.trim();
    if (preface) sections.push({ title: "서문", content: preface });
    offset = 1;
  }

  for (let i = offset; i < chunks.length; i++) {
    const block = chunks[i];
    const nl = block.indexOf("\n");
    const title = (nl === -1 ? block : block.slice(0, nl)).trim() || `섹션 ${i + 1}`;
    const content = (nl === -1 ? "" : block.slice(nl + 1)).trim();
    sections.push({ title: title.slice(0, 80), content });
  }

  return sections.length > 0 ? sections : [{ title: "요약", content: trimmed }];
}

export async function generateMarkdownPPTX(opts: {
  title: string;
  subtitle?: string;
  markdown: string;
}): Promise<Buffer> {
  const sections = markdownToPptxSections(opts.markdown);
  return generateReportPPTX(sections, {
    companyName: opts.title,
    reportDate: new Date(),
  });
}
