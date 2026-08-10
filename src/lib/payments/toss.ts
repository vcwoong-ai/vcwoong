import { SubscriptionPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/lib/brand";
import { yearlyPriceFromMonthly, type BillingCycle } from "@/lib/plans";

export const PLAN_PRICES: Record<string, number> = {
  solo: 99000,
  sector_pro: 290000,
  multi: 790000,
  full: 1490000,
  bio_premium: 1990000,
};

export const PLAN_NAMES: Record<string, string> = {
  solo: "Solo (Pro)",
  sector_pro: "Sector Pro",
  multi: "Multi-Sector",
  full: "Full-Stack",
  bio_premium: "Bio Premium",
};

export function planAmount(planKey: string, cycle: BillingCycle = "monthly"): number {
  const monthly = PLAN_PRICES[planKey];
  if (!monthly) throw new Error("Invalid plan");
  return cycle === "yearly" ? yearlyPriceFromMonthly(monthly) : monthly;
}

const TOSS_API = "https://api.tosspayments.com/v1";

function getAuthHeader(): string | null {
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) return null;
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

export function isTossConfigured(): boolean {
  return Boolean(
    getAuthHeader() &&
      (process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.startsWith("test_ck_") ||
        process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.startsWith("live_ck_"))
  );
}

export async function issueBillingKey(authKey: string, customerKey: string) {
  const auth = getAuthHeader();
  if (!auth) throw new Error("Toss secret key not configured");

  const res = await fetch(`${TOSS_API}/billing/authorizations/issue`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ authKey, customerKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? "Billing key issue failed");
  return { billingKey: data.billingKey as string };
}

export async function chargeBilling(
  billingKey: string,
  customerKey: string,
  planKey: string,
  orderId: string,
  cycle: BillingCycle = "monthly"
) {
  const auth = getAuthHeader();
  if (!auth) throw new Error("Toss secret key not configured");

  const amount = planAmount(planKey, cycle);

  const cycleLabel = cycle === "yearly" ? "연간" : "월간";
  const res = await fetch(`${TOSS_API}/billing/${billingKey}`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customerKey,
      amount,
      orderId,
      orderName: `${BRAND.name} ${PLAN_NAMES[planKey] ?? planKey} ${cycleLabel} 구독`,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? "Charge failed");
  return {
    paymentKey: data.paymentKey as string,
    orderId: data.orderId as string,
    totalAmount: data.totalAmount as number,
  };
}

/** 웹훅 시크릿을 실어 보낼 수 있는 헤더 이름들 */
export const TOSS_WEBHOOK_SECRET_HEADERS = [
  "x-toss-webhook-secret",
  "x-webhook-secret",
] as const;

/**
 * 웹훅 요청의 공유 시크릿을 검증한다.
 *
 * 시크릿이 설정돼 있지 않으면 통과시키지 않는다(fail-closed). 이 엔드포인트는
 * 인증 없이 열려 있고 customerKey가 추측 가능해서, 검증 없이 받아주면 아무나
 * 남의 구독을 해지시킬 수 있기 때문이다.
 */
export function verifyTossWebhookSecret(
  headers: { get(name: string): string | null },
  expectedSecret = process.env.TOSS_WEBHOOK_SECRET
): boolean {
  const expected = expectedSecret?.trim();
  if (!expected) return false;
  return TOSS_WEBHOOK_SECRET_HEADERS.some(
    (header) => headers.get(header)?.trim() === expected
  );
}

/**
 * 결제 건을 Toss에 직접 조회한다.
 *
 * 웹훅 본문은 누구나 위조해서 보낼 수 있으므로, 본문 값을 그대로 믿고
 * DB를 바꾸면 안 된다. 실제 상태는 항상 Toss API로 되물어 확인한다.
 * 조회할 수 없으면 null.
 */
export async function getPayment(
  paymentKey: string
): Promise<{ status: string; orderId: string } | null> {
  const auth = getAuthHeader();
  if (!auth) return null;

  try {
    const res = await fetch(
      `${TOSS_API}/payments/${encodeURIComponent(paymentKey)}`,
      { headers: { Authorization: auth } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.status !== "string") return null;
    return { status: data.status, orderId: String(data.orderId ?? "") };
  } catch (error) {
    console.error("[Toss] 결제 조회 실패:", error);
    return null;
  }
}

export async function recordPayment(
  userId: string,
  plan: SubscriptionPlan,
  amount: number,
  status: string,
  paymentKey?: string
) {
  return prisma.subscriptionPayment.create({
    data: { userId, plan, amount, status, paymentKey },
  });
}
