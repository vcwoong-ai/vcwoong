/**
 * PE 딜 목록 — 여러 딜의 canonical readiness 요약을 배치로 조회한다(PE
 * 프론트엔드 제품화, Phase 4).
 *
 * `buildPEDecisionReadiness()`(pe-decision-readiness.ts, 수정 없음)를 그대로
 * 재사용한다 — 목록 카드가 자체 점수/판정을 새로 만들지 않는다. 이 파일이
 * 하는 일은 딱 하나: 딜 여러 개의 재무기간/DD/리뷰 데이터를 딜마다 따로
 * 쿼리하지 않고(N+1 방지) `maDealId IN (...)`로 한 번에 모아 온 뒤, 메모리
 * 안에서 딜별로 그룹핑해 기존 엔진에 그대로 넣어주는 배치 조립뿐이다.
 *
 * 리뷰 상태는 "내 검토"(actor 본인의 PEICReview.status)만 보여준다 — 목록
 * 화면에서 fingerprint/재검토 필요 여부까지 계산하면 딜마다
 * buildPEICDecision() 전체(thesis/driver/breaker/evidence/질문 생성)를
 * 돌려야 해서 목록 로드 비용이 급격히 커진다. 대신 저장된 status를 있는
 * 그대로 보여주고 "최신 여부"를 주장하지 않는다(상세 화면에서 확인) —
 * 지어내는 대신 없는 정보라고 정직하게 표시하는 이 레포의 기존 원칙과
 * 동일하다.
 */

import { prisma } from "@/lib/prisma";
import { normalizeFinancialPeriod } from "./financial-normalization";
import type { CanonicalLineItem, MaFinancialSourceType } from "./financial-types";
import { buildPEDDCaseFromRows } from "./pe-dd-persistence-adapter";
import { buildPEDecisionReadiness } from "./pe-decision-readiness";
import type { ReadinessState, PEDecisionPeriod } from "./pe-decision-readiness";
import type { PEICReviewSignoffStatus } from "@prisma/client";

export interface MaDealListReadinessSummary {
  overall: ReadinessState;
  financial: ReadinessState;
  qoe: ReadinessState;
  lbo: ReadinessState;
  dd: ReadinessState;
  blockerCount: number;
  latestPeriodLabel: string | null;
  /** actor 본인의 리뷰 상태 그대로(최신 여부 미계산) — 없으면 null(="미검토"와 구분: 아직 리뷰 행 자체가 없음) */
  myReviewStatus: PEICReviewSignoffStatus | null;
}

function periodLabel(fiscalYear: number, periodType: string): string {
  return periodType === "ANNUAL" ? `FY${fiscalYear}` : `FY${fiscalYear} ${periodType}`;
}

/**
 * `dealIds`에 대해 딜당 O(1) 추가 쿼리가 아니라 전체 O(1)(고정 개수) 쿼리로
 * 배치 조회한다 — Prisma의 `IN (...)` 조회는 딜 개수와 무관하게 쿼리 수가
 * 늘어나지 않는다(N+1 방지, §21).
 *
 * ## 신뢰 경계(중요)
 *
 * 이 함수는 `dealIds`에 대해 자체적으로 인가를 확인하지 않는다 — 호출자가
 * `maDealReadWhere()`로 이미 필터링한 목록만 넘긴다는 전제다(현재 두
 * 호출처인 `ma-deals/page.tsx`/`api/ma-deals/route.ts` GET 모두 그렇게
 * 한다). 필터링되지 않은 임의의 dealId를 이 함수에 직접 넘기면 안 된다.
 */
