import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamContext } from "@/lib/team-access";
import { maDealReadWhere } from "@/lib/pe/ma-team-access";
import { documentTextWindow, DOCUMENT_TEXT_OFFSET_MAX } from "@/lib/document-text";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const offsetSchema = z.string().regex(/^\d{1,6}$/).transform(Number).pipe(z.number().int().max(DOCUMENT_TEXT_OFFSET_MAX));

/** One authorized document, bounded parser text. No raw storage URL/fetch or AI. */
export async function GET(request: NextRequest, { params }: { params: { id: string; documentId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401, headers });

  const { teamId } = await getUserTeamContext(session.user.id);
  const document = await prisma.mADocument.findFirst({
    where: { id: params.documentId, maDealId: params.id, maDeal: maDealReadWhere(session.user.id, teamId) },
    select: { parsedText: true },
  });
  // Scope is checked before query errors; missing and forbidden have identical bodies.
  if (!document) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  const offset = offsetSchema.safeParse(request.nextUrl.searchParams.get("offset") ?? "0");
  if (!offset.success) return NextResponse.json({ error: "조회 위치가 올바르지 않습니다" }, { status: 400, headers });

  return NextResponse.json({ data: documentTextWindow(document.parsedText, offset.data) }, { headers });
}
