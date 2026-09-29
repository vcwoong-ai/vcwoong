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
import { buildPEDDCaseFromRows } from "@/lib/pe/pe-dd-persistence-adapter";
import type { PEDDCase } from "@/lib/pe/dd-types";

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

  // IC 워크스페이스(PR #107)를 위해 PR #105가 영속화한 PEDDCase/PEDDFinding/
  // PEEvidence를 조회한다. 위에서 이미 maDealReadWhere()로 이 딜에 대한 읽기
  // 권한을 확인했으므로(maDeal이 not_found가 아니면 통과) 별도 actor 검증 없이
  // ddCaseId로 스코프된 하위 조회만 하면 된다 — pe-dd-repository.ts의
  // getPEDDCaseForDeal()과 동일한 신뢰 경계.
  //
  // loadPEDDCaseForReadiness()(pe-dd-persistence-adapter.ts)를 그대로 쓰지
  // 않고 여기서 직접 조립하는 이유: 그 함수는 재무기간을 다시 조회하는데
  // (내부에서 prisma.mAFinancialPeriod.findMany 재호출), 바로 위에서 이미
  // lineItems/adjustments까지 포함해 조회해 둔 `periods`를 그대로 재사용하면
  // 같은 쿼리를 두 번 보낼 필요가 없다(§18 성능 — 중복 조회 금지).
  // buildPEDDCaseFromRows()는 순수 함수라 새 판단을 하지 않는다.
  const ddCaseRow = await prisma.pEDDCase.findUnique({ where: { maDealId: params.id } });
  let ddCase: PEDDCase | undefined;
  if (ddCaseRow) {
    const [findingRows, evidenceRows] = await Promise.all([
      prisma.pEDDFinding.findMany({ where: { ddCaseId: ddCaseRow.id } }),
      prisma.pEEvidence.findMany({ where: { ddCaseId: ddCaseRow.id } }),
    ]);
    ddCase = buildPEDDCaseFromRows(periods, findingRows, evidenceRows);
  }

  return (
    <AppLayout title={maDeal.companyName}>
      <MaDealDetailClient
        maDeal={JSON.parse(JSON.stringify(maDeal))}
        periods={JSON.parse(JSON.stringify(periodsWithSummary))}
        ddCase={ddCase ? JSON.parse(JSON.stringify(ddCase)) : undefined}
        canEdit={canEdit}
      />
    </AppLayout>
  );
}