export async function loadMaDealListReadinessSummaries(
  dealIds: string[],
  actorUserId: string
): Promise<Record<string, MaDealListReadinessSummary>> {
  if (dealIds.length === 0) return {};

  const [periods, ddCases, myReviews] = await Promise.all([
    prisma.mAFinancialPeriod.findMany({
      where: { maDealId: { in: dealIds } },
      include: {
        lineItems: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        adjustments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
      orderBy: [{ fiscalYear: "desc" }, { periodType: "asc" }],
    }),
    prisma.pEDDCase.findMany({ where: { maDealId: { in: dealIds } } }),
    prisma.pEICReview.findMany({
      where: { maDealId: { in: dealIds }, reviewerId: actorUserId },
      select: { maDealId: true, status: true },
    }),
  ]);

  const ddCaseIds = ddCases.map((c) => c.id);
  const [findingRows, evidenceRows] = ddCaseIds.length
    ? await Promise.all([
        prisma.pEDDFinding.findMany({ where: { ddCaseId: { in: ddCaseIds } } }),
        prisma.pEEvidence.findMany({ where: { ddCaseId: { in: ddCaseIds } } }),
      ])
    : [[], []];

  const periodsByDeal = new Map<string, typeof periods>();
  for (const p of periods) {
    const list = periodsByDeal.get(p.maDealId) ?? [];
    list.push(p);
    periodsByDeal.set(p.maDealId, list);
  }

  const ddCaseByDeal = new Map(ddCases.map((c) => [c.maDealId, c]));
  const findingsByDdCase = new Map<string, typeof findingRows>();
  for (const f of findingRows) {
    const list = findingsByDdCase.get(f.ddCaseId) ?? [];
    list.push(f);
    findingsByDdCase.set(f.ddCaseId, list);
  }
  const evidenceByDdCase = new Map<string, typeof evidenceRows>();
  for (const e of evidenceRows) {
    const list = evidenceByDdCase.get(e.ddCaseId) ?? [];
    list.push(e);
    evidenceByDdCase.set(e.ddCaseId, list);
  }
  const myReviewByDeal = new Map(myReviews.map((r) => [r.maDealId, r.status]));

  const result: Record<string, MaDealListReadinessSummary> = {};
  for (const dealId of dealIds) {
    const dealPeriods = periodsByDeal.get(dealId) ?? [];
    const decisionPeriods: PEDecisionPeriod[] = dealPeriods.map((p) => ({
      id: p.id,
      fiscalYear: p.fiscalYear,
      periodType: p.periodType as PEDecisionPeriod["periodType"],
      currency: p.currency,
      lineItems: p.lineItems,
      adjustments: p.adjustments,
      normalizedSummary: normalizeFinancialPeriod({
        periodCurrency: p.currency,
        lineItems: p.lineItems.map((item) => ({
          lineItem: item.lineItem as CanonicalLineItem,
          value: item.value,
          currency: item.currency,
          sourceType: item.source as MaFinancialSourceType,
          sourceName: item.sourceName ?? undefined,
          sourceLocation: item.sourceLocation ?? undefined,
        })),
        adjustments: p.adjustments.map((adj) => ({
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

    const ddCaseRow = ddCaseByDeal.get(dealId);
    const ddCase = ddCaseRow
      ? buildPEDDCaseFromRows(
          dealPeriods,
          findingsByDdCase.get(ddCaseRow.id) ?? [],
          evidenceByDdCase.get(ddCaseRow.id) ?? []
        )
      : undefined;

    const readiness = buildPEDecisionReadiness({ periods: decisionPeriods, ddCase });
    const financial = readiness.domains.find((d) => d.domain === "FINANCIAL")?.status ?? "NOT_STARTED";
    const qoe = readiness.domains.find((d) => d.domain === "QOE")?.status ?? "NOT_STARTED";
    const lbo = readiness.domains.find((d) => d.domain === "LBO")?.status ?? "NOT_STARTED";
    const dd = readiness.domains.find((d) => d.domain === "DD")?.status ?? "NOT_STARTED";
    const latest = dealPeriods[0];

    result[dealId] = {
      overall: readiness.overall,
      financial,
      qoe,
      lbo,
      dd,
      blockerCount: readiness.blockers.length,
      latestPeriodLabel: latest ? periodLabel(latest.fiscalYear, latest.periodType) : null,
      myReviewStatus: myReviewByDeal.get(dealId) ?? null,
    };
  }
  return result;
}
