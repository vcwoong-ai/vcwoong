import type { BillingCycle } from "../plans";
import type { PlanKey } from "../quotas";
import { billingPeriodUTC, withinBillingPeriod } from "./billing-period";

export type PaidPlan = Exclude<PlanKey, "free">;
export type BillingIntentStatus = "PREPARED" | "PROCESSING" | "UNKNOWN" | "SUCCEEDED" | "HOLD" | "CANCELLED";
export type BillingOperation = "INITIAL" | "RENEWAL";
export interface BillingSubscription {
  id: string; userId: string; version: number; plan: PaidPlan; cycle: BillingCycle;
  anchor: Date; paidThroughIndex: number; periodStart: Date; periodEnd: Date;
  status: "ACTIVE" | "CANCELLED"; cancelAtPeriodEnd: boolean;
}
/** All identifiers/price/ref fields are immutable, server-created, persisted before any charge. */
export interface BillingIntent {
  id: string; userId: string; operation: BillingOperation; plan: PaidPlan; cycle: BillingCycle;
  anchor: Date; periodIndex: number; periodStart: Date; periodEnd: Date;
  subscriptionId: string | null; subscriptionVersion: number | null;
  amount: number; currency: "KRW"; orderId: string; idempotencyKey: string;
  customerRef: string; paymentMethodRef: string;
  status: BillingIntentStatus; version: number; createdAt: Date; expiresAt: Date;
  firstChargeAt: Date | null; leaseUntil: Date | null; workerToken: string | null;
}
export interface BillingLease { intent: BillingIntent; workerToken: string; leaseUntil: Date }
export interface ProviderPayment {
  orderId: string; paymentKey: string; amount: number; currency: string;
  status: "DONE" | "CANCELED" | "PARTIAL_CANCELED" | "PENDING";
}
export interface BillingProvider {
  charge(intent: Readonly<BillingIntent>): Promise<ProviderPayment>;
  /** Not found is still ambiguous after a timeout; it never authorizes a fresh charge. */
  lookupByOrder(intent: Readonly<BillingIntent>): Promise<ProviderPayment | null>;
}
export type CommitPaidResult = "COMMITTED" | "STALE" | "POLICY_HOLD";
export interface BillingRepository {
  getSubscription(userId: string): Promise<BillingSubscription | null>;
  getIntent(id: string, userId: string): Promise<BillingIntent | null>;
  /** Atomic reservation: INITIAL unique(userId,operation) across different checkout anchors;
   * RENEWAL unique(subscriptionId,periodIndex). Return existing immutable intent on duplicate.
   * This first implementation deliberately holds reactivation/plan replacement for policy review.
   */
  createIntentIfAbsent(intent: BillingIntent): Promise<BillingIntent>;
  /** Atomic version + state + expired/empty lease CAS. Charge only PREPARED, lookup otherwise.
   * Recheck subscription eligibility/cancellation/version in this transaction BEFORE charging.
   * For charge, set PROCESSING and firstChargeAt BEFORE returning the lease.
   * For reconciliation, set UNKNOWN; never reset firstChargeAt or generated keys.
   */
  claim(input: { id: string; userId: string; version: number; now: Date; workerToken: string;
    leaseUntil: Date; mode: "charge" | "reconcile" }): Promise<BillingLease | null>;
  /** CAS workerToken + intent version + unexpired lease; release lease on transition. */
  finish(lease: BillingLease, status: "UNKNOWN" | "HOLD" | "CANCELLED", now: Date): Promise<boolean>;
  /** ONE transaction: fence lease/version; unique paymentKey/attempt; check subscription version,
   * continuity and cancellation; insert payment; set paid period; mark intent SUCCEEDED/release.
   * If subscription policy changed after a charge, persist a manual-review payment, mark HOLD,
   * and return POLICY_HOLD without reviving access. Failure must roll back all writes.
   */
  commitPaid(lease: BillingLease, payment: ProviderPayment, now: Date): Promise<CommitPaidResult>;
}
export interface BillingPorts {
  repository: BillingRepository; provider: BillingProvider; now(): Date; newId(): string;
  /** Wire existing planAmount/priceForCycle here; client-supplied amounts are never accepted. */
  price(plan: PaidPlan, cycle: BillingCycle): number;
  leaseMs?: number;
}
export class BillingPolicyHold extends Error {
  constructor() { super("Billing requires policy review"); this.name = "BillingPolicyHold"; }
}
export type BillingOutcome = "SUCCEEDED" | "UNKNOWN" | "BUSY" | "STALE" | "HOLD" | "CANCELLED" | "MISSING";

