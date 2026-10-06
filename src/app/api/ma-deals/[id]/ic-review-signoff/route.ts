import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserTeamContext } from "@/lib/team-access";
import { prisma } from "@/lib/prisma";
import { loadPECommitteePackForDeal } from "@/lib/pe/pe-committee-pack-loader";
import { listPEICReviews, upsertOwnPEICReview, type PEDDActor } from "@/lib/pe/pe-ic-review-signoff-repository";
import { toPEICReviewView } from "@/lib/pe/pe-ic-review-signoff-types";
import { PE_IC_REVIEW_SIGNOFF_STATUSES } from "@/lib/pe/pe-ic-review-signoff-types";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(PE_IC_REVIEW_SIGNOFF_STATUSES),
  comment: z.string().optional(),
  expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).refine(input => input.status !== "REVIEWED" || !!input.expectedFingerprint, { message: "검토한 자료 버전이 필요합니다", path: ["expectedFingerprint"] });

/**
 * PE IC Review Sign-off(PR #110). GET은 이 딜의 모든 리뷰어 서명 상태를
 * 반환한다(팀원 서로의 진행 상황을 봐야 함 — 조회는 `maDealReadWhere()`
 * 기준이라 ANALYST도 볼 수 있다). PATCH는 **actor.userId 자신의** 리뷰
 * 행만 만들거나 바꾼다 — 요청 바디에 reviewerId를 받지 않는다(§Step18
 * "client cannot manipulate reviewerId/mark another reviewer reviewed"의
 * 핵심 방어 — 애초에 그런 파라미터 자리가 없음).
 *
 * fingerprint는 매 요청마다 `loadPECommitteePackForDeal()`로 새로 계산한다
 * — 클라이언트가 보낸 값을 절대 신뢰하지 않는다(§Step18 10).
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const actor: PEDDActor = { userId: session.user.id, teamId, role };

  const packResult = await loadPECommitteePackForDeal(actor, params.id);
  if (packResult.status === "not_found") return NextResponse.json({ error: "PE 딜을 찾을 수 없습니다" }, { status: 404 });

  const reviewsResult = await listPEICReviews(actor, params.id);
  if (reviewsResult.status !== "ok") return NextResponse.json({ error: "PE 딜을 찾을 수 없습니다" }, { status: 404 });

  const breakdown = packResult.data.pack.fingerprintBreakdown;
  const data = reviewsResult.data.map((row) => toPEICReviewView(row, breakdown));
  return NextResponse.json({ data, fingerprint: breakdown.overall });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const actor: PEDDActor = { userId: session.user.id, teamId, role };

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다" }, { status: 400 });
  }

  const result = await upsertOwnPEICReview(actor, params.id, parsed.data);
  if (result.status === "not_found") return NextResponse.json({ error: "쓰기 권한이 없습니다" }, { status: 404 });
  if (result.status === "invalid") return NextResponse.json({ error: "요청을 처리할 수 없습니다", issues: result.issues }, { status: 400 });
  if (result.status === "conflict") return NextResponse.json({ error: "검토 자료가 변경되었거나 다른 검토가 진행 중입니다. 자료를 다시 불러와 확인한 뒤 검토해 주세요." }, { status: 409 });
  const breakdown = result.breakdown;

  const reviewer = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true } });
  return NextResponse.json({
    data: toPEICReviewView({ ...result.data, reviewer: reviewer ?? { name: null, email: null } }, breakdown),
  });
  } catch {
    return NextResponse.json({ error: "검토 상태를 저장하지 못했습니다. 현재 검토 상태를 다시 확인해 주세요." }, { status: 500 });
  }
}
