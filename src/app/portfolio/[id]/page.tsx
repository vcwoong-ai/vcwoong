import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { PortfolioDetailClient } from "./portfolio-detail-client";

export default async function PortfolioDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const company = await prisma.portfolioCompany.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      kpis: { orderBy: { period: "asc" } },
      milestones: { orderBy: { dueDate: "asc" } },
      updates: { orderBy: { period: "desc" } },
      fund: { select: { id: true, name: true } },
      deal: { select: { id: true, name: true } },
    },
  });

  if (!company) notFound();

  return (
    <AppLayout title={`포트폴리오: ${company.companyName}`}>
      <PortfolioDetailClient
        key={company.id}
        company={JSON.parse(JSON.stringify(company))}
      />
    </AppLayout>
  );
}
