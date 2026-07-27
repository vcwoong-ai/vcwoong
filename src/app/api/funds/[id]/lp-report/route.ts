import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { ReportStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentPeriod } from "@/lib/portfolio";
import {
  computeLpFigures,
  generateLpNarrative,
  renderLpMarkdown,
} from "@/lib/lp-report";

const bodySchema = z.object({
  period: z.string().regex(/^\d{4}Q[1-4]$/).optional(),
});

/** 실제 포트폴리오 데이터로 LP 분기 리포트를 생성·저장한다 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const fund = await prisma.fund.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      companies: {
        include: {
          kpis: { orderBy: { period: "asc" } },
          milestones: { orderBy: { dueDate: "asc" } },
          updates: { orderBy: { period: "desc" }, take: 1 },
        },
      },
    },
  });

  if (!fund) {
    return NextResponse.json({ error: "펀드를 찾을 수 없습니다" }, { status: 404 });
  }

  if (fund.companies.length === 0) {
    return NextResponse.json(
      { error: "포트폴리오사가 없어 리포트를 생성할 수 없습니다" },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력 데이터가 올바르지 않습니다" },
      { status: 400 }
    );
  }
  const period = parsed.data.period ?? currentPeriod();

  const fundInput = {
    name: fund.name,
    vintageYear: fund.vintageYear,
    fundSize: fund.fundSize,
    paidIn: fund.paidIn,
    managementFee: fund.managementFee,
  };

  try {
    const computed = computeLpFigures(fundInput, fund.companies);
    const { sections, modelUsed } = await generateLpNarrative({
      fund: fundInput,
      companies: fund.companies,
      period,
      computed,
    });
    const content = renderLpMarkdown({
      fund: fundInput,
      period,
      computed,
      sections,
    });

    const existing = await prisma.lpReport.findFirst({
      where: { fundId: fund.id, period },
      select: { id: true },
    });

    const saved = existing
      ? await prisma.lpReport.update({
          where: { id: existing.id },
          data: {
            content,
            metrics: computed as unknown as import("@prisma/client").Prisma.InputJsonValue,
            status: ReportStatus.DRAFT,
          },
        })
      : await prisma.lpReport.create({
          data: {
            fundId: fund.id,
            period,
            title: `${fund.name} ${period} LP 리포트`,
            content,
            metrics: computed as unknown as import("@prisma/client").Prisma.InputJsonValue,
            status: ReportStatus.DRAFT,
          },
        });

    return NextResponse.json({
      data: { report: saved, computed, modelUsed },
    });
  } catch (error) {
    console.error("LP report generation error:", error);
    return NextResponse.json(
      { error: "LP 리포트 생성 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const fund = await prisma.fund.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  });
  if (!fund) {
    return NextResponse.json({ error: "펀드를 찾을 수 없습니다" }, { status: 404 });
  }

  const reports = await prisma.lpReport.findMany({
    where: { fundId: params.id },
    orderBy: { period: "desc" },
  });

  return NextResponse.json({ data: reports });
}
