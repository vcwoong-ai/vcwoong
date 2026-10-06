import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { BillingCycle } from "../plans";
import { BillingPolicyHold, type BillingIntent, type BillingLifecycle, type BillingOutcome, type PaidPlan } from "./billing-lifecycle";
import type { BillingKeyVault } from "./billing-key-vault";
import { billingPeriodUTC } from "./billing-period";
import type { PrismaBillingRepository } from "./prisma-billing-repository";

type StoredSession = Prisma.BillingCheckoutSessionGetPayload<Record<string, never>>;
export interface CheckoutSessionPorts {
  client: PrismaClient;
  repository: PrismaBillingRepository;
  lifecycle: BillingLifecycle;
  vault: BillingKeyVault;
  issueBillingKey(authKey: string, customerRef: string): Promise<{ billingKey: string }>;
  now(): Date;
  newId(): string;
  price(plan: PaidPlan, cycle: BillingCycle): number;
}
export type CheckoutCallbackOutcome = BillingOutcome | "ISSUE_HOLD" | "EXPIRED";
type CallbackDecision = { outcome: CheckoutCallbackOutcome } | { ready: StoredSession } | { issue: StoredSession };

/** INITIAL checkout only. Plan replacement/reactivation and ambiguous key issuance require review.
 * Persist the immutable issuance reservation BEFORE the non-idempotent provider call.
 * Never store raw authKey. Never retry issuance after any claimed call, including process death.
 */
export class CheckoutSessionService {
  constructor(private readonly ports: CheckoutSessionPorts) {}

  private async lockUser(tx: Prisma.TransactionClient, userId: string, now: Date) {
    if (!userId || !Number.isFinite(now.getTime())) throw new BillingPolicyHold();
    const result = await tx.user.updateMany({ where: { id: userId }, data: { updatedAt: now } });
    if (result.count !== 1) throw new BillingPolicyHold();
  }

