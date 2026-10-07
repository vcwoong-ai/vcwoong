import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamContext, reportReadWhere } from "@/lib/team-access";
import { computeReportDecision, REPORT_FOR_PRESENTATION_INCLUDE } from "@/lib/vc-decision-loader";
import { buildReportPresentation } from "@/lib/report-presentation";
import { PRIVATE_RESPONSE_HEADERS } from "@/lib/private-response-headers";

/**
 * VC Investment Decision — canonical 엔진(buildInvestmentDecision)의 결과를 그대로
 * 돌려준다. 화면은 이 응답을 표시만 하고 다시 계산하지 않는다. export와 같은
 * 조립 함수(vc-decision-loader.ts)를 쓰므로 화면과 문서가 다른 결론을 낼 수 없다.
 *
 * AI 호출 없음(순수 계산). 권한은 다른 보고서 라우트와 같은 reportReadWhere —
 * 없거나 권한이 없으면 동일하게 404(존재 여부를 노출하지 않는다).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401, headers: PRIVATE_RESPONSE_HEADERS });
  }

  const { teamId } = await getUserTeamContext(session.user.id);
  const report = await prisma.report.findFirst({
    where: { id: params.id, ...reportReadWhere(session.user.id, teamId) },
    include: REPORT_FOR_PRESENTATION_INCLUDE,
  });

  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: PRIVATE_RESPONSE_HEADERS });
  }

  const result = computeReportDecision(report);

  return NextResponse.json({
    data: {
      deal: {
        id: report.deal.id,
        companyName: report.deal.companyName,
        sector: report.deal.sector,
        stage: report.deal.stage,
        investRound: report.deal.investRound,
        investAmount: report.deal.investAmount,
        valuation: report.deal.valuation,
      },
      decision: result.decision,
      gate: result.gate,
      sectionRefs: result.sectionRefs,
      hasScore: result.hasScore,
      scoreOverall: result.scoreOverall,
      assessmentBasis: result.assessmentBasis,
      questionsGenerated: result.questionsGenerated,
      questionsSource: result.questionsSource,
      questionLinks: result.questionLinks,
      documentCount: report.deal.documents.length,
      evidenceTotals: result.evidence.totals,
      presentation: buildReportPresentation(result, report.deal.companyName),
    },
  }, { headers: PRIVATE_RESPONSE_HEADERS });
}
