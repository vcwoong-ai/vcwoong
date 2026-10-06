import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamContext, dealWriteWhere } from "@/lib/team-access";
import { recoverDocument } from "@/lib/upload-recovery";

export const maxDuration = 240;
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  const { teamId, role } = await getUserTeamContext(session.user.id);
  const row = await prisma.document.findFirst({ where: { id: params.id, deal: dealWriteWhere(session.user.id, teamId, role) }, select: { id: true } });
  if (!row) return NextResponse.json({ error: "문서를 수정할 권한이 없습니다" }, { status: 404 });
  waitUntil(recoverDocument(row.id).catch(() => { console.warn("[UploadRecovery] 문서 복구 지연"); }));
  return NextResponse.json({ data: { scheduled: true } }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
}
