import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TopBar from "@/components/layout/TopBar";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const [deals, reports] = await Promise.all([
    prisma.deal.findMany({
      where: { userId: session.user.id },
      include: {
        _count: { select: { documents: true, reports: true } },
        reports: { orderBy: { generatedAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.report.findMany({
      where: { deal: { userId: session.user.id } },
      include: { deal: { select: { companyName: true, sector: true } } },
      orderBy: { generatedAt: "desc" },
      take: 5,
    }),
  ]);

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  type DealWithCounts = typeof deals[number];
  const thisMonthDeals = deals.filter(
    (d: DealWithCounts) => new Date(d.createdAt) >= thisMonthStart
  ).length;

  const stats = {
    totalDeals: deals.length,
    thisMonthDeals,
    totalReports: reports.length,
    pipeline: {
      검토중: deals.filter((d: DealWithCounts) => d.status === "검토중").length,
      심층심사: deals.filter((d: DealWithCounts) => d.status === "심층심사").length,
      투심: deals.filter((d: DealWithCounts) => d.status === "투심").length,
      투자완료: deals.filter((d: DealWithCounts) => d.status === "투자완료").length,
    },
  };

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="대시보드"
        subtitle={`안녕하세요, ${session.user.name || "심사역"}님`}
        action={{ label: "새 딜 추가", href: "/deals/new" }}
      />
      <div className="flex-1 overflow-auto p-6">
        <DashboardClient
          deals={JSON.parse(JSON.stringify(deals))}
          recentReports={JSON.parse(JSON.stringify(reports))}
          stats={stats}
        />
      </div>
    </div>
  );
}
