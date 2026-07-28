import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PrintLpReportClient } from "./print-lp-report-client";
import { getUserTeamContext, lpReportReadWhere } from "@/lib/team-access";

export default async function LPReportPrintPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { teamId } = await getUserTeamContext(session.user.id);
  const report = await prisma.lpReport.findFirst({
    where: { id: params.id, ...lpReportReadWhere(session.user.id, teamId) },
    include: { fund: { select: { name: true, vintageYear: true } } },
  });

  if (!report) notFound();

  return (
    <PrintLpReportClient
      report={{
        id: report.id,
        title: report.title,
        period: report.period,
        content: report.content,
        fundName: report.fund.name,
        vintageYear: report.fund.vintageYear,
        createdAt: report.createdAt.toISOString(),
      }}
    />
  );
}
