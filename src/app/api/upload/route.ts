import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recoverDocument, queuedRecovery, LEGACY_PENDING_WARNING } from "@/lib/upload-recovery";
import { uploadFile, verifyUploadedBlob, PrivateStorageConfigurationError } from "@/lib/storage";
import { validateUploadFile, verifyUploadGrant, publicDocument } from "@/lib/upload-security";
import { DocumentType } from "@prisma/client";
import { randomUUID } from "crypto";
import {
  getUserTeamContext,
  dealWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const MIME_TYPE_MAP: Record<string, DocumentType> = {
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    DocumentType.IR_DECK,
  "application/vnd.ms-powerpoint": DocumentType.IR_DECK,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    DocumentType.OTHER,
  "application/pdf": DocumentType.OTHER,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    DocumentType.FINANCIAL,
  "application/vnd.ms-excel": DocumentType.FINANCIAL,
};

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // 4.5MB를 넘는 파일은 브라우저에서 Vercel Blob으로 직접 업로드된 뒤,
  // 여기엔 blobUrl만 JSON으로 전달돼 문서 레코드 생성 + 텍스트 파싱만 수행한다.
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    return finalizeBlobUpload(request, session.user.id);
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const dealId = formData.get("dealId") as string | null;
    const documentType = formData.get("type") as DocumentType | null;

    if (!file) {
      return NextResponse.json({ error: "파일을 선택해주세요" }, { status: 400 });
    }

    if (!dealId) {
      return NextResponse.json({ error: "딜 ID가 필요합니다" }, { status: 400 });
    }
    try { validateUploadFile({ fileName: file.name, mimeType: file.type, fileSize: file.size }, "deal"); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "잘못된 파일입니다" }, { status: 400 }); }
    if (documentType && !Object.values(DocumentType).includes(documentType)) return NextResponse.json({ error: "잘못된 문서 유형입니다" }, { status: 400 });

    // Verify deal write access (owner or team editor)
    const { teamId, role } = await getUserTeamContext(session.user.id);
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, ...dealWriteWhere(session.user.id, teamId, role) },
    });
    if (!deal) {
      return NextResponse.json(
        { error: permissionDeniedMessage("edit") },
        { status: 403 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "파일 크기는 50MB를 초과할 수 없습니다" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileId = randomUUID();
    const ext = file.name.split(".").pop() ?? "bin";
    const key = `deals/${dealId}/${fileId}.${ext}`;

    // Upload file to storage
    const url = await uploadFile(buffer, key, file.type);

    const docType =
      documentType ?? MIME_TYPE_MAP[file.type] ?? DocumentType.OTHER;

    const document = await prisma.document.create({
      data: {
        dealId,
        name: file.name,
        type: docType,
        url,
        size: file.size,
        mimeType: file.type,
        metadata: { warning: LEGACY_PENDING_WARNING, __uploadRecovery: { ...queuedRecovery() } },
      },
    });

    await recoverDocument(document.id, buffer);
    const latest = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    return NextResponse.json({ data: publicDocument(latest) }, { status: 201 });
  } catch (error) {
    console.error("Upload error");
    return NextResponse.json(
      { error: error instanceof PrivateStorageConfigurationError ? error.message : "파일 업로드 중 오류가 발생했습니다" },
      { status: error instanceof PrivateStorageConfigurationError ? 503 : 500 }
    );
  }
}

async function finalizeBlobUpload(request: NextRequest, userId: string) {
  try {
    const { blobUrl, binding, dealId, fileName, mimeType, fileSize, documentType } =
      (await request.json()) as {
        blobUrl?: string;
        binding?: string;
        dealId?: string;
        fileName?: string;
        mimeType?: string;
        fileSize?: number;
        documentType?: DocumentType;
      };

    if (!blobUrl || !dealId || !fileName || !binding) {
      return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
    }

    // 이 URL은 그대로 서버가 fetch(readStoredFile)하므로, 우리가 발급한
    // 업로드 자리(이 딜의 Blob 경로)인지 반드시 확인해야 한다 — 안 그러면
    // 로그인한 사용자가 서버에게 임의 주소를 대신 요청시킬 수 있다(SSRF).
    let claims;
    try {
      claims = verifyUploadGrant(binding, userId, "deal", dealId);
      if (claims.fileName !== fileName || claims.mimeType !== mimeType || claims.fileSize !== fileSize) throw new Error("업로드 승인과 파일 정보가 다릅니다");
      if (documentType && !Object.values(DocumentType).includes(documentType)) throw new Error("잘못된 문서 유형입니다");
    } catch {
      return NextResponse.json(
        { error: "잘못된 업로드 승인입니다" },
        { status: 400 }
      );
    }

    const { teamId, role } = await getUserTeamContext(userId);
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, ...dealWriteWhere(userId, teamId, role) },
    });
    if (!deal) {
      return NextResponse.json(
        { error: permissionDeniedMessage("edit") },
        { status: 403 }
      );
    }
    try { await verifyUploadedBlob(blobUrl, claims.pathname, claims.fileSize, claims.mimeType); }
    catch { return NextResponse.json({ error: "업로드된 파일을 확인할 수 없습니다" }, { status: 400 }); }
    const existing = await prisma.document.findFirst({ where: { dealId, url: blobUrl } });
    if (existing) {
      await recoverDocument(existing.id);
      const latest = await prisma.document.findUniqueOrThrow({ where: { id: existing.id } });
      return NextResponse.json({ data: publicDocument(latest) });
    }
    const registered = await prisma.document.create({ data: {
      id: claims.uploadId, dealId, name: claims.fileName,
      type: documentType ?? MIME_TYPE_MAP[claims.mimeType] ?? DocumentType.OTHER,
      url: blobUrl, size: claims.fileSize, mimeType: claims.mimeType,
      metadata: { warning: LEGACY_PENDING_WARNING, __uploadRecovery: { ...queuedRecovery() } },
    } }).catch(async (error) => {
      if (error?.code !== "P2002") throw error;
      const row = await prisma.document.findFirst({ where: { id: claims.uploadId, dealId, url: blobUrl } });
      if (!row) throw error;
      return row;
    });
    await recoverDocument(registered.id);
    const latest = await prisma.document.findUniqueOrThrow({ where: { id: registered.id } });
    return NextResponse.json({ data: publicDocument(latest) }, { status: 201 });
  } catch {
    console.error("Upload finalize error");
    return NextResponse.json(
      { error: "파일 업로드 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
