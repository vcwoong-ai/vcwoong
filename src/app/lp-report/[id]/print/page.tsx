import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PrintLpReportClient } from "./print-lp-report-client";

/**
 * 인쇄 전용 LP 리포트 뷰.
 * IC 보고서 인쇄 뷰와 동일하게 브라우저 "PDF로 저장"을 사용한다.
 */
export default async function LpReportPrintPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const report = await prisma.lpReport.findFirst({
    where: { id: params.id, fund: { userId: session.user.id } },
    include: {
      fund: { select: { name: true, vintageYear: true, fundSize: true } },
    },
  });

  if (!report) notFound();

  return (
    <PrintLpReportClient
      report={{
        id: report.id,
        title: report.title,
        period: report.period,
        content: report.content,
        createdAt: report.createdAt.toISOString(),
        fund: report.fund,
      }}
    />
  );
}
