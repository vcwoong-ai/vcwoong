import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unlink } from "fs/promises";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; docId: string } }
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

  const document = await prisma.document.findFirst({
    where: { id: params.docId, dealId: params.id },
  });
  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (document.localPath) {
    try {
      await unlink(document.localPath);
    } catch (err) {
      console.warn("Could not delete file:", err);
    }
  }

  await prisma.document.delete({ where: { id: params.docId } });
  return NextResponse.json({ message: "삭제되었습니다." });
}
