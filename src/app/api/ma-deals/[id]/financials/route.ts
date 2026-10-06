import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamContext, permissionDeniedMessage } from "@/lib/team-access";
import { maDealReadWhere, maDealWriteWhere } from "@/lib/pe/ma-team-access";
import { createFinancialPeriodSchema } from "@/lib/pe/financial-validation";
import {
  computeAdjustmentNormalizedValue,
  normalizeFinancialPeriod,
} from "@/lib/pe/financial-normalization";
import type { CanonicalLineItem, MaFinancialSourceType } from "@/lib/pe/financial-types";

// getServerSession() → authorization(MADeal ownership/team) → validation → operation
// 순서를 GET/POST 모두 동일하게 따른다(다른 팀의 MADeal에는 접근 불가).

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
    where: { maDealId: params.id },
    // 정렬 없는 include는 행 순서를 보장하지 않는다(PR #112) — pe-ma-deal-context.ts와
    // 동일하게 명시적으로 정렬해, 데이터가 안 바뀌었는데도 findLineItem()이
    // 매번 다른 항목을 고르는 일을 막는다(§20 false staleness/비결정성).
    include: {
      lineItems: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      adjustments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
    orderBy: [{ fiscalYear: "desc" }, { periodType: "asc" }],
  });

  // 정규화 요약(EBITDA/Net Debt/FCF 등)은 저장하지 않고 조회 시점에
  // line item으로부터 매번 결정적으로 계산한다 — 저장된 요약과 원본
  // line item이 어긋날 여지를 없앤다.
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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const maDeal = await prisma.mADeal.findFirst({
    where: { id: params.id, ...maDealWriteWhere(session.user.id, teamId, role) },
  });
  if (!maDeal) {
    return NextResponse.json(
      { error: permissionDeniedMessage("edit") },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const validated = createFinancialPeriodSchema.parse(body);

    const created = await prisma.$transaction(async (tx) => {
      const period = await tx.mAFinancialPeriod.create({
        data: {
          maDealId: params.id,
          fiscalYear: validated.fiscalYear,
          periodType: validated.periodType,
          startDate: validated.startDate,
          endDate: validated.endDate,
          currency: validated.currency,
        },
      });

      await tx.mAFinancialLineItem.createMany({
        data: validated.lineItems.map((item) => ({
          financialPeriodId: period.id,
          statementType: item.statementType,
          lineItem: item.lineItem,
          value: item.value,
          currency: item.currency,
          source: item.source,
          sourceName: item.sourceName,
          sourceLocation: item.sourceLocation,
          isNormalized: item.isNormalized ?? false,
        })),
      });

      if (validated.adjustments && validated.adjustments.length > 0) {
        await tx.mAFinancialAdjustment.createMany({
          data: validated.adjustments.map((adj) => ({
            financialPeriodId: period.id,
            metric: adj.metric,
            reportedValue: adj.reportedValue,
            adjustmentValue: adj.adjustmentValue,
            normalizedValue: computeAdjustmentNormalizedValue(
              adj.reportedValue,
              adj.adjustmentValue
            ),
            reason: adj.reason,
            source: adj.source,
            sourceName: adj.sourceName,
            sourceLocation: adj.sourceLocation,
          })),
        });
      }

      return tx.mAFinancialPeriod.findUniqueOrThrow({
        where: { id: period.id },
        include: { lineItems: true, adjustments: true },
      });
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.issues },
        { status: 400 }
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "이미 동일한 회계연도·기간유형의 재무데이터가 존재합니다" },
        { status: 409 }
      );
    }
    // Prisma diagnostics can include submitted financial values; keep server logs scalar.
    console.error("MAFinancialPeriod creation error");
    return NextResponse.json(
      { error: "재무 데이터 생성 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
