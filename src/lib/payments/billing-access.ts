import type { PlanKey } from "../quotas";
import { billingPeriodUTC, withinBillingPeriod } from "./billing-period";

export interface StoredBillingAccess {
  plan: string; cycle: string; status: string; anchor: Date; paidThroughIndex: number;
  periodStart: Date; periodEnd: Date; version: number; cancelAtPeriodEnd: boolean;
}
export interface BillingAccessView {
  plan: PlanKey;
  source: "legacy" | "durable";
  billing: { version: number; paidUntil: Date | null; cancelAtPeriodEnd: boolean; canCancel: boolean } | null;
}
const plans: Record<string, PlanKey> = {
  FREE: "free", SOLO: "solo", SECTOR_PRO: "sector_pro", MULTI: "multi", FULL: "full", BIO_PREMIUM: "bio_premium",
};

/** A present but expired/corrupt/cancelled durable row NEVER falls back to legacy paid access. */
export function billingAccessView(durable: StoredBillingAccess | null,
  legacy: { subscriptionPlan: string; subscriptionStatus: string } | null, now: Date): BillingAccessView {
  if (!durable) return { source: "legacy", plan: legacy?.subscriptionStatus === "ACTIVE" &&
    Object.prototype.hasOwnProperty.call(plans, legacy.subscriptionPlan) ? plans[legacy.subscriptionPlan] : "free", billing: null };
  let valid = false;
  try {
    const canonical = billingPeriodUTC(durable.anchor, durable.cycle as "monthly" | "yearly", durable.paidThroughIndex);
    valid = ["solo", "sector_pro", "multi", "full", "bio_premium"].includes(durable.plan) &&
      ["ACTIVE", "CANCELLED"].includes(durable.status) && Number.isSafeInteger(durable.version) && durable.version >= 0 &&
      typeof durable.cancelAtPeriodEnd === "boolean" && canonical.start.getTime() === durable.periodStart.getTime() &&
      canonical.end.getTime() === durable.periodEnd.getTime() && Number.isFinite(now.getTime());
  } catch { valid = false; }
  const active = valid && durable.status === "ACTIVE";
  return { source: "durable", plan: active && withinBillingPeriod(now, durable.periodStart, durable.periodEnd) ? durable.plan as PlanKey : "free",
    billing: { version: durable.version, paidUntil: valid ? durable.periodEnd : null,
      cancelAtPeriodEnd: durable.cancelAtPeriodEnd === true, canCancel: active && !durable.cancelAtPeriodEnd } };
}
