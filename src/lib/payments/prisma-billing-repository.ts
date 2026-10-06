import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { BillingEventTarget } from "./billing-events";
import { billingPeriodUTC, withinBillingPeriod } from "./billing-period";
import {
  BillingPolicyHold,
  type BillingIntent,
  type BillingLease,
  type BillingRepository,
  type BillingSubscription,
  type CommitPaidResult,
  type ProviderPayment,
} from "./billing-lifecycle";

type Tx = Prisma.TransactionClient;
type StoredIntent = Prisma.BillingIntentGetPayload<Record<string, never>>;
type StoredSubscription = Prisma.BillingSubscriptionGetPayload<Record<string, never>>;
export type StoredBillingMethod = Prisma.BillingPaymentMethodGetPayload<Record<string, never>>;
export interface BillingMaintenanceCandidate {
  id: string; userId: string; version: number;
}
export interface BillingRenewalContext {
  subscription: BillingSubscription;
  existingIntent: BillingIntent | null;
  customerRef: string;
  paymentMethodRef: string;
}

function subscription(row: StoredSubscription | null): BillingSubscription | null {
  if (!row) return null;
  if (!["solo", "sector_pro", "multi", "full", "bio_premium"].includes(row.plan) ||
      !["monthly", "yearly"].includes(row.cycle) || !["ACTIVE", "CANCELLED"].includes(row.status)) {
    throw new BillingPolicyHold();
  }
  return { id: row.id, userId: row.userId, version: row.version,
    plan: row.plan as BillingSubscription["plan"], cycle: row.cycle as BillingSubscription["cycle"],
    anchor: row.anchor, paidThroughIndex: row.paidThroughIndex, periodStart: row.periodStart,
    periodEnd: row.periodEnd, status: row.status as BillingSubscription["status"],
    cancelAtPeriodEnd: row.cancelAtPeriodEnd };
}

function intent(row: StoredIntent): BillingIntent {
  if (!["INITIAL", "RENEWAL"].includes(row.operation) || row.currency !== "KRW" ||
      !["PREPARED", "PROCESSING", "UNKNOWN", "SUCCEEDED", "HOLD", "CANCELLED"].includes(row.status) ||
      !["solo", "sector_pro", "multi", "full", "bio_premium"].includes(row.plan) ||
      !["monthly", "yearly"].includes(row.cycle)) throw new BillingPolicyHold();
  const { reservationKey: _reservationKey, ...values } = row;
  // Explicit construction excludes infrastructure-only uniqueness keys.
  void _reservationKey;
  return { ...values, operation: row.operation as BillingIntent["operation"],
    plan: row.plan as BillingIntent["plan"], cycle: row.cycle as BillingIntent["cycle"],
    status: row.status as BillingIntent["status"], currency: "KRW" };
}

function sameDate(left: Date, right: Date) { return left.getTime() === right.getTime(); }

function eligible(current: BillingSubscription | null, pending: BillingIntent): boolean {
  const period = billingPeriodUTC(pending.anchor, pending.cycle, pending.periodIndex);
  if (!sameDate(period.start, pending.periodStart) || !sameDate(period.end, pending.periodEnd)) return false;
  if (pending.operation === "INITIAL") return current === null && pending.periodIndex === 0 &&
    pending.subscriptionId === null && pending.subscriptionVersion === null;
  if (!current || current.status !== "ACTIVE" || current.cancelAtPeriodEnd ||
      current.userId !== pending.userId || current.id !== pending.subscriptionId ||
      current.version !== pending.subscriptionVersion || current.plan !== pending.plan ||
      current.cycle !== pending.cycle || !sameDate(current.anchor, pending.anchor) ||
      pending.periodIndex !== current.paidThroughIndex + 1 || !sameDate(current.periodEnd, pending.periodStart)) return false;
  const previous = billingPeriodUTC(current.anchor, current.cycle, current.paidThroughIndex);
  return sameDate(previous.start, current.periodStart) && sameDate(previous.end, current.periodEnd);
}

function leaseWhere(lease: BillingLease, now: Date): Prisma.BillingIntentWhereInput {
  return { id: lease.intent.id, userId: lease.intent.userId, version: lease.intent.version,
    workerToken: lease.workerToken, status: { in: ["PROCESSING", "UNKNOWN"] }, leaseUntil: { gt: now } };
}

