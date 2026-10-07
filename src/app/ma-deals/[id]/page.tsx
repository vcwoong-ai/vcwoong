import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AppLayout } from "@/components/layout/app-layout";
import { MaDealDetailClient } from "./ma-deal-detail-client";
import { getUserTeamContext, canEditResource } from "@/lib/team-access";
import { loadMaDealIcContext } from "@/lib/pe/pe-ma-deal-context";
import { MeetingDealLink } from "@/components/meetings/meeting-deal-link";

export default async function MaDealDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { teamId, role } = await getUserTeamContext(session.user.id);

  // PR #108부터 딜 인가 확인 + 재무기간 조회/정규화 + PEDDCase 조회를
  // pe-ma-deal-context.ts(서버 전용 공용 로더)로 옮겼다 — 이 page.tsx와
  // IC Memo export route(/api/ma-deals/[id]/ic-memo)가 정확히 같은 조회
  // 시퀀스를 쓰도록 강제하기 위함(순수 추출 리팩토링, 동작 변경 없음).
  const result = await loadMaDealIcContext(session.user.id, teamId, params.id);
  if (result.status === "not_found") notFound();
  const { maDeal, periodsWithSummary, ddCase } = result.data;

  const canEdit = canEditResource({
    ownerUserId: maDeal.userId,
    resourceTeamId: maDeal.teamId,
    currentUserId: session.user.id,
    currentTeamId: teamId,
    role,
  });

  return (
    <AppLayout title={maDeal.companyName}>
      <MeetingDealLink track="pe" dealId={maDeal.id} />
      <MaDealDetailClient
        maDeal={JSON.parse(JSON.stringify(maDeal))}
        periods={JSON.parse(JSON.stringify(periodsWithSummary))}
        ddCase={ddCase ? JSON.parse(JSON.stringify(ddCase)) : undefined}
        canEdit={canEdit}
        currentUserId={session.user.id}
      />
    </AppLayout>
  );
}