function eligible(subscription: BillingSubscription | null, intent: Pick<BillingIntent,
  "operation" | "userId" | "plan" | "cycle" | "anchor" | "periodIndex" | "subscriptionId" | "subscriptionVersion">): boolean {
  if (intent.operation === "INITIAL") return subscription === null && intent.periodIndex === 0;
  if (!subscription) return false;
  try {
    const paid = billingPeriodUTC(subscription.anchor, subscription.cycle, subscription.paidThroughIndex);
    const next = billingPeriodUTC(intent.anchor, intent.cycle, intent.periodIndex);
    if (paid.start.getTime() !== subscription.periodStart.getTime() || paid.end.getTime() !== subscription.periodEnd.getTime() ||
        next.start.getTime() !== subscription.periodEnd.getTime()) return false;
  } catch { return false; }
  return subscription !== null && subscription.userId === intent.userId && subscription.status === "ACTIVE" &&
    !subscription.cancelAtPeriodEnd && subscription.id === intent.subscriptionId &&
    subscription.version === intent.subscriptionVersion && subscription.plan === intent.plan &&
    subscription.cycle === intent.cycle && subscription.anchor.getTime() === intent.anchor.getTime() &&
    intent.periodIndex === subscription.paidThroughIndex + 1;
}

export function hasBillingPeriodAccess(subscription: BillingSubscription, now: Date): boolean {
  return subscription.status === "ACTIVE" && withinBillingPeriod(now, subscription.periodStart, subscription.periodEnd);
}

/** Infrastructure-independent core only. This class does not make checkout ready or add app routes. */
export class BillingLifecycle {
  private readonly leaseMs: number;
  constructor(private readonly ports: BillingPorts) {
    this.leaseMs = ports.leaseMs ?? 120_000;
    if (!Number.isSafeInteger(this.leaseMs) || this.leaseMs < 1000 || this.leaseMs > 600_000) throw new BillingPolicyHold();
  }
  async prepare(input: { userId: string; plan: PaidPlan; cycle: BillingCycle; anchor: Date;
    periodIndex: number; operation: BillingOperation; customerRef: string; paymentMethodRef: string }): Promise<BillingIntent> {
    // The future server adapter must bind user/ref fields to authentication and vault ownership.
    // This engine is not an HTTP authorization boundary.
    const now = this.ports.now();
    const period = billingPeriodUTC(input.anchor, input.cycle, input.periodIndex);
    if (!withinBillingPeriod(now, period.start, period.end) || !input.userId || !input.customerRef || !input.paymentMethodRef ||
        !["INITIAL", "RENEWAL"].includes(input.operation) ||
        !["solo", "sector_pro", "multi", "full", "bio_premium"].includes(input.plan)) throw new BillingPolicyHold();
    const subscription = await this.ports.repository.getSubscription(input.userId);
    const amount = this.ports.price(input.plan, input.cycle);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new BillingPolicyHold();
    const intent: BillingIntent = { ...input, subscriptionId: subscription?.id ?? null,
      subscriptionVersion: subscription?.version ?? null, amount, currency: "KRW",
      periodStart: period.start, periodEnd: period.end,
      id: this.ports.newId(), orderId: this.ports.newId(), idempotencyKey: this.ports.newId(),
      status: "PREPARED", version: 0, createdAt: now, expiresAt: new Date(Math.min(now.getTime() + 30 * 60_000, period.end.getTime())),
      firstChargeAt: null, workerToken: null, leaseUntil: null };
    if (!intent.id || !/^[a-zA-Z0-9_-]{6,64}$/.test(intent.orderId) ||
        intent.idempotencyKey.length < 6 || intent.idempotencyKey.length > 300 ||
        new Set([intent.id, intent.orderId, intent.idempotencyKey]).size !== 3) throw new BillingPolicyHold();
    if (!eligible(subscription, intent)) throw new BillingPolicyHold();
    const saved = await this.ports.repository.createIntentIfAbsent(intent);
    // A duplicate request may not reinterpret the stored order's price/plan/method/period.
    if (saved.userId !== intent.userId || saved.plan !== intent.plan || saved.cycle !== intent.cycle ||
        saved.operation !== intent.operation || saved.periodStart.getTime() !== intent.periodStart.getTime() ||
        saved.periodEnd.getTime() !== intent.periodEnd.getTime() || saved.amount !== intent.amount ||
        saved.customerRef !== intent.customerRef || saved.paymentMethodRef !== intent.paymentMethodRef) throw new BillingPolicyHold();
    return saved;
  }

