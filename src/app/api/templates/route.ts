import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TemplateFileType, TemplateStatus } from "@prisma/client";
import { uploadFile } from "@/lib/storage";
import { parseTemplate } from "@/lib/template/template-parser";
import { mapTemplateSections } from "@/lib/template/template-mapper";
import { checkQuota } from "@/lib/quotas";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const templates = await prisma.template.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: templates });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const name = formData.get("name") as string | null;

  if (!file) {
    return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
  }

  const quota = await checkQuota(session.user.id, "template");
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.message }, { status: 429 });
  }

  const allowedTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "application/vnd.ms-powerpoint",
  ];

  if (!allowedTypes.some((t) => file.type.includes(t.split("/")[1]))) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["docx", "pptx", "doc", "ppt"].includes(ext ?? "")) {
      return NextResponse.json({ error: "DOCX 또는 PPTX 파일만 지원합니다" }, { status: 400 });
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "docx";
  const fileType: TemplateFileType = ext === "pptx" || ext === "ppt" ? "PPTX" : "DOCX";

  // 1. 파일 저장
  const fileUrl = await uploadFile(buffer, file.name, file.type || "application/octet-stream");

  // 2. 구조 파싱 (비동기 처리)
  const template = await prisma.template.create({
    data: {
      name: name || file.name.replace(/\.[^.]+$/, ""),
      originalName: file.name,
      fileType,
      fileUrl,
      fileSize: file.size,
      status: TemplateStatus.ANALYZING,
      userId: session.user.id,
    },
  });

  // 백그라운드에서 분석 실행
  analyzeTemplateAsync(template.id, buffer, file.name, file.type);

  return NextResponse.json({ data: template }, { status: 201 });
}

async function analyzeTemplateAsync(
  templateId: string,
  buffer: Buffer,
  filename: string,
  mimeType: string
) {
  try {
    const structure = await parseTemplate(buffer, mimeType, filename);
    const sectionMap = await mapTemplateSections(structure.sections);

    await prisma.template.update({
      where: { id: templateId },
      data: {
        structure: JSON.parse(JSON.stringify(structure)),
        sectionMap: JSON.parse(JSON.stringify(sectionMap)),
        status: TemplateStatus.READY,
      },
    });

    console.log(`[Template] 분석 완료: ${templateId} | 섹션 ${structure.totalSections}개 | 커버리지 ${Math.round(sectionMap.coverageRate * 100)}%`);
  } catch (err) {
    console.error("[Template] 분석 실패:", err);
    await prisma.template.update({
      where: { id: templateId },
      data: { status: TemplateStatus.ERROR },
    });
  }
}
