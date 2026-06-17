import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { ReportPageClient } from "./report-page-client";

export default async function ReportPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const report = await prisma.report.findFirst({
    where: {
      id: params.id,
      deal: { userId: session.user.id },
    },
    include: {
      deal: true,
      sections: { orderBy: { order: "asc" } },
    },
  });

  if (!report) notFound();

  return (
    <AppLayout title={`보고서: ${report.deal.companyName}`}>
      <ReportPageClient report={JSON.parse(JSON.stringify(report))} />
    </AppLayout>
  );
}
