import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { PortfolioDetailClient } from "./portfolio-detail-client";
import {
  getUserTeamContext,
  portfolioReadWhere,
  canEditResource,
} from "@/lib/team-access";
import { getUserSubscription, enumToPlanKey } from "@/lib/subscription";
import { hasFeature } from "@/lib/plans";

export default async function PortfolioDetailPage({
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

  const company = await prisma.portfolioCompany.findFirst({
    where: { id: params.id, ...portfolioReadWhere(session.user.id, teamId) },
    include: {
      kpis: { orderBy: { period: "asc" } },
      milestones: { orderBy: { dueDate: "asc" } },
      updates: { orderBy: { period: "desc" } },
      fund: { select: { id: true, name: true } },
      deal: { select: { id: true, name: true } },
    },
  });

  if (!company) notFound();

  const canEdit = canEditResource({
    ownerUserId: company.userId,
    resourceTeamId: company.teamId,
    currentUserId: session.user.id,
    currentTeamId: teamId,
    role,
  });

  return (
    <AppLayout title={`포트폴리오: ${company.companyName}`}>
      <PortfolioDetailClient
        key={company.id}
        company={JSON.parse(JSON.stringify(company))}
        canEdit={canEdit}
        isOwner={company.userId === session.user.id}
        userTeamId={teamId}
        canUseTeam={hasFeature(currentPlan, "teamCollaboration")}
        userRole={role}
      />
    </AppLayout>
  );
}
