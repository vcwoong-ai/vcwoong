import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamContext } from "@/lib/team-access";
import { maDealReadWhere } from "@/lib/pe/ma-team-access";
import { normalizeFinancialPeriod } from "@/lib/pe/financial-normalization";
import type { CanonicalLineItem, MaFinancialSourceType } from "@/lib/pe/financial-types";

/**
 * 이미 DART로 적재된(POST .../dart/import) PE 재무 데이터를 조회한다.
 * DART를 다시 호출하지 않으므로(순수 DB 조회) 레이트리밋이 필요 없다
 * (외부 API 비용이 드는 건 import뿐 — 기존 /api/deals/[id]/dart의
 * 레이트리밋 정책은 "DART 실호출"에 건 것이지 "조회"에 건 게 아니다).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId } = await getUserTeamContext(session.user.id);
  const maDeal = await prisma.mADeal.findFirst({
    where: { id: params.id, ...maDealReadWhere(session.user.id, teamId) },
  });
  if (!maDeal) {
    return NextResponse.json(
      { error: "PE 딜을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  const periods = await prisma.mAFinancialPeriod.findMany({
    where: { maDealId: params.id, lineItems: { some: { source: "DART" } } },
    include: {
      lineItems: { where: { source: "DART" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      adjustments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
    orderBy: [{ fiscalYear: "desc" }, { periodType: "asc" }],
  });

  const data = periods.map((period) => ({
    ...period,
    normalizedSummary: normalizeFinancialPeriod({
      periodCurrency: period.currency,
      lineItems: period.lineItems.map((item) => ({
        lineItem: item.lineItem as CanonicalLineItem,
        value: item.value,
        currency: item.currency,
        sourceType: item.source as MaFinancialSourceType,
        sourceName: item.sourceName ?? undefined,
        sourceLocation: item.sourceLocation ?? undefined,
      })),
      adjustments: period.adjustments.map((adj) => ({
        metric: adj.metric as CanonicalLineItem,
        reportedValue: adj.reportedValue,
        adjustmentValue: adj.adjustmentValue,
        reason: adj.reason,
        sourceType: adj.source as MaFinancialSourceType,
        sourceName: adj.sourceName ?? undefined,
        sourceLocation: adj.sourceLocation ?? undefined,
      })),
    }),
  }));

  return NextResponse.json({ data });
}
