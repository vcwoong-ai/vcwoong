/** In-memory repository and synthetic provider only. No environment/DB/network access. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { BillingLifecycle, BillingPolicyHold, hasBillingPeriodAccess, type BillingIntent, type BillingLease,
  type BillingPorts, type BillingRepository, type BillingSubscription, type ProviderPayment } from "../src/lib/payments/billing-lifecycle";
import { billingBoundaryUTC, billingPeriodUTC } from "../src/lib/payments/billing-period";
import { createTossBillingProvider } from "../src/lib/payments/toss-billing-provider";
import { isSubscriptionCheckoutReady } from "../src/lib/payments/checkout-readiness";

// Reuse the actual product priceForCycle/PUBLIC_PLANS without importing its Prisma-backed quotas.
function priceCatalog(): any {
  const exports = {};
  const keys = ["free", "solo", "sector_pro", "multi", "full", "bio_premium"];
  const modules: Record<string, unknown> = {
    "@prisma/client": { SubscriptionPlan: Object.fromEntries(keys.map((key) => [key.toUpperCase(), key.toUpperCase()])) },
    "@/lib/quotas": { PLAN_LIMITS: Object.fromEntries(keys.map((key) => [key, { reports: 1, sectors: 1, templates: 1 }])) },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/plans.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (name: string) => { assert(name in modules); return modules[name]; } });
  return exports;
}

class MemoryRepository implements BillingRepository {
  intents = new Map<string, BillingIntent>();
  subscriptions = new Map<string, BillingSubscription>();
  payments = new Map<string, ProviderPayment>();
  failCommit = false;
  failFinish = false;
  beforeClaim?: () => void;
  async getSubscription(userId: string) { return structuredClone(this.subscriptions.get(userId) ?? null); }
  async getIntent(id: string, userId: string) {
    const intent = this.intents.get(id); return structuredClone(intent?.userId === userId ? intent : null);
  }
  async createIntentIfAbsent(intent: BillingIntent) {
    const found = Array.from(this.intents.values()).find((row) => row.userId === intent.userId && row.operation === intent.operation &&
      (intent.operation === "INITIAL" || (row.subscriptionId === intent.subscriptionId && row.periodIndex === intent.periodIndex)));
    if (found) return structuredClone(found);
    this.intents.set(intent.id, structuredClone(intent)); return structuredClone(intent);
  }
  async claim(input: Parameters<BillingRepository["claim"]>[0]): Promise<BillingLease | null> {
    this.beforeClaim?.();
    const row = this.intents.get(input.id);
    if (!row || row.userId !== input.userId || row.version !== input.version ||
        (row.leaseUntil && row.leaseUntil.getTime() > input.now.getTime())) return null;
    if (input.mode === "charge") {
      if (row.status !== "PREPARED" || row.firstChargeAt !== null || !this.policyAllows(row)) return null;
      row.status = "PROCESSING"; row.firstChargeAt = input.now;
    } else {
      if (!["PROCESSING", "UNKNOWN"].includes(row.status)) return null;
      row.status = "UNKNOWN";
    }
    row.version++; row.workerToken = input.workerToken; row.leaseUntil = input.leaseUntil;
    return { intent: structuredClone(row), workerToken: input.workerToken, leaseUntil: input.leaseUntil };
  }
  private fenced(lease: BillingLease, now: Date) {
    const row = this.intents.get(lease.intent.id);
    return row && row.version === lease.intent.version && row.workerToken === lease.workerToken &&
      row.leaseUntil && row.leaseUntil.getTime() > now.getTime() ? row : null;
  }
  private policyAllows(row: BillingIntent) {
    const sub = this.subscriptions.get(row.userId);
    if (row.operation === "INITIAL") return !sub;
    return sub?.status === "ACTIVE" && !sub.cancelAtPeriodEnd && sub.id === row.subscriptionId &&
      sub.version === row.subscriptionVersion && sub.plan === row.plan && sub.cycle === row.cycle &&
      sub.paidThroughIndex + 1 === row.periodIndex && sub.anchor.getTime() === row.anchor.getTime();
  }
  async finish(lease: BillingLease, status: "UNKNOWN" | "HOLD" | "CANCELLED", now: Date) {
    if (this.failFinish) throw new Error("Synthetic persistence failure");
    const row = this.fenced(lease, now); if (!row) return false;
    row.status = status; row.version++; row.workerToken = null; row.leaseUntil = null; return true;
  }
  async commitPaid(lease: BillingLease, payment: ProviderPayment, now: Date) {
    if (this.failCommit) throw new Error("Synthetic commit failure");
    const row = this.fenced(lease, now); if (!row) return "STALE" as const;
    if (!this.policyAllows(row) || now.getTime() >= row.periodEnd.getTime() || this.payments.has(payment.paymentKey)) {
      // In a real adapter this transaction also writes a durable manual-review ledger.
      row.status = "HOLD"; row.version++; row.workerToken = null; row.leaseUntil = null;
      return "POLICY_HOLD" as const;
    }
    this.payments.set(payment.paymentKey, structuredClone(payment));
    const sub = this.subscriptions.get(row.userId);
    this.subscriptions.set(row.userId, { id: sub?.id ?? "synthetic-subscription", userId: row.userId,
      version: (sub?.version ?? -1) + 1, plan: row.plan, cycle: row.cycle, anchor: row.anchor,
      paidThroughIndex: row.periodIndex, periodStart: row.periodStart, periodEnd: row.periodEnd,
      status: "ACTIVE", cancelAtPeriodEnd: false });
    row.status = "SUCCEEDED"; row.version++; row.workerToken = null; row.leaseUntil = null;
    return "COMMITTED" as const;
  }
}

const catalog = priceCatalog();
function fixture() {
  const repository = new MemoryRepository();
  let now = new Date("2024-01-31T10:30:40.456Z");
  let ids = 0, charges = 0, lookups = 0;
  let failCharge = false;
  let remote: ProviderPayment | null = null;
  let chargeOverride: ((intent: BillingIntent) => Promise<ProviderPayment>) | undefined;
  const ports: BillingPorts = {
    repository, now: () => new Date(now), newId: () => `synthetic-billing-${++ids}`,
    price: (plan, cycle) => catalog.priceForCycle(catalog.PUBLIC_PLANS.find((candidate: any) => candidate.key === plan), cycle),
    provider: {
      charge: async (intent) => {
        charges++;
        if (chargeOverride) return chargeOverride(intent as BillingIntent);
        if (failCharge) throw new Error("Synthetic remote timeout");
        remote = { orderId: intent.orderId, paymentKey: "synthetic-payment", amount: intent.amount, currency: "KRW", status: "DONE" };
        return { ...remote };
      },
      lookupByOrder: async () => { lookups++; return remote ? { ...remote } : null; },
    },
  };
  const engine = new BillingLifecycle(ports);
  const prepare = (overrides = {}) => engine.prepare({ userId: "synthetic-user", plan: "solo", cycle: "monthly",
    anchor: new Date("2024-01-31T10:30:40.456Z"), periodIndex: 0, operation: "INITIAL",
    customerRef: "synthetic-customer", paymentMethodRef: "synthetic-vault-reference", ...overrides } as Parameters<BillingLifecycle["prepare"]>[0]);
  return { repository, engine, ports, prepare, counts: () => ({ charges, lookups }),
    advance: (ms: number) => { now = new Date(now.getTime() + ms); }, setNow: (date: Date) => { now = date; },
    failCharge: () => { failCharge = true; }, setRemote: (payment: ProviderPayment | null) => { remote = payment; },
    overrideCharge: (fn: typeof chargeOverride) => { chargeOverride = fn; } };
}

async function main() {
  assert.equal(isSubscriptionCheckoutReady(), false, "core implementation never enables real checkout");
  const anchor = new Date("2024-01-31T10:30:40.456Z");
  assert.equal(billingBoundaryUTC(anchor, "monthly", 1).toISOString(), "2024-02-29T10:30:40.456Z");
  assert.equal(billingBoundaryUTC(anchor, "monthly", 2).toISOString(), "2024-03-31T10:30:40.456Z");
  const leap = new Date("2024-02-29T00:00:00.001Z");
  assert.equal(billingBoundaryUTC(leap, "yearly", 1).toISOString(), "2025-02-28T00:00:00.001Z");
  assert.equal(billingBoundaryUTC(leap, "yearly", 4).toISOString(), "2028-02-29T00:00:00.001Z");
  assert.throws(() => billingPeriodUTC(new Date("invalid"), "monthly", 0));
  assert.throws(() => billingPeriodUTC(anchor, "monthly", -1));

  const duplicate = fixture();
  const [intent, repeated] = await Promise.all([duplicate.prepare(), duplicate.prepare()]);
  assert.equal(intent.id, repeated.id);
  assert.equal(intent.amount, 99000);
  assert.equal(duplicate.repository.intents.size, 1);
  await assert.rejects(duplicate.prepare({ plan: "multi" }), BillingPolicyHold);
  await assert.rejects(duplicate.prepare({ anchor: new Date(anchor.getTime() - 1) }), BillingPolicyHold,
    "different initial checkout anchors cannot create multiple pending charges");
  assert.equal(await duplicate.engine.execute(intent.id, "outsider"), "MISSING");
  const outcomes = await Promise.all([duplicate.engine.execute(intent.id, intent.userId), duplicate.engine.execute(intent.id, intent.userId)]);
  assert(outcomes.includes("SUCCEEDED"));
  assert.equal(duplicate.counts().charges, 1);
  assert.equal(await duplicate.engine.execute(intent.id, intent.userId), "SUCCEEDED");
  assert.equal(duplicate.repository.payments.size, 1);
  const sub = await duplicate.repository.getSubscription(intent.userId);
  assert(sub);
  assert(hasBillingPeriodAccess(sub, intent.periodStart));
  assert.equal(hasBillingPeriodAccess(sub, intent.periodEnd), false);
  sub.cancelAtPeriodEnd = true; duplicate.repository.subscriptions.set(sub.userId, sub);
  assert(hasBillingPeriodAccess(sub, intent.periodStart), "period-end cancellation keeps access only through the paid period");
  assert.equal(hasBillingPeriodAccess({ ...sub, status: "CANCELLED" }, intent.periodStart), false);
  duplicate.setNow(intent.periodEnd);
  await assert.rejects(duplicate.prepare({ operation: "RENEWAL", periodIndex: 1 }), BillingPolicyHold);

  const renewal = fixture();
  const firstPeriod = await renewal.prepare();
  assert.equal(await renewal.engine.execute(firstPeriod.id, firstPeriod.userId), "SUCCEEDED");
  renewal.setNow(firstPeriod.periodEnd);
  const nextPeriod = await renewal.prepare({ operation: "RENEWAL", periodIndex: 1 });
  renewal.overrideCharge(async () => ({ orderId: nextPeriod.orderId, paymentKey: "synthetic-renewal-payment", amount: nextPeriod.amount, currency: "KRW", status: "DONE" }));
  assert.equal(await renewal.engine.execute(nextPeriod.id, nextPeriod.userId), "SUCCEEDED");
  assert.equal((await renewal.repository.getSubscription(nextPeriod.userId))?.periodEnd.toISOString(), "2024-03-31T10:30:40.456Z");
  assert.equal(renewal.repository.payments.size, 2);
  const storedRenewal = await renewal.repository.getSubscription(nextPeriod.userId);
  assert(storedRenewal);
  storedRenewal.periodEnd = new Date(storedRenewal.periodEnd.getTime() + 1);
  renewal.repository.subscriptions.set(storedRenewal.userId, storedRenewal);
  renewal.setNow(billingBoundaryUTC(anchor, "monthly", 2));
  await assert.rejects(renewal.prepare({ operation: "RENEWAL", periodIndex: 2 }), BillingPolicyHold,
    "corrupt stored period continuity cannot authorize a new charge");

  const yearly = fixture();
  const yearlyIntent = await yearly.prepare({ cycle: "yearly" });
  assert.equal(yearlyIntent.amount, 990000, "existing two-free-month annual pricing reused");
  await assert.rejects(fixture().prepare({ operation: "PLAN_CHANGE" }), BillingPolicyHold, "undefined proration policy is held");
  const expired = fixture();
  const expiredIntent = await expired.prepare();
  expired.advance(30 * 60_000);
  assert.equal(await expired.engine.execute(expiredIntent.id, expiredIntent.userId), "HOLD");
  assert.equal(expired.counts().charges, 0);

  const dbFailure = fixture();
  const uncertain = await dbFailure.prepare();
  dbFailure.repository.failCommit = true;
  assert.equal(await dbFailure.engine.execute(uncertain.id, uncertain.userId), "UNKNOWN");
  assert.equal(dbFailure.repository.payments.size, 0);
  assert.equal((await dbFailure.repository.getIntent(uncertain.id, uncertain.userId))?.status, "UNKNOWN");
  dbFailure.repository.failCommit = false;
  assert.equal(await dbFailure.engine.execute(uncertain.id, uncertain.userId), "SUCCEEDED");
  assert.deepEqual(dbFailure.counts(), { charges: 1, lookups: 1 });

  const timeout = fixture();
  const timeoutIntent = await timeout.prepare();
  timeout.failCharge();
  assert.equal(await timeout.engine.execute(timeoutIntent.id, timeoutIntent.userId), "UNKNOWN");
  assert.equal(await timeout.engine.execute(timeoutIntent.id, timeoutIntent.userId), "UNKNOWN");
  timeout.advance(16 * 24 * 60 * 60_000);
  assert.equal(await timeout.engine.execute(timeoutIntent.id, timeoutIntent.userId), "UNKNOWN");
  assert.deepEqual(timeout.counts(), { charges: 1, lookups: 2 }, "ambiguous/not-found/old orders are lookup-only");

  const doubleFailure = fixture();
  const crashed = await doubleFailure.prepare();
  doubleFailure.repository.failCommit = true; doubleFailure.repository.failFinish = true;
  assert.equal(await doubleFailure.engine.execute(crashed.id, crashed.userId), "UNKNOWN");
  assert.equal((await doubleFailure.repository.getIntent(crashed.id, crashed.userId))?.status, "PROCESSING");
  doubleFailure.advance(120_001);
  doubleFailure.repository.failCommit = false; doubleFailure.repository.failFinish = false;
  assert.equal(await doubleFailure.engine.execute(crashed.id, crashed.userId), "SUCCEEDED");
  assert.equal(doubleFailure.counts().charges, 1);

  const oldWorker = fixture();
  const leased = await oldWorker.prepare();
  let release!: (payment: ProviderPayment) => void;
  oldWorker.overrideCharge(() => new Promise((resolve) => { release = resolve; }));
  const waiting = oldWorker.engine.execute(leased.id, leased.userId);
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  oldWorker.advance(120_001);
  oldWorker.setRemote({ orderId: leased.orderId, paymentKey: "synthetic-payment", amount: leased.amount, currency: "KRW", status: "DONE" });
  assert.equal(await oldWorker.engine.execute(leased.id, leased.userId), "SUCCEEDED");
  release({ orderId: leased.orderId, paymentKey: "synthetic-payment", amount: leased.amount, currency: "KRW", status: "DONE" });
  assert.equal(await waiting, "STALE");
  assert.equal(oldWorker.repository.payments.size, 1);
  assert.deepEqual(oldWorker.counts(), { charges: 1, lookups: 1 });

  const mismatched = fixture();
  const mismatchIntent = await mismatched.prepare();
  mismatched.overrideCharge(async () => ({ orderId: "wrong-order", paymentKey: "synthetic-payment", amount: mismatchIntent.amount, currency: "KRW", status: "DONE" }));
  assert.equal(await mismatched.engine.execute(mismatchIntent.id, mismatchIntent.userId), "HOLD");
  assert.equal(mismatched.repository.payments.size, 0);

  const cancelRace = fixture();
  const cancelled = await cancelRace.prepare();
  cancelRace.overrideCharge(async () => {
    cancelRace.repository.subscriptions.set(cancelled.userId, { id: "synthetic-cancelled", userId: cancelled.userId,
      version: 1, plan: cancelled.plan, cycle: cancelled.cycle, anchor: cancelled.anchor, paidThroughIndex: 0,
      periodStart: cancelled.periodStart, periodEnd: cancelled.periodEnd, status: "CANCELLED", cancelAtPeriodEnd: true });
    return { orderId: cancelled.orderId, paymentKey: "synthetic-payment", amount: cancelled.amount, currency: "KRW", status: "DONE" };
  });
  assert.equal(await cancelRace.engine.execute(cancelled.id, cancelled.userId), "HOLD");
  assert.equal((await cancelRace.repository.getSubscription(cancelled.userId))?.status, "CANCELLED");

  let calls = 0;
  const adapter = createTossBillingProvider({ authorization: async () => "Basic synthetic-only",
    resolvePaymentMethod: async () => "synthetic-method", fetch: async (url, init) => {
      calls++;
      assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
      if (init.method === "POST") {
        assert.equal((init.headers as Record<string, string>)["Idempotency-Key"], intent.idempotencyKey);
        assert.equal(JSON.parse(init.body as string).orderId, intent.orderId);
      } else assert(url.endsWith(`/payments/orders/${intent.orderId}`));
      return Response.json({ orderId: intent.orderId, paymentKey: "synthetic-payment", totalAmount: intent.amount, currency: "KRW", status: "DONE" });
    } });
  assert.equal((await adapter.charge(intent)).status, "DONE");
  assert.equal((await adapter.lookupByOrder(intent))?.amount, intent.amount);
  assert.equal(calls, 2);
  console.log("PASS billing core: synthetic duplicate/lease/timeout/reconciliation/UTC periods/cancellation/provider adapter; checkout remains disabled");
}
main().catch(() => { console.error("FAIL synthetic billing lifecycle regression"); process.exitCode = 1; });