/** No singleton, environment reads, network calls or legacy entitlement writes.
 * Every writer locks User -> Intent -> Subscription. Callers must not use direct writes to cancel.
 */
export class PrismaBillingRepository implements BillingRepository {
  constructor(private readonly client: PrismaClient) {}

  private async lockUser(tx: Tx, userId: string, now: Date): Promise<void> {
    if (!Number.isFinite(now.getTime()) || !userId) throw new BillingPolicyHold();
    const locked = await tx.user.updateMany({ where: { id: userId }, data: { updatedAt: now } });
    if (locked.count !== 1) throw new BillingPolicyHold();
  }

  private async renewalPolicyAllowed(tx: Tx, current: BillingSubscription | null, pending: BillingIntent): Promise<boolean> {
    if (pending.operation !== "RENEWAL") return true;
    if (!current) return false;
    const blocked = await tx.billingIntent.findFirst({ where: { userId: pending.userId, id: { not: pending.id },
      status: { in: ["UNKNOWN", "PROCESSING", "HOLD"] } }, select: { id: true } });
    if (blocked) return false;
    const previous = await tx.billingIntent.findFirst({ where: { userId: current.userId, status: "SUCCEEDED",
      plan: current.plan, cycle: current.cycle, anchor: current.anchor, periodIndex: current.paidThroughIndex,
      periodStart: current.periodStart, periodEnd: current.periodEnd,
      customerRef: pending.customerRef, paymentMethodRef: pending.paymentMethodRef,
      amount: pending.amount,
      payment: { is: { userId: current.userId, subscriptionId: current.id, status: "APPLIED", amount: pending.amount } },
    }, select: { id: true } });
    return !!previous;
  }

  async getSubscription(userId: string): Promise<BillingSubscription | null> {
    return subscription(await this.client.billingSubscription.findUnique({ where: { userId } }));
  }

  async getIntent(id: string, userId: string): Promise<BillingIntent | null> {
    const row = await this.client.billingIntent.findFirst({ where: { id, userId } });
    return row ? intent(row) : null;
  }

  async createIntentIfAbsent(pending: BillingIntent): Promise<BillingIntent> {
    return this.client.$transaction(async (tx) => {
      await this.lockUser(tx, pending.userId, pending.createdAt);
      return this.createIntentIfAbsentInTransaction(tx, pending);
    });
  }

  /** Caller must already hold the user's row lock; checkout then locks its session before this call. */
  async createIntentIfAbsentInTransaction(tx: Tx, pending: BillingIntent): Promise<BillingIntent> {
      const reservationKey = pending.operation === "INITIAL" ? `INITIAL:${pending.userId}` :
        `RENEWAL:${pending.subscriptionId}:${pending.periodIndex}`;
      const existing = await tx.billingIntent.findUnique({ where: { reservationKey } });
      if (existing) return intent(existing);
      const current = subscription(await tx.billingSubscription.findUnique({ where: { userId: pending.userId } }));
      const legacy = await tx.user.findUniqueOrThrow({ where: { id: pending.userId }, select: { subscriptionPlan: true } });
      const method = await tx.billingPaymentMethod.findFirst({ where: {
        id: pending.paymentMethodRef, userId: pending.userId, customerRef: pending.customerRef, revokedAt: null } });
      const renewalAllowed = await this.renewalPolicyAllowed(tx, current, pending);
      if (pending.status !== "PREPARED" || pending.version !== 0 || pending.firstChargeAt !== null ||
          pending.workerToken !== null || pending.leaseUntil !== null || !eligible(current, pending) ||
          !method || !renewalAllowed || (pending.operation === "INITIAL" && legacy.subscriptionPlan !== "FREE") ||
          !withinBillingPeriod(pending.createdAt, pending.periodStart, pending.periodEnd) ||
          pending.expiresAt <= pending.createdAt || pending.expiresAt > pending.periodEnd ||
          !Number.isSafeInteger(pending.amount) || pending.amount <= 0 || pending.currency !== "KRW") {
        throw new BillingPolicyHold();
      }
      return intent(await tx.billingIntent.create({ data: { ...pending, reservationKey } }));
  }

