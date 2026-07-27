import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { LPReportClient } from "./lp-report-client";
import { computeLpFigures } from "@/lib/lp-report";

export default async function LPReportPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const funds = await prisma.fund.findMany({
    where: { userId: session.user.id },
    include: {
      companies: {
        include: {
          kpis: { orderBy: { period: "asc" } },
          milestones: true,
          updates: { orderBy: { period: "desc" }, take: 1 },
        },
      },
      lpReports: { orderBy: { period: "desc" } },
    },
    orderBy: { vintageYear: "desc" },
  });

  const view = funds.map((f) => ({
    id: f.id,
    name: f.name,
    vintageYear: f.vintageYear,
    fundSize: f.fundSize,
    paidIn: f.paidIn,
    companyCount: f.companies.length,
    computed: computeLpFigures(
      {
        name: f.name,
        vintageYear: f.vintageYear,
        fundSize: f.fundSize,
        paidIn: f.paidIn,
        managementFee: f.managementFee,
      },
      f.companies
    ),
    reports: f.lpReports.map((r) => ({
      id: r.id,
      period: r.period,
      title: r.title,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    })),
  }));

  return (
    <AppLayout title="LP 리포팅">
      <LPReportClient funds={JSON.parse(JSON.stringify(view))} />
    </AppLayout>
  );
}
