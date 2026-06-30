import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { analyzePPTX } from "@/lib/template-parser/pptx-analyzer";
import { mapTemplateFields } from "@/lib/template-parser/field-mapper";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "파일을 업로드해주세요" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "pptx") {
    return NextResponse.json(
      { error: "현재 PPTX 형식만 지원합니다" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const analysis = await analyzePPTX(buffer);
  const mappings = await mapTemplateFields(analysis);

  return NextResponse.json({ analysis, mappings });
}
