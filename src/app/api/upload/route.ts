import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseDocument } from "@/lib/document-parser";
import { uploadFile } from "@/lib/storage";
import { DocumentType } from "@prisma/client";
import { randomUUID } from "crypto";

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

    // Verify deal ownership
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: session.user.id },
    });
    if (!deal) {
      return NextResponse.json(
        { error: "딜을 찾을 수 없습니다" },
        { status: 404 }
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
    } catch (parseError) {
      console.warn("Document parsing failed:", parseError);
    }

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