  async prepare(input: { userId: string; plan: PaidPlan; cycle: BillingCycle; origin: string }): Promise<{
    customerKey: string; successUrl: string; failUrl: string;
  }> {
    const now = this.ports.now();
    const origin = new URL(input.origin);
    if (!(["https:", "http:"].includes(origin.protocol)) || origin.origin !== input.origin ||
        !["solo", "sector_pro", "multi", "full", "bio_premium"].includes(input.plan)) throw new BillingPolicyHold();
    const period = billingPeriodUTC(now, input.cycle, 0);
    const amount = this.ports.price(input.plan, input.cycle);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new BillingPolicyHold();
    const saved = await this.ports.client.$transaction(async (tx) => {
      await this.lockUser(tx, input.userId, now);
      const existing = await tx.billingCheckoutSession.findUnique({ where: { activeUserId: input.userId } });
      if (existing) {
        if (existing.status === "PREPARED" && existing.expiresAt <= now && existing.authKeyHash === null &&
            existing.workerToken === null && existing.leaseUntil === null) {
          // Preserve the unused reservation history and release only its active slot under User lock.
          // A fresh session/customer prevents the old callback from binding the replacement.
          const released = await tx.billingCheckoutSession.updateMany({ where: { id: existing.id,
            status: "PREPARED", version: existing.version, authKeyHash: null, workerToken: null, leaseUntil: null },
          data: { status: "EXPIRED", activeUserId: null, version: { increment: 1 } } });
          if (released.count !== 1) throw new BillingPolicyHold();
        } else {
          if (existing.plan !== input.plan || existing.cycle !== input.cycle || existing.callbackOrigin !== input.origin ||
              existing.status !== "PREPARED" || existing.expiresAt <= now) throw new BillingPolicyHold();
          return existing;
        }
      }
      const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { subscriptionPlan: true } });
      const current = await tx.billingSubscription.findUnique({ where: { userId: input.userId } });
      const priorIntent = await tx.billingIntent.findUnique({ where: { reservationKey: `INITIAL:${input.userId}` } });
      if (current || priorIntent || user.subscriptionPlan !== "FREE") throw new BillingPolicyHold();
      const ids = Array.from({ length: 6 }, () => this.ports.newId());
      if (new Set(ids).size !== ids.length || ids.some(id => !/^[a-zA-Z0-9_-]{6,50}$/.test(id))) throw new BillingPolicyHold();
      return tx.billingCheckoutSession.create({ data: { id: ids[0], userId: input.userId, activeUserId: input.userId,
        plan: input.plan, cycle: input.cycle, anchor: now, periodStart: period.start, periodEnd: period.end, amount,
        customerRef: ids[1], paymentMethodRef: ids[2], intentId: ids[3], orderId: ids[4], idempotencyKey: ids[5],
        callbackOrigin: input.origin, status: "PREPARED", version: 0, createdAt: now,
        expiresAt: new Date(Math.min(now.getTime() + 30 * 60_000, period.end.getTime())) } });
    });
    const success = new URL("/api/payments/success", saved.callbackOrigin);
    success.searchParams.set("session", saved.id);
    return { customerKey: saved.customerRef, successUrl: success.href,
      failUrl: new URL("/api/payments/fail", saved.callbackOrigin).href };
  }

  async callback(input: { userId: string; sessionId: string; customerKey: string; authKey: string }): Promise<CheckoutCallbackOutcome> {
    if (!input.userId || !input.sessionId || typeof input.authKey !== "string" ||
        input.authKey.length < 1 || input.authKey.length > 300 || !input.customerKey) return "MISSING";
    const hash = createHash("sha256").update(input.authKey, "utf8").digest("hex");
    const now = this.ports.now();
    const decision = await this.ports.client.$transaction<CallbackDecision>(async (tx) => {
      await this.lockUser(tx, input.userId, now);
      const stored = await tx.billingCheckoutSession.findFirst({ where: { id: input.sessionId, userId: input.userId } });
      if (!stored || stored.customerRef !== input.customerKey) return { outcome: "MISSING" as const };
      if (stored.status === "EXPIRED") return { outcome: "EXPIRED" as const };
      if (stored.authKeyHash && stored.authKeyHash !== hash) return { outcome: "ISSUE_HOLD" as const };
      if (stored.status === "READY") return { ready: stored };
      if (stored.status === "HOLD") return { outcome: "ISSUE_HOLD" as const };
      if (stored.status === "ISSUING") {
        if (stored.leaseUntil && stored.leaseUntil > now) return { outcome: "BUSY" as const };
        await tx.billingCheckoutSession.updateMany({ where: { id: stored.id, version: stored.version, status: "ISSUING" },
          data: { status: "HOLD", version: { increment: 1 }, workerToken: null, leaseUntil: null } });
        return { outcome: "ISSUE_HOLD" as const };
      }
      if (stored.status !== "PREPARED") return { outcome: "ISSUE_HOLD" as const };
      if (stored.expiresAt <= now) return { outcome: "EXPIRED" as const };
      const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { subscriptionPlan: true } });
      const current = await tx.billingSubscription.findUnique({ where: { userId: input.userId } });
      const prior = await tx.billingIntent.findUnique({ where: { reservationKey: `INITIAL:${input.userId}` } });
      if (current || prior || user.subscriptionPlan !== "FREE") return { outcome: "ISSUE_HOLD" as const };
      const workerToken = this.ports.newId();
      const claimed = await tx.billingCheckoutSession.updateMany({ where: { id: stored.id, userId: input.userId,
        status: "PREPARED", version: stored.version, authKeyHash: null }, data: {
        status: "ISSUING", authKeyHash: hash, version: { increment: 1 }, workerToken,
        leaseUntil: new Date(now.getTime() + 120_000) } });
      if (claimed.count !== 1) return { outcome: "STALE" as const };
      return { issue: await tx.billingCheckoutSession.findUniqueOrThrow({ where: { id: stored.id } }) };
    });
    if ("outcome" in decision) return decision.outcome;
    if ("ready" in decision) return this.ports.lifecycle.execute(decision.ready.intentId, input.userId);
    const claimed = decision.issue;
    try {
      const issued = await this.ports.issueBillingKey(input.authKey, claimed.customerRef);
      // Only ciphertext may cross the DB boundary. The raw provider key remains local to this call.
      const encrypted = this.ports.vault.seal({ userId: input.userId, methodRef: claimed.paymentMethodRef, billingKey: issued.billingKey });
      const bound = await this.bindIssuedMethod(claimed, encrypted);
      if (!bound) {
        await this.holdIssuance(claimed).catch(() => {});
        return "ISSUE_HOLD";
      }
    } catch {
      // Issuance has no assumed provider idempotency: timeout, crash and DB failure must not retry it.
      await this.holdIssuance(claimed).catch(() => {});
      return "ISSUE_HOLD";
    }
    return this.ports.lifecycle.execute(claimed.intentId, input.userId);
  }

  private async bindIssuedMethod(claimed: StoredSession, encryptedBillingKey: string): Promise<boolean> {
    const now = this.ports.now();
    return this.ports.client.$transaction(async (tx) => {
      await this.lockUser(tx, claimed.userId, now);
      const fence = await tx.billingCheckoutSession.updateMany({ where: { id: claimed.id, userId: claimed.userId,
        version: claimed.version, status: "ISSUING", workerToken: claimed.workerToken,
        leaseUntil: { gt: now }, expiresAt: { gt: now } }, data: { version: { increment: 1 } } });
      if (fence.count !== 1) return false;
      const stored = await tx.billingCheckoutSession.findUniqueOrThrow({ where: { id: claimed.id } });
      const user = await tx.user.findUniqueOrThrow({ where: { id: stored.userId }, select: { subscriptionPlan: true } });
      if (user.subscriptionPlan !== "FREE") throw new BillingPolicyHold();
      const period = billingPeriodUTC(stored.anchor, stored.cycle as BillingCycle, 0);
      if (period.start.getTime() !== stored.periodStart.getTime() || period.end.getTime() !== stored.periodEnd.getTime()) throw new BillingPolicyHold();
      await this.ports.repository.saveMethodInTransaction(tx, { id: stored.paymentMethodRef, userId: stored.userId,
        customerRef: stored.customerRef, encryptedBillingKey, keyVersion: this.ports.vault.keyVersion });
      const pending: BillingIntent = { id: stored.intentId, userId: stored.userId, operation: "INITIAL",
        plan: stored.plan as PaidPlan, cycle: stored.cycle as BillingCycle, anchor: stored.anchor,
        periodIndex: 0, periodStart: stored.periodStart, periodEnd: stored.periodEnd,
        subscriptionId: null, subscriptionVersion: null, amount: stored.amount, currency: "KRW",
        orderId: stored.orderId, idempotencyKey: stored.idempotencyKey, customerRef: stored.customerRef,
        paymentMethodRef: stored.paymentMethodRef, status: "PREPARED", version: 0, createdAt: stored.createdAt,
        expiresAt: stored.expiresAt, firstChargeAt: null, leaseUntil: null, workerToken: null };
      const bound = await this.ports.repository.createIntentIfAbsentInTransaction(tx, pending);
      if (bound.id !== stored.intentId) throw new BillingPolicyHold();
      await tx.billingCheckoutSession.update({ where: { id: stored.id }, data: {
        status: "READY", workerToken: null, leaseUntil: null } });
      return true;
    });
  }

  private async holdIssuance(claimed: StoredSession): Promise<void> {
    const now = this.ports.now();
    await this.ports.client.$transaction(async (tx) => {
      await this.lockUser(tx, claimed.userId, now);
      await tx.billingCheckoutSession.updateMany({ where: { id: claimed.id, userId: claimed.userId,
        status: "ISSUING", version: claimed.version, workerToken: claimed.workerToken },
      data: { status: "HOLD", version: { increment: 1 }, workerToken: null, leaseUntil: null } });
    });
  }
}
