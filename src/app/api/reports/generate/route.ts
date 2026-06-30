import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { rebuildPPTX } from "@/lib/template-generator/pptx-rebuilder";
import { rebuildDOCX } from "@/lib/template-generator/docx-rebuilder";
import type { TemplateAnalysis } from "@/lib/template-parser/pptx-analyzer";
import type { FieldMapping } from "@/lib/template-parser/field-mapper";

const schema = z.object({
  format: z.enum(["pptx", "docx"]),
  analysis: z.record(z.string(), z.unknown()).optional(),
  mappings: z.array(z.record(z.string(), z.unknown())).optional(),
  content: z.record(z.string(), z.string()),
  metadata: z.object({
    companyName: z.string(),
    reviewerName: z.string(),
    reviewDate: z.string(),
  }),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { format, content, metadata } = parsed.data;

  let buffer: Buffer;
  let contentType: string;
  let filename: string;

  if (format === "pptx" && parsed.data.analysis) {
    buffer = await rebuildPPTX({
      analysis: parsed.data.analysis as unknown as TemplateAnalysis,
      mappings: (parsed.data.mappings ?? []) as unknown as FieldMapping[],
      content,
      metadata,
    });
    contentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    filename = `${metadata.companyName}_투자심사보고서.pptx`;
  } else {
    const sections = Object.entries(content).map(([k, v]) => ({
      heading: k.replace(/_/g, " ").toUpperCase(),
      content: v,
    }));
    buffer = await rebuildDOCX(sections, metadata);
    contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    filename = `${metadata.companyName}_투자심사보고서.docx`;
  }

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
