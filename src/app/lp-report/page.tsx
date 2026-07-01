import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { LPReportClient } from "./lp-report-client";

export default async function LPReportPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const deals = await prisma.deal.findMany({
    where: { userId: session.user.id, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      companyName: true,
      sector: true,
      stage: true,
      investAmount: true,
      valuation: true,
      investRound: true,
      createdAt: true,
    },
  });

  return (
    <AppLayout title="LP 리포팅">
      <LPReportClient deals={JSON.parse(JSON.stringify(deals))} />
    </AppLayout>
  );
}
