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

export async function rebuildPPTX(input: GenerationInput): Promise<Buffer> {
  // pptxgenjs is a client-side library; we use dynamic import to avoid SSR issues.
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pres = new PptxGenJS();

  pres.defineLayout({
    name: "CUSTOM",
    width: input.analysis.slideSize.w / 25.4,
    height: input.analysis.slideSize.h / 25.4,
  });
  pres.layout = "CUSTOM";

  for (const slideAnalysis of input.analysis.slides) {
    const slide = pres.addSlide();

    for (const element of slideAnalysis.elements) {
      if (element.type === "image" && element.imageData) {
        slide.addImage({
          data: `data:image/png;base64,${element.imageData}`,
          x: element.position.x / 25.4,
          y: element.position.y / 25.4,
          w: element.position.w / 25.4,
          h: element.position.h / 25.4,
        });
        continue;
      }

      if (element.type === "text") {
        const mapping = input.mappings.find(
          (m) =>
            m.slideNum === slideAnalysis.slideNum && m.elementId === element.id
        );

        let textContent = element.textContent || "";
        if (mapping && mapping.mappedField !== "skip") {
          // Special handling for meta fields
          if (mapping.mappedField === "date") {
            textContent = input.metadata.reviewDate;
          } else if (mapping.mappedField === "reviewer") {
            textContent = input.metadata.reviewerName;
          } else if (mapping.mappedField === "company_name") {
            textContent = input.metadata.companyName;
          } else {
            textContent = input.content[mapping.mappedField] || textContent;
          }
        }

        const fontSize = autoFontSize(textContent, element.position);

        slide.addText(textContent, {
          x: element.position.x / 25.4,
          y: element.position.y / 25.4,
          w: element.position.w / 25.4,
          h: element.position.h / 25.4,
          fontSize,
          fontFace:
            element.fontInfo?.family ||
            input.analysis.designTokens.fontBody ||
            "맑은 고딕",
          color: element.fontInfo?.color?.replace("#", "") || "333333",
          bold: element.fontInfo?.bold || false,
          valign: "top",
          wrap: true,
        });
      }
    }
  }

  return (await pres.write({ outputType: "nodebuffer" })) as unknown as Buffer;
}

function autoFontSize(
  text: string,
  position: { w: number; h: number }
): number {
  const area = position.w * position.h;
  if (area === 0) return 12;
  const density = text.length / area;
  if (density < 0.05) return 18;
  if (density < 0.1) return 14;
  if (density < 0.2) return 12;
  return 10;
}
