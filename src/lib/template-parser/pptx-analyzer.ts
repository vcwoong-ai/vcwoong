import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

export type SlideElement = {
  type: "text" | "image" | "shape";
  id: string;
  position: { x: number; y: number; w: number; h: number }; // mm
  textContent?: string;
  fontInfo?: {
    family?: string;
    size?: number;
    color?: string;
    bold?: boolean;
  };
  placeholderType?: string;
  imageData?: string; // base64
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
    fontHeading?: string;
    fontBody?: string;
    logoPosition?: { x: number; y: number; w: number; h: number };
  };
  slideSize: { w: number; h: number }; // mm
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => ["p:sp", "p:pic", "a:p", "a:r"].includes(name),
});

function emuToMm(val: unknown): number {
  return Math.round((Number(val) || 0) / 36000);
}

function extractColor(node: unknown): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const n = node as Record<string, unknown>;
  const srgb = (n["a:srgbClr"] as Record<string, unknown> | undefined)?.[
    "@_val"
  ];
  return srgb ? `#${srgb}` : undefined;
}

function inferLayout(elements: SlideElement[]): string {
  const texts = elements.filter((e) => e.type === "text");
  if (texts.length <= 1) return "title";
  if (texts.length === 2) return "title_content";
  return "content";
}

function parseSlide(slideXml: string, slideNum: number): SlideAnalysis {
  const data = parser.parse(slideXml) as Record<string, unknown>;
  const spTree = (
    (
      (data["p:sld"] as Record<string, unknown>)?.["p:cSld"] as Record<
        string,
        unknown
      >
    )?.["p:spTree"] as Record<string, unknown>
  ) ?? {};

  const elements: SlideElement[] = [];

  // Text shapes
  const shapes = (spTree["p:sp"] as unknown[]) ?? [];
  for (const sp of shapes) {
    const s = sp as Record<string, unknown>;
    const xfrm = (
      (s["p:spPr"] as Record<string, unknown>)?.["a:xfrm"] as Record<
        string,
        unknown
      >
    );
    if (!xfrm) continue;

    const off = xfrm["a:off"] as Record<string, unknown> | undefined;
    const ext = xfrm["a:ext"] as Record<string, unknown> | undefined;

    const txBody = s["p:txBody"] as Record<string, unknown> | undefined;
    const paras = (txBody?.["a:p"] as unknown[]) ?? [];
    const text = paras
      .map((p) => {
        const para = p as Record<string, unknown>;
        const runs = (para["a:r"] as unknown[]) ?? [];
        return runs
          .map((r) => ((r as Record<string, unknown>)["a:t"] as string) ?? "")
          .join("");
      })
      .join("\n");

    const nvSpPr = s["p:nvSpPr"] as Record<string, unknown> | undefined;
    const ph = (
      (nvSpPr?.["p:nvPr"] as Record<string, unknown>)?.["p:ph"] as Record<
        string,
        unknown
      >
    );

    elements.push({
      type: "text",
      id:
        ((nvSpPr?.["p:cNvPr"] as Record<string, unknown>)?.["@_id"] as string) ??
        `t${elements.length}`,
      position: {
        x: emuToMm(off?.["@_x"]),
        y: emuToMm(off?.["@_y"]),
        w: emuToMm(ext?.["@_cx"]),
        h: emuToMm(ext?.["@_cy"]),
      },
      textContent: text,
      placeholderType: ph?.["@_type"] as string | undefined,
    });
  }

  // Images
  const pics = (spTree["p:pic"] as unknown[]) ?? [];
  for (const pic of pics) {
    const p = pic as Record<string, unknown>;
    const xfrm = (
      (p["p:spPr"] as Record<string, unknown>)?.["a:xfrm"] as Record<
        string,
        unknown
      >
    );
    if (!xfrm) continue;
    const off = xfrm["a:off"] as Record<string, unknown> | undefined;
    const ext = xfrm["a:ext"] as Record<string, unknown> | undefined;
    const nvPicPr = p["p:nvPicPr"] as Record<string, unknown> | undefined;

    elements.push({
      type: "image",
      id:
        ((nvPicPr?.["p:cNvPr"] as Record<string, unknown>)?.["@_id"] as string) ??
        `i${elements.length}`,
      position: {
        x: emuToMm(off?.["@_x"]),
        y: emuToMm(off?.["@_y"]),
        w: emuToMm(ext?.["@_cx"]),
        h: emuToMm(ext?.["@_cy"]),
      },
    });
  }

  return { slideNum, layoutType: inferLayout(elements), elements };
}

export async function analyzePPTX(
  file: File | Buffer
): Promise<TemplateAnalysis> {
  const buffer =
    file instanceof File ? Buffer.from(await file.arrayBuffer()) : file;
  const zip = await JSZip.loadAsync(buffer);

  // Slide size
  const presFile = zip.file("ppt/presentation.xml");
  let slideSize = { w: 254, h: 190 }; // 와이드 기본값 (mm)
  if (presFile) {
    const presXml = await presFile.async("string");
    const presData = parser.parse(presXml) as Record<string, unknown>;
    const sldSz = (
      (presData["p:presentation"] as Record<string, unknown>)?.["p:sldSz"] as Record<string, unknown>
    );
    if (sldSz) {
      slideSize = {
        w: emuToMm(sldSz["@_cx"]),
        h: emuToMm(sldSz["@_cy"]),
      };
    }
  }

  // Design tokens from theme
  const designTokens: TemplateAnalysis["designTokens"] = {};
  const themeFile = zip.file("ppt/theme/theme1.xml");
  if (themeFile) {
    const themeXml = await themeFile.async("string");
    const themeData = parser.parse(themeXml) as Record<string, unknown>;
    const themeEl = (
      (themeData["a:theme"] as Record<string, unknown>)?.["a:themeElements"] as Record<string, unknown>
    );
    const clr = themeEl?.["a:clrScheme"] as Record<string, unknown> | undefined;
    const font = themeEl?.["a:fontScheme"] as Record<string, unknown> | undefined;
    if (clr) {
      designTokens.primaryColor = extractColor(clr["a:accent1"]);
      designTokens.secondaryColor = extractColor(clr["a:accent2"]);
    }
    if (font) {
      designTokens.fontHeading =
        ((font["a:majorFont"] as Record<string, unknown>)?.["a:ea"] as Record<string, unknown>)?.["@_typeface"] as string | undefined ??
        ((font["a:majorFont"] as Record<string, unknown>)?.["a:latin"] as Record<string, unknown>)?.["@_typeface"] as string | undefined;
      designTokens.fontBody =
        ((font["a:minorFont"] as Record<string, unknown>)?.["a:ea"] as Record<string, unknown>)?.["@_typeface"] as string | undefined ??
        ((font["a:minorFont"] as Record<string, unknown>)?.["a:latin"] as Record<string, unknown>)?.["@_typeface"] as string | undefined;
    }
  }

  // Parse slides
  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0");
      const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0");
      return na - nb;
    });

  const slides: SlideAnalysis[] = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async("string");
    slides.push(parseSlide(xml, i + 1));
  }

  // Find logo (small image top-right of first slide)
  const logo = slides[0]?.elements.find(
    (e) =>
      e.type === "image" &&
      e.position.x > 150 &&
      e.position.y < 30 &&
      e.position.w < 60
  );
  if (logo) designTokens.logoPosition = logo.position;

  return { fileType: "pptx", slideCount: slides.length, slides, designTokens, slideSize };
}
