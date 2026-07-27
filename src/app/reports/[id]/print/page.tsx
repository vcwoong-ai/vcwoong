import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dealScope } from "@/lib/team";
import { PrintReportClient } from "./print-report-client";

/**
 * 인쇄 전용 보고서 뷰.
 * 한글 PDF는 폰트 임베딩 비용이 커서 브라우저의 "PDF로 저장"을 사용한다.
 */
export default async function ReportPrintPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const report = await prisma.report.findFirst({
    where: { id: params.id, ...(await dealScope(session.user.id)) },
    include: {
      deal: { select: { companyName: true, sector: true, investRound: true } },
      sections: { orderBy: { order: "asc" } },
    },
  });

  if (!report) notFound();

  return (
    <PrintReportClient
      report={{
        id: report.id,
        title: report.title,
        agentType: report.agentType,
        generatedAt: report.generatedAt?.toISOString() ?? null,
        deal: report.deal,
        sections: report.sections.map((s) => ({
          id: s.id,
          title: s.title,
          content: s.content,
          order: s.order,
        })),
      }}
    />
  );
}
