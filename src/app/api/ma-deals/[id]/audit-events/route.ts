import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserTeamContext } from "@/lib/team-access";
import { listPEICAuditEvents } from "@/lib/pe/pe-ic-review-audit-repository";
import type { PEDDActor } from "@/lib/pe/pe-evidence-request-repository";

/**
 * PE IC Audit Event 타임라인(PR #111) — append-only, 경계 있는
 * 페이지네이션(§32 "전체 감사 이력을 기본으로 로드하지 않는다"). 최신
 * 30건을 기본으로 주고, `before`(ISO 타임스탬프) 쿼리로 그 이전 구간을
 * 더 가져올 수 있다. 쓰기 엔드포인트는 없다 — 이벤트는 서명/코멘트/근거
 * 요청 라우트가 각자 트랜잭션 안에서 기록한다(§27 "새 엔드포인트로 같은
 * 동작 중복 금지").
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const actor: PEDDActor = { userId: session.user.id, teamId, role };

  const beforeParam = request.nextUrl.searchParams.get("before");
  const before = beforeParam && !Number.isNaN(Date.parse(beforeParam)) ? new Date(beforeParam) : undefined;
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam && !Number.isNaN(Number(limitParam)) ? Number(limitParam) : undefined;

  const result = await listPEICAuditEvents(actor, params.id, { before, limit });
  if (result.status !== "ok") return NextResponse.json({ error: "PE 딜을 찾을 수 없습니다" }, { status: 404 });

  return NextResponse.json({ data: result.data });
}
