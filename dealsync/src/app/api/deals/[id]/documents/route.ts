import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractText, detectFileType } from "@/lib/extract";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: dealId } = await params;

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId: session.user.id },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const documents = await prisma.document.findMany({
    where: { dealId },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      fileName: true,
      originalName: true,
      fileType: true,
      fileSize: true,
      filePath: true,
      extractedText: true,
      uploadedAt: true,
    },
  });

  return NextResponse.json(documents);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: dealId } = await params;

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId: session.user.id },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "파일을 선택해주세요" },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "파일 크기는 20MB 이하여야 합니다" },
      { status: 400 }
    );
  }

  const fileType = detectFileType(file.name, file.type);
  if (!fileType) {
    return NextResponse.json(
      { error: "지원하지 않는 파일 형식입니다. PDF, DOCX, TXT 파일만 업로드 가능합니다." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Build a non-guessable storage path using a generated ID prefix
  const docId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedFileName = `${docId}_${sanitizedName}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", dealId);
  const absolutePath = path.join(uploadDir, storedFileName);
  const publicPath = `/uploads/${dealId}/${storedFileName}`;

  await mkdir(uploadDir, { recursive: true });
  await writeFile(absolutePath, buffer);

  // Extract text (may throw — handled below)
  let extractedText: string | null = null;
  try {
    extractedText = await extractText(buffer, fileType);
  } catch (err) {
    console.error("[documents] Text extraction failed:", err);
    // Store the document even if extraction fails
  }

  const document = await prisma.document.create({
    data: {
      dealId,
      fileName: storedFileName,
      originalName: file.name,
      fileType,
      fileSize: file.size,
      filePath: publicPath,
      extractedText,
    },
  });

  return NextResponse.json(document, { status: 201 });
}
