import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseDocument } from "@/lib/document-parser";
import { extractDocumentImages } from "@/lib/document-images";
import { uploadFile, readStoredFile } from "@/lib/storage";
import { DocumentType } from "@prisma/client";
import { randomUUID } from "crypto";
import {
  getUserTeamContext,
  dealWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * DOCX/PPTX면 내장 이미지를 꺼내 각각 별도 Blob으로 올리고 URL 목록을
 * 돌려준다. 보고서 내보내기(PPTX)에서 첨부 이미지로 재활용한다.
 *
 * 이미지 추출·업로드가 실패해도 문서 등록 자체는 막지 않는다 — 텍스트
 * 파싱(AI 인풋의 핵심)과 달리 이미지는 있으면 좋은 보너스라, 실패를
 * 삼키고 빈 배열로 계속 진행한다.
 */
async function extractAndUploadImages(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  dealId: string,
  fileId: string
): Promise<Array<{ url: string; mimeType: string }>> {
  try {
    const images = await extractDocumentImages(buffer, mimeType, filename);
    const uploaded = await Promise.all(
      images.map(async (img, i) => {
        const ext = img.mimeType.split("/")[1] ?? "png";
        const key = `deals/${dealId}/images/${fileId}-${i}.${ext}`;
        const url = await uploadFile(img.buffer, key, img.mimeType);
        return { url, mimeType: img.mimeType };
      })
    );
    return uploaded;
  } catch (error) {
    console.warn("[Upload] 이미지 업로드 실패(무시):", error);
    return [];
  }
}

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

    // Parse document text
    let parsedText: string | undefined;
    let metadata: Record<string, unknown> = {};

    try {
      const parsed = await parseDocument(buffer, file.type, file.name);
      parsedText = parsed.text;
      metadata = parsed.metadata as Record<string, unknown>;
      if (parsed.warning) metadata.warning = parsed.warning;
    } catch (parseError) {
      console.warn("Document parsing failed:", parseError);
      metadata.warning =
        "문서에서 텍스트를 추출하지 못했습니다. AI가 이 자료의 내용을 인식할 수 없습니다.";
    }

    const images = await extractAndUploadImages(buffer, file.type, file.name, dealId, fileId);
    if (images.length > 0) metadata.images = images;

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
        parsedText,
        metadata: metadata as import("@prisma/client").Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ data: document }, { status: 201 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "파일 업로드 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

async function finalizeBlobUpload(request: NextRequest, userId: string) {
  try {
    const { blobUrl, dealId, fileName, mimeType, fileSize, documentType } =
      (await request.json()) as {
        blobUrl?: string;
        dealId?: string;
        fileName?: string;
        mimeType?: string;
        fileSize?: number;
        documentType?: DocumentType;
      };

    if (!blobUrl || !dealId || !fileName) {
      return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
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

    const mime = mimeType ?? "application/octet-stream";
    let parsedText: string | undefined;
    let metadata: Record<string, unknown> = {};

    try {
      const buffer = await readStoredFile(blobUrl);
      if (buffer) {
        const parsed = await parseDocument(buffer, mime, fileName);
        parsedText = parsed.text;
        metadata = parsed.metadata as Record<string, unknown>;
        if (parsed.warning) metadata.warning = parsed.warning;

        const images = await extractAndUploadImages(
          buffer,
          mime,
          fileName,
          dealId,
          randomUUID()
        );
        if (images.length > 0) metadata.images = images;
      } else {
        metadata.warning =
          "업로드된 파일을 읽지 못했습니다. AI가 이 자료의 내용을 인식할 수 없습니다.";
      }
    } catch (parseError) {
      console.warn("Document parsing failed:", parseError);
      metadata.warning =
        "문서에서 텍스트를 추출하지 못했습니다. AI가 이 자료의 내용을 인식할 수 없습니다.";
    }

    const docType = documentType ?? MIME_TYPE_MAP[mime] ?? DocumentType.OTHER;

    const document = await prisma.document.create({
      data: {
        dealId,
        name: fileName,
        type: docType,
        url: blobUrl,
        size: fileSize ?? 0,
        mimeType: mime,
        parsedText,
        metadata: metadata as import("@prisma/client").Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ data: document }, { status: 201 });
  } catch (error) {
    console.error("Upload finalize error:", error);
    return NextResponse.json(
      { error: "파일 업로드 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
