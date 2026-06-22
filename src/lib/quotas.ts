export const PLAN_LIMITS = {
  free:        { reports: 1,   sectors: 1, templates: 1 },
  solo:        { reports: 20,  sectors: 1, templates: 3 },
  sector_pro:  { reports: 50,  sectors: 1, templates: 10 },
  multi:       { reports: 100, sectors: 3, templates: 30 },
  full:        { reports: 300, sectors: 6, templates: 100 },
  bio_premium: { reports: 300, sectors: 6, templates: 100 },
} as const;

export type PlanKey = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[(plan as PlanKey)] ?? PLAN_LIMITS.free;
}
