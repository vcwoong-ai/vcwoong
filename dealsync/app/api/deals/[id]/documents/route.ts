import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { extractText } from "@/lib/extract";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deal = await prisma.deal.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const documents = await prisma.document.findMany({
    where: { dealId: params.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(documents);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deal = await prisma.deal.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const docType = (formData.get("type") as string) || "OTHER";

  if (!file) {
    return NextResponse.json({ error: "파일을 선택해주세요." }, { status: 400 });
  }

  const allowedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "text/plain",
  ];

  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|docx|xlsx|pptx|doc|txt)$/i)) {
    return NextResponse.json(
      { error: "지원하지 않는 파일 형식입니다. PDF, DOCX, XLSX, PPTX만 가능합니다." },
      { status: 400 }
    );
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const uploadsDir = path.join(process.cwd(), "uploads", params.id);
  await mkdir(uploadsDir, { recursive: true });

  const safeFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const filePath = path.join(uploadsDir, safeFileName);
  await writeFile(filePath, buffer);

  let extractedText: string | null = null;
  try {
    extractedText = await extractText(buffer, file.name, file.type);
  } catch (err) {
    console.error("Text extraction failed:", err);
  }

  const document = await prisma.document.create({
    data: {
      dealId: params.id,
      type: docType,
      fileName: file.name,
      localPath: filePath,
      mimeType: file.type,
      fileSize: buffer.length,
      extractedText,
    },
  });

  return NextResponse.json(document, { status: 201 });
}
