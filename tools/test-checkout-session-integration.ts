/** Synthetic checkout coordinator + disposable PostgreSQL only. No provider HTTP or real keys. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { BillingLifecycle, BillingPolicyHold, hasBillingPeriodAccess, type BillingProvider, type ProviderPayment } from "../src/lib/payments/billing-lifecycle";
import { assertCleanE2EWorkspace, assertE2ETarget, assertNoExternalE2ECredentials } from "./helpers/e2e-environment";

function deferred() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
async function waitForIssue(entered: Promise<void>, worker: Promise<unknown>) {
  let timeout!: ReturnType<typeof setTimeout>;
  try {
    await Promise.race([entered, worker.then(() => { throw new Error("Synthetic callback completed before issuance"); }, () => { throw new Error("Synthetic callback failed before issuance"); }),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Synthetic issuer entry deadline")), 30000); })]);
  } finally { clearTimeout(timeout); }
}
function syntheticIssuer() {
  let calls = 0, ambiguous = false;
  let gate: ReturnType<typeof deferred> | undefined;
  let entered: ReturnType<typeof deferred> | undefined;
  return {
    async issue(customerRef: string) {
      calls++; entered?.release(); if (gate) await gate.promise;
      if (ambiguous) throw new Error("Synthetic issuance uncertainty");
      return { customerRef, billingKey: `synthetic-test-only-method-${randomUUID()}` };
    },
    calls: () => calls,
    hold() { gate = deferred(); entered = deferred(); return entered.promise; },
    release() { gate?.release(); gate = undefined; entered = undefined; },
    timeout() { ambiguous = true; },
  };
}
async function preflight() {
  const issuer = syntheticIssuer(); const entered = issuer.hold();
  const issued = issuer.issue("synthetic-customer"); await entered; assert.equal(issuer.calls(), 1);
  issuer.release(); assert.equal((await issued).customerRef, "synthetic-customer");
  issuer.timeout(); await assert.rejects(issuer.issue("synthetic-customer")); assert.equal(issuer.calls(), 2);
  console.log("Checkout issuer offline preflight PASS; PostgreSQL, application authorization and real issuance/payment not executed.");
}

let stage = "guards";
async function runDatabase() {
  assertE2ETarget(process.env.BASE_URL ?? "http://localhost:3112");
  assertCleanE2EWorkspace(); assertNoExternalE2ECredentials(); assert.equal(process.env.NODE_ENV, "test");
  await preflight();
  const { createBillingClient } = await import("../src/lib/payments/billing-client");
  const db = createBillingClient(process.env.DATABASE_URL!); const clients = [db];
  // Bind the ACTUAL source singleton to this real, guarded, quiet PostgreSQL client
  // before plans/quotas/subscription import it. No queries or getter results are mocked.
  const sourceGlobals = globalThis as typeof globalThis & { prisma?: typeof db };
  const previousPrisma = sourceGlobals.prisma; sourceGlobals.prisma = db;
  try {
  const { PrismaBillingRepository } = await import("../src/lib/payments/prisma-billing-repository");
  const { CheckoutSessionService } = await import("../src/lib/payments/checkout-session");
  const { BillingKeyVault } = await import("../src/lib/payments/billing-key-vault");
  const { createCheckoutRuntime } = await import("../src/lib/payments/billing-runtime");
  const { PUBLIC_PLANS, priceForCycle } = await import("../src/lib/plans");
  assert.equal((await import("../src/lib/prisma")).prisma, db, "source getters use this actual quiet isolated PostgreSQL client");
  const fixedTestKey = Buffer.alloc(32, 0x64); const vault = new BillingKeyVault({ key: fixedTestKey, keyId: "synthetic-checkout-v1" }); fixedTestKey.fill(0);
  const prefix = `e2e-checkout-${randomUUID()}`;
  const emails: string[] = [];
  const issuers: ReturnType<typeof syntheticIssuer>[] = [];
  const active = new Set<Promise<unknown>>();
  const origin = new URL(process.env.BASE_URL ?? "http://localhost:3112").origin;
  const price = (plan: Parameters<typeof priceForCycle>[0]["key"], cycle: Parameters<typeof priceForCycle>[1]) => { const entry = PUBLIC_PLANS.find(item => item.key === plan); assert(entry); return priceForCycle(entry, cycle); };
  async function fixture(label: string) {
    const email = `${prefix}-${label}@example.invalid`; emails.push(email);
    const user = await db.user.create({ data: { email, name: "합성 구독 신청 검사", passwordHash: `synthetic-unused-${randomUUID()}` } });
    const issuer = syntheticIssuer(); issuers.push(issuer);
    let clock = new Date("2024-01-31T10:30:40.456Z"); let charges = 0, queries = 0, ambiguousCharge = false;
    const remote = new Map<string, ProviderPayment>();
    const authKey = `synthetic-auth-${randomUUID()}`;
    const provider: BillingProvider = {
      async charge(intent) { charges++; const payment: ProviderPayment = { orderId: intent.orderId, paymentKey: `synthetic-receipt-${randomUUID()}`, amount: intent.amount, currency: "KRW", status: "DONE" }; remote.set(intent.orderId, payment); if (ambiguousCharge) throw new Error("Synthetic uncertain charge"); return { ...payment }; },
      async lookupByOrder(intent) { queries++; return remote.has(intent.orderId) ? { ...remote.get(intent.orderId)! } : null; },
    };
    const service = (client = db) => {
      const repository = new PrismaBillingRepository(client);
      const lifecycle = new BillingLifecycle({ repository, provider, now: () => new Date(clock), newId: () => `synthetic-${randomUUID()}`, price });
      return new CheckoutSessionService({ client, repository, lifecycle, vault, now: () => new Date(clock), newId: () => `synthetic-${randomUUID()}`, price,
        issueBillingKey: async (receivedAuthKey, customerRef) => { assert.equal(receivedAuthKey, authKey); return issuer.issue(customerRef); } });
    };
    const input = { userId: user.id, plan: "solo" as const, cycle: "monthly" as const, origin };
    return { user, issuer, authKey, input, service, now: () => new Date(clock), setNow: (value: Date) => { clock = new Date(value); }, advance: (ms: number) => { clock = new Date(clock.getTime() + ms); },
      counts: () => ({ issues: issuer.calls(), charges, queries }), ambiguousCharge: () => { ambiguousCharge = true; } };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  type Prepared = Awaited<ReturnType<InstanceType<typeof CheckoutSessionService>["prepare"]>>;
  function callback(fixture: Fixture, prepared: Prepared) { const id = new URL(prepared.successUrl).searchParams.get("session"); assert(id); return { userId: fixture.user.id, sessionId: id, customerKey: prepared.customerKey, authKey: fixture.authKey }; }
  function track<T>(promise: Promise<T>) { active.add(promise); void promise.then(() => active.delete(promise), () => active.delete(promise)); return promise; }
  async function restart() { const client = createBillingClient(process.env.DATABASE_URL!); clients.push(client); return client; }
  async function snapshot(userId: string) { return { session: await db.billingCheckoutSession.findUnique({ where: { activeUserId: userId } }), methods: await db.billingPaymentMethod.findMany({ where: { userId }, orderBy: { id: "asc" } }), intents: await db.billingIntent.findMany({ where: { userId }, orderBy: { id: "asc" } }), payments: await db.billingPayment.findMany({ where: { userId }, orderBy: { id: "asc" } }), subscription: await db.billingSubscription.findUnique({ where: { userId } }) }; }
  try {
    stage = "owner scope and server-derived price";
    const happy = await fixture("happy"), outsider = await fixture("outsider"); const service = happy.service();
    await assert.rejects(service.prepare({ ...happy.input, userId: "" }), BillingPolicyHold);
    const extraPrepare = { ...happy.input, amount: 1, currency: "USD", userIdFromBody: outsider.user.id };
    const prepared = await service.prepare(extraPrepare);
    const input = callback(happy, prepared);
    assert.equal(await service.callback({ ...input, userId: "" }), "MISSING");
    assert.equal(await service.callback({ ...input, userId: outsider.user.id }), "MISSING");
    assert.equal(await service.callback({ ...input, customerKey: "synthetic-wrong-customer" }), "MISSING");
    assert.deepEqual(happy.counts(), { issues: 0, charges: 0, queries: 0 });
    const reserved = (await snapshot(happy.user.id)).session; assert(reserved);
    assert.equal(reserved.amount, 99000); assert.equal(reserved.plan, "solo"); assert.equal(reserved.cycle, "monthly");
    assert.equal(new URL(prepared.successUrl).origin, origin); assert.equal(new URL(prepared.failUrl).origin, origin);

    stage = "same callback concurrently issues and charges once";
    const repeatedPrepare = await Promise.all(Array.from({ length: 3 }, () => service.prepare(happy.input)));
    assert(repeatedPrepare.every(value => value.successUrl === prepared.successUrl && value.customerKey === prepared.customerKey));
    const entered = happy.issuer.hold(); const first = track(service.callback(input)); await waitForIssue(entered, first);
    const competitors = await Promise.all(Array.from({ length: 3 }, () => happy.service().callback(input)));
    assert(competitors.every(outcome => outcome === "BUSY")); assert.equal(happy.counts().issues, 1);
    happy.issuer.release(); assert.equal(await first, "SUCCEEDED");
    const tamperedCallback = { ...input, plan: "full", cycle: "yearly", amount: 1, currency: "USD" };
    assert.equal(await service.callback(tamperedCallback), "SUCCEEDED");
    const paid = await snapshot(happy.user.id); assert.equal(paid.session?.status, "READY"); assert.equal(paid.intents.length, 1); assert.equal(paid.payments.length, 1);
    assert.equal(paid.payments[0].amount, 99000); assert.equal(paid.subscription?.plan, "solo"); assert.equal(paid.subscription?.cycle, "monthly");
    assert(!JSON.stringify(paid).includes(happy.authKey), "raw provider auth key is never persisted");
    assert.deepEqual(happy.counts(), { issues: 1, charges: 1, queries: 0 });

    stage = "issuance uncertainty holds permanently without reissue";
    const uncertain = await fixture("uncertain"); const uncertainService = uncertain.service(); const uncertainPrepared = await uncertainService.prepare(uncertain.input);
    uncertain.issuer.timeout(); assert.equal(await uncertainService.callback(callback(uncertain, uncertainPrepared)), "ISSUE_HOLD");
    assert.equal(await uncertain.service(await restart()).callback(callback(uncertain, uncertainPrepared)), "ISSUE_HOLD");
    const unknownIssue = await snapshot(uncertain.user.id); assert.equal(unknownIssue.session?.status, "HOLD"); assert.equal(unknownIssue.methods.length, 0); assert.equal(unknownIssue.intents.length, 0);
    assert.deepEqual(uncertain.counts(), { issues: 1, charges: 0, queries: 0 });

    stage = "expired unclaimed checkout invokes neither issuance nor charge";
    const expired = await fixture("expired"); const expiredService = expired.service(); const expiredPrepared = await expiredService.prepare(expired.input);
    expired.advance(30 * 60 * 1000);
    assert.equal(await expiredService.callback(callback(expired, expiredPrepared)), "EXPIRED");
    assert.deepEqual(expired.counts(), { issues: 0, charges: 0, queries: 0 });
    const replacement = await expiredService.prepare(expired.input);
    assert.notEqual(replacement.successUrl, expiredPrepared.successUrl); assert.notEqual(replacement.customerKey, expiredPrepared.customerKey);
    assert.equal(await expiredService.callback(callback(expired, expiredPrepared)), "EXPIRED", "expired reservation history cannot target its replacement");
    assert.equal(await db.billingCheckoutSession.count({ where: { userId: expired.user.id } }), 2);
    const preserved = await db.billingCheckoutSession.findUniqueOrThrow({ where: { id: callback(expired, expiredPrepared).sessionId } });
    assert.equal(preserved.status, "EXPIRED"); assert.equal(preserved.activeUserId, null);
    assert.deepEqual(expired.counts(), { issues: 0, charges: 0, queries: 0 });

    stage = "issuance storage failure rolls back method intent and READY before HOLD";
    const fault = await fixture("storage-fault"); const faultService = fault.service(); const faultPrepared = await faultService.prepare(fault.input); const faultInput = callback(fault, faultPrepared);
    let injected = false;
    const faultClient = new Proxy(db, { get(target, member) {
      if (member === "$transaction") return (fn: unknown, ...options: unknown[]) => {
        if (typeof fn !== "function") return Reflect.apply(target.$transaction, target, [fn, ...options]);
        return Reflect.apply(target.$transaction, target, [(tx: Prisma.TransactionClient) => fn(new Proxy(tx, { get(transaction, key) {
          if (key !== "billingCheckoutSession") return Reflect.get(transaction, key);
          return new Proxy(transaction.billingCheckoutSession, { get(delegate, operation) {
            if (operation !== "update") { const value = Reflect.get(delegate, operation); return typeof value === "function" ? value.bind(delegate) : value; }
            return async (args: Parameters<typeof delegate.update>[0]) => { const result = await delegate.update(args); if (!injected && args.where.id === faultInput.sessionId && args.data.status === "READY") { injected = true; throw new Error("Synthetic checkout final-write failure"); } return result; };
          } });
        } })), ...options]);
      };
      const value = Reflect.get(target, member); return typeof value === "function" ? value.bind(target) : value;
    } });
    assert.equal(await fault.service(faultClient).callback(faultInput), "ISSUE_HOLD"); assert(injected);
    const heldFault = await snapshot(fault.user.id); assert.equal(heldFault.session?.status, "HOLD"); assert.equal(heldFault.methods.length, 0); assert.equal(heldFault.intents.length, 0); assert.equal(heldFault.subscription, null);
    assert.equal(await fault.service(await restart()).callback(faultInput), "ISSUE_HOLD"); assert.deepEqual(fault.counts(), { issues: 1, charges: 0, queries: 0 });

    stage = "READY retry preserves original anchor and same intent after uncertain charge";
    const retry = await fixture("retry"); const retryService = retry.service(); const retryPrepared = await retryService.prepare(retry.input); const retryInput = callback(retry, retryPrepared);
    retry.ambiguousCharge(); assert.equal(await retryService.callback(retryInput), "UNKNOWN");
    const beforeRetry = await snapshot(retry.user.id); assert.equal(beforeRetry.session?.status, "READY"); assert.equal(beforeRetry.intents[0].status, "UNKNOWN");
    retry.advance(24 * 60 * 60 * 1000);
    assert.equal(await retry.service(await restart()).callback(retryInput), "SUCCEEDED");
    const afterRetry = await snapshot(retry.user.id);
    assert.equal(afterRetry.intents.length, 1); assert.equal(afterRetry.intents[0].id, beforeRetry.intents[0].id);
    assert.equal(afterRetry.intents[0].anchor.toISOString(), beforeRetry.intents[0].anchor.toISOString());
    assert.equal(afterRetry.intents[0].orderId, beforeRetry.intents[0].orderId); assert.equal(afterRetry.intents[0].idempotencyKey, beforeRetry.intents[0].idempotencyKey);
    assert.deepEqual(retry.counts(), { issues: 1, charges: 1, queries: 1 });

    stage = "expired callback lease fences late issuer and prevents reissue";
    const stale = await fixture("stale"); const staleService = stale.service(); const stalePrepared = await staleService.prepare(stale.input); const staleInput = callback(stale, stalePrepared);
    const staleEntered = stale.issuer.hold(); const old = track(staleService.callback(staleInput)); await waitForIssue(staleEntered, old);
    stale.advance(120001);
    assert.equal(await stale.service(await restart()).callback(staleInput), "ISSUE_HOLD"); const replaced = await snapshot(stale.user.id);
    stale.issuer.release(); assert.equal(await old, "ISSUE_HOLD");
    assert.deepEqual(await snapshot(stale.user.id), replaced, "late issuance cannot write method, intent, READY, payment or subscription");
    assert.deepEqual(stale.counts(), { issues: 1, charges: 0, queries: 0 });

    stage = "paid-period access and versioned cancellation";
    const repository = new PrismaBillingRepository(db); const subscription = await repository.getSubscription(happy.user.id); assert(subscription);
    assert(hasBillingPeriodAccess(subscription, subscription.periodStart)); assert.equal(hasBillingPeriodAccess(subscription, subscription.periodEnd), false);
    assert.equal(await repository.cancelAtPeriodEnd(happy.user.id, subscription.version, happy.now()), true);
    const cancelled = await repository.getSubscription(happy.user.id); assert(cancelled); assert(cancelled.cancelAtPeriodEnd);
    assert(hasBillingPeriodAccess(cancelled, happy.now()), "cancellation retains only the already-paid period");
    assert.equal(hasBillingPeriodAccess(cancelled, cancelled.periodEnd), false);
    assert.equal(await service.callback(input), "SUCCEEDED"); assert.equal(happy.counts().charges, 1);

    stage = "actual runtime composition with injected issuer charge and order lookup responses";
    for (const uncertainCharge of [false, true]) {
      const composed = await fixture(uncertainCharge ? "runtime-query" : "runtime-success");
      const runtimeKey = Buffer.alloc(32, 0x71); const syntheticBillingKey = `synthetic-runtime-key-${randomUUID()}`;
      const orders = new Map<string, { orderId: string; paymentKey: string; totalAmount: number; currency: string; status: string }>();
      let issues = 0, charges = 0, queries = 0;
      const runtime = createCheckoutRuntime({ databaseUrl: process.env.DATABASE_URL!, vaultKey: runtimeKey, vaultKeyId: "synthetic-runtime-v1", tossClientKey: "test_ck_synthetic", tossSecretKey: "test_sk_synthetic" }, {
        client: db, now: composed.now, newId: () => `synthetic-${randomUUID()}`,
        // Deliberately no native fetch call: exact provider-shaped fixtures exercise
        // the actual issuer/parser/resolver/provider adapters without provider access.
        fetch: async (url, init) => {
          const target = new URL(url); assert.equal(target.origin, "https://api.tosspayments.com");
          assert.equal(new Headers(init.headers).get("Authorization"), `Basic ${Buffer.from("test_sk_synthetic:").toString("base64")}`);
          if (target.pathname === "/v1/billing/authorizations/issue") {
            assert.equal(init.method, "POST"); issues++;
            const body = JSON.parse(String(init.body)); assert.equal(body.authKey, composed.authKey);
            return Response.json({ customerKey: body.customerKey, billingKey: syntheticBillingKey });
          }
          if (target.pathname === `/v1/billing/${encodeURIComponent(syntheticBillingKey)}`) {
            assert.equal(init.method, "POST"); charges++;
            const body = JSON.parse(String(init.body)); assert.equal(body.amount, 99000);
            const payment = { orderId: body.orderId, paymentKey: `synthetic-runtime-receipt-${randomUUID()}`, totalAmount: body.amount, currency: "KRW", status: "DONE" };
            orders.set(body.orderId, payment);
            if (uncertainCharge && charges === 1) throw new Error("Synthetic remote completion with uncertain response");
            return Response.json(payment);
          }
          if (target.pathname.startsWith("/v1/payments/orders/")) {
            assert.equal(init.method, "GET"); queries++;
            const payment = orders.get(decodeURIComponent(target.pathname.slice("/v1/payments/orders/".length))); assert(payment);
            return Response.json(payment);
          }
          throw new Error("Unrecognized synthetic provider request");
        },
      });
      runtimeKey.fill(0);
      try {
        const publicView = await runtime.service.prepare(composed.input); const composedInput = callback(composed, publicView);
        const firstOutcome = await runtime.service.callback(composedInput);
        assert.equal(firstOutcome, uncertainCharge ? "UNKNOWN" : "SUCCEEDED");
        assert.equal(await runtime.service.callback(composedInput), "SUCCEEDED");
        assert.deepEqual({ issues, charges, queries }, { issues: 1, charges: 1, queries: uncertainCharge ? 1 : 0 });
        const saved = await snapshot(composed.user.id); assert.equal(saved.payments.length, 1); assert.equal(saved.intents.length, 1); assert(saved.subscription);
        assert(!JSON.stringify(saved).includes(syntheticBillingKey)); assert(!JSON.stringify(saved).includes(composed.authKey));
        const publicSerialized = JSON.stringify({ ...publicView, outcome: firstOutcome });
        assert(!publicSerialized.includes("test_sk_synthetic") && !publicSerialized.includes(syntheticBillingKey) && !publicSerialized.includes(composed.authKey));
      } finally { await runtime.dispose(); }
      assert.equal(await db.user.count({ where: { id: composed.user.id } }), 1, "runtime disposal preserves the externally owned client");
    }

    stage = "actual subscription getters enforce current canonical paid period";
    const { getUserPlanKey, getUserSubscription } = await import("../src/lib/subscription");
    const { billingPeriodUTC } = await import("../src/lib/payments/billing-period");
    const access = await fixture("access-now"); access.setNow(new Date(Date.now() - 1000));
    const accessService = access.service(); const accessPrepared = await accessService.prepare(access.input);
    assert.equal(await accessService.callback(callback(access, accessPrepared)), "SUCCEEDED");
    assert.equal(await getUserPlanKey(access.user.id), "solo");
    const publicSubscription = await getUserSubscription(access.user.id); assert(publicSubscription);
    assert.equal(publicSubscription.subscriptionPlan, "SOLO"); assert.equal(publicSubscription.source, "durable");
    assert.equal(publicSubscription.hasBillingKey, true);
    const publicJson = JSON.stringify(publicSubscription);
    assert(!publicJson.includes('"billingKey"') && !publicJson.includes("encryptedBillingKey") && !publicJson.includes(access.authKey));
    // Deliberately set a legacy paid flag only on this synthetic user: a present
    // durable row outside its canonical interval must never fall back to legacy.
    const futureAnchor = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const futurePeriod = billingPeriodUTC(futureAnchor, "monthly", 0);
    await db.$transaction([
      db.user.update({ where: { id: access.user.id }, data: { subscriptionPlan: "FULL", subscriptionStatus: "ACTIVE" } }),
      db.billingSubscription.update({ where: { userId: access.user.id }, data: { anchor: futureAnchor, paidThroughIndex: 0, periodStart: futurePeriod.start, periodEnd: futurePeriod.end } }),
    ]);
    assert.equal(await getUserPlanKey(access.user.id), "free");
    assert.equal((await getUserSubscription(access.user.id))?.subscriptionPlan, "FREE");
    const expiredAnchor = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const expiredPeriod = billingPeriodUTC(expiredAnchor, "monthly", 0);
    await db.billingSubscription.update({ where: { userId: access.user.id }, data: { anchor: expiredAnchor, paidThroughIndex: 0, periodStart: expiredPeriod.start, periodEnd: expiredPeriod.end } });
    assert.equal(await getUserPlanKey(access.user.id), "free");
    assert.equal((await getUserSubscription(access.user.id))?.subscriptionPlan, "FREE");
    console.log("Synthetic PostgreSQL checkout session PASS: owner binding, server price, callback uniqueness, uncertain issuance HOLD, storage rollback, immutable retry, stale fencing and paid-period cancellation. Actual HTTP login/URL tampering, Toss issuance/charge, browser and production checkout remain untested.");
  } finally {
    try {
      for (const issuer of issuers) issuer.release(); await Promise.allSettled([...active]);
      const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } }); assert(users.every(user => user.email !== null && emails.includes(user.email) && user.email.startsWith(prefix)));
      const ids = users.map(user => user.id);
      await db.$transaction([db.billingPayment.deleteMany({ where: { userId: { in: ids } } }), db.billingCheckoutSession.deleteMany({ where: { userId: { in: ids } } }), db.billingIntent.deleteMany({ where: { userId: { in: ids } } }), db.billingSubscription.deleteMany({ where: { userId: { in: ids } } }), db.billingPaymentMethod.deleteMany({ where: { userId: { in: ids } } }), db.user.deleteMany({ where: { id: { in: ids } } })]);
      assert.equal(await db.user.count({ where: { email: { in: emails } } }), 0);
    } finally { vault.destroy(); }
  }
  } finally { sourceGlobals.prisma = previousPrisma; await Promise.allSettled(clients.map(client => client.$disconnect())); }
}
(process.argv.includes("--run-db") ? runDatabase() : preflight()).catch(error => {
  const safeValue = (value: unknown) => typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) || value === null || typeof value === "string" &&
    ["MISSING", "BUSY", "STALE", "UNKNOWN", "SUCCEEDED", "HOLD", "ISSUE_HOLD", "EXPIRED", "READY", "PREPARED", "FREE", "solo", "monthly"].includes(value) ? value : "UNREPORTED";
  console.error(JSON.stringify({ result: "SYNTHETIC_CHECKOUT_FAILED", stage, diagnostic: error instanceof assert.AssertionError ? { actual: safeValue(error.actual), expected: safeValue(error.expected) } : "DETAILS_WITHHELD" })); process.exitCode = 1;
});
