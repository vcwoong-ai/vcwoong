import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { DealsPageClient } from "./deals-page-client";
import { getUserTeamContext, dealReadWhere } from "@/lib/team-access";

export default async function DealsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { teamId, role } = await getUserTeamContext(session.user.id);

  const deals = await prisma.deal.findMany({
    where: dealReadWhere(session.user.id, teamId),
    include: {
      documents: { select: { id: true } },
      reports: {
        select: { id: true, status: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <AppLayout title="딜 관리">
      <DealsPageClient
        deals={JSON.parse(JSON.stringify(deals))}
        currentUserId={session.user.id}
        currentTeamId={teamId}
        role={role}
      />
    </AppLayout>
  );
}
