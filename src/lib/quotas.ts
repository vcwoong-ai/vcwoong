import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getUserPlanKey } from "@/lib/subscription";
import { kstStartOfMonth } from "@/lib/utils";

export const PLAN_LIMITS = {
  free: { reports: 5, sectors: 1, templates: 2 },
  solo: { reports: 20, sectors: 1, templates: 3 },
  sector_pro: { reports: 50, sectors: 1, templates: 10 },
  multi: { reports: 100, sectors: 3, templates: 30 },
  full: { reports: 300, sectors: 6, templates: 100 },
  bio_premium: { reports: 300, sectors: 6, templates: 100 },
} as const;

export type PlanKey = keyof typeof PLAN_LIMITS;

export interface QuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
  plan: PlanKey;
  message?: string;
}

/**
 * 월 한도의 기준 시각 — 한국 시간 기준 이번 달 1일 0시.
 * (서버 UTC 기준으로 세면 매월 1일 0~9시에 한도가 안 풀린 것처럼 보인다)
 */
function reportMonthWindow(now: Date): { gte: Date; lt: Date } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return { gte: kstStartOfMonth(now),
    lt: new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() + 1, 1) - 9 * 60 * 60 * 1000) };
}

export async function checkQuota(
  userId: string,
  action: "report" | "template",
  plan?: PlanKey,
  client: Pick<Prisma.TransactionClient, "report" | "template" | "reportQuotaAdmission"> = prisma,
  now: Date = new Date()
): Promise<QuotaResult> {
  const effectivePlan = plan ?? (await getUserPlanKey(userId));
  const limits = PLAN_LIMITS[effectivePlan];
  const limit = action === "report" ? limits.reports : limits.templates;
  const window = reportMonthWindow(now);

  let used: number;
  if (action === "report") {
    // The owner-billed admission survives report/deal deletion. Only unlinked legacy reports
    // remain in the old count; counting linked reports too would consume the same slot twice.
    // A missing ledger/schema must fail closed, never silently restore an allowance.
    const [admissions, legacyReports] = await Promise.all([
      client.reportQuotaAdmission.count({ where: { userId, createdAt: window } }),
      client.report.count({
          where: {
            deal: { userId },
            quotaAdmission: { is: null },
            createdAt: window,
          },
        }),
    ]);
    used = admissions + legacyReports;
  } else used = await client.template.count({ where: { userId, createdAt: { gte: window.gte } } });

  const allowed = used < limit;

  return {
    allowed,
    used,
    limit,
    plan: effectivePlan,
    message: allowed
      ? undefined
      : `이번 달 ${action === "report" ? "보고서" : "양식"} 한도(${limit}건)를 초과했습니다. (${used}/${limit})`,
  };
}

export async function getQuotaSummary(userId: string, plan?: PlanKey) {
  const effectivePlan = plan ?? (await getUserPlanKey(userId));
  const [reports, templates] = await Promise.all([
    checkQuota(userId, "report", effectivePlan),
    checkQuota(userId, "template", effectivePlan),
  ]);
  return { reports, templates, plan: effectivePlan };
}
