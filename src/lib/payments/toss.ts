import { SubscriptionPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const TOSS_API = "https://api.tosspayments.com/v1";

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
  orderId: string
) {
  const auth = getAuthHeader();
  if (!auth) throw new Error("Toss secret key not configured");

  const amount = PLAN_PRICES[planKey];
  if (!amount) throw new Error("Invalid plan");

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
      orderName: `DealSync ${PLAN_NAMES[planKey] ?? planKey} 구독`,
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
