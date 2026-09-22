import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveDartCorpCode, fetchDartFinancials, type DartFinancials } from "@/lib/dart";
import { checkRateLimit } from "@/lib/rate-limit";
import { getUserTeamContext, permissionDeniedMessage } from "@/lib/team-access";
import { maDealWriteWhere } from "@/lib/pe/ma-team-access";
import {
  adaptDartFinancialsToPE,
  parseDartFiscalYear,
  dartFiscalYearToPeriodBounds,
  DART_PERIOD_TYPE,
  DART_CURRENCY,
} from "@/lib/pe/dart-adapter";
import { LINE_ITEM_STATEMENT_TYPE } from "@/lib/pe/financial-types";
import { normalizeFinancialPeriod } from "@/lib/pe/financial-normalization";

/**
 * DART 재무제표를 가져와 PE 정규화 계층(PR-B)에 raw fact로 적재한다.
 *
 * DART → adaptDartFinancialsToPE() → MAFinancialPeriod/MAFinancialLineItem만
 * 생성한다. EBITDA/Net Debt/FCF 같은 파생 지표는 여기서 계산하지 않고
 * PR-B의 normalizeFinancialPeriod()에 그대로 위임한다(응답에는 "이번
 * import로 무엇을 파생 계산할 수 있게 됐는지"만 참고용으로 보여준다).
 *
 * 멱등성: (maDealId, fiscalYear, periodType) unique 제약(PR-B에 이미 존재)에
 * 그대로 의존한다. 이미 있는 기간은 절대 덮어쓰지 않고 건너뛴다(NOOP) —
 * 사용자가 그 기간에 수동으로 추가한 MAFinancialAdjustment도 자동으로
 * 보존된다(그 period를 다시 건드리지 않으므로).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized", message: "인증이 필요합니다" }, { status: 401 });
  }

  // 기존 /api/deals/[id]/dart와 같은 키(dart:${userId})를 공유한다 —
  // OpenDART API 자체의 호출 한도는 VC/PE 경로 구분 없이 사용자 단위로
  // 같이 소진되므로, 레이트리밋도 같은 예산을 공유해야 우회를 막는다.
  const rate = await checkRateLimit(`dart:${session.user.id}`, 30, 60 * 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const maDeal = await prisma.mADeal.findFirst({
    where: { id: params.id, ...maDealWriteWhere(session.user.id, teamId, role) },
    select: { id: true, companyName: true },
  });
  // 존재하지 않는 MADeal과 권한 없는 MADeal을 구분하지 않는다 — PR-A/B의
  // 기존 findFirst+where 패턴과 동일(다른 팀 MADeal의 존재 자체를 노출하지 않음).
  if (!maDeal) {
    return NextResponse.json(
      { error: "forbidden", message: permissionDeniedMessage("edit") },
      { status: 403 }
    );
  }

  // resolveDartCorpCode/fetchDartFinancials는 기존 dart.ts를 그대로 재사용한다
  // (수정 없음). searchDartCompany() 대신 이 두 함수를 직접 쓰는 이유:
  // corpCode가 응답에 필요한데 searchDartCompany는 이를 반환하지 않고,
  // 이 PR에서 쓰지 않는 공시 목록까지 불필요하게 한 번 더 호출하기 때문이다.
  const corp = await resolveDartCorpCode(maDeal.companyName);
  if (!corp) {
    return NextResponse.json(
      {
        error: "company_not_found",
        message: "DART에서 회사를 찾을 수 없습니다(비상장이거나 회사명이 일치하지 않을 수 있습니다)",
      },
      { status: 404 }
    );
  }

  const thisYear = new Date().getUTCFullYear();
  const [yearMinus1, yearMinus2] = await Promise.all([
    fetchDartFinancials(corp.corpCode, thisYear - 1),
    fetchDartFinancials(corp.corpCode, thisYear - 2),
  ]);
  const financials = [yearMinus1, yearMinus2].filter(
    (f): f is DartFinancials => f !== null
  );

  if (financials.length === 0) {
    return NextResponse.json(
      { error: "dart_unavailable", message: "DART 재무 데이터를 가져올 수 없습니다" },
      { status: 502 }
    );
  }

  const importedPeriods: Array<{
    fiscalYear: number;
    periodType: typeof DART_PERIOD_TYPE;
    periodId: string;
    lineItemsImported: number;
    derivedMetricsAvailable: string[];
  }> = [];
  const skipped: Array<{ fiscalYear?: number; year?: string; reason: string }> = [];

  for (const dartFinancials of financials) {
    let fiscalYear: number;
    try {
      fiscalYear = parseDartFiscalYear(dartFinancials);
    } catch {
      skipped.push({ year: dartFinancials.year, reason: "invalid_financial_period" });
      continue;
    }

    const lineItems = adaptDartFinancialsToPE(dartFinancials);
    if (lineItems.length === 0) {
      skipped.push({ fiscalYear, reason: "no_supported_line_items" });
      continue;
    }

    const { startDate, endDate } = dartFiscalYearToPeriodBounds(fiscalYear);

    try {
      // 재무기간 1개 = 트랜잭션 1개(기존 /api/ma-deals/[id]/financials POST와
      // 동일한 크기 단위) — 한 연도가 unique 제약으로 실패해도 다른 연도의
      // import는 계속 진행된다.
      const period = await prisma.$transaction(async (tx) => {
        const created = await tx.mAFinancialPeriod.create({
          data: {
            maDealId: params.id,
            fiscalYear,
            periodType: DART_PERIOD_TYPE,
            startDate,
            endDate,
            currency: DART_CURRENCY,
          },
        });

        await tx.mAFinancialLineItem.createMany({
          data: lineItems.map((item) => ({
            financialPeriodId: created.id,
            statementType: LINE_ITEM_STATEMENT_TYPE[item.lineItem],
            lineItem: item.lineItem,
            value: item.value,
            currency: item.currency,
            source: item.sourceType,
            sourceName: item.sourceName,
            sourceLocation: item.sourceLocation,
            isNormalized: false,
          })),
        });

        return created;
      });

      const summary = normalizeFinancialPeriod({
        periodCurrency: DART_CURRENCY,
        lineItems,
      });
      const derivedMetricsAvailable = Object.entries(summary)
        .filter(([, result]) => result.status === "ok")
        .map(([metric]) => metric);

      importedPeriods.push({
        fiscalYear,
        periodType: DART_PERIOD_TYPE,
        periodId: period.id,
        lineItemsImported: lineItems.length,
        derivedMetricsAvailable,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // 이미 이 (maDealId, fiscalYear, periodType) 조합이 존재 — 덮어쓰지
        // 않고 건너뛴다(그 기간의 기존 line item·수동 adjustment는 그대로 보존됨).
        skipped.push({ fiscalYear, reason: "duplicate_import" });
        continue;
      }
      console.error("PE DART import error:", error);
      return NextResponse.json(
        { error: "normalization_error", message: "재무 데이터 저장 중 오류가 발생했습니다" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    {
      data: {
        maDealId: params.id,
        corpCode: corp.corpCode,
        companyName: corp.corpName,
        importedPeriods: importedPeriods.length,
        importedPeriodsDetail: importedPeriods,
        importedLineItems: importedPeriods.reduce((sum, p) => sum + p.lineItemsImported, 0),
        skippedPeriods: skipped,
        derivedMetricsAvailable: Array.from(
          new Set(importedPeriods.flatMap((p) => p.derivedMetricsAvailable))
        ),
        source: "DART",
      },
    },
    { status: 201 }
  );
}
