import { createHash } from "node:crypto";
import type { BillingIntent, BillingRepository, BillingSubscription, ProviderPayment } from "./billing-lifecycle";

export interface BillingEventReceipt {
  id: string; userId: string; intentId: string; subscriptionId: string | null;
  paymentKey: string; orderId: string; amount: number; currency: string; status: string;
}
export interface BillingEventTarget {
  intent: BillingIntent; receipt: BillingEventReceipt | null; subscription: BillingSubscription | null;
}
export interface BillingEventRepository extends Pick<BillingRepository, "claim" | "commitPaid" | "finish"> {
  findEventTarget(hint: { orderId?: string; paymentKey?: string }): Promise<BillingEventTarget | null>;
  /** Revalidate all immutable receipt fields and fresh subscription/version/period under User lock.
   * Full cancellation of the current receipt suspends access; partial cancellation only stops
   * renewal. Older periods never change current access. No refund/provider mutation is allowed.
   */
  holdVerifiedCancellation(target: BillingEventTarget, payment: ProviderPayment, now: Date): Promise<"RECORDED" | "DUPLICATE" | "STALE">;
}
export interface BillingEventPorts {
  repository: BillingEventRepository;
  /** Server-authenticated fixed-origin GET of the persisted order, bounded to the webhook budget. */
  lookupByOrder(intent: Readonly<BillingIntent>): Promise<ProviderPayment | null>;
  now(): Date;
  newId(): string;
  /** Shared strict limiter; storage failure must throw, never fail open. Keys contain no raw refs. */
  allow(key: string): Promise<boolean>;
}
export type BillingEventOutcome = "IGNORED" | "UNVERIFIED" | "MISSING" | "RETRY" | "RATE_LIMITED" |
  "STALE" | "RECORDED" | "DUPLICATE" | "SUCCEEDED" | "HOLD";

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function identifier(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_=-]{1,200}$/.test(value) ? value : undefined;
}
function receiptMatches(target: BillingEventTarget, payment: ProviderPayment): boolean {
  const { intent, receipt } = target;
  return !!intent.userId && payment.paymentKey.length > 0 && payment.orderId === intent.orderId &&
    payment.amount === intent.amount && payment.currency === intent.currency &&
    (!receipt || (receipt.userId === intent.userId && receipt.intentId === intent.id &&
      receipt.paymentKey === payment.paymentKey && receipt.orderId === intent.orderId &&
      receipt.amount === intent.amount && receipt.currency === intent.currency));
}

/** General Toss payment events have no documented signature. The body is only a lookup hint.
 * Reference: https://docs.tosspayments.com/reference/using-api/webhook-events
 * BILLING_DELETED has no independently verifiable deletion lookup here and causes no mutation.
 * This service never charges, cancels/refunds remotely, trusts a customerKey, or logs a body.
 */
export class BillingEventService {
  constructor(private readonly ports: BillingEventPorts) {}
  async handle(body: unknown): Promise<BillingEventOutcome> {
    const event = object(body);
    if (event?.eventType === "BILLING_DELETED") return "UNVERIFIED";
    if (event?.eventType !== "PAYMENT_STATUS_CHANGED") return "IGNORED";
    const data = object(event.data);
    const orderId = identifier(data?.orderId), paymentKey = identifier(data?.paymentKey);
    if (!orderId && !paymentKey) return "MISSING";
    try {
      if (!await this.ports.allow("billing-events:global")) return "RATE_LIMITED";
      const target = await this.ports.repository.findEventTarget({ orderId, paymentKey });
      if (!target || (orderId && target.intent.orderId !== orderId) ||
          (paymentKey && target.receipt && target.receipt.paymentKey !== paymentKey)) return "MISSING";
      const digest = createHash("sha256").update(target.intent.orderId).digest("hex");
      if (!await this.ports.allow(`billing-events:order:${digest}`)) return "RATE_LIMITED";
      const payment = await this.ports.lookupByOrder(target.intent);
      if (!payment) return "RETRY";
      if (!receiptMatches(target, payment) || (paymentKey && payment.paymentKey !== paymentKey)) return "HOLD";
      const now = this.ports.now();
      if (!Number.isFinite(now.getTime())) return "RETRY";
      if (target.receipt) {
        if (payment.status === "CANCELED" || payment.status === "PARTIAL_CANCELED") {
          return this.ports.repository.holdVerifiedCancellation(target, payment, now);
        }
        // DONE cannot revive a previously cancelled/held receipt or extend any paid period.
        return payment.status === "DONE" ? "DUPLICATE" : "RETRY";
      }
      // A forged event for an uncharged PREPARED intent must never start a provider charge.
      if (!["PROCESSING", "UNKNOWN"].includes(target.intent.status) || !target.intent.firstChargeAt) return "HOLD";
      if (!["DONE", "CANCELED", "PARTIAL_CANCELED"].includes(payment.status)) return "RETRY";
      const lease = await this.ports.repository.claim({ id: target.intent.id, userId: target.intent.userId,
        version: target.intent.version, mode: "reconcile", now, workerToken: this.ports.newId(),
        leaseUntil: new Date(now.getTime() + 30_000) });
      if (!lease) return "STALE";
      if (payment.status === "CANCELED" || payment.status === "PARTIAL_CANCELED") {
        return await this.ports.repository.finish(lease, "HOLD", this.ports.now()) ? "HOLD" : "STALE";
      }
      const committed = await this.ports.repository.commitPaid(lease, payment, this.ports.now());
      return committed === "COMMITTED" ? "SUCCEEDED" : committed === "POLICY_HOLD" ? "HOLD" : "STALE";
    } catch {
      // Any ambiguous lookup/storage outcome is retried as a query, never a fresh charge.
      return "RETRY";
    }
  }
}
