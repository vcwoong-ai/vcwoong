import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam, lockTeamManagementContext } from "@/lib/team-access";

const schema = z.object({ action: z.enum(["accept", "reject", "cancel"]) });
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "요청이 올바르지 않습니다" }, { status: 400 });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const invitation = await tx.teamInvitation.findUnique({ where: { id: params.id } });
      if (!invitation) return { error: "초대를 찾을 수 없습니다", status: 404 };
      const { action } = parsed.data;
      if (action !== "cancel" && invitation.targetUserId !== session.user.id) return { error: "이 초대에 응답할 권한이 없습니다", status: 403 };
      // 모든 초대 mutation은 팀 행을 먼저 잠가 취소/역할변경/멤버제거와 순서를 맞춘다.
      const current = await lockTeamManagementContext(tx, action === "cancel" ? session.user.id : invitation.invitedByUserId, invitation.teamId);
      if (action === "cancel" && (!current || !canManageTeam(current.role, current.isTeamOwner))) return { error: "초대 취소 권한이 없습니다", status: 403 };
      const fresh = await tx.teamInvitation.findUnique({ where: { id: params.id } });
      if (!fresh || fresh.status !== "PENDING") return { error: "이미 처리된 초대입니다", status: 409 };
      const now = new Date();
      if (fresh.expiresAt <= now) {
        await tx.teamInvitation.updateMany({ where: { id: fresh.id, status: "PENDING" }, data: { status: "EXPIRED", respondedAt: now } });
        return { error: "초대가 만료되었습니다", status: 409 };
      }
      if (action === "accept" && (!current || !canManageTeam(current.role, current.isTeamOwner))) return { error: "초대한 사용자의 팀 관리 권한이 해제되었습니다", status: 403 };
      const status = action === "accept" ? "ACCEPTED" : action === "reject" ? "REJECTED" : "CANCELLED";
      const changed = await tx.teamInvitation.updateMany({ where: { id: fresh.id, status: "PENDING", expiresAt: { gt: now } }, data: { status, respondedAt: now } });
      if (changed.count !== 1) return { error: "초대 상태가 변경되었습니다", status: 409 };
      if (action === "accept") {
        const joined = await tx.user.updateMany({ where: { id: session.user.id, teamId: null }, data: { teamId: fresh.teamId, teamRole: fresh.role } });
        if (joined.count !== 1) throw new Error("INVITATION_MEMBERSHIP_CONFLICT");
      }
      return { data: { id: fresh.id, status }, status: 200 };
    });
    return NextResponse.json(result.error ? { error: result.error } : { data: result.data }, { status: result.status });
  } catch (error) {
    if (error instanceof Error && error.message === "INVITATION_MEMBERSHIP_CONFLICT") return NextResponse.json({ error: "이미 다른 팀에 소속되어 있습니다", }, { status: 409 });
    return NextResponse.json({ error: "초대 처리에 실패했습니다" }, { status: 500 });
  }
}
