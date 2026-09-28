import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { MaDealDetailClient } from "./ma-deal-detail-client";
import { getUserTeamContext, canEditResource } from "@/lib/team-access";
import { maDealReadWhere } from "@/lib/pe/ma-team-access";
import { normalizeFinancialPeriod } from "@/lib/pe/financial-normalization";
import type { CanonicalLineItem, MaFinancialSourceType } from "@/lib/pe/financial-types";

export default async function MaDealDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { teamId, role } = await getUserTeamContext(session.user.id);

  const maDeal = await prisma.mADeal.findFirst({
    where: { id: params.id, ...maDealReadWhere(session.user.id, teamId) },
  });
  if (!maDeal) notFound();

  const periods = await prisma.mAFinancialPeriod.findMany({
    where: { maDealId: params.id },
    include: { lineItems: true, adjustments: true },
    orderBy: [{ fiscalYear: "desc" }, { periodType: "asc" }],
  });

  // /api/ma-deals/[id]/financials와 동일하게, 정규화 요약은 저장하지 않고
  // 조회 시점에 매번 결정적으로 계산한다(저장된 요약과 원본이 어긋날 여지 제거).
  const periodsWithSummary = periods.map((period) => ({
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

  const canEdit = canEditResource({
    ownerUserId: maDeal.userId,
    resourceTeamId: maDeal.teamId,
    currentUserId: session.user.id,
    currentTeamId: teamId,
    role,
  });

  return (
    <AppLayout title={maDeal.companyName}>
      <MaDealDetailClient
        maDeal={JSON.parse(JSON.stringify(maDeal))}
        periods={JSON.parse(JSON.stringify(periodsWithSummary))}
        canEdit={canEdit}
      />
    </AppLayout>
  );
}
