import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { evaluateReport } from "@/lib/report-quality";
import { extractSharedFacts } from "@/lib/shared-facts";
import { getUserTeamContext, reportReadWhere } from "@/lib/team-access";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId } = await getUserTeamContext(session.user.id);
  const report = await prisma.report.findFirst({
    where: { id: params.id, ...reportReadWhere(session.user.id, teamId) },
    include: {
      sections: { orderBy: { order: "asc" } },
      deal: {
        include: {
          documents: { select: { name: true, parsedText: true } },
        },
      },
    },
  });

  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const facts = extractSharedFacts({
    companyName: report.deal.companyName,
    sector: report.deal.sector,
    investRound: report.deal.investRound ?? undefined,
    investAmount: report.deal.investAmount ?? undefined,
    valuation: report.deal.valuation ?? undefined,
    documents: report.deal.documents,
  });

  const summary = evaluateReport(
    report.sections.map((s) => ({
      sectionKey: s.sectionKey,
      content: s.content,
    })),
    {
      investAmount: facts.investAmount,
      valuation: facts.valuation,
      metrics: facts.metrics,
      terms: facts.terms,
      clinicalPhase: facts.clinicalPhase,
    }
  );

  return NextResponse.json({ data: summary });
}
