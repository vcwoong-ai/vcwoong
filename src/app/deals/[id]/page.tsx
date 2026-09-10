import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAIConfigured } from "@/lib/claude";
import { AppLayout } from "@/components/layout/app-layout";
import { DealDetailClient } from "./deal-detail-client";
import { getUserTeamContext, dealReadWhere, canEditResource } from "@/lib/team-access";
import { getUserSubscription, enumToPlanKey } from "@/lib/subscription";
import { hasFeature } from "@/lib/plans";

export default async function DealDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const subscription = await getUserSubscription(session.user.id);
  const currentPlan = subscription
    ? enumToPlanKey(subscription.subscriptionPlan)
    : "free";

  // 문서의 parsedText(최대 50만자)·섹션의 content는 이 페이지에서
  // 글자수/개수만 쓰고 본문은 렌더링하지 않는다(deal-detail-client.tsx
  // 참고) — sections는 select로 필요한 필드만 가져와 content 전송을
  // 피한다. parsedText는 "글자 수가 너무 적음" 경고 판단에 실제로 쓰이므로
  // (문서 목록 카드) 계속 가져온다.
  const deal = await prisma.deal.findFirst({
    where: { id: params.id, ...dealReadWhere(session.user.id, teamId) },
    include: {
      documents: {
        select: {
          id: true,
          name: true,
          type: true,
          size: true,
          mimeType: true,
          createdAt: true,
          parsedText: true,
          metadata: true,
        },
      },
      reports: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          agentType: true,
          status: true,
          createdAt: true,
          sections: {
            orderBy: { order: "asc" },
            select: { id: true, title: true, order: true, status: true },
          },
        },
      },
    },
  });

  if (!deal) notFound();

  const canEdit = canEditResource({
    ownerUserId: deal.userId,
    resourceTeamId: deal.teamId,
    currentUserId: session.user.id,
    currentTeamId: teamId,
    role,
  });

  return (
    <AppLayout title={deal.companyName}>
      <Suspense fallback={<div className="p-8 text-center text-gray-400">로딩 중...</div>}>
        <DealDetailClient
          deal={JSON.parse(JSON.stringify(deal))}
          demoMode={!isAIConfigured()}
          currentUserId={session.user.id}
          userTeamId={teamId}
          canUseTeam={hasFeature(currentPlan, "teamCollaboration")}
          canEdit={canEdit}
          userRole={role}
        />
      </Suspense>
    </AppLayout>
  );
}
