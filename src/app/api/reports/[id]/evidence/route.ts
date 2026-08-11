import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { traceReportEvidence } from "@/lib/evidence";
import { getUserTeamContext, reportReadWhere } from "@/lib/team-access";

/**
 * 보고서에 쓰인 수치가 업로드 자료에 실재하는지 되짚어 돌려준다.
 * 계산은 전부 문자열 대조라 AI 호출이 없다 — 새로고침해도 비용이 안 든다.
 */
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

  const evidence = traceReportEvidence(
    report.sections.map((s) => ({
      sectionKey: s.sectionKey,
      content: s.content,
    })),
    report.deal.documents,
    {
      investAmount: report.deal.investAmount,
      valuation: report.deal.valuation,
    }
  );

  return NextResponse.json({
    data: { ...evidence, documentCount: report.deal.documents.length },
  });
}
