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

  const deal = await prisma.deal.findFirst({
    where: { id: params.id, ...dealReadWhere(session.user.id, teamId) },
    include: {
      documents: true,
      reports: {
        include: { sections: { orderBy: { order: "asc" } } },
        orderBy: { createdAt: "desc" },
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
