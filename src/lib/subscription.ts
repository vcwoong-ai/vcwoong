import { SubscriptionPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PlanKey } from "@/lib/quotas";
import { PLAN_LIMITS } from "@/lib/quotas";

export const PLAN_DISPLAY: Record<SubscriptionPlan, { name: string; price: number; planKey: PlanKey }> = {
  FREE: { name: "Free", price: 0, planKey: "free" },
  SOLO: { name: "Solo (Pro)", price: 99000, planKey: "solo" },
  SECTOR_PRO: { name: "Sector Pro", price: 290000, planKey: "sector_pro" },
  MULTI: { name: "Multi-Sector", price: 790000, planKey: "multi" },
  FULL: { name: "Full-Stack", price: 1490000, planKey: "full" },
  BIO_PREMIUM: { name: "Bio Premium", price: 1990000, planKey: "bio_premium" },
};

export const UPGRADE_PLANS: SubscriptionPlan[] = [
  SubscriptionPlan.SOLO,
  SubscriptionPlan.SECTOR_PRO,
  SubscriptionPlan.MULTI,
];

export function planParamToEnum(plan: string): SubscriptionPlan {
  const map: Record<string, SubscriptionPlan> = {
    free: SubscriptionPlan.FREE,
    solo: SubscriptionPlan.SOLO,
    sector_pro: SubscriptionPlan.SECTOR_PRO,
    multi: SubscriptionPlan.MULTI,
    full: SubscriptionPlan.FULL,
    bio_premium: SubscriptionPlan.BIO_PREMIUM,
  };
  return map[plan.toLowerCase()] ?? SubscriptionPlan.SOLO;
}

export function enumToPlanKey(plan: SubscriptionPlan): PlanKey {
  return PLAN_DISPLAY[plan].planKey;
}

export async function getUserPlanKey(userId: string): Promise<PlanKey> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionPlan: true, subscriptionStatus: true },
  });
  if (!user || user.subscriptionStatus !== "ACTIVE") return "free";
  return enumToPlanKey(user.subscriptionPlan);
}

export async function getUserSubscription(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionPlan: true,
      subscriptionStatus: true,
      billingKey: true,
    },
  });
}

export async function activateSubscription(
  userId: string,
  plan: SubscriptionPlan,
  billingKey: string
) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionPlan: plan,
      subscriptionStatus: "ACTIVE",
      billingKey,
    },
  });
}

export async function cancelSubscription(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionPlan: SubscriptionPlan.FREE,
      subscriptionStatus: "CANCELED",
      billingKey: null,
    },
  });
}

export function getPlanLimitsForUser(plan: SubscriptionPlan) {
  return PLAN_LIMITS[enumToPlanKey(plan)];
}

export const PLANS: Record<
  PlanKey,
  { name: string; price: number; features: string[] }
> = {
  free: {
    name: "Free",
    price: 0,
    features: ["월 5건 보고서", "1개 섹터", "양식 2개", "6개 AI 에이전트"],
  },
  solo: {
    name: "Solo (Pro)",
    price: 99000,
    features: ["월 20건 보고서", "1개 섹터", "양식 3개", "DOCX보내기"],
  },
  sector_pro: {
    name: "Sector Pro",
    price: 290000,
    features: ["월 50건 보고서", "1개 섹터", "양식 10개", "양식 재현 엔진"],
  },
  multi: {
    name: "Multi-Sector",
    price: 790000,
    features: ["월 100건 보고서", "3개 섹터", "양식 30개", "LP 리포팅"],
  },
  full: {
    name: "Full-Stack",
    price: 1490000,
    features: ["월 300건 보고서", "6개 섹터", "양식 100개", "팀 협업"],
  },
  bio_premium: {
    name: "Bio Premium",
    price: 1990000,
    features: ["월 300건 보고서", "6개 섹터", "rNPV 부록", "PubMed/FDA 연동"],
  },
};

export function getPlanByKey(key: PlanKey) {
  return PLANS[key];
}
