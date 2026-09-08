import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { TemplatesClient } from "./templates-client";
import { getUserTeamContext, templateReadWhere } from "@/lib/team-access";
import { getUserSubscription, enumToPlanKey } from "@/lib/subscription";
import { hasFeature } from "@/lib/plans";
import { TEMPLATES_PAGE_SIZE, resolveListLimit } from "@/lib/list-paging";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: { limit?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { teamId } = await getUserTeamContext(session.user.id);
  const subscription = await getUserSubscription(session.user.id);
  const currentPlan = subscription
    ? enumToPlanKey(subscription.subscriptionPlan)
    : "free";

  const where = templateReadWhere(session.user.id, teamId);
  const limit = resolveListLimit(searchParams?.limit, TEMPLATES_PAGE_SIZE);

  const [templatesRaw, total] = await Promise.all([
    prisma.template.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.template.count({ where }),
  ]);

  // Serialize for client component
  const templates = JSON.parse(JSON.stringify(templatesRaw));

  return (
    <AppLayout title="양식 관리">
      <TemplatesClient
        templates={templates}
        total={total}
        nextLimit={templatesRaw.length + TEMPLATES_PAGE_SIZE}
        currentUserId={session.user.id}
        userTeamId={teamId}
        canUseTeam={hasFeature(currentPlan, "teamCollaboration")}
      />
    </AppLayout>
  );
}
