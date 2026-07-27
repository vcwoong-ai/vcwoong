import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const kpiSchema = z.object({
  period: z.string().regex(/^\d{4}Q[1-4]$/, "2025Q1 형식이어야 합니다"),
  metric: z.string().min(1).max(40),
  value: z.number(),
  unit: z.string().min(1).max(12),
});

const bodySchema = z.object({
  kpis: z.array(kpiSchema).min(1).max(20),
});

/** 분기 KPI 일괄 저장 (같은 기간·지표는 덮어쓰기) */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const owned = await prisma.portfolioCompany.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력 데이터가 올바르지 않습니다", details: parsed.error.issues },
      { status: 400 }
    );
  }

  await prisma.$transaction(
    parsed.data.kpis.map((k) =>
      prisma.companyKPI.upsert({
        where: {
          companyId_period_metric: {
            companyId: params.id,
            period: k.period,
            metric: k.metric,
          },
        },
        create: { companyId: params.id, ...k },
        update: { value: k.value, unit: k.unit },
      })
    )
  );

  const kpis = await prisma.companyKPI.findMany({
    where: { companyId: params.id },
    orderBy: { period: "asc" },
  });

  return NextResponse.json({ data: kpis });
}
