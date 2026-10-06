/** Disposable PostgreSQL + synthetic provider only. No checkout, HTTP, secrets or real charges. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { BillingLifecycle, BillingPolicyHold, hasBillingPeriodAccess, type BillingIntent, type BillingLease, type ProviderPayment, type BillingProvider } from "../src/lib/payments/billing-lifecycle";
import { assertCleanE2EWorkspace, assertE2ETarget, assertNoExternalE2ECredentials } from "./helpers/e2e-environment";

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
function syntheticProvider() {
  const remote = new Map<string, ProviderPayment>();
  let charges = 0, queries = 0;
  let gate: ReturnType<typeof deferred> | undefined;
  let entered: ReturnType<typeof deferred> | undefined;
  let timeoutAfterCharge = false;
  let hideRemote = false;
  let forcedPaymentKey: string | undefined;
  const provider: BillingProvider = {
    async charge(intent) {
      charges++;
      const payment: ProviderPayment = { orderId: intent.orderId, paymentKey: forcedPaymentKey ?? `synthetic-payment-${randomUUID()}`, amount: intent.amount, currency: "KRW", status: "DONE" };
      remote.set(intent.orderId, payment); entered?.release();
      if (gate) await gate.promise;
      if (timeoutAfterCharge) throw new Error("Synthetic ambiguous timeout");
      return { ...payment };
    },
    async lookupByOrder(intent) { queries++; return !hideRemote && remote.has(intent.orderId) ? { ...remote.get(intent.orderId)! } : null; },
  };
  return { provider, counts: () => ({ charges, queries }),
    hold() { gate = deferred(); entered = deferred(); return entered.promise; },
    release() { gate?.release(); gate = undefined; entered = undefined; },
    timeout() { timeoutAfterCharge = true; }, hide(value: boolean) { hideRemote = value; },
    reuseReceipt(value: string) { forcedPaymentKey = value; },
    payment(orderId: string) { const payment = remote.get(orderId); assert(payment); return { ...payment }; } };
}
async function preflight() {
  const fake = syntheticProvider();
  const input = { orderId: `synthetic-order-${randomUUID()}`, amount: 99000 } as BillingIntent;
  const entered = fake.hold();
  const pending = fake.provider.charge(input); await entered;
  assert.equal(fake.counts().charges, 1);
  const queried = await fake.provider.lookupByOrder(input); assert(queried && queried.orderId === input.orderId);
  fake.release(); assert.deepEqual(await pending, queried);
  fake.hide(true); assert.equal(await fake.provider.lookupByOrder(input), null);
  console.log("Billing persistence offline provider preflight PASS; PostgreSQL, checkout, payment-provider API and HTTP authorization not executed.");
}

let stage = "guards";
async function runDatabase() {
  // No source Prisma/client import or connection before all guards have passed.
  assertE2ETarget(process.env.BASE_URL ?? "http://localhost:3112");
  assertCleanE2EWorkspace(); assertNoExternalE2ECredentials();
  assert.equal(process.env.NODE_ENV, "test");
  await preflight();
  const { createBillingClient } = await import("../src/lib/payments/billing-client");
  const { PrismaBillingRepository } = await import("../src/lib/payments/prisma-billing-repository");
  const { BillingKeyVault } = await import("../src/lib/payments/billing-key-vault");
  const { createPaymentMethodResolver } = await import("../src/lib/payments/payment-method-resolver");
  const { PUBLIC_PLANS, priceForCycle } = await import("../src/lib/plans");
  const db = createBillingClient(process.env.DATABASE_URL!);
  // Public fixed fixture bytes, not production key material or an entropy claim.
  const syntheticMaster = Buffer.alloc(32, 0x5a);
  const vault = new BillingKeyVault({ key: syntheticMaster, keyId: "synthetic-v1" });
  syntheticMaster.fill(0);
  const clients = [db];
  const prefix = `e2e-billing-${randomUUID()}`;
  const emails: string[] = [];
  const activeExecutions = new Set<Promise<unknown>>();
  const providers: ReturnType<typeof syntheticProvider>[] = [];
  async function fixture(label: string) {
    const email = `${prefix}-${label}@example.invalid`; emails.push(email);
    const user = await db.user.create({ data: { email, name: "합성 결제 저장 검사", passwordHash: `synthetic-unused-${randomUUID()}` } });
    assert.equal(user.subscriptionPlan, "FREE");
    let clock = new Date("2024-01-31T10:30:40.456Z");
    const fake = syntheticProvider(); providers.push(fake);
    const repository = new PrismaBillingRepository(db);
    const methodRef = `synthetic-method-${user.id}`;
    const syntheticPlaintext = `${prefix}-${label}-not-a-provider-key`;
    const envelope = vault.seal({ userId: user.id, methodRef, billingKey: syntheticPlaintext });
    await repository.saveMethod({ id: methodRef, userId: user.id, customerRef: `synthetic-customer-${user.id}`, encryptedBillingKey: envelope, keyVersion: vault.keyVersion });
    const storedMethod = await repository.getMethodForUser(methodRef, user.id); assert(storedMethod);
    assert.equal(storedMethod.encryptedBillingKey, envelope);
    assert(!storedMethod.encryptedBillingKey.includes(syntheticPlaintext), "database stores an authenticated envelope, never plaintext");
    const resolveMethod = createPaymentMethodResolver({ store: repository, vault, keyVersion: vault.keyVersion });
    assert.equal(await resolveMethod(methodRef, user.id), syntheticPlaintext, "actual vault/database/resolver roundtrip uses synthetic material only");
    const engine = (repo = repository) => new BillingLifecycle({ repository: repo, provider: fake.provider,
      now: () => new Date(clock), newId: () => `synthetic-${randomUUID()}`, leaseMs: 1000,
      price: (plan, cycle) => { const catalog = PUBLIC_PLANS.find(item => item.key === plan); assert(catalog); return priceForCycle(catalog, cycle); } });
    const prepare = (lifecycle: BillingLifecycle, operation: "INITIAL" | "RENEWAL" = "INITIAL", periodIndex = 0) => lifecycle.prepare({ userId: user.id, plan: "solo", cycle: "monthly", anchor: new Date("2024-01-31T10:30:40.456Z"), periodIndex, operation, customerRef: `synthetic-customer-${user.id}`, paymentMethodRef: `synthetic-method-${user.id}` });
    return { user, fake, repository, engine, prepare, resolveMethod, now: () => new Date(clock), setNow: (value: Date) => { clock = new Date(value); }, advance: (ms: number) => { clock = new Date(clock.getTime() + ms); } };
  }
  function track<T>(promise: Promise<T>): Promise<T> { activeExecutions.add(promise); void promise.then(() => activeExecutions.delete(promise), () => activeExecutions.delete(promise)); return promise; }
  async function restart() { const client = createBillingClient(process.env.DATABASE_URL!); clients.push(client); return new PrismaBillingRepository(client); }
  async function snapshot(userId: string) {
    return { subscription: await db.billingSubscription.findUnique({ where: { userId } }),
      intents: await db.billingIntent.findMany({ where: { userId }, orderBy: { id: "asc" } }),
      payments: await db.billingPayment.findMany({ where: { userId }, orderBy: { id: "asc" } }) };
  }
  try {
    stage = "initial unique reservation and concurrent one-charge execution";
    const duplicate = await fixture("duplicate"); const service = duplicate.engine();
    const intents = await Promise.all(Array.from({ length: 4 }, () => duplicate.prepare(service)));
    assert(intents.every(intent => intent.id === intents[0].id));
    assert.equal(await db.billingIntent.count({ where: { userId: duplicate.user.id } }), 1);
    await assert.rejects(service.prepare({ userId: duplicate.user.id, plan: "solo", cycle: "monthly", operation: "INITIAL", periodIndex: 0,
      anchor: new Date(intents[0].anchor.getTime() - 1), customerRef: intents[0].customerRef, paymentMethodRef: intents[0].paymentMethodRef }), BillingPolicyHold);
    assert.equal(await db.billingIntent.count({ where: { userId: duplicate.user.id } }), 1, "different checkout anchors cannot reserve another initial charge");
    const entered = duplicate.fake.hold();
    const first = track(service.execute(intents[0].id, duplicate.user.id)); await entered;
    const competitors = await Promise.all(Array.from({ length: 3 }, () => duplicate.engine().execute(intents[0].id, duplicate.user.id)));
    assert(competitors.every(outcome => ["BUSY", "STALE"].includes(outcome))); assert.equal(duplicate.fake.counts().charges, 1);
    duplicate.fake.release(); assert.equal(await first, "SUCCEEDED");
    const paid = await snapshot(duplicate.user.id);
    assert.equal(paid.payments.length, 1); assert.equal(paid.payments[0].status, "APPLIED");
    assert.equal(paid.intents[0].status, "SUCCEEDED"); assert.equal(paid.subscription?.paidThroughIndex, 0);

    stage = "permanent receipt reuse holds without subscription or receipt writes";
    const collision = await fixture("collision"); const collisionService = collision.engine();
    const collisionIntent = await collision.prepare(collisionService);
    collision.fake.reuseReceipt(paid.payments[0].paymentKey);
    assert.equal(await collisionService.execute(collisionIntent.id, collision.user.id), "HOLD");
    const heldCollision = await snapshot(collision.user.id);
    assert.equal(heldCollision.subscription, null, "a permanently reused receipt grants no subscription");
    assert.equal(heldCollision.payments.length, 0); assert.equal(heldCollision.intents[0].status, "HOLD");
    assert.deepEqual(await snapshot(duplicate.user.id), paid, "the existing user's receipt and subscription remain unchanged");
    assert.equal(collision.fake.counts().charges, 1);

    stage = "injected final-write failure rolls back actual PostgreSQL transaction";
    const atomic = await fixture("atomic"); const atomicIntent = await atomic.prepare(atomic.engine());
    let injectFailure = true; let injectedFailures = 0;
    // This proxy is confined to this unpredictable synthetic intent. The SQL update
    // has run, but its surrounding transaction has not committed when we throw.
    // No database trigger/schema change or fault on another user's data is introduced.
    const faultClient = new Proxy(db, {
      get(target, key) {
        if (key === "$transaction") return (callback: unknown, ...options: unknown[]) => {
          if (typeof callback !== "function") return Reflect.apply(target.$transaction, target, [callback, ...options]);
          return Reflect.apply(target.$transaction, target, [(tx: Prisma.TransactionClient) => callback(new Proxy(tx, {
            get(transaction, member) {
              if (member !== "billingIntent") return Reflect.get(transaction, member);
              return new Proxy(transaction.billingIntent, {
                get(delegate, operation) {
                  if (operation !== "update") { const value = Reflect.get(delegate, operation); return typeof value === "function" ? value.bind(delegate) : value; }
                  return async (args: Parameters<typeof delegate.update>[0]) => {
                    const result = await delegate.update(args);
                    if (injectFailure && args.where.id === atomicIntent.id && args.data.status === "SUCCEEDED") {
                      injectFailure = false; injectedFailures++; throw new Error("Synthetic final-write failure");
                    }
                    return result;
                  };
                },
              });
            },
          })), ...options]);
        };
        const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const atomicService = atomic.engine(new PrismaBillingRepository(faultClient));
    assert.equal(await atomicService.execute(atomicIntent.id, atomic.user.id), "UNKNOWN");
    assert.equal(injectedFailures, 1);
    const rolledBack = await snapshot(atomic.user.id);
    assert.equal(rolledBack.subscription, null); assert.equal(rolledBack.payments.length, 0);
    assert.equal(rolledBack.intents[0].status, "UNKNOWN");
    assert.equal(await atomic.engine(await restart()).execute(atomicIntent.id, atomic.user.id), "SUCCEEDED");
    const recoveredAtomic = await snapshot(atomic.user.id);
    assert(recoveredAtomic.subscription); assert.equal(recoveredAtomic.payments.length, 1);
    assert.equal(recoveredAtomic.intents[0].status, "SUCCEEDED");
    assert.deepEqual(atomic.fake.counts(), { charges: 1, queries: 1 });

    stage = "persisted UNKNOWN after client restart queries only";
    const unknown = await fixture("unknown"); const unknownService = unknown.engine();
    const unknownIntent = await unknown.prepare(unknownService); unknown.fake.timeout();
    assert.equal(await unknownService.execute(unknownIntent.id, unknown.user.id), "UNKNOWN");
    assert.equal((await unknown.repository.getIntent(unknownIntent.id, unknown.user.id))?.status, "UNKNOWN");
    const restartedRepository = await restart(); const restarted = unknown.engine(restartedRepository);
    unknown.fake.hide(true); assert.equal(await restarted.execute(unknownIntent.id, unknown.user.id), "UNKNOWN");
    unknown.fake.hide(false); assert.equal(await restarted.execute(unknownIntent.id, unknown.user.id), "SUCCEEDED");
    assert.deepEqual(unknown.fake.counts(), { charges: 1, queries: 2 });
    assert.equal((await snapshot(unknown.user.id)).payments.length, 1);

    stage = "revoked method UNKNOWN reconciliation holds without new charge";
    const revoked = await fixture("revoked"); const revokedService = revoked.engine(); const revokedIntent = await revoked.prepare(revokedService);
    revoked.fake.timeout(); assert.equal(await revokedService.execute(revokedIntent.id, revoked.user.id), "UNKNOWN");
    assert.equal(await revoked.repository.revokeMethod(`synthetic-method-${revoked.user.id}`, revoked.user.id, revoked.now()), true);
    await assert.rejects(revoked.resolveMethod(`synthetic-method-${revoked.user.id}`, revoked.user.id), "revoked stored envelopes cannot resolve");
    assert.equal(await revoked.engine(await restart()).execute(revokedIntent.id, revoked.user.id), "HOLD");
    const held = await snapshot(revoked.user.id); assert.equal(held.subscription, null);
    assert.equal(held.payments.filter(payment => payment.status === "POLICY_HOLD").length, 1);
    assert.deepEqual(revoked.fake.counts(), { charges: 1, queries: 1 });

    stage = "expired old charge worker fenced after reconciliation";
    const stale = await fixture("stale"); const staleService = stale.engine(); const staleIntent = await stale.prepare(staleService);
    const staleEntered = stale.fake.hold(); const old = track(staleService.execute(staleIntent.id, stale.user.id)); await staleEntered;
    const oldIntent = await stale.repository.getIntent(staleIntent.id, stale.user.id); assert(oldIntent?.workerToken && oldIntent.leaseUntil);
    const oldLease: BillingLease = { intent: oldIntent, workerToken: oldIntent.workerToken, leaseUntil: oldIntent.leaseUntil };
    stale.advance(1001);
    assert.equal(await stale.engine(await restart()).execute(staleIntent.id, stale.user.id), "SUCCEEDED");
    const fresh = await snapshot(stale.user.id);
    stale.fake.release(); assert.equal(await old, "STALE");
    assert.equal(await stale.repository.commitPaid(oldLease, stale.fake.payment(staleIntent.orderId), stale.now()), "STALE");
    assert.equal(await stale.repository.finish(oldLease, "HOLD", stale.now()), false);
    assert.deepEqual(await snapshot(stale.user.id), fresh); assert.deepEqual(stale.fake.counts(), { charges: 1, queries: 1 });

    stage = "unique renewal atomically persists payment period and intent";
    duplicate.setNow(intents[0].periodEnd);
    const renewals = await Promise.all(Array.from({ length: 3 }, () => duplicate.prepare(service, "RENEWAL", 1)));
    assert(renewals.every(intent => intent.id === renewals[0].id));
    assert.equal(await service.execute(renewals[0].id, duplicate.user.id), "SUCCEEDED");
    const renewed = await snapshot(duplicate.user.id);
    assert.equal(renewed.payments.length, 2); assert(renewed.payments.every(payment => payment.status === "APPLIED"));
    assert.equal(renewed.subscription?.paidThroughIndex, 1); assert.equal(renewed.subscription?.periodEnd.toISOString(), "2024-03-31T10:30:40.456Z");
    assert(renewed.intents.every(intent => intent.status === "SUCCEEDED")); assert.equal(duplicate.fake.counts().charges, 2);
    assert.equal(await service.execute(renewals[0].id, duplicate.user.id), "SUCCEEDED"); assert.equal(duplicate.fake.counts().charges, 2);

    stage = "cancellation racing charged renewal holds payment without revival";
    const cancel = await fixture("cancel"); const cancelService = cancel.engine(); const initial = await cancel.prepare(cancelService);
    assert.equal(await cancelService.execute(initial.id, cancel.user.id), "SUCCEEDED"); cancel.setNow(initial.periodEnd);
    const renewal = await cancel.prepare(cancelService, "RENEWAL", 1);
    const cancelEntered = cancel.fake.hold(); const cancellationRace = track(cancelService.execute(renewal.id, cancel.user.id)); await cancelEntered;
    const previousSubscription = await db.billingSubscription.findUniqueOrThrow({ where: { userId: cancel.user.id } });
    assert.equal(await cancel.repository.cancelAtPeriodEnd(cancel.user.id, previousSubscription.version, cancel.now()), true);
    assert.equal(await cancel.repository.cancelAtPeriodEnd(cancel.user.id, previousSubscription.version, cancel.now()), false, "stale cancellation version is fenced");
    cancel.fake.release(); assert.equal(await cancellationRace, "HOLD");
    const cancelled = await snapshot(cancel.user.id); assert.equal(cancelled.subscription?.cancelAtPeriodEnd, true);
    assert.equal(cancelled.subscription?.paidThroughIndex, previousSubscription.paidThroughIndex);
    assert.equal(cancelled.subscription?.periodEnd.toISOString(), previousSubscription.periodEnd.toISOString());
    assert.equal(cancelled.payments.filter(payment => payment.status === "POLICY_HOLD").length, 1);
    assert.equal((await cancel.repository.getIntent(renewal.id, cancel.user.id))?.status, "HOLD");
    const cancelledAccess = await cancel.repository.getSubscription(cancel.user.id); assert(cancelledAccess); assert.equal(hasBillingPeriodAccess(cancelledAccess, cancel.now()), false);

    stage = "repository user scope and synthetic fixture isolation";
    assert.equal(await duplicate.repository.getIntent(intents[0].id, unknown.user.id), null);
    assert.equal(await service.execute(intents[0].id, unknown.user.id), "MISSING");
    const scoped = await fixture("scope"); const scopeIntent = await scoped.prepare(scoped.engine());
    assert.equal(await scoped.repository.getMethodForUser(`synthetic-method-${scoped.user.id}`, duplicate.user.id), null);
    await assert.rejects(scoped.resolveMethod(`synthetic-method-${scoped.user.id}`, duplicate.user.id), "another owner cannot decrypt through the resolver");
    assert.equal(await scoped.repository.revokeMethod(`synthetic-method-${scoped.user.id}`, duplicate.user.id, scoped.now()), false);
    // Use a live PREPARED intent, so rejection cannot merely be caused by terminal state.
    const scopeClaim = { id: scopeIntent.id, version: scopeIntent.version, now: scoped.now(), workerToken: `synthetic-${randomUUID()}`, leaseUntil: new Date(scoped.now().getTime() + 1000), mode: "charge" as const };
    assert.equal(await scoped.repository.claim({ ...scopeClaim, userId: duplicate.user.id }), null);
    const ownLease = await scoped.repository.claim({ ...scopeClaim, userId: scoped.user.id }); assert(ownLease);
    assert.equal(await scoped.repository.finish(ownLease, "HOLD", scoped.now()), true);
    assert.equal(scoped.fake.counts().charges, 0);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: duplicate.user.id } })).subscriptionPlan, "FREE", "persistence preparation does not silently enable existing checkout or app entitlements");
    console.log("Synthetic PostgreSQL billing repository PASS: vault/database/resolver roundtrip with owner/revocation denial, concurrent reservation/one charge, UNKNOWN query-only restart, stale fences, renewal, cancellation hold and scoped access. Actual checkout/provider/webhook/refund/HTTP authorization and forced simultaneous cross-user receipt collision remain untested.");
  } finally {
    try {
      for (const provider of providers) provider.release();
      await Promise.allSettled([...activeExecutions]);
      const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } });
      assert(users.every(user => user.email !== null && emails.includes(user.email) && user.email.startsWith(prefix)));
      const ids = users.map(user => user.id);
      await db.$transaction([
        db.billingPayment.deleteMany({ where: { userId: { in: ids } } }),
        db.billingIntent.deleteMany({ where: { userId: { in: ids } } }),
        db.billingSubscription.deleteMany({ where: { userId: { in: ids } } }),
        db.billingPaymentMethod.deleteMany({ where: { userId: { in: ids } } }),
        db.user.deleteMany({ where: { id: { in: ids } } }),
      ]);
      assert.equal(await db.user.count({ where: { email: { in: emails } } }), 0);
    } finally { await Promise.allSettled(clients.map(client => client.$disconnect())); vault.destroy(); }
  }
}
(process.argv.includes("--run-db") ? runDatabase() : preflight()).catch(error => {
  const safeValue = (value: unknown) => typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) || value === null ||
    typeof value === "string" && ["PREPARED", "PROCESSING", "UNKNOWN", "SUCCEEDED", "HOLD", "CANCELLED", "BUSY", "STALE", "MISSING", "APPLIED", "POLICY_HOLD", "FREE"].includes(value) ? value : "UNREPORTED";
  console.error(JSON.stringify({ result: "SYNTHETIC_BILLING_PERSISTENCE_FAILED", stage,
    diagnostic: error instanceof assert.AssertionError ? { actual: safeValue(error.actual), expected: safeValue(error.expected) } : "DETAILS_WITHHELD" }));
  process.exitCode = 1;
});