  async claim(input: { id: string; userId: string; version: number; now: Date; workerToken: string;
    leaseUntil: Date; mode: "charge" | "reconcile" }): Promise<BillingLease | null> {
    if (!input.workerToken || !Number.isFinite(input.leaseUntil.getTime()) ||
        input.leaseUntil.getTime() <= input.now.getTime() ||
        input.leaseUntil.getTime() - input.now.getTime() > 600_000) throw new BillingPolicyHold();
    return this.client.$transaction(async (tx) => {
      await this.lockUser(tx, input.userId, input.now);
      const row = await tx.billingIntent.findFirst({ where: { id: input.id, userId: input.userId } });
      if (!row || row.version !== input.version || (row.leaseUntil && row.leaseUntil > input.now)) return null;
      const pending = intent(row);
      if (input.mode === "charge") {
        if (pending.status !== "PREPARED" || pending.firstChargeAt !== null || pending.expiresAt <= input.now ||
            !withinBillingPeriod(input.now, pending.periodStart, pending.periodEnd)) return null;
        const current = subscription(await tx.billingSubscription.findUnique({ where: { userId: input.userId } }));
        const legacy = await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { subscriptionPlan: true } });
        const method = await tx.billingPaymentMethod.findFirst({ where: { id: pending.paymentMethodRef,
          userId: pending.userId, customerRef: pending.customerRef, revokedAt: null } });
        if (!method || (pending.operation === "INITIAL" && legacy.subscriptionPlan !== "FREE") || !eligible(current, pending) ||
            !await this.renewalPolicyAllowed(tx, current, pending)) return null;
      } else if (!["PROCESSING", "UNKNOWN"].includes(pending.status) || !pending.firstChargeAt) return null;
      const changed = await tx.billingIntent.updateMany({ where: { id: input.id, userId: input.userId,
        version: input.version, status: pending.status, OR: [{ leaseUntil: null }, { leaseUntil: { lte: input.now } }] },
      data: { version: { increment: 1 }, status: input.mode === "charge" ? "PROCESSING" : "UNKNOWN",
        workerToken: input.workerToken, leaseUntil: input.leaseUntil,
        ...(input.mode === "charge" ? { firstChargeAt: input.now } : {}) } });
      if (changed.count !== 1) return null;
      const saved = await tx.billingIntent.findUniqueOrThrow({ where: { id: input.id } });
      return { intent: intent(saved), workerToken: input.workerToken, leaseUntil: input.leaseUntil };
    });
  }

  async finish(lease: BillingLease, status: "UNKNOWN" | "HOLD" | "CANCELLED", now: Date): Promise<boolean> {
    return this.client.$transaction(async (tx) => {
      await this.lockUser(tx, lease.intent.userId, now);
      const changed = await tx.billingIntent.updateMany({ where: leaseWhere(lease, now),
        data: { status, version: { increment: 1 }, workerToken: null, leaseUntil: null } });
      return changed.count === 1;
    });
  }

  async commitPaid(lease: BillingLease, payment: ProviderPayment, now: Date): Promise<CommitPaidResult> {
    try {
      return await this.commitPaidOnce(lease, payment, now);
    } catch (error) {
      // Two different users may race on the same provider receipt without sharing a User lock.
      // The first transaction fully rolls back on uniqueness failure; recheck once under the
      // original fence so a now-known collision converges to HOLD without granting access.
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        return this.commitPaidOnce(lease, payment, now);
      }
      throw error;
    }
  }

  private async commitPaidOnce(lease: BillingLease, payment: ProviderPayment, now: Date): Promise<CommitPaidResult> {
    return this.client.$transaction(async (tx) => {
      await this.lockUser(tx, lease.intent.userId, now);
      // Fence the actual stored attempt, never accept mutable lease.intent price/ref values.
      const fenced = await tx.billingIntent.updateMany({ where: leaseWhere(lease, now),
        data: { version: { increment: 1 } } });
      if (fenced.count !== 1) return "STALE";
      const pending = intent(await tx.billingIntent.findUniqueOrThrow({ where: { id: lease.intent.id } }));
      if (!payment.paymentKey || payment.status !== "DONE" || payment.orderId !== pending.orderId ||
          payment.amount !== pending.amount || payment.currency !== pending.currency) throw new BillingPolicyHold();
      const existingReceipt = await tx.billingPayment.findFirst({ where: { OR: [
        { paymentKey: payment.paymentKey }, { intentId: pending.id }, { orderId: pending.orderId },
      ] } });
      if (existingReceipt) {
        // A known immutable receipt collision is a policy incident, not a retryable timeout.
        // Preserve the existing ledger/subscription, including inconsistent same-intent records.
        await tx.billingIntent.update({ where: { id: pending.id },
          data: { status: "HOLD", workerToken: null, leaseUntil: null } });
        return "POLICY_HOLD";
      }
      const current = subscription(await tx.billingSubscription.findUnique({ where: { userId: pending.userId } }));
      const legacy = await tx.user.findUniqueOrThrow({ where: { id: pending.userId }, select: { subscriptionPlan: true } });
      const method = await tx.billingPaymentMethod.findFirst({ where: { id: pending.paymentMethodRef,
        userId: pending.userId, customerRef: pending.customerRef, revokedAt: null } });
      const canApply = !!method && (pending.operation !== "INITIAL" || legacy.subscriptionPlan === "FREE") &&
        eligible(current, pending) && withinBillingPeriod(now, pending.periodStart, pending.periodEnd) &&
        await this.renewalPolicyAllowed(tx, current, pending);
      // Unique receipt/intent/order constraints reject cross-intent payment reuse atomically.
      const subscriptionId = canApply ? (current?.id ?? randomUUID()) : current?.id ?? null;
      if (canApply) {
        if (!current) {
          await tx.billingSubscription.create({ data: { id: subscriptionId!, userId: pending.userId,
            version: 0, plan: pending.plan, cycle: pending.cycle, anchor: pending.anchor,
            paidThroughIndex: pending.periodIndex, periodStart: pending.periodStart, periodEnd: pending.periodEnd,
            status: "ACTIVE", cancelAtPeriodEnd: false } });
        } else {
          const updated = await tx.billingSubscription.updateMany({ where: { id: current.id, userId: pending.userId,
            version: current.version, status: "ACTIVE", cancelAtPeriodEnd: false },
          data: { version: { increment: 1 }, paidThroughIndex: pending.periodIndex,
            periodStart: pending.periodStart, periodEnd: pending.periodEnd } });
          if (updated.count !== 1) throw new BillingPolicyHold();
        }
      }
      await tx.billingPayment.create({ data: { id: randomUUID(), userId: pending.userId, intentId: pending.id,
        subscriptionId, paymentKey: payment.paymentKey, orderId: payment.orderId,
        amount: payment.amount, currency: payment.currency, status: canApply ? "APPLIED" : "POLICY_HOLD", createdAt: now } });
      await tx.billingIntent.update({ where: { id: pending.id }, data: {
        status: canApply ? "SUCCEEDED" : "HOLD", workerToken: null, leaseUntil: null } });
      return canApply ? "COMMITTED" : "POLICY_HOLD";
    });
  }

  /** Version-checked cancellation of future renewals; paid access remains until periodEnd.
   * Authentication/owner authorization belongs to the future application coordinator.
   */
  async cancelAtPeriodEnd(userId: string, version: number, now: Date): Promise<boolean> {
    return this.client.$transaction(async (tx) => {
      await this.lockUser(tx, userId, now);
      const changed = await tx.billingSubscription.updateMany({ where: { userId, version,
        status: "ACTIVE", cancelAtPeriodEnd: false }, data: { cancelAtPeriodEnd: true, version: { increment: 1 } } });
      return changed.count === 1;
    });
  }

  /** Server-only result includes encrypted material and references; never serialize to clients. */
  async getMethodForUser(id: string, userId: string): Promise<StoredBillingMethod | null> {
    return this.client.billingPaymentMethod.findFirst({ where: { id, userId, revokedAt: null } });
  }

  /** An immutable new method reference; encryption/authentication are validated by the vault port.
   * No raw billing key field is accepted and an existing reference can never be overwritten.
   */
  async saveMethod(input: Pick<StoredBillingMethod,
    "id" | "userId" | "customerRef" | "encryptedBillingKey" | "keyVersion">): Promise<StoredBillingMethod> {
    return this.client.$transaction(async (tx) => {
      await this.lockUser(tx, input.userId, new Date());
      return this.saveMethodInTransaction(tx, input);
    });
  }

  /** Caller must already hold User -> CheckoutSession locks. The reference is immutable. */
  async saveMethodInTransaction(tx: Tx, input: Pick<StoredBillingMethod,
    "id" | "userId" | "customerRef" | "encryptedBillingKey" | "keyVersion">): Promise<StoredBillingMethod> {
    if (!input.id || !input.userId || !input.customerRef || !input.encryptedBillingKey || !input.keyVersion) {
      throw new BillingPolicyHold();
    }
    return tx.billingPaymentMethod.create({ data: input });
  }

  async revokeMethod(id: string, userId: string, now: Date): Promise<boolean> {
    return this.client.$transaction(async (tx) => {
      await this.lockUser(tx, userId, now);
      const changed = await tx.billingPaymentMethod.updateMany({ where: { id, userId, revokedAt: null },
        data: { revokedAt: now } });
      return changed.count === 1;
    });
  }

  /** Stable private keyset scan; deletion of the cursor row does not reset progress. */
  async listReconciliationCandidates(now: Date, take: number, afterId?: string): Promise<BillingMaintenanceCandidate[]> {
    return this.client.billingIntent.findMany({ where: {
      status: { in: ["UNKNOWN", "PROCESSING"] }, firstChargeAt: { not: null },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      ...(afterId ? { id: { gt: afterId } } : {}),
    }, orderBy: [{ id: "asc" }],
    take: Math.min(20, Math.max(1, take)), select: { id: true, userId: true, version: true } });
  }

  async listRenewalCandidates(now: Date, take: number, afterId?: string): Promise<BillingMaintenanceCandidate[]> {
    return this.client.billingSubscription.findMany({ where: {
      status: "ACTIVE", cancelAtPeriodEnd: false, periodEnd: { lte: now },
      ...(afterId ? { id: { gt: afterId } } : {}),
    }, orderBy: [{ id: "asc" }],
    take: Math.min(20, Math.max(1, take)), select: { id: true, userId: true, version: true } });
  }

  /** Recheck cancellation, canonical continuity and private method binding under the User lock.
   * A skipped/missed period is never repaired by charging multiple historical periods.
   */
  async getRenewalContext(candidate: BillingMaintenanceCandidate, now: Date): Promise<BillingRenewalContext | null> {
    return this.client.$transaction(async (tx) => {
      await this.lockUser(tx, candidate.userId, now);
      const current = subscription(await tx.billingSubscription.findFirst({ where: {
        id: candidate.id, userId: candidate.userId, version: candidate.version, status: "ACTIVE", cancelAtPeriodEnd: false,
      } }));
      if (!current || current.periodEnd > now) return null;
      const previous = billingPeriodUTC(current.anchor, current.cycle, current.paidThroughIndex);
      const next = billingPeriodUTC(current.anchor, current.cycle, current.paidThroughIndex + 1);
      if (!sameDate(previous.start, current.periodStart) || !sameDate(previous.end, current.periodEnd) ||
          !sameDate(current.periodEnd, next.start) || !withinBillingPeriod(now, next.start, next.end)) return null;
      const blocked = await tx.billingIntent.findFirst({ where: { userId: candidate.userId,
        status: { in: ["UNKNOWN", "PROCESSING", "HOLD"] } }, select: { id: true } });
      if (blocked) return null;
      const paid = await tx.billingIntent.findFirst({ where: { userId: current.userId, status: "SUCCEEDED",
        plan: current.plan, cycle: current.cycle, anchor: current.anchor, periodIndex: current.paidThroughIndex,
        periodStart: current.periodStart, periodEnd: current.periodEnd,
        payment: { is: { userId: current.userId, subscriptionId: current.id, status: "APPLIED" } },
      } });
      if (!paid) return null;
      const method = await tx.billingPaymentMethod.findFirst({ where: { id: paid.paymentMethodRef,
        userId: current.userId, customerRef: paid.customerRef, revokedAt: null }, select: { id: true } });
      if (!method) return null;
      const existing = await tx.billingIntent.findUnique({ where: {
        subscriptionId_periodIndex: { subscriptionId: current.id, periodIndex: current.paidThroughIndex + 1 },
      } });
      if (existing && (existing.status !== "PREPARED" || existing.firstChargeAt !== null ||
          existing.customerRef !== paid.customerRef || existing.paymentMethodRef !== paid.paymentMethodRef)) return null;
      return { subscription: current, existingIntent: existing ? intent(existing) : null,
        customerRef: paid.customerRef, paymentMethodRef: paid.paymentMethodRef };
    });
  }

  async findEventTarget(hint: { orderId?: string; paymentKey?: string }): Promise<BillingEventTarget | null> {
    if (!hint.orderId && !hint.paymentKey) return null;
    const receipt = await this.client.billingPayment.findFirst({ where: {
      ...(hint.orderId ? { orderId: hint.orderId } : {}), ...(hint.paymentKey ? { paymentKey: hint.paymentKey } : {}),
    } });
    const row = hint.orderId ? await this.client.billingIntent.findUnique({ where: { orderId: hint.orderId } }) :
      receipt ? await this.client.billingIntent.findUnique({ where: { id: receipt.intentId } }) : null;
    if (!row || (receipt && (receipt.userId !== row.userId || receipt.intentId !== row.id))) return null;
    const current = subscription(await this.client.billingSubscription.findUnique({ where: { userId: row.userId } }));
    return { intent: intent(row), receipt, subscription: current };
  }

  /** Only a separately provider-verified cancellation may call this server-only method.
   * Preserve old-period intent SUCCEEDED: historical receipt review must not block a newer period.
   */
  async holdVerifiedCancellation(target: BillingEventTarget, payment: ProviderPayment, now: Date): Promise<"RECORDED" | "DUPLICATE" | "STALE"> {
    if (!["CANCELED", "PARTIAL_CANCELED"].includes(payment.status) || !target.receipt) return "STALE";
    return this.client.$transaction(async (tx) => {
      await this.lockUser(tx, target.intent.userId, now);
      const row = await tx.billingIntent.findFirst({ where: { id: target.intent.id, userId: target.intent.userId } });
      if (!row || row.version !== target.intent.version || row.status !== target.intent.status) return "STALE";
      const receipt = await tx.billingPayment.findFirst({ where: { id: target.receipt!.id, userId: row.userId, intentId: row.id } });
      if (!receipt || receipt.paymentKey !== payment.paymentKey || receipt.orderId !== payment.orderId ||
          receipt.amount !== payment.amount || receipt.currency !== payment.currency ||
          payment.orderId !== row.orderId || payment.amount !== row.amount || payment.currency !== row.currency ||
          receipt.subscriptionId !== target.receipt!.subscriptionId || receipt.status !== target.receipt!.status) return "STALE";
      const current = subscription(await tx.billingSubscription.findUnique({ where: { userId: row.userId } }));
      const expected = target.subscription;
      if (!!current !== !!expected || (current && expected && (current.id !== expected.id || current.version !== expected.version ||
          current.status !== expected.status || current.cancelAtPeriodEnd !== expected.cancelAtPeriodEnd ||
          current.paidThroughIndex !== expected.paidThroughIndex || current.plan !== expected.plan || current.cycle !== expected.cycle ||
          !sameDate(current.anchor, expected.anchor) || !sameDate(current.periodStart, expected.periodStart) ||
          !sameDate(current.periodEnd, expected.periodEnd)))) return "STALE";
      let isCurrentPeriod = false;
      if (current && receipt.subscriptionId === current.id && row.periodIndex === current.paidThroughIndex &&
          row.plan === current.plan && row.cycle === current.cycle && sameDate(row.anchor, current.anchor) &&
          sameDate(row.periodStart, current.periodStart) && sameDate(row.periodEnd, current.periodEnd)) {
        const canonical = billingPeriodUTC(current.anchor, current.cycle, current.paidThroughIndex);
        isCurrentPeriod = sameDate(canonical.start, current.periodStart) && sameDate(canonical.end, current.periodEnd);
      }
      const requiresSubscriptionChange = isCurrentPeriod && current && (!current.cancelAtPeriodEnd ||
        (payment.status === "CANCELED" && current.status !== "CANCELLED"));
      if (receipt.status === "POLICY_HOLD" && !requiresSubscriptionChange) return "DUPLICATE";
      const fenced = await tx.billingIntent.updateMany({ where: { id: row.id, userId: row.userId,
        version: row.version, status: row.status }, data: { version: { increment: 1 } } });
      if (fenced.count !== 1) return "STALE";
      await tx.billingPayment.update({ where: { id: receipt.id }, data: { status: "POLICY_HOLD" } });
      if (requiresSubscriptionChange && current) {
        const changed = await tx.billingSubscription.updateMany({ where: { id: current.id, userId: row.userId, version: current.version },
          data: { version: { increment: 1 }, cancelAtPeriodEnd: true,
            ...(payment.status === "CANCELED" ? { status: "CANCELLED" } : {}) } });
        if (changed.count !== 1) throw new BillingPolicyHold();
      }
      return "RECORDED";
    });
  }
}
