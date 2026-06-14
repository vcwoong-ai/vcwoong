import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unlink } from "fs/promises";
import path from "path";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: dealId, docId } = await params;

  // Verify ownership via deal
  const document = await prisma.document.findFirst({
    where: {
      id: docId,
      dealId,
      deal: { userId: session.user.id },
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Remove from filesystem
  try {
    const absolutePath = path.join(process.cwd(), "public", document.filePath);
    await unlink(absolutePath);
  } catch (err) {
    // Log but do not block DB cleanup if the file is already gone
    console.warn("[documents] File delete failed:", err);
  }

  await prisma.document.delete({ where: { id: docId } });

  return new NextResponse(null, { status: 204 });
}
