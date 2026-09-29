import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserTeamContext } from "@/lib/team-access";
import { loadPECommitteePackForDeal } from "@/lib/pe/pe-committee-pack-loader";
import { getPEICReviewSnapshot } from "@/lib/pe/pe-ic-review-audit-repository";
import type { PEDDActor } from "@/lib/pe/pe-evidence-request-repository";

/**
 * PE IC Review 스냅샷 상세(PR #111). URL의 [id](딜)와 [reviewId](스냅샷)가
 * 실제로 같은 딜에 속하는지 repository가 확인한다 — 다른 딜의 reviewId를
 * 이 딜의 URL로 조작하려는 시도는 존재 여부를 구분하지 않고 not_found로
 * 응답한다(§25 IDOR, pe-dd-repository.ts와 동일 관례).
 */
export async function GET(request: NextRequest, { params }: { params: { id: string; reviewId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const actor: PEDDActor = { userId: session.user.id, teamId, role };

  const packResult = await loadPECommitteePackForDeal(actor, params.id);
  if (packResult.status === "not_found") return NextResponse.json({ error: "PE 딜을 찾을 수 없습니다" }, { status: 404 });

  const result = await getPEICReviewSnapshot(actor, params.id, params.reviewId, packResult.data.pack.fingerprintBreakdown);
  if (result.status !== "ok") return NextResponse.json({ error: "검토 스냅샷을 찾을 수 없습니다" }, { status: 404 });

  return NextResponse.json({ data: result.data });
}
