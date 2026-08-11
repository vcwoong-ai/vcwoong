import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { getUserTeamContext, fundReadWhere } from "@/lib/team-access";
import { FundAnalyticsClient } from "./fund-analytics-client";

export default async function FundAnalyticsPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { teamId } = await getUserTeamContext(session.user.id);
  const fund = await prisma.fund.findFirst({
    where: { id: params.id, ...fundReadWhere(session.user.id, teamId) },
    select: { id: true, name: true, vintageYear: true },
  });

  if (!fund) notFound();

  return (
    <AppLayout title={`${fund.name} — 운용 심화 분석`}>
      <FundAnalyticsClient fundId={fund.id} fundName={fund.name} />
    </AppLayout>
  );
}
