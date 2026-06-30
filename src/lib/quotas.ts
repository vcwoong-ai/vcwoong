export const PLAN_LIMITS = {
  free:        { reports: 1,   sectors: 1, templates: 1 },
  solo:        { reports: 20,  sectors: 1, templates: 3 },
  sector_pro:  { reports: 50,  sectors: 1, templates: 10 },
  multi:       { reports: 100, sectors: 3, templates: 30 },
  full:        { reports: 300, sectors: 6, templates: 100 },
  bio_premium: { reports: 300, sectors: 6, templates: 100 },
} as const;

export type PlanKey = keyof typeof PLAN_LIMITS;

export interface QuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
  plan: PlanKey;
}

export async function checkQuota(
  userId: string,
  action: "report" | "template",
  plan: PlanKey = "free"
): Promise<QuotaResult> {
  const limits = PLAN_LIMITS[plan];
  const limit = action === "report" ? limits.reports : limits.templates;

  // TODO: Supabase에서 현재 월 사용량 조회
  // const { count } = await prisma.report.count({
  //   where: { deal: { userId }, createdAt: { gte: startOfMonth } }
  // });
  const used = 0; // placeholder

  return {
    allowed: used < limit,
    used,
    limit,
    plan,
  };
}
