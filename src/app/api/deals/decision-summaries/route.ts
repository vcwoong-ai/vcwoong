import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamContext, dealReadWhere } from "@/lib/team-access";
import { computeReportDecision, REPORT_FOR_DECISION_INCLUDE } from "@/lib/vc-decision-loader";
import { summarizeDealDecision, type DealQueueSummary } from "@/lib/vc-deal-queue";
import { DEALS_PAGE_SIZE } from "@/lib/list-paging";

/**
 * VC 딜 목록(검토 대기열)용 배치 결정 요약.
 *
 * 딜마다 최신 보고서 1건의 canonical 결정(computeReportDecision — 화면·상세 API·DOCX가
 * 쓰는 같은 조립 경로)을 계산해 목록 한 줄 분량으로 압축해 돌려준다. 새 계산·AI 호출 없음.
 *
 * 권한: 요청한 id 중 `dealReadWhere`로 조회 가능한 딜만 대상이다. 권한이 없거나 없는 id는
 * 응답에서 그냥 빠진다(존재 여부를 노출하지 않음). 전체 딜을 읽은 뒤 브라우저에서 거르지 않는다.
 * 한 번에 최대 DEALS_PAGE_SIZE개 — 목록 한 페이지 분량을 넘는 요청은 400.
 */
const querySchema = z.object({
  ids: z
    .string()
    .min(1)
    .transform((v) => Array.from(new Set(v.split(",").map((s) => s.trim()).filter(Boolean))))
    .pipe(z.array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)).min(1).max(DEALS_PAGE_SIZE)),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const parsed = querySchema.safeParse({ ids: request.nextUrl.searchParams.get("ids") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "ids가 올바르지 않습니다(최대 24개, 쉼표 구분)" }, { status: 400 });
  }

  const { teamId } = await getUserTeamContext(session.user.id);
  const deals = await prisma.deal.findMany({
    where: { id: { in: parsed.data.ids }, ...dealReadWhere(session.user.id, teamId) },
    select: { id: true },
  });

  const summaries: Record<string, DealQueueSummary> = {};
  await Promise.all(
    deals.map(async (deal) => {
      const report = await prisma.report.findFirst({
        where: { dealId: deal.id },
        orderBy: { createdAt: "desc" },
        include: REPORT_FOR_DECISION_INCLUDE,
      });
      if (!report) return;
      summaries[deal.id] = summarizeDealDecision(deal.id, report.id, computeReportDecision(report));
    })
  );

  return NextResponse.json({ data: summaries });
}
