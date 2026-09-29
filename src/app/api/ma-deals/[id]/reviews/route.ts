import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserTeamContext } from "@/lib/team-access";
import { loadPECommitteePackForDeal } from "@/lib/pe/pe-committee-pack-loader";
import { listPEICReviewSnapshots } from "@/lib/pe/pe-ic-review-audit-repository";
import type { PEDDActor } from "@/lib/pe/pe-evidence-request-repository";

/**
 * PE IC Review 이력(PR #111) — 불변 스냅샷 목록. `PATCH /ic-review-signoff`
 * (PR #110)가 남긴 "지금 상태"와 달리, 이건 REVIEWED로 전환했던 매 순간을
 * 영구 보존한 기록이다 — 재검토해도 예전 스냅샷은 절대 바뀌지 않는다
 * (§6/§40). 쓰기 엔드포인트는 없다 — 스냅샷은 `PATCH /ic-review-signoff`가
 * 만든다(§27 "기존 라우트 재사용, 새 엔드포인트로 같은 동작 중복 금지").
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const actor: PEDDActor = { userId: session.user.id, teamId, role };

  const packResult = await loadPECommitteePackForDeal(actor, params.id);
  if (packResult.status === "not_found") return NextResponse.json({ error: "PE 딜을 찾을 수 없습니다" }, { status: 404 });

  const result = await listPEICReviewSnapshots(actor, params.id, packResult.data.pack.fingerprintBreakdown);
  if (result.status !== "ok") return NextResponse.json({ error: "PE 딜을 찾을 수 없습니다" }, { status: 404 });

  return NextResponse.json({ data: result.data, currentFingerprint: packResult.data.pack.fingerprint });
}
