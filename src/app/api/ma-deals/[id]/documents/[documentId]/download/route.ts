import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamContext } from "@/lib/team-access";
import { maDealReadWhere } from "@/lib/pe/ma-team-access";
import { readStoredFile } from "@/lib/storage";
import { attachmentHeaders } from "@/lib/upload-security";

export async function GET(_request: Request, { params }: { params: { id: string; documentId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  const { teamId } = await getUserTeamContext(session.user.id);
  const document = await prisma.mADocument.findFirst({ where: { id: params.documentId, maDealId: params.id, maDeal: maDealReadWhere(session.user.id, teamId) }, select: { name: true, url: true } });
  if (!document) return NextResponse.json({ error: "문서를 찾을 수 없습니다" }, { status: 404 });
  const bytes = await readStoredFile(document.url);
  if (!bytes) return NextResponse.json({ error: "파일을 읽을 수 없습니다" }, { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: attachmentHeaders(document.name) });
}
