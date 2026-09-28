import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { MaDealsPageClient } from "./ma-deals-page-client";
import { getUserTeamContext } from "@/lib/team-access";
import { maDealReadWhere } from "@/lib/pe/ma-team-access";
import { MA_DEALS_PAGE_SIZE } from "@/lib/list-paging";

export default async function MaDealsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const where = maDealReadWhere(session.user.id, teamId);

  const [maDeals, total] = await Promise.all([
    prisma.mADeal.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: MA_DEALS_PAGE_SIZE,
    }),
    prisma.mADeal.count({ where }),
  ]);

  return (
    <AppLayout title="PE/M&A 딜">
      <MaDealsPageClient
        deals={JSON.parse(JSON.stringify(maDeals))}
        total={total}
        pageSize={MA_DEALS_PAGE_SIZE}
        currentUserId={session.user.id}
        currentTeamId={teamId}
        role={role}
      />
    </AppLayout>
  );
}
