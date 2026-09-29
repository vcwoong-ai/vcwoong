import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserTeamContext } from "@/lib/team-access";
import { prisma } from "@/lib/prisma";
import {
  linkDocumentToPEEvidenceRequest,
  updatePEEvidenceRequestStatus,
  type PEDDActor,
} from "@/lib/pe/pe-evidence-request-repository";
import { PE_EVIDENCE_REQUEST_STATUSES, toPEEvidenceRequestView } from "@/lib/pe/pe-ic-review-types";
import { z } from "zod";

const patchSchema = z.union([
  z.object({ action: z.literal("link_document"), documentId: z.string().min(1) }),
  z.object({ action: z.literal("update_status"), status: z.enum(PE_EVIDENCE_REQUEST_STATUSES) }),
]);

/**
 * PE Evidence Request 상태 변경(PR #109). URL의 [id](딜)와 [requestId]가
 * 실제로 같은 딜에 속하는지 먼저 확인한다 — 다른 딜의 requestId를 이
 * 딜의 URL로 조작하려는 시도를 막는다(§Step16 "no cross-deal leakage
 * through API response"의 쓰기 경로판).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; requestId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const actor: PEDDActor = { userId: session.user.id, teamId, role };

  const existing = await prisma.pEEvidenceRequest.findUnique({
    where: { id: params.requestId },
    include: { ddCase: { select: { maDealId: true } } },
  });
  if (!existing || existing.ddCase.maDealId !== params.id) {
    // 존재하지 않는 요청과 "다른 딜에 속한" 요청을 구분해서 응답하지
    // 않는다(IDOR 방지 — pe-dd-repository.ts와 동일 관례).
    return NextResponse.json({ error: "근거 요청을 찾을 수 없습니다" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다", issues: parsed.error.issues }, { status: 400 });
  }

  const result =
    parsed.data.action === "link_document"
      ? await linkDocumentToPEEvidenceRequest(actor, params.requestId, parsed.data.documentId)
      : await updatePEEvidenceRequestStatus(actor, params.requestId, parsed.data.status);

  if (result.status === "not_found") return NextResponse.json({ error: "쓰기 권한이 없습니다" }, { status: 404 });
  if (result.status === "invalid") return NextResponse.json({ error: "요청을 처리할 수 없습니다", issues: result.issues }, { status: 400 });

  let linkedDocumentName: string | null = null;
  if (result.data.linkedDocumentId) {
    const doc = await prisma.mADocument.findUnique({ where: { id: result.data.linkedDocumentId }, select: { name: true } });
    linkedDocumentName = doc?.name ?? null;
  }
  return NextResponse.json({ data: toPEEvidenceRequestView(result.data, linkedDocumentName) });
}
