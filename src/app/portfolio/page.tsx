import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { PortfolioPageClient } from "./portfolio-page-client";
import { buildAlerts, calculatePortfolioMetrics } from "@/lib/portfolio";
import {
  getUserTeamContext,
  portfolioReadWhere,
  fundReadWhere,
  dealWriteWhere,
  canEditShared,
} from "@/lib/team-access";

export default async function PortfolioPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const canEdit = canEditShared(role);

  const [companies, funds, closedDeals] = await Promise.all([
    prisma.portfolioCompany.findMany({
      where: portfolioReadWhere(session.user.id, teamId),
      include: {
        kpis: { orderBy: { period: "asc" } },
        milestones: { orderBy: { dueDate: "asc" } },
        updates: { orderBy: { period: "desc" }, take: 2 },
        fund: { select: { id: true, name: true } },
      },
      orderBy: { investedAt: "desc" },
    }),
    prisma.fund.findMany({
      where: fundReadWhere(session.user.id, teamId),
      orderBy: { vintageYear: "desc" },
      select: { id: true, name: true, vintageYear: true, fundSize: true },
    }),
    // 승격 가능 딜 — 편집 권한이 있는 범위만 (심사역은 공유 딜 승격 불가)
    prisma.deal.findMany({
      where: {
        ...dealWriteWhere(session.user.id, teamId, role),
        stage: { in: ["IC_REVIEW", "CLOSED"] },
        portfolio: null,
      },
      select: {
        id: true,
        companyName: true,
        sector: true,
        investAmount: true,
        valuation: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const metrics = calculatePortfolioMetrics(companies);
  const alerts = buildAlerts(companies);

  return (
    <AppLayout title="포트폴리오 사후관리">
      <PortfolioPageClient
        companies={JSON.parse(JSON.stringify(companies))}
        funds={JSON.parse(JSON.stringify(funds))}
        promotableDeals={JSON.parse(JSON.stringify(closedDeals))}
        metrics={metrics}
        alerts={JSON.parse(JSON.stringify(alerts))}
        canEdit={canEdit}
      />
    </AppLayout>
  );
}
