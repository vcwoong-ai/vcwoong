import { prisma } from "@/lib/prisma";
import { getUserPlanKey } from "@/lib/subscription";

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

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function checkQuota(
  userId: string,
  action: "report" | "template",
  plan?: PlanKey
): Promise<QuotaResult> {
  const effectivePlan = plan ?? (await getUserPlanKey(userId));
  const limits = PLAN_LIMITS[effectivePlan];
  const limit = action === "report" ? limits.reports : limits.templates;
  const since = startOfMonth();

  const used =
    action === "report"
      ? await prisma.report.count({
          where: {
            deal: { userId },
            createdAt: { gte: since },
            status: { not: "PENDING" },
          },
        })
      : await prisma.template.count({
          where: { userId, createdAt: { gte: since } },
        });

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
