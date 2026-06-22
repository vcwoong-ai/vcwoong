import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

export type SlideElement = {
  type: "text" | "image" | "shape";
  id: string;
  position: { x: number; y: number; w: number; h: number };
  textContent?: string;
  fontInfo?: {
    family?: string;
    size?: number;
    color?: string;
    bold?: boolean;
  };
  placeholderType?: string;
  imageData?: string;
};

export type SlideAnalysis = {
  slideNum: number;
  layoutType: string;
  elements: SlideElement[];
};

export type TemplateAnalysis = {
  fileType: "pptx";
  slideCount: number;
  slides: SlideAnalysis[];
  designTokens: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    fontHeading?: string;
    fontBody?: string;
    logoPosition?: { x: number; y: number; w: number; h: number };
    logoImageBase64?: string;
  };
  slideSize: { w: number; h: number };
};

export async function analyzePPTX(
  file: File | Buffer
): Promise<TemplateAnalysis> {
  const buffer =
    file instanceof File ? Buffer.from(await file.arrayBuffer()) : file;
  const zip = await JSZip.loadAsync(buffer);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  const presXml = await zip.file("ppt/presentation.xml")!.async("string");
  const presData = parser.parse(presXml);
  const slideSize = extractSlideSize(presData);

  const themeFile = zip.file("ppt/theme/theme1.xml");
  let designTokens: TemplateAnalysis["designTokens"] = {};
  if (themeFile) {
    const themeData = parser.parse(await themeFile.async("string"));
    designTokens = extractDesignTokens(themeData);
  }

  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort();

  const slides: SlideAnalysis[] = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const slideXml = await zip.file(slideFiles[i])!.async("string");
    const slideData = parser.parse(slideXml);
    slides.push(analyzeSlide(slideData, i + 1));
  }

  const logo = findLogo(slides[0]);
  if (logo) {
    designTokens.logoPosition = logo.position;
  }

  return { fileType: "pptx", slideCount: slides.length, slides, designTokens, slideSize };
}

function extractSlideSize(presData: unknown): { w: number; h: number } {
  const sldSz = (presData as Record<string, Record<string, Record<string, string>>>)?.["p:presentation"]?.["p:sldSz"];
  return {
    w: Math.round((Number(sldSz?.["@_cx"]) || 9144000) / 36000),
    h: Math.round((Number(sldSz?.["@_cy"]) || 6858000) / 36000),
  };
}

function extractDesignTokens(themeData: unknown): TemplateAnalysis["designTokens"] {
  const td = themeData as Record<string, Record<string, Record<string, Record<string, unknown>>>>;
  const clrScheme = td?.["a:theme"]?.["a:themeElements"]?.["a:clrScheme"];
  const fontScheme = td?.["a:theme"]?.["a:themeElements"]?.["a:fontScheme"];
  return {
    primaryColor: extractColor(clrScheme?.["a:accent1"]),
    secondaryColor: extractColor(clrScheme?.["a:accent2"]),
    accentColor: extractColor(clrScheme?.["a:accent3"]),
    fontHeading:
      (fontScheme?.["a:majorFont"] as Record<string, Record<string, string>>)?.["a:ea"]?.["@_typeface"] ||
      (fontScheme?.["a:majorFont"] as Record<string, Record<string, string>>)?.["a:latin"]?.["@_typeface"],
    fontBody:
      (fontScheme?.["a:minorFont"] as Record<string, Record<string, string>>)?.["a:ea"]?.["@_typeface"] ||
      (fontScheme?.["a:minorFont"] as Record<string, Record<string, string>>)?.["a:latin"]?.["@_typeface"],
  };
}

function extractColor(node: unknown): string | undefined {
  if (!node) return undefined;
  const srgb = (node as Record<string, Record<string, string>>)["a:srgbClr"]?.["@_val"];
  return srgb ? `#${srgb}` : undefined;
}

function analyzeSlide(slideData: unknown, slideNum: number): SlideAnalysis {
  const sd = slideData as Record<string, Record<string, Record<string, unknown>>>;
  const spTree = sd?.["p:sld"]?.["p:cSld"]?.["p:spTree"];
  const shapes = (spTree as Record<string, unknown>)?.["p:sp"] || [];
  const elements: SlideElement[] = [];

  const spArray = Array.isArray(shapes) ? shapes : [shapes];
  for (const sp of spArray) {
    if (!sp) continue;
    const s = sp as Record<string, unknown>;
    const xfrm = (s?.["p:spPr"] as Record<string, unknown>)?.["a:xfrm"] as Record<string, Record<string, string>>;
    if (!xfrm) continue;

    const txBody = s?.["p:txBody"] as Record<string, unknown>;
    const paragraphs = Array.isArray(txBody?.["a:p"])
      ? (txBody["a:p"] as unknown[])
      : [txBody?.["a:p"]].filter(Boolean);
    const text = paragraphs
      .map((p) => {
        const runs = Array.isArray((p as Record<string, unknown>)?.["a:r"])
          ? ((p as Record<string, unknown>)["a:r"] as unknown[])
          : [(p as Record<string, unknown>)?.["a:r"]].filter(Boolean);
        return runs.map((r) => (r as Record<string, string>)?.["a:t"] || "").join("");
      })
      .join("\n");

    const nvSpPr = s?.["p:nvSpPr"] as Record<string, Record<string, unknown>>;
    const cNvPr = nvSpPr?.["p:cNvPr"] as Record<string, unknown> | undefined;
    const nvPr = nvSpPr?.["p:nvPr"] as Record<string, unknown> | undefined;
    const ph = nvPr?.["p:ph"] as Record<string, string> | undefined;
    elements.push({
      type: "text",
      id: String(cNvPr?.["@_id"] ?? `text_${elements.length}`),
      position: {
        x: emuToMm(xfrm["a:off"]?.["@_x"]),
        y: emuToMm(xfrm["a:off"]?.["@_y"]),
        w: emuToMm(xfrm["a:ext"]?.["@_cx"]),
        h: emuToMm(xfrm["a:ext"]?.["@_cy"]),
      },
      textContent: text,
      placeholderType: ph?.["@_type"],
    });
  }

  return { slideNum, layoutType: inferLayoutType(elements), elements };
}

function emuToMm(emu: string | number | undefined): number {
  return Math.round((Number(emu) || 0) / 36000);
}

function inferLayoutType(elements: SlideElement[]): string {
  const count = elements.filter((e) => e.type === "text").length;
  if (count === 1) return "title";
  if (count === 2) return "title_content";
  return "content";
}

function findLogo(slide: SlideAnalysis | undefined): SlideElement | undefined {
  if (!slide) return undefined;
  return slide.elements.find(
    (e) => e.type === "image" && e.position.x > 200 && e.position.y < 30
  );
}
