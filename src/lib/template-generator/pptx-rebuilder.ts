import PptxGenJS from "pptxgenjs";
import type { TemplateAnalysis } from "@/lib/template-parser/pptx-analyzer";
import type { FieldMapping } from "@/lib/template-parser/field-mapper";

export type GenerationInput = {
  analysis: TemplateAnalysis;
  mappings: FieldMapping[];
  content: Record<string, string>;
  metadata: {
    companyName: string;
    reviewerName: string;
    reviewDate: string;
  };
};

function autoFontSize(text: string, pos: { w: number; h: number }): number {
  const density = text.length / Math.max(pos.w * pos.h, 1);
  if (density < 0.05) return 18;
  if (density < 0.1) return 14;
  if (density < 0.2) return 12;
  return 10;
}

export async function rebuildPPTX(input: GenerationInput): Promise<Buffer> {
  const pres = new PptxGenJS();

  const wIn = input.analysis.slideSize.w / 25.4;
  const hIn = input.analysis.slideSize.h / 25.4;
  pres.defineLayout({ name: "CUSTOM", width: wIn, height: hIn });
  pres.layout = "CUSTOM";

  const mappingMap = new Map(
    input.mappings.map((m) => [`${m.slideNum}:${m.elementId}`, m])
  );

  const fillContent = (slideNum: number, elementId: string, original: string): string => {
    const mapping = mappingMap.get(`${slideNum}:${elementId}`);
    if (!mapping || mapping.mappedField === "skip") return original;

    // meta fields
    if (mapping.mappedField === "report_date") return input.metadata.reviewDate;
    if (mapping.mappedField === "reviewer_name") return input.metadata.reviewerName;
    if (mapping.mappedField === "company_name") return input.metadata.companyName;

    return input.content[mapping.mappedField] ?? original;
  };

  for (const slideAnalysis of input.analysis.slides) {
    const slide = pres.addSlide();

    for (const element of slideAnalysis.elements) {
      if (element.type === "image") continue; // 이미지는 원본 재현 생략 (관계 파일 필요)

      if (element.type === "text") {
        const text = fillContent(
          slideAnalysis.slideNum,
          element.id,
          element.textContent ?? ""
        );

        slide.addText(text, {
          x: element.position.x / 25.4,
          y: element.position.y / 25.4,
          w: element.position.w / 25.4,
          h: element.position.h / 25.4,
          fontSize: autoFontSize(text, element.position),
          fontFace:
            element.fontInfo?.family ??
            input.analysis.designTokens.fontBody ??
            "맑은 고딕",
          color:
            element.fontInfo?.color?.replace("#", "") ?? "333333",
          bold: element.fontInfo?.bold ?? false,
          valign: "top",
          wrap: true,
        });
      }
    }
  }

  return (await pres.write({ outputType: "nodebuffer" })) as unknown as Buffer;
}
