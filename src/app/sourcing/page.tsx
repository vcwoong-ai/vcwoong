import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { SourcingPageClient } from "./sourcing-page-client";
import { getUserTeamContext, inboundReadWhere, canEditShared } from "@/lib/team-access";
import { SOURCING_PAGE_SIZE, resolveListLimit } from "@/lib/list-paging";

export default async function SourcingPage({
  searchParams,
}: {
  searchParams: { limit?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const where = inboundReadWhere(session.user.id, teamId);
  // 인박스는 자동 인입이라 행이 가장 빨리 쌓이는 목록이다 — 상한 없이
  // 전부 조회하면 시간이 지날수록 이 화면만 계속 무거워진다.
  const limit = resolveListLimit(searchParams?.limit, SOURCING_PAGE_SIZE);

  const [leads, total] = await Promise.all([
    prisma.inboundDeal.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: limit,
    }),
    prisma.inboundDeal.count({ where }),
  ]);

  return (
    <AppLayout title="딜소싱">
      <SourcingPageClient
        leads={JSON.parse(JSON.stringify(leads))}
        total={total}
        nextLimit={leads.length + SOURCING_PAGE_SIZE}
        currentUserId={session.user.id}
        canEditShared={canEditShared(role)}
        role={role}
      />
    </AppLayout>
  );
}
