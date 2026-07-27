import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { TemplateCompareClient } from "./template-compare-client";

export default async function TemplateComparePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { reportId?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const template = await prisma.template.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true, name: true, fileType: true },
  });
  if (!template) notFound();

  const reports = await prisma.report.findMany({
    where: { deal: { userId: session.user.id }, sections: { some: {} } },
    select: {
      id: true,
      title: true,
      deal: { select: { companyName: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });

  return (
    <AppLayout title="양식 재현 비교">
      <TemplateCompareClient
        template={template}
        reports={reports.map((r) => ({
          id: r.id,
          label: `${r.deal.companyName} · ${r.title}`,
        }))}
        initialReportId={searchParams.reportId ?? null}
      />
    </AppLayout>
  );
}
