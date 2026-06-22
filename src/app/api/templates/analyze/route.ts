import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { analyzePPTX } from "@/lib/template-parser/pptx-analyzer";
import { analyzeDOCX } from "@/lib/template-parser/docx-analyzer";
import { mapTemplateFields } from "@/lib/template-parser/field-mapper";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "파일이 필요합니다" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name.toLowerCase();

  try {
    if (fileName.endsWith(".pptx")) {
      const analysis = await analyzePPTX(buffer);
      const mappings = await mapTemplateFields(analysis);
      return NextResponse.json({ data: { analysis, mappings } });
    } else if (fileName.endsWith(".docx")) {
      const analysis = await analyzeDOCX(buffer);
      return NextResponse.json({ data: { analysis, mappings: [] } });
    } else {
      return NextResponse.json(
        { error: "PPTX 또는 DOCX 파일만 지원합니다" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Template analysis error:", error);
    return NextResponse.json({ error: "분석 중 오류가 발생했습니다" }, { status: 500 });
  }
}
