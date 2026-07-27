import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import {
  extractBody,
  pickBodyProto,
  splitBlocks,
} from "@/lib/template/docx-xml";
import type { TemplateSectionMap } from "@/lib/template/template-mapper";
import { normalizeTitle } from "@/lib/template/docx-xml";

interface PreviewBlock {
  kind: "heading" | "body" | "table";
  text: string;
  /** 이 헤딩에 매핑된 표준 섹션 */
  sectionKey: string | null;
  /** 재현 시 이 블록이 생성 본문으로 교체되는지 */
  willReplace: boolean;
}

/**
 * 양식 재현 미리보기 — 원본의 어느 부분이 교체되는지 보여준다.
 * 실제 내보내기와 같은 판정 로직을 쓰기 위해 docx-xml 유틸을 공유한다.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const template = await prisma.template.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!template) {
    return NextResponse.json({ error: "양식을 찾을 수 없습니다" }, { status: 404 });
  }

  if (template.fileType !== "DOCX") {
    return NextResponse.json({
      data: {
        supported: false,
        reason: "PPTX 양식은 아직 1:1 재현을 지원하지 않습니다 (DOCX만 가능).",
        blocks: [],
      },
    });
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

  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(original);
    const docXml = await zip.file("word/document.xml")?.async("text");
    if (!docXml) throw new Error("document.xml 없음");

    const parts = extractBody(docXml);
    if (!parts) throw new Error("body 파싱 실패");

    const blocks = splitBlocks(parts.body);
    const proto = pickBodyProto(blocks);

    const sectionMap = (template.sectionMap ?? {
      mappings: [],
    }) as unknown as TemplateSectionMap;
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
        preview.push({
          kind: "heading",
          text: b.text,
          sectionKey: key,
          willReplace: false,
        });
        continue;
      }

      if (b.headingLevel !== null) {
        pendingKey = null;
        preview.push({
          kind: "heading",
          text: b.text,
          sectionKey: null,
          willReplace: false,
        });
        continue;
      }

      preview.push({
        kind: "body",
        text: b.text.slice(0, 120),
        sectionKey: null,
        willReplace: pendingKey !== null,
      });
    }

    return NextResponse.json({
      data: {
        supported: matched.size > 0,
        reason:
          matched.size > 0
            ? null
            : "원본에서 매핑된 섹션 제목을 찾지 못했습니다. 내보내기 시 기본 양식으로 대체됩니다.",
        matchedSections: matched.size,
        totalBlocks: preview.length,
        hasBodyProto: Boolean(proto.pPr || proto.rPr),
        blocks: preview.slice(0, 120),
      },
    });
  } catch (error) {
    console.error("Template preview error:", error);
    return NextResponse.json({
      data: {
        supported: false,
        reason: "원본 DOCX를 해석하지 못했습니다.",
        blocks: [],
      },
    });
  }
}
