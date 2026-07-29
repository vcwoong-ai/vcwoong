import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { ReportPageClient } from "./report-page-client";
import { getUserTeamContext, reportReadWhere, canEditResource } from "@/lib/team-access";

export default async function ReportPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { teamId, role } = await getUserTeamContext(session.user.id);

  const report = await prisma.report.findFirst({
    where: {
      id: params.id,
      ...reportReadWhere(session.user.id, teamId),
    },
    include: {
      deal: true,
      sections: { orderBy: { order: "asc" } },
    },
  });

  if (!report) notFound();

  const canEdit = canEditResource({
    ownerUserId: report.deal.userId,
    resourceTeamId: report.deal.teamId,
    currentUserId: session.user.id,
    currentTeamId: teamId,
    role,
  });

  return (
    <AppLayout title={`보고서: ${report.deal.companyName}`}>
      <ReportPageClient
        key={report.id}
        report={JSON.parse(JSON.stringify(report))}
        canEdit={canEdit}
      />
    </AppLayout>
  );
}
