import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomUUID } from "node:crypto";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamContext } from "@/lib/team-access";
import { maDealWriteWhere } from "@/lib/pe/ma-team-access";
import { readStoredFile } from "@/lib/storage";
import { parseDocument } from "@/lib/document-parser";
import { PRIVATE_RESPONSE_HEADERS } from "@/lib/private-response-headers";
import { createPrismaPEUploadRepository, PEParseRecoveryService, PEUploadError } from "@/lib/pe/pe-document-upload";

export const maxDuration = 60;

async function emptyInput(request: NextRequest): Promise<boolean> {
  if (!request.body) return true;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1024) { await reader.cancel(); return false; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!length) return true;
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) return false;
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return !!body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 0;
  } catch { return false; }
}

/** Reparse only a confirmed existing original. Client file bytes or URLs are never accepted. */
export async function POST(request: NextRequest, { params }: { params: { id: string; documentId: string } }) {
  const headers = PRIVATE_RESPONSE_HEADERS;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401, headers });
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "요청 출처를 확인해 주세요." }, { status: 403, headers });
    if (![params.id, params.documentId].every(id => /^[A-Za-z0-9_-]{1,200}$/.test(id))) return NextResponse.json({ error: "자료를 확인해 주세요." }, { status: 400, headers });
    const { teamId, role } = await getUserTeamContext(session.user.id);
    const deal = await prisma.mADeal.findFirst({ where: { id: params.id, ...maDealWriteWhere(session.user.id, teamId, role) }, select: { id: true } });
    if (!deal) return NextResponse.json({ error: "자료를 찾을 수 없거나 편집 권한이 없습니다." }, { status: 404, headers });
    if (!await emptyInput(request)) return NextResponse.json({ error: "저장된 자료의 텍스트 추출만 요청할 수 있습니다." }, { status: 400, headers });
    const service = new PEParseRecoveryService({ repository: createPrismaPEUploadRepository(prisma),
      read: readStoredFile, parse: parseDocument, now: () => new Date(), newToken: randomUUID });
    const data = await service.retry({ dealId: params.id, documentId: params.documentId });
    return NextResponse.json({ data }, { status: data.status === "processing" ? 202 : 200, headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PEUploadError ? error.message : "텍스트 추출 상태를 확인하지 못했습니다. 자료 목록을 다시 조회해 주세요." },
      { status: error instanceof PEUploadError ? error.status : 503, headers });
  }
}
