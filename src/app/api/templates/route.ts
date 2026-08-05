import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TemplateFileType, TemplateStatus } from "@prisma/client";
import { uploadFile, readStoredFile } from "@/lib/storage";
import { parseTemplate } from "@/lib/template/template-parser";
import { mapTemplateSections } from "@/lib/template/template-mapper";
import { checkQuota } from "@/lib/quotas";
import { randomUUID } from "crypto";
import { getUserTeamContext, templateReadWhere } from "@/lib/team-access";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId } = await getUserTeamContext(session.user.id);

  const templates = await prisma.template.findMany({
    where: templateReadWhere(session.user.id, teamId),
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: templates });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // 4.5MB를 넘는 파일은 브라우저에서 Vercel Blob으로 직접 업로드된 뒤,
  // 여기엔 blobUrl만 JSON으로 전달돼 템플릿 레코드 생성 + 구조 분석만 수행한다.
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    return finalizeBlobTemplate(request, session.user.id);
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

  // 1. 파일 저장 — 파일명만 쓰면 다른 사용자의 동명 양식을 덮어쓰므로 고유 키를 만든다
  const storageKey = `templates/${randomUUID()}.${ext}`;
  const fileUrl = await uploadFile(
    buffer,
    storageKey,
    file.type || "application/octet-stream"
  );

  // 2. 구조 파싱 (비동기 처리)
  const { teamId } = await getUserTeamContext(session.user.id);
  const template = await prisma.template.create({
    data: {
      name: name || file.name.replace(/\.[^.]+$/, ""),
      originalName: file.name,
      fileType,
      fileUrl,
      fileSize: file.size,
      status: TemplateStatus.ANALYZING,
      userId: session.user.id,
      teamId,
    },
  });

  // 백그라운드에서 분석 실행
  analyzeTemplateAsync(template.id, buffer, file.name, file.type);

  return NextResponse.json({ data: template }, { status: 201 });
}

async function finalizeBlobTemplate(request: NextRequest, userId: string) {
  const { blobUrl, fileName, mimeType, fileSize, name } =
    (await request.json()) as {
      blobUrl?: string;
      fileName?: string;
      mimeType?: string;
      fileSize?: number;
      name?: string;
    };

  if (!blobUrl || !fileName) {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  const quota = await checkQuota(userId, "template");
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.message }, { status: 429 });
  }

  const ext = fileName.split(".").pop()?.toLowerCase() ?? "docx";
  const fileType: TemplateFileType = ext === "pptx" || ext === "ppt" ? "PPTX" : "DOCX";

  const { teamId } = await getUserTeamContext(userId);
  const template = await prisma.template.create({
    data: {
      name: name || fileName.replace(/\.[^.]+$/, ""),
      originalName: fileName,
      fileType,
      fileUrl: blobUrl,
      fileSize: fileSize ?? 0,
      status: TemplateStatus.ANALYZING,
      userId,
      teamId,
    },
  });

  const buffer = await readStoredFile(blobUrl);
  if (buffer) {
    analyzeTemplateAsync(
      template.id,
      buffer,
      fileName,
      mimeType ?? "application/octet-stream"
    );
  } else {
    await prisma.template.update({
      where: { id: template.id },
      data: { status: TemplateStatus.ERROR },
    });
  }

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
