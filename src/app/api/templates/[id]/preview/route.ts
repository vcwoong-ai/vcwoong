import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { extractBody, pickBodyProto, splitBlocks, normalizeTitle } from "@/lib/template/docx-xml";
import {
  extractSlideTitle,
  extractSlideText,
  normalizeTitle as normTitle,
  sortedSlidePaths,
} from "@/lib/template/pptx-xml";
import type { TemplateSectionMap } from "@/lib/template/template-mapper";
import { getUserTeamContext, templateReadWhere } from "@/lib/team-access";

interface PreviewBlock {
  kind: "heading" | "body" | "table" | "slide";
  text: string;
  sectionKey: string | null;
  willReplace: boolean;
}

async function previewDocx(original: Buffer, sectionMap: TemplateSectionMap) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(original);
  const docXml = await zip.file("word/document.xml")?.async("text");
  if (!docXml) throw new Error("document.xml 없음");

  const parts = extractBody(docXml);
  if (!parts) throw new Error("body 파싱 실패");

  const blocks = splitBlocks(parts.body);
  pickBodyProto(blocks);

  const titleToKey = new Map<string, string>();
  for (const m of sectionMap.mappings ?? []) {
    if (m.sectionKey) titleToKey.set(normalizeTitle(m.templateSection), m.sectionKey);
  }

  const matched = new Set<string>();
  const preview: PreviewBlock[] = [];
  let pendingKey: string | null = null;

  for (const b of blocks) {
    if (b.kind === "sectPr" || b.kind === "other") continue;

    if (b.kind === "tbl") {
      preview.push({
        kind: "table",
        text: b.text.slice(0, 80) || "(표)",
        sectionKey: null,
        willReplace: pendingKey !== null,
      });
      continue;
    }
    if (!b.text) continue;

    const norm = normalizeTitle(b.text);
    let key = titleToKey.get(norm) ?? null;
    if (!key) {
      titleToKey.forEach((k, t) => {
        if (!key && t.length >= 2 && (norm.includes(t) || t.includes(norm))) key = k;
      });
    }
    const isHeading =
      Boolean(key) && !matched.has(key!) && (b.headingLevel !== null || b.text.length <= 40);

    if (isHeading) {
      matched.add(key!);
      pendingKey = key;
      preview.push({ kind: "heading", text: b.text, sectionKey: key, willReplace: false });
      continue;
    }

    if (b.headingLevel !== null) {
      pendingKey = null;
      preview.push({ kind: "heading", text: b.text, sectionKey: null, willReplace: false });
      continue;
    }

    preview.push({
      kind: "body",
      text: b.text.slice(0, 120),
      sectionKey: null,
      willReplace: pendingKey !== null,
    });
  }

  return { preview, matched: matched.size, fileType: "DOCX" as const };
}

async function previewPptx(original: Buffer, sectionMap: TemplateSectionMap) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(original);
  const slidePaths = sortedSlidePaths(zip.files);

  const titleToKey = new Map<string, string>();
  for (const m of sectionMap.mappings ?? []) {
    if (m.sectionKey) titleToKey.set(normTitle(m.templateSection), m.sectionKey);
  }

  const matched = new Set<string>();
  const preview: PreviewBlock[] = [];

  for (let i = 0; i < slidePaths.length; i++) {
    const xml = await zip.file(slidePaths[i])!.async("text");
    const title = extractSlideTitle(xml);
    const norm = normTitle(title);
    let key = titleToKey.get(norm) ?? null;
    if (!key) {
      titleToKey.forEach((k, t) => {
        if (!key && t.length >= 2 && (norm.includes(t) || t.includes(norm))) key = k;
      });
    }

    const isMatch = Boolean(key) && !matched.has(key!);
    if (isMatch) matched.add(key!);

    preview.push({
      kind: "slide",
      text: title || `슬라이드 ${i + 1}`,
      sectionKey: isMatch ? key : null,
      willReplace: isMatch,
    });

    if (isMatch) {
      preview.push({
        kind: "body",
        text: extractSlideText(xml).slice(0, 100) || "(본문 placeholder)",
        sectionKey: key,
        willReplace: true,
      });
    }
  }

  return { preview, matched: matched.size, fileType: "PPTX" as const };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId } = await getUserTeamContext(session.user.id);

  const template = await prisma.template.findFirst({
    where: { id: params.id, ...templateReadWhere(session.user.id, teamId) },
  });
  if (!template) {
    return NextResponse.json({ error: "양식을 찾을 수 없습니다" }, { status: 404 });
  }

  const original = await readStoredFile(template.fileUrl);
  if (!original) {
    return NextResponse.json({
      data: {
        supported: false,
        reason: "원본 파일을 읽을 수 없습니다. 양식을 다시 업로드해 주세요.",
        blocks: [],
      },
    });
  }

  const sectionMap = (template.sectionMap ?? { mappings: [] }) as unknown as TemplateSectionMap;

  try {
    const result =
      template.fileType === "PPTX"
        ? await previewPptx(original, sectionMap)
        : await previewDocx(original, sectionMap);

    const preserveCount = result.preview.filter((b) => !b.willReplace).length;
    const replaceCount = result.preview.filter((b) => b.willReplace).length;

    return NextResponse.json({
      data: {
        supported: result.matched > 0,
        fileType: result.fileType,
        reason:
          result.matched > 0
            ? null
            : "원본에서 매핑된 섹션 제목을 찾지 못했습니다. 내보내기 시 기본 양식으로 대체됩니다.",
        matchedSections: result.matched,
        totalBlocks: result.preview.length,
        preserveBlocks: preserveCount,
        replaceBlocks: replaceCount,
        qaScore:
          result.preview.length > 0
            ? Math.round((preserveCount / result.preview.length) * 100)
            : 0,
        blocks: result.preview.slice(0, 120),
      },
    });
  } catch (error) {
    console.error("Template preview error:", error);
    return NextResponse.json({
      data: {
        supported: false,
        reason: "원본 파일을 해석하지 못했습니다.",
        blocks: [],
      },
    });
  }
}
