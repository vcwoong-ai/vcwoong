import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { PortfolioPageClient } from "./portfolio-page-client";
import { buildAlerts, calculatePortfolioMetrics } from "@/lib/portfolio";

export default async function PortfolioPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const [companies, funds, closedDeals] = await Promise.all([
    prisma.portfolioCompany.findMany({
      where: { userId: session.user.id },
      include: {
        kpis: { orderBy: { period: "asc" } },
        milestones: { orderBy: { dueDate: "asc" } },
        updates: { orderBy: { period: "desc" }, take: 2 },
        fund: { select: { id: true, name: true } },
      },
      orderBy: { investedAt: "desc" },
    }),
    prisma.fund.findMany({
      where: { userId: session.user.id },
      orderBy: { vintageYear: "desc" },
      select: { id: true, name: true, vintageYear: true, fundSize: true },
    }),
    // 아직 포트폴리오로 승격되지 않은 종료 단계 딜
    prisma.deal.findMany({
      where: {
        userId: session.user.id,
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
      />
    </AppLayout>
  );
}
