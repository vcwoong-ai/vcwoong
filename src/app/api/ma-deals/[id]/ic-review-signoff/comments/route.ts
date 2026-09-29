import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserTeamContext } from "@/lib/team-access";
import { prisma } from "@/lib/prisma";
import { addPEICReviewComment, listPEICReviewComments, type PEDDActor } from "@/lib/pe/pe-ic-review-signoff-repository";
import { toPEICReviewCommentView, PE_IC_REVIEW_COMMENT_TARGET_TYPES } from "@/lib/pe/pe-ic-review-signoff-types";
import { z } from "zod";

const createSchema = z.object({
  targetType: z.enum(PE_IC_REVIEW_COMMENT_TARGET_TYPES),
  targetId: z.string().optional(),
  text: z.string().min(1),
});

/**
 * PE IC Review 코멘트(PR #110). 의견/메모일 뿐 canonical 재무 데이터를
 * 바꾸지 않는다(§Step10 — repository는 PEICReviewComment 외 어떤 테이블도
 * 쓰지 않는다). authorId는 항상 세션의 userId다 — 요청 바디로 받지 않는다.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const actor: PEDDActor = { userId: session.user.id, teamId, role };

  const targetTypeParam = request.nextUrl.searchParams.get("targetType");
  const targetIdParam = request.nextUrl.searchParams.get("targetId");
  const targetType = PE_IC_REVIEW_COMMENT_TARGET_TYPES.includes(targetTypeParam as (typeof PE_IC_REVIEW_COMMENT_TARGET_TYPES)[number])
    ? (targetTypeParam as (typeof PE_IC_REVIEW_COMMENT_TARGET_TYPES)[number])
    : undefined;

  const result = await listPEICReviewComments(actor, params.id, targetType ? { targetType, targetId: targetIdParam } : undefined);
  if (result.status !== "ok") return NextResponse.json({ error: "PE 딜을 찾을 수 없습니다" }, { status: 404 });

  return NextResponse.json({ data: result.data.map(toPEICReviewCommentView) });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const actor: PEDDActor = { userId: session.user.id, teamId, role };

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다", issues: parsed.error.issues }, { status: 400 });
  }

  const result = await addPEICReviewComment(actor, params.id, parsed.data);
  if (result.status === "not_found") return NextResponse.json({ error: "쓰기 권한이 없습니다" }, { status: 404 });
  if (result.status === "invalid") return NextResponse.json({ error: "입력값이 올바르지 않습니다", issues: result.issues }, { status: 400 });

  const author = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true } });
  return NextResponse.json(
    { data: toPEICReviewCommentView({ ...result.data, author: author ?? { name: null, email: null } }) },
    { status: 201 }
  );
}
