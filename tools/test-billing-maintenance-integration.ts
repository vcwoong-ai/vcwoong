/** Disposable PostgreSQL, synthetic provider and verified-event fixtures only; no real calls. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { BillingLifecycle, BillingPolicyHold, type BillingIntent, type BillingProvider, type ProviderPayment } from "../src/lib/payments/billing-lifecycle";
import { assertCleanE2EWorkspace, assertE2ETarget, assertNoExternalE2ECredentials } from "./helpers/e2e-environment";

function syntheticProvider() {
  const remote = new Map<string, ProviderPayment>();
  const counts = new Map<string, { charges: number; queries: number }>();
  const uncertain = new Set<string>();
  const holds = new Map<string, { gate: Promise<void>; entered: Promise<void>; enter: () => void; release: () => void }>();
  let afterCall: (() => void) | undefined;
  const counter = (userId: string) => { if (!counts.has(userId)) counts.set(userId, { charges: 0, queries: 0 }); return counts.get(userId)!; };
  const provider: BillingProvider = {
    async charge(intent) {
      counter(intent.userId).charges++;
      const payment: ProviderPayment = { orderId: intent.orderId, paymentKey: `synthetic-maintenance-receipt-${randomUUID()}`, amount: intent.amount, currency: "KRW", status: "DONE" };
      remote.set(intent.orderId, payment);
      const hold = holds.get(intent.userId); if (hold) { hold.enter(); await hold.gate; }
      afterCall?.();
      if (uncertain.has(intent.userId)) throw new Error("Synthetic uncertain remote charge");
      return { ...payment };
    },
    async lookupByOrder(intent) { counter(intent.userId).queries++; afterCall?.(); return remote.has(intent.orderId) ? { ...remote.get(intent.orderId)! } : null; },
  };
  return { provider, counts: (userId: string) => ({ ...counter(userId) }), uncertain: (userId: string) => uncertain.add(userId),
    afterCall(fn?: () => void) { afterCall = fn; },
    hold(userId: string) { let release!: () => void, enter!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); const entered = new Promise<void>(resolve => { enter = resolve; }); holds.set(userId, { gate, entered, enter, release }); return entered; },
    release(userId: string) { holds.get(userId)?.release(); holds.delete(userId); },
    releaseAll() { for (const hold of holds.values()) hold.release(); holds.clear(); },
    remote(orderId: string) { const value = remote.get(orderId); assert(value); return { ...value }; },
    setRemote(payment: ProviderPayment) { remote.set(payment.orderId, { ...payment }); } };
}
async function preflight() {
  const fake = syntheticProvider(); const input = { userId: "synthetic-user", orderId: `synthetic-${randomUUID()}`, amount: 99000 } as BillingIntent;
  fake.uncertain(input.userId); await assert.rejects(fake.provider.charge(input));
  assert.equal((await fake.provider.lookupByOrder(input))?.status, "DONE");
  assert.deepEqual(fake.counts(input.userId), { charges: 1, queries: 1 });
  console.log("Billing maintenance offline synthetic-provider preflight PASS; PostgreSQL, cron/event HTTP and real provider not executed.");
}
let stage = "guards";
async function runDatabase() {
  assertE2ETarget(process.env.BASE_URL ?? "http://localhost:3112"); assertCleanE2EWorkspace(); assertNoExternalE2ECredentials(); assert.equal(process.env.NODE_ENV, "test");
  await preflight();
  const { createBillingClient } = await import("../src/lib/payments/billing-client");
  const db = createBillingClient(process.env.DATABASE_URL!); const clients = [db];
  const sourceGlobals = globalThis as typeof globalThis & { prisma?: typeof db }; const previousPrisma = sourceGlobals.prisma; sourceGlobals.prisma = db;
  try {
    const { PrismaBillingRepository } = await import("../src/lib/payments/prisma-billing-repository");
    const { BillingMaintenance } = await import("../src/lib/payments/billing-maintenance");
    const { PrismaBillingMaintenanceSchedule, BILLING_MAINTENANCE_STATE_ID } = await import("../src/lib/payments/billing-maintenance-schedule");
    const { BillingEventService } = await import("../src/lib/payments/billing-events");
    const { BillingKeyVault } = await import("../src/lib/payments/billing-key-vault");
    const { PUBLIC_PLANS, priceForCycle } = await import("../src/lib/plans");
    const { getUserPlanKey } = await import("../src/lib/subscription");
    const { checkQuota } = await import("../src/lib/quotas");
    assert.equal((await import("../src/lib/prisma")).prisma, db);
    const master = Buffer.alloc(32, 0x7a); const vault = new BillingKeyVault({ key: master, keyId: "synthetic-maintenance-v1" }); master.fill(0);
    const liveNow = new Date(); let clock = new Date(liveNow); let mono = 0;
    const previousMonth = new Date(Date.UTC(liveNow.getUTCFullYear(), liveNow.getUTCMonth() - 1, 1));
    const currentMonth = new Date(Date.UTC(liveNow.getUTCFullYear(), liveNow.getUTCMonth(), 1));
    const prefix = `e2e-maintenance-${randomUUID()}`; const emails: string[] = [];
    let ownsScheduleState = false;
    const fake = syntheticProvider(); const active = new Set<Promise<unknown>>();
    const now = () => new Date(clock); const newId = () => `synthetic-${randomUUID()}`;
    let catalogOverride: number | undefined;
    const price: ConstructorParameters<typeof BillingLifecycle>[0]["price"] = (plan, cycle) => { const entry = PUBLIC_PLANS.find(item => item.key === plan); assert(entry); return catalogOverride ?? priceForCycle(entry, cycle); };
    const repository = new PrismaBillingRepository(db);
    const lifecycle = (repo = repository) => new BillingLifecycle({ repository: repo, provider: fake.provider, now, newId, price });
    const maintenance = (repo = repository) => new BillingMaintenance({ repository: repo, lifecycle: lifecycle(repo), now, monotonicMs: () => mono });
    function privacy(result: unknown) {
      assert(result !== null && typeof result === "object" && !Array.isArray(result));
      const keys = ["examined", "renewals", "reconciliations", "succeeded", "unknown", "held", "skipped", "failed", "budgetStopped"];
      assert.deepEqual(Object.keys(result).sort(), keys.sort());
      assert(Object.values(result).every(value => typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)));
    }
    async function run(repo = repository) { mono = 0; const result = await maintenance(repo).run({ batchLimit: 2, timeBudgetMs: 105000 }); privacy(result); return result; }
    async function fixture(label: string, anchor = previousMonth) {
      clock = new Date(anchor); const email = `${prefix}-${label}@example.invalid`; emails.push(email);
      stage = "synthetic fixture user insertion";
      const user = await db.user.create({ data: { email, name: "합성 정기청구 검사", passwordHash: `synthetic-unused-${randomUUID()}` } });
      const methodRef = `synthetic-method-${user.id}`, customerRef = `synthetic-customer-${user.id}`;
      stage = "synthetic fixture method encryption and insertion";
      await repository.saveMethod({ id: methodRef, userId: user.id, customerRef, keyVersion: vault.keyVersion,
        encryptedBillingKey: vault.seal({ userId: user.id, methodRef, billingKey: `synthetic-maintenance-key-${randomUUID()}` }) });
      stage = `fixture ${label.replace(/[^A-Za-z-]/g, "")} initial preparation`;
      const intent = await lifecycle().prepare({ userId: user.id, plan: "solo", cycle: "monthly", operation: "INITIAL", periodIndex: 0, anchor, customerRef, paymentMethodRef: methodRef });
      return { user, anchor, methodRef, customerRef, intent };
    }
    async function seed(label: string, anchor = previousMonth) { const item = await fixture(label, anchor); assert.equal(await lifecycle().execute(item.intent.id, item.user.id), "SUCCEEDED"); return item; }
    async function snapshot(userId: string) { return { subscription: await db.billingSubscription.findUnique({ where: { userId } }), intents: await db.billingIntent.findMany({ where: { userId }, orderBy: { id: "asc" } }), payments: await db.billingPayment.findMany({ where: { userId }, orderBy: { id: "asc" } }), methods: await db.billingPaymentMethod.findMany({ where: { userId }, orderBy: { id: "asc" } }) }; }
    function track<T>(promise: Promise<T>) { active.add(promise); void promise.then(() => active.delete(promise), () => active.delete(promise)); return promise; }
    async function restart() { const client = createBillingClient(process.env.DATABASE_URL!); clients.push(client); return new PrismaBillingRepository(client); }
    try {
      stage = "same-period maintenance race charges one immutable renewal";
      const happy = await seed("happy"); clock = new Date(liveNow);
      stage = "existing renewal preparation";
      const storedRenewal = await lifecycle().prepare({ userId: happy.user.id, plan: "solo", cycle: "monthly", operation: "RENEWAL", periodIndex: 1, anchor: happy.anchor, customerRef: happy.customerRef, paymentMethodRef: happy.methodRef });
      catalogOverride = 1; // An existing immutable reservation must not be repriced.
      stage = "existing renewal provider entry";
      const entered = fake.hold(happy.user.id); const first = track(run());
      let entryTimeout!: ReturnType<typeof setTimeout>;
      try { await Promise.race([entered, first.then(() => { throw new Error("Maintenance completed before held charge"); }), new Promise<never>((_, reject) => { entryTimeout = setTimeout(() => reject(new Error("Synthetic maintenance entry deadline")), 30000); })]); } finally { clearTimeout(entryTimeout); }
      privacy(await run()); fake.release(happy.user.id); privacy(await first);
      stage = "existing renewal charge and receipt counts";
      catalogOverride = undefined;
      assert.deepEqual(fake.counts(happy.user.id), { charges: 2, queries: 0 });
      privacy(await run()); assert.equal(fake.counts(happy.user.id).charges, 2);
      const renewed = await snapshot(happy.user.id); assert.equal(renewed.payments.length, 2); assert.equal(renewed.subscription?.paidThroughIndex, 1);
      const renewal = renewed.intents.find(intent => intent.periodIndex === 1); assert(renewal);
      assert.equal(renewal.id, storedRenewal.id); assert.equal(renewal.amount, storedRenewal.amount); assert.equal(renewal.anchor.toISOString(), happy.anchor.toISOString());
      assert.equal(renewal.customerRef, happy.customerRef); assert.equal(renewal.paymentMethodRef, happy.methodRef);
      stage = "renewed actual plan and quota access";
      assert.equal(await getUserPlanKey(happy.user.id), "solo"); assert.equal((await checkQuota(happy.user.id, "report")).limit, 20);

      stage = "persisted UNKNOWN server-object restart performs order query only";
      const unknown = await fixture("unknown", currentMonth); fake.uncertain(unknown.user.id);
      assert.equal(await lifecycle().execute(unknown.intent.id, unknown.user.id), "UNKNOWN"); clock = new Date(liveNow);
      privacy(await run(await restart())); assert.deepEqual(fake.counts(unknown.user.id), { charges: 1, queries: 1 });
      assert.equal((await repository.getIntent(unknown.intent.id, unknown.user.id))?.status, "SUCCEEDED");

      stage = "cancelled revoked and missed-period subscriptions never charge";
      const cancelled = await seed("cancelled"); const cancelSubscription = await repository.getSubscription(cancelled.user.id); assert(cancelSubscription);
      assert.equal(await repository.cancelAtPeriodEnd(cancelled.user.id, cancelSubscription.version, now()), true);
      const revoked = await seed("revoked"); assert.equal(await repository.revokeMethod(revoked.methodRef, revoked.user.id, now()), true);
      const missedAnchor = new Date(Date.UTC(liveNow.getUTCFullYear(), liveNow.getUTCMonth() - 2, 1)); const missed = await seed("missed", missedAnchor);
      clock = new Date(liveNow); privacy(await run());
      for (const item of [cancelled, revoked, missed]) { assert.equal(fake.counts(item.user.id).charges, 1); assert.equal(await db.billingIntent.count({ where: { userId: item.user.id } }), 1); }

      stage = "unapproved new-period catalog price change holds before charging";
      const changedPrice = await seed("changed-price"); clock = new Date(liveNow); catalogOverride = 1;
      const priceHold = await run(); catalogOverride = undefined;
      assert(priceHold.held >= 1); assert.equal(fake.counts(changedPrice.user.id).charges, 1);
      assert.equal(await db.billingIntent.count({ where: { userId: changedPrice.user.id } }), 1);
      const unchangedSubscription = await repository.getSubscription(changedPrice.user.id); assert(unchangedSubscription);
      assert.equal(unchangedSubscription.paidThroughIndex, 0);
      // Close this synthetic reservation's future renewal eligibility before budget cases.
      assert.equal(await repository.cancelAtPeriodEnd(changedPrice.user.id, unchangedSubscription.version, now()), true);

      stage = "provider batch and reserved time budget expose counts only";
      const budgetA = await seed("budget-A"), budgetB = await seed("budget-B"); clock = new Date(liveNow);
      mono = 0; fake.afterCall(() => { mono += 40000; });
      const bounded = await maintenance().run({ batchLimit: 2, timeBudgetMs: 105000 }); privacy(bounded); assert.equal(bounded.budgetStopped, 1);
      fake.afterCall();
      assert.equal(fake.counts(budgetA.user.id).charges + fake.counts(budgetB.user.id).charges, 3, "one new charge, plus two seed charges, before remaining budget falls below provider reserve");
      privacy(await run()); assert.equal(fake.counts(budgetA.user.id).charges + fake.counts(budgetB.user.id).charges, 4);

      stage = "durable wrapper with actual financial lifecycle and synthetic provider";
      assert.equal(await db.billingMaintenanceState.count(), 0, "Dedicated wrapper test cannot replace pre-existing schedule state.");
      const scheduled = await seed("durable-wrapper"); clock = new Date(liveNow); mono = 0;
      const wrapped = () => new PrismaBillingMaintenanceSchedule(db, { now, newId, monotonicMs: () => mono,
        lifecycle: lifecycle(), repository: {
          listReconciliationCandidates: async (date, take, afterId) => (await repository.listReconciliationCandidates(date, take, afterId)).filter(item => item.userId === scheduled.user.id),
          listRenewalCandidates: async (date, take, afterId) => (await repository.listRenewalCandidates(date, take, afterId)).filter(item => item.userId === scheduled.user.id),
          getRenewalContext: repository.getRenewalContext.bind(repository), getIntent: repository.getIntent.bind(repository),
        } });
      ownsScheduleState = true;
      const scheduledEntered = fake.hold(scheduled.user.id);
      const scheduledFirst = track(wrapped().run());
      let scheduledTimeout!: ReturnType<typeof setTimeout>;
      try { await Promise.race([scheduledEntered, scheduledFirst.then(() => { throw new Error("Synthetic wrapper completed before provider barrier"); }),
        new Promise<never>((_, reject) => { scheduledTimeout = setTimeout(() => reject(new Error("Synthetic wrapper deadline")), 30000); })]); }
      finally { clearTimeout(scheduledTimeout); }
      const busy = await wrapped().run(); assert.equal(busy.busy, 1); assert.equal(busy.examined, 0);
      fake.release(scheduled.user.id); assert.equal((await scheduledFirst).succeeded, 1);
      assert.deepEqual(fake.counts(scheduled.user.id), { charges: 2, queries: 0 });
      assert.equal((await wrapped().run()).backoff, 1);
      const scheduledState = await db.billingMaintenanceState.findUniqueOrThrow({ where: { id: BILLING_MAINTENANCE_STATE_ID } });
      clock = new Date(scheduledState.nextAttemptAt!.getTime());
      assert.equal((await wrapped().run()).renewals, 0);
      assert.equal(fake.counts(scheduled.user.id).charges, 2);
      assert.equal((await repository.getSubscription(scheduled.user.id))?.paidThroughIndex, 1);
      await db.billingMaintenanceState.delete({ where: { id: BILLING_MAINTENANCE_STATE_ID } }); ownsScheduleState = false;

      stage = "event payload is only a hint and verified older refund preserves current access";
      clock = new Date(liveNow); const limiterKeys: string[] = [];
      const events = new BillingEventService({ repository, lookupByOrder: fake.provider.lookupByOrder, now, newId,
        allow: async key => { limiterKeys.push(key); return true; } });
      const body = (payment: ProviderPayment, extras: Record<string, unknown> = {}) => ({ eventType: "PAYMENT_STATUS_CHANGED", data: { orderId: payment.orderId, paymentKey: payment.paymentKey, ...extras } });
      const current = fake.remote(renewal.orderId); const original = fake.remote(happy.intent.orderId);
      const beforeForgery = await snapshot(happy.user.id);
      assert.equal(await events.handle(body(current, { status: "CANCELED", amount: 1, currency: "USD", userId: unknown.user.id })), "DUPLICATE");
      assert.deepEqual(await snapshot(happy.user.id), beforeForgery);
      assert.equal(await events.handle({ eventType: "BILLING_DELETED", data: { customerKey: happy.customerRef } }), "UNVERIFIED");
      assert.deepEqual(await snapshot(happy.user.id), beforeForgery);
      fake.setRemote({ ...current, status: "CANCELED", amount: current.amount + 1 });
      assert.equal(await events.handle(body(current)), "HOLD"); assert.deepEqual(await snapshot(happy.user.id), beforeForgery);
      fake.setRemote(current);
      fake.setRemote({ ...original, status: "CANCELED" });
      assert.equal(await events.handle(body(original)), "RECORDED"); assert.equal(await events.handle(body(original)), "DUPLICATE");
      const oldRefund = await snapshot(happy.user.id); assert.deepEqual(oldRefund.subscription, beforeForgery.subscription);
      assert.equal(await getUserPlanKey(happy.user.id), "solo");

      stage = "partial current refund retains paid access; full refund and duplicates never revive";
      fake.setRemote({ ...current, status: "PARTIAL_CANCELED" }); assert.equal(await events.handle(body(current)), "RECORDED");
      const partial = await repository.getSubscription(happy.user.id); assert(partial); assert.equal(partial.status, "ACTIVE"); assert(partial.cancelAtPeriodEnd);
      assert.equal(await getUserPlanKey(happy.user.id), "solo");
      fake.setRemote({ ...current, status: "CANCELED" }); assert.equal(await events.handle(body(current)), "RECORDED");
      const fullyCancelled = await snapshot(happy.user.id); assert.equal(fullyCancelled.subscription?.status, "CANCELLED");
      assert.equal(await getUserPlanKey(happy.user.id), "free"); assert.equal((await checkQuota(happy.user.id, "report")).limit, 5);
      assert.equal(await events.handle(body(current)), "DUPLICATE");
      fake.setRemote(current); assert.equal(await events.handle(body(current, { status: "DONE" })), "DUPLICATE");
      assert.deepEqual(await snapshot(happy.user.id), fullyCancelled);
      assert(limiterKeys.every(key => key === "billing-events:global" || /^billing-events:order:[a-f0-9]{64}$/.test(key)), "limiter keys contain only aggregate/hash identifiers");
      const denied = new BillingEventService({ repository, lookupByOrder: fake.provider.lookupByOrder, now, newId, allow: async () => false });
      const beforeDenied = fake.counts(happy.user.id); assert.equal(await denied.handle(body(current)), "RATE_LIMITED"); assert.deepEqual(fake.counts(happy.user.id), beforeDenied);

      stage = "historical HOLD and UNKNOWN block a later fresh-period charge";
      for (const historyStatus of ["HOLD", "UNKNOWN"] as const) {
        const historical = await seed(`historical-${historyStatus}`); clock = new Date(liveNow);
        const paidNext = await lifecycle().prepare({ userId: historical.user.id, plan: "solo", cycle: "monthly", operation: "RENEWAL", periodIndex: 1,
          anchor: historical.anchor, customerRef: historical.customerRef, paymentMethodRef: historical.methodRef });
        assert.equal(await lifecycle().execute(paidNext.id, historical.user.id), "SUCCEEDED");
        // Simulate durable uncertainty/manual review in an OLDER synthetic period,
        // independently of the newer successful receipt. No production state is touched.
        const changed = await db.billingIntent.updateMany({ where: { id: historical.intent.id, userId: historical.user.id, periodIndex: 0 }, data: { status: historyStatus } }); assert.equal(changed.count, 1);
        if (historyStatus === "UNKNOWN") fake.setRemote({ ...fake.remote(historical.intent.orderId), status: "PENDING" });
        const subscription = await repository.getSubscription(historical.user.id); assert(subscription);
        clock = new Date(subscription.periodEnd.getTime() + 1);
        const candidate = { id: subscription.id, userId: historical.user.id, version: subscription.version };
        assert.equal(await repository.getRenewalContext(candidate, now()), null, "older unresolved state blocks new-period preparation");
        // Filter only this fixture after the real bounded PG scan, preserving the
        // actual context/claim/commit gates while other fixtures' clocks stay isolated.
        const scopedMaintenance = new BillingMaintenance({ now, monotonicMs: () => mono, lifecycle: lifecycle(), repository: {
          listReconciliationCandidates: async (date, take) => (await repository.listReconciliationCandidates(date, take)).filter(item => item.userId === historical.user.id),
          listRenewalCandidates: async (date, take, afterId) => (await repository.listRenewalCandidates(date, take, afterId)).filter(item => item.userId === historical.user.id),
          getRenewalContext: repository.getRenewalContext.bind(repository), getIntent: repository.getIntent.bind(repository),
        } });
        mono = 0; privacy(await scopedMaintenance.run({ batchLimit: 2, timeBudgetMs: 105000 }));
        assert.equal(fake.counts(historical.user.id).charges, 2, "only the two completed seed periods were charged");
        assert.equal(await db.billingIntent.count({ where: { userId: historical.user.id } }), 2);
        assert.equal((await repository.getSubscription(historical.user.id))?.paidThroughIndex, 1);
        assert.equal((await repository.getIntent(historical.intent.id, historical.user.id))?.status, historyStatus);
        assert.equal(fake.counts(historical.user.id).queries, historyStatus === "UNKNOWN" ? 1 : 0);
      }
      console.log("Synthetic PostgreSQL maintenance/events PASS: one-charge renewal races, restart queries, cancellation/revocation/missed-period safety, immutable reservations, catalog-change hold, historical HOLD/UNKNOWN fresh-charge blocking, budget/privacy counts, actual quota access and independently verified old/partial/full refund behavior. Real cron/webhook HTTP, provider and production jobs remain untested.");
    } finally {
      try {
        fake.releaseAll(); await Promise.allSettled([...active]);
        if (ownsScheduleState) await db.billingMaintenanceState.deleteMany({ where: { id: BILLING_MAINTENANCE_STATE_ID } });
        const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } }); assert(users.every(user => user.email !== null && emails.includes(user.email) && user.email.startsWith(prefix))); const ids = users.map(user => user.id);
        await db.$transaction([db.billingPayment.deleteMany({ where: { userId: { in: ids } } }), db.billingIntent.deleteMany({ where: { userId: { in: ids } } }), db.billingSubscription.deleteMany({ where: { userId: { in: ids } } }), db.billingPaymentMethod.deleteMany({ where: { userId: { in: ids } } }), db.user.deleteMany({ where: { id: { in: ids } } })]);
        assert.equal(await db.user.count({ where: { email: { in: emails } } }), 0);
      } finally { vault.destroy(); }
    }
  } finally { sourceGlobals.prisma = previousPrisma; await Promise.allSettled(clients.map(client => client.$disconnect())); }
}
(process.argv.includes("--run-db") ? runDatabase() : preflight()).catch(error => {
  const safe = (value: unknown) => typeof value === "number" || typeof value === "boolean" || value === null ? value :
    typeof value === "string" && /^(SUCCEEDED|UNKNOWN|HOLD|PREPARED|ACTIVE|CANCELLED|DUPLICATE|RECORDED|solo|free)$/.test(value) ? value : "WITHHELD";
  const diagnostic = error instanceof assert.AssertionError ? { kind: "ASSERTION", actual: safe(error.actual), expected: safe(error.expected) } : {
    kind: error instanceof BillingPolicyHold ? "POLICY_HOLD" : error instanceof Error && /^(BillingConflict|PrismaClientKnownRequestError|PrismaClientValidationError|PrismaClientInitializationError)$/.test(error.name) ? error.name : "WITHHELD",
    code: error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^P\d{4}$/.test(error.code) ? error.code :
      error && typeof error === "object" && "errorCode" in error && typeof error.errorCode === "string" && /^P\d{4}$/.test(error.errorCode) ? error.errorCode : "WITHHELD",
  };
  console.error(JSON.stringify({ result: "SYNTHETIC_MAINTENANCE_FAILED", stage, diagnostic })); process.exitCode = 1;
});
