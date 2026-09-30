import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, HelpCircle } from "lucide-react";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { buildUsageCostReport } from "@/lib/usage-cost-report";
import { DailyCostChart } from "@/components/admin/daily-cost-chart";

// 운영자 전용 — 고객사(팀) 단위가 아니라 플랫폼 전체 UsageLog를 본다.
// isPlatformAdminEmail 참고: UserRole.ADMIN(팀 관리자)과는 다른 축이다.

const RANGE_OPTIONS = [7, 30, 90] as const;
const DEFAULT_RANGE = 7;

function formatUsd(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function UsageCostPage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  if (!isPlatformAdminEmail(session.user.email)) {
    return (
      <AppLayout title="비용 대시보드">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center text-sm text-gray-500">
            이 페이지는 DealMind 운영자 전용입니다.
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  const parsedDays = Number(searchParams.days);
  const days = (RANGE_OPTIONS as readonly number[]).includes(parsedDays)
    ? parsedDays
    : DEFAULT_RANGE;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // 플랫폼 전체(모든 고객사) 비용이므로 userId 필터 없음 — 대신 무제한 조회를
  // 막기 위해 기간(최대 90일)과 건수(20000행) 둘 다로 상한을 둔다
  // (list-paging.ts와 같은 원칙).
  const rows = await prisma.usageLog.findMany({
    where: { createdAt: { gte: since } },
    select: {
      model: true,
      estimatedCost: true,
      inputTokens: true,
      outputTokens: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
    take: 20000,
  });

  const report = buildUsageCostReport(rows);

  return (
    <AppLayout title="비용 대시보드">
      <div className="max-w-4xl space-y-6">
        <div className="flex items-center gap-2">
          {RANGE_OPTIONS.map((r) => (
            <Link
              key={r}
              href={`/admin/usage-cost?days=${r}`}
              className={`px-3 py-1.5 rounded-md text-sm border ${
                r === days
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700"
              }`}
            >
              최근 {r}일
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" /> 확인된 총 비용
              </p>
              <p className="text-2xl font-semibold mt-1">
                {formatUsd(report.totalKnownCost)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-gray-400">전체 AI 호출</p>
              <p className="text-2xl font-semibold mt-1">
                {report.totalCalls.toLocaleString()}건
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-gray-400 flex items-center gap-1">
                비용 미확인 호출
                <HelpCircle className="w-3.5 h-3.5" />
              </p>
              <p className="text-2xl font-semibold mt-1">
                {report.unknownCostCalls.toLocaleString()}건
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                OpenRouter 응답에 usage.cost가 없던 호출 — 0원이 아니라
                &quot;모름&quot;이라 총 비용에서 제외됨
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">일별 비용 추이</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyCostChart data={report.dailyCost} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">모델별 비용</CardTitle>
          </CardHeader>
          <CardContent>
            {report.byModel.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">
                선택한 기간에 AI 호출 기록이 없습니다.
              </p>
            ) : (
              <div className="space-y-1">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-xs text-gray-400 px-2 pb-2 border-b">
                  <span>모델</span>
                  <span className="text-right">호출수</span>
                  <span className="text-right">평균/호출</span>
                  <span className="text-right">총 비용</span>
                </div>
                {report.byModel.map((m) => (
                  <div
                    key={m.model}
                    className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-2 py-2 text-sm border-b last:border-0"
                  >
                    <span className="font-mono text-xs truncate" title={m.model}>
                      {m.model}
                    </span>
                    <span className="text-right text-gray-500 tabular-nums">
                      {m.calls.toLocaleString()}
                    </span>
                    <span className="text-right text-gray-500 tabular-nums">
                      {m.avgCostPerCall != null ? formatUsd(m.avgCostPerCall) : "-"}
                    </span>
                    <span className="text-right font-medium tabular-nums">
                      {formatUsd(m.totalCost)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-gray-400">
          <Badge variant="secondary" className="mr-1">
            최근 {days}일
          </Badge>
          최대 20,000건까지만 집계합니다. 더 넓은 범위가 필요하면 DB를
          직접 조회하세요.
        </p>
      </div>
    </AppLayout>
  );
}
