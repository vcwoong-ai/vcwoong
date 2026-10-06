import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TemplateFileType, TemplateStatus } from "@prisma/client";
import { uploadFile, verifyUploadedBlob, PrivateStorageConfigurationError } from "@/lib/storage";
import { validateUploadFile, verifyUploadGrant, publicTemplate } from "@/lib/upload-security";
import { recoverTemplate, queuedRecovery } from "@/lib/upload-recovery";
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

  return NextResponse.json({ data: templates.map(publicTemplate) });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  try {
  // 4.5MB를 넘는 파일은 브라우저에서 Vercel Blob으로 직접 업로드된 뒤,
  // 여기엔 blobUrl만 JSON으로 전달돼 템플릿 레코드 생성 + 구조 분석만 수행한다.
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    return await finalizeBlobTemplate(request, session.user.id);
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const name = formData.get("name") as string | null;

  if (!file) {
    return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
  }
  try { validateUploadFile({ fileName: file.name, mimeType: file.type, fileSize: file.size }, "template"); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "잘못된 파일입니다" }, { status: 400 }); }

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
      structure: { __uploadRecovery: { ...queuedRecovery() } },
      userId: session.user.id,
      teamId,
    },
  });

  // 응답을 먼저 보낸 뒤에도 Vercel이 함수를 바로 얼리지 않도록 분석 작업의
  // 수명을 연장한다. waitUntil 없이 fire-and-forget으로 두면 서버리스
  // 인스턴스가 응답 직후 정지되면서 분석이 중간에 끊겨 ANALYZING에 영원히
  // 멈출 수 있다 (report-generation의 run/route.ts와 동일한 이유).
  waitUntil(recoverTemplate(template.id, buffer, file.type));

  return NextResponse.json({ data: publicTemplate(template) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PrivateStorageConfigurationError ? error.message : "양식 업로드 중 오류가 발생했습니다" }, { status: error instanceof PrivateStorageConfigurationError ? 503 : 500 });
  }
}

async function finalizeBlobTemplate(request: NextRequest, userId: string) {
  const { blobUrl, binding, fileName, mimeType, fileSize, name } =
    (await request.json()) as {
      blobUrl?: string;
      binding?: string;
      fileName?: string;
      mimeType?: string;
      fileSize?: number;
      name?: string;
    };

  if (!blobUrl || !fileName || !binding) {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  // 이 URL은 그대로 서버가 fetch(readStoredFile)하므로, 우리가 발급한
  // 업로드 자리인지 반드시 확인해야 한다 — 안 그러면 로그인한 사용자가
  // 서버에게 임의 주소를 대신 요청시킬 수 있다(SSRF).
  let claims;
  try {
    claims = verifyUploadGrant(binding, userId, "template");
    if (claims.fileName !== fileName || claims.mimeType !== mimeType || claims.fileSize !== fileSize) throw new Error("업로드 승인과 파일 정보가 다릅니다");
    await verifyUploadedBlob(blobUrl, claims.pathname, claims.fileSize, claims.mimeType);
  } catch {
    return NextResponse.json(
      { error: "잘못된 업로드 승인 또는 파일입니다" },
      { status: 400 }
    );
  }
  const existing = await prisma.template.findFirst({ where: { userId, fileUrl: blobUrl } });
  if (existing) {
    waitUntil(recoverTemplate(existing.id));
    return NextResponse.json({ data: publicTemplate(existing) });
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
      id: claims.uploadId,
      name: name || fileName.replace(/\.[^.]+$/, ""),
      originalName: fileName,
      fileType,
      fileUrl: blobUrl,
      fileSize: fileSize ?? 0,
      status: TemplateStatus.ANALYZING,
      structure: { __uploadRecovery: { ...queuedRecovery() } },
      userId,
      teamId,
    },
  }).catch(async (error) => {
    if (error?.code !== "P2002") throw error;
    const registered = await prisma.template.findFirst({ where: { id: claims.uploadId, userId, fileUrl: blobUrl } });
    if (!registered) throw error;
    return registered;
  });
  waitUntil(recoverTemplate(template.id));

  return NextResponse.json({ data: publicTemplate(template) }, { status: 201 });
}
