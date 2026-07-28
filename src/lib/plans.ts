import { SubscriptionPlan } from "@prisma/client";
import type { PlanKey } from "@/lib/quotas";
import { PLAN_LIMITS } from "@/lib/quotas";

/** 플랜별로 잠기는 기능 */
export type PlanFeature =
  | "lpReporting"
  | "portfolio"
  | "sourcing"
  | "templateEngine"
  | "bioExternalData"
  | "teamCollaboration";

export const FEATURE_LABEL: Record<PlanFeature, string> = {
  lpReporting: "LP 리포팅",
  portfolio: "포트폴리오 사후관리",
  sourcing: "딜소싱 인박스",
  templateEngine: "양식 재현 엔진",
  bioExternalData: "PubMed·FDA·KIPRIS 외부 데이터",
  teamCollaboration: "팀 협업 (딜·양식 공유)",
};

const FEATURES: Record<PlanKey, PlanFeature[]> = {
  free: ["sourcing"],
  solo: ["sourcing", "portfolio"],
  sector_pro: ["sourcing", "portfolio", "templateEngine"],
  multi: ["sourcing", "portfolio", "templateEngine", "lpReporting", "teamCollaboration"],
  full: [
    "sourcing",
    "portfolio",
    "templateEngine",
    "lpReporting",
    "bioExternalData",
    "teamCollaboration",
  ],
  bio_premium: [
    "sourcing",
    "portfolio",
    "templateEngine",
    "lpReporting",
    "bioExternalData",
    "teamCollaboration",
  ],
};

/** 공개 가격표 — 랜딩과 설정이 같은 정의를 쓰도록 단일 소스로 관리한다 */
export type BillingCycle = "monthly" | "yearly";

/** 연간 결제 시 월 환산 할인율 (2개월 무료 ≈ 16.7%) */
export const YEARLY_DISCOUNT = 2 / 12;

export interface PublicPlan {
  key: PlanKey;
  enumValue: SubscriptionPlan;
  name: string;
  price: number;
  /** 연간 일시납 (월가 × 10 = 2개월 무료) */
  yearlyPrice: number;
  tagline: string;
  highlight?: boolean;
  features: string[];
}

export function yearlyPriceFromMonthly(monthly: number): number {
  if (monthly === 0) return 0;
  return monthly * 10;
}

export function priceForCycle(plan: PublicPlan, cycle: BillingCycle): number {
  return cycle === "yearly" ? plan.yearlyPrice : plan.price;
}

export function monthlyEquivalent(plan: PublicPlan, cycle: BillingCycle): number {
  if (cycle === "monthly") return plan.price;
  return Math.round(plan.yearlyPrice / 12);
}

export const PUBLIC_PLANS: PublicPlan[] = [
  {
    key: "free",
    enumValue: SubscriptionPlan.FREE,
    name: "Free",
    price: 0,
    yearlyPrice: 0,
    tagline: "제품을 직접 써보고 판단하세요",
    features: [
      `월 ${PLAN_LIMITS.free.reports}건 보고서`,
      `양식 ${PLAN_LIMITS.free.templates}개`,
      "6개 섹터 AI 에이전트",
      "딜소싱 인박스",
      "DOCX 내보내기",
    ],
  },
  {
    key: "solo",
    enumValue: SubscriptionPlan.SOLO,
    name: "Solo",
    price: 99000,
    yearlyPrice: yearlyPriceFromMonthly(99000),
    tagline: "1인 심사역 · 단일 섹터 집중",
    features: [
      `월 ${PLAN_LIMITS.solo.reports}건 보고서`,
      `양식 ${PLAN_LIMITS.solo.templates}개`,
      "포트폴리오 사후관리",
      "섹션별 재생성 · 품질 점수",
    ],
  },
  {
    key: "sector_pro",
    enumValue: SubscriptionPlan.SECTOR_PRO,
    name: "Sector Pro",
    price: 290000,
    yearlyPrice: yearlyPriceFromMonthly(290000),
    tagline: "섹터 전담 심사 조직",
    highlight: true,
    features: [
      `월 ${PLAN_LIMITS.sector_pro.reports}건 보고서`,
      `양식 ${PLAN_LIMITS.sector_pro.templates}개`,
      "회사 양식 재현 엔진",
      "약한 섹션 일괄 개선",
    ],
  },
  {
    key: "multi",
    enumValue: SubscriptionPlan.MULTI,
    name: "Multi-Sector",
    price: 790000,
    yearlyPrice: yearlyPriceFromMonthly(790000),
    tagline: "멀티 섹터 운용사",
    features: [
      `월 ${PLAN_LIMITS.multi.reports}건 보고서`,
      `양식 ${PLAN_LIMITS.multi.templates}개`,
      "LP 리포팅 (펀드 지표·DOCX)",
      "팀 협업 · 딜·양식 공유",
      "펀드 다중 관리",
    ],
  },
  {
    key: "full",
    enumValue: SubscriptionPlan.FULL,
    name: "Full-Stack",
    price: 1490000,
    yearlyPrice: yearlyPriceFromMonthly(1490000),
    tagline: "풀사이클 전면 도입",
    features: [
      `월 ${PLAN_LIMITS.full.reports}건 보고서`,
      `양식 ${PLAN_LIMITS.full.templates}개`,
      "PubMed·FDA 외부 데이터",
      "딜소싱 → LP 리포팅 풀사이클",
    ],
  },
  {
    key: "bio_premium",
    enumValue: SubscriptionPlan.BIO_PREMIUM,
    name: "Bio Premium",
    price: 1990000,
    yearlyPrice: yearlyPriceFromMonthly(1990000),
    tagline: "바이오 특화 심사 조직",
    features: [
      `월 ${PLAN_LIMITS.bio_premium.reports}건 보고서`,
      "rNPV 자동 부록",
      "ClinicalTrials·OpenFDA 실시간",
      "Full-Stack 전체 포함",
    ],
  },
];

export function planByKey(key: PlanKey): PublicPlan {
  return PUBLIC_PLANS.find((p) => p.key === key) ?? PUBLIC_PLANS[0];
}

export function hasFeature(plan: PlanKey, feature: PlanFeature): boolean {
  return FEATURES[plan].includes(feature);
}

/** 해당 기능을 처음 제공하는 최소 플랜 */
export function minPlanFor(feature: PlanFeature): PublicPlan {
  const found = PUBLIC_PLANS.find((p) => hasFeature(p.key, feature));
  return found ?? PUBLIC_PLANS[PUBLIC_PLANS.length - 1];
}

/** 받침 유무에 따라 은/는 같은 조사를 고른다 */
export function withParticle(
  word: string,
  withBatchim: string,
  withoutBatchim: string
): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  // 한글 음절이 아니면 받침 없는 형태로 처리
  if (code < 0xac00 || code > 0xd7a3) return `${word}${withoutBatchim}`;
  const hasBatchim = (code - 0xac00) % 28 !== 0;
  return `${word}${hasBatchim ? withBatchim : withoutBatchim}`;
}

export function featureLockMessage(feature: PlanFeature): string {
  const min = minPlanFor(feature);
  const subject = withParticle(FEATURE_LABEL[feature], "은", "는");
  return `${subject} ${min.name} 플랜부터 사용할 수 있습니다.`;
}