  async execute(id: string, userId: string): Promise<BillingOutcome> {
    const intent = await this.ports.repository.getIntent(id, userId);
    if (!intent) return "MISSING";
    if (intent.status === "SUCCEEDED" || intent.status === "HOLD" || intent.status === "CANCELLED") return intent.status;
    const now = this.ports.now();
    if (!Number.isFinite(now.getTime())) throw new BillingPolicyHold();
    if (intent.leaseUntil && intent.leaseUntil.getTime() > now.getTime()) return "BUSY";
    const mode = intent.status === "PREPARED" && intent.firstChargeAt === null ? "charge" : "reconcile";
    if (mode === "charge") {
      if (now.getTime() >= intent.expiresAt.getTime() || !withinBillingPeriod(now, intent.periodStart, intent.periodEnd)) return "HOLD";
      const subscription = await this.ports.repository.getSubscription(userId);
      if (!eligible(subscription, intent)) return "HOLD";
    }
    const lease = await this.ports.repository.claim({ id, userId, version: intent.version, now,
      workerToken: this.ports.newId(), leaseUntil: new Date(now.getTime() + this.leaseMs), mode });
    if (!lease) return "STALE";
    try {
      const payment = mode === "charge" ? await this.ports.provider.charge(lease.intent) :
        await this.ports.provider.lookupByOrder(lease.intent);
      const completedAt = this.ports.now();
      if (lease.leaseUntil.getTime() <= completedAt.getTime()) return "STALE";
      if (!payment) return await this.finish(lease, "UNKNOWN", completedAt);
      if (!payment.paymentKey || payment.orderId !== lease.intent.orderId || payment.amount !== lease.intent.amount ||
          payment.currency !== lease.intent.currency || payment.status === "CANCELED" || payment.status === "PARTIAL_CANCELED") {
        return await this.finish(lease, "HOLD", completedAt);
      }
      if (payment.status !== "DONE") return await this.finish(lease, "UNKNOWN", completedAt);
      const committed = await this.ports.repository.commitPaid(lease, payment, completedAt);
      return committed === "COMMITTED" ? "SUCCEEDED" : committed === "POLICY_HOLD" ? "HOLD" : "STALE";
    } catch {
      // Timeout and a successful remote charge followed by DB failure are equally ambiguous.
      // If this write also fails, expired PROCESSING will still be reconciled, never charged again.
      try { return await this.finish(lease, "UNKNOWN", this.ports.now()); } catch { return "UNKNOWN"; }
    }
  }

  private async finish(lease: BillingLease, status: "UNKNOWN" | "HOLD", now: Date): Promise<BillingOutcome> {
    if (lease.leaseUntil.getTime() <= now.getTime()) return "STALE";
    return await this.ports.repository.finish(lease, status, now) ? status : "STALE";
  }
}
