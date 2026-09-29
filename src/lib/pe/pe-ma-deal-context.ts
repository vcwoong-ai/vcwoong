/**
 * PE MADeal IC 컨텍스트 로더 — 서버 전용(PR #108).
 *
 * page.tsx(개요/IC 워크스페이스/IC 의사결정 탭의 서버 컴포넌트)와
 * `/api/ma-deals/[id]/ic-memo` export route가 똑같이 필요로 하는 조회
 * 시퀀스(딜 인가 확인 → 재무기간 조회+정규화 → PEDDCase/finding/evidence
 * 조회)를 한 곳에 모은다 — 두 곳이 각자 조회 로직을 복제하면 나중에
 * 한쪽만 고쳐서 어긋날 위험이 있다(§10 "UI와 export가 서로 다른 결론을
 * 만들면 안 된다"의 데이터 조회판).
 *
 * 이 파일은 prisma를 직접 다루는 서버 전용 코드다 — 클라이언트
 * 컴포넌트에서 import하면 안 된다.
 */

import { prisma } from "@/lib/prisma";
import { maDealReadWhere } from "./ma-team-access";
import { normalizeFinancialPeriod } from "./financial-normalization";
import type { CanonicalLineItem, MaFinancialSourceType } from "./financial-types";
import { buildPEDDCaseFromRows } from "./pe-dd-persistence-adapter";
import type { PEDDCase } from "./dd-types";
import type { DashboardPeriod, DashboardAdjustmentRow } from "./ma-deal-dashboard";
import type { MADeal } from "@prisma/client";

export interface MaDealPeriodWithSummary {
  id: string;
  fiscalYear: number;
  periodType: string;
  currency: string;
  lineItems: Array<{
    id: string;
    lineItem: string;
    value: number;
    currency: string;
    source: string;
    sourceName: string | null;
    sourceLocation: string | null;
  }>;
  adjustments: Array<Record<string, unknown>>;
  normalizedSummary: ReturnType<typeof normalizeFinancialPeriod>;
}

export interface MaDealIcContextData {
  maDeal: MADeal;
  periodsWithSummary: MaDealPeriodWithSummary[];
  dashboardPeriods: DashboardPeriod[];
  ddCase?: PEDDCase;
}

export type MaDealIcContextResult = { status: "not_found" } | { status: "ok"; data: MaDealIcContextData };

export async function loadMaDealIcContext(
  userId: string,
  teamId: string | null,
  maDealId: string
): Promise<MaDealIcContextResult> {
  const maDeal = await prisma.mADeal.findFirst({
    where: { id: maDealId, ...maDealReadWhere(userId, teamId) },
  });
  if (!maDeal) return { status: "not_found" };

  const periods = await prisma.mAFinancialPeriod.findMany({
    where: { maDealId },
    include: { lineItems: true, adjustments: true },
    orderBy: [{ fiscalYear: "desc" }, { periodType: "asc" }],
  });

  const periodsWithSummary: MaDealPeriodWithSummary[] = periods.map((period) => ({
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

  const dashboardPeriods: DashboardPeriod[] = periodsWithSummary.map((p) => ({
    id: p.id,
    fiscalYear: p.fiscalYear,
    periodType: p.periodType as DashboardPeriod["periodType"],
    currency: p.currency,
    lineItems: p.lineItems,
    adjustments: p.adjustments as unknown as DashboardAdjustmentRow[],
    normalizedSummary: {
      revenue: p.normalizedSummary.revenue,
      ebitda: p.normalizedSummary.ebitda,
      netDebt: p.normalizedSummary.netDebt,
    },
  }));

  // IC 워크스페이스(PR #107)/IC 의사결정(PR #108)을 위해 PR #105가 영속화한
  // PEDDCase/PEDDFinding/PEEvidence를 조회한다. 위에서 이미 maDealReadWhere()로
  // 이 딜에 대한 읽기 권한을 확인했으므로(maDeal이 not_found가 아니면 통과)
  // 별도 actor 검증 없이 ddCaseId로 스코프된 하위 조회만 하면 된다 —
  // pe-dd-repository.ts의 getPEDDCaseForDeal()과 동일한 신뢰 경계.
  //
  // loadPEDDCaseForReadiness()(pe-dd-persistence-adapter.ts)를 그대로 쓰지
  // 않는 이유: 그 함수는 재무기간을 다시 조회하는데, 바로 위에서 이미
  // lineItems/adjustments까지 포함해 조회해 둔 `periods`를 재사용하면 같은
  // 쿼리를 두 번 보낼 필요가 없다(성능 — 중복 조회 금지).
  const ddCaseRow = await prisma.pEDDCase.findUnique({ where: { maDealId } });
  let ddCase: PEDDCase | undefined;
  if (ddCaseRow) {
    const [findingRows, evidenceRows] = await Promise.all([
      prisma.pEDDFinding.findMany({ where: { ddCaseId: ddCaseRow.id } }),
      prisma.pEEvidence.findMany({ where: { ddCaseId: ddCaseRow.id } }),
    ]);
    ddCase = buildPEDDCaseFromRows(periods, findingRows, evidenceRows);
  }

  return { status: "ok", data: { maDeal, periodsWithSummary, dashboardPeriods, ddCase } };
}
