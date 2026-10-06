/** Synthetic fixtures only. Default is offline; DB requires explicit isolated --run-db. */
/* eslint-disable @typescript-eslint/no-explicit-any -- Test-only VM module mocks and raw transaction spies mirror dynamically loaded ports; production code is not changed. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { assertCleanE2EWorkspace, assertE2ETarget, assertNoExternalE2ECredentials } from "./helpers/e2e-environment";

const countKeys = ["intentHold", "intentUnknown", "intentProcessingExpired", "checkoutIssuanceExpired", "checkoutHold", "receiptPolicyHold", "renewalOverdue", "renewalMissedPeriod"];
const ageKeys = ["under1h", "h1to24", "d1to7", "d7plus"] as const;
const fixedNow = new Date("2026-06-15T12:00:00.000Z");
let stage = "offline";
function privacy(report: any) {
  assert.deepEqual(Object.keys(report).sort(), ["status", "activation", "asOf", "providerVerified", "counts", "ageBuckets", "blockers", "limitations"].sort());
  assert.equal(report.status, "READ_ONLY_SNAPSHOT"); assert.equal(report.activation, "HELD"); assert.equal(report.providerVerified, false);
  assert.deepEqual(Object.keys(report.counts).sort(), [...countKeys].sort());
  for (const key of countKeys) { assert(Number.isSafeInteger(report.counts[key]) && report.counts[key] >= 0); assert.deepEqual(Object.keys(report.ageBuckets[key]).sort(), [...ageKeys].sort()); }
  assert(Object.values(report.blockers).every(value => Number.isSafeInteger(value) && Number(value) >= 0));
  assert(Array.isArray(report.limitations) && report.limitations.every((value: unknown) => typeof value === "string"));
}
async function offline() {
  const { inspectBillingDiagnostics, BILLING_DIAGNOSTIC_BLOCKERS } = await import("../src/lib/payments/billing-diagnostics");
  const calls: string[] = [];
  const database: any = { $transaction: async (fn: any, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: "RepeatableRead", timeout: 15000, maxWait: 5000 });
    return fn({ $executeRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => { const sql = parts.join("?"); calls.push(sql); assert.equal(values.length, 0); assert(/^SET (TRANSACTION READ ONLY|LOCAL statement_timeout|LOCAL TIME ZONE)/i.test(sql.trim())); return 0; },
      $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => { calls.push("SELECT"); assert(/SELECT/i.test(parts.join("?"))); assert(!/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i.test(parts.join("?"))); assert(values.every(value => value instanceof Date)); return [...BILLING_DIAGNOSTIC_BLOCKERS.map(metric => ({ metric, age_bucket: "none", total: 0n })), { metric: "intentHold", age_bucket: "d7plus", total: 2n }, { metric: "intentUnknown", age_bucket: "under1h", total: 1n }]; } });
  } };
  const report = await inspectBillingDiagnostics(database, { now: fixedNow }); privacy(report);
  assert.equal(report.counts.intentHold, 2); assert.equal(report.ageBuckets.intentHold.d7plus, 2); assert.equal(report.counts.intentUnknown, 1);
  assert.equal(calls.length, 4); assert(/READ ONLY/.test(calls[0])); assert.equal(calls[3], "SELECT");
  await assert.rejects(inspectBillingDiagnostics({ $transaction: async () => { throw new Error("synthetic-secret-payload"); } } as any, { now: fixedNow }));
  await assert.rejects(inspectBillingDiagnostics(database, { now: new Date(NaN) }));
  await cliChecks();
  console.log("Billing diagnostics offline COUNT/age, read-only transaction and privacy checks PASS; PostgreSQL/provider not executed.");
}

async function cliChecks() {
  const source = ts.transpileModule(readFileSync("tools/billing-diagnostics.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  async function run(args: string[], env: Record<string, string> = {}, fail = false, unsafeGeneratedEnv = false, provider = "postgresql") {
    const output: string[] = [], errors: string[] = []; let constructions = 0, inspections = 0, disconnections = 0, runtimeImports = 0;
    const processMock = { argv: ["synthetic-node", "synthetic-script", ...args], env, exitCode: 0 };
    const context: any = { exports: {}, __filename: "synthetic-diagnostics-cli", URL, process: processMock, console: { log: (value: string) => output.push(value), error: (value: string) => errors.push(value) }, require: (name: string) => {
      if (name === "node:module") return { createRequire: () => ({ resolve: () => "synthetic-generated-client" }) };
      if (name === "node:fs/promises") return { readFile: async () => `"clientVersion":"6.19.3", "activeProvider":"${provider}", "relativeEnvPaths": {"rootEnvPath":${unsafeGeneratedEnv ? '"synthetic-env-file"' : "null"},"schemaEnvPath":null}` };
      if (name.endsWith("/billing-diagnostics")) return { inspectBillingDiagnostics: async () => { inspections++; if (fail) throw new Error("synthetic-raw-secret-provider-body"); return { status: "READ_ONLY_SNAPSHOT", activation: "HELD", providerVerified: false }; } };
      if (name.endsWith("/billing-client")) { runtimeImports++; return { createBillingClient: () => { constructions++; return { $disconnect: async () => { disconnections++; } }; } }; }
      throw new Error("Unexpected diagnostic dependency");
    } };
    vm.runInNewContext(source.replace("main().catch", "globalThis.completion = main().catch"), context);
    await context.completion;
    assert(![...output, ...errors].join("").includes("synthetic-raw-secret"));
    return { output: output.map(value => JSON.parse(value)), errors: errors.map(value => JSON.parse(value)), constructions, inspections, disconnections, runtimeImports, exit: processMock.exitCode };
  }
  for (const args of [[], ["--help"]]) { const result = await run(args); assert.equal(result.constructions, 0); assert.equal(result.inspections, 0); assert.equal(result.output[0].databaseAccess, false); assert.equal(result.exit, 0); }
  for (const args of [["--run-db"], ["--unknown"]]) { const result = await run(args); assert.equal(result.constructions, 0); assert.equal(result.exit, 1); assert.deepEqual(result.errors, [{ status: "UNAVAILABLE", activation: "HELD", code: "BILLING_DIAGNOSTICS_UNAVAILABLE" }]); }
  const failed = await run(["--run-db"], { BILLING_DIAGNOSTICS_DATABASE_URL: "postgresql://localhost/dealmind_test" }, true);
  assert.equal(failed.exit, 1); assert.equal(failed.disconnections, 1); assert.equal(failed.output.length, 0); assert.deepEqual(failed.errors, [{ status: "UNAVAILABLE", activation: "HELD", code: "BILLING_DIAGNOSTICS_UNAVAILABLE" }]);
  for (const key of ["DEBUG", "RUST_LOG", "PRISMA_LOG_QUERIES", "PRISMA_QUERY_ENGINE_LOG_LEVEL"]) {
    const result = await run(["--run-db"], { BILLING_DIAGNOSTICS_DATABASE_URL: "postgresql://localhost/dealmind_test", [key]: "synthetic-debug" }); assert.equal(result.constructions, 0); assert.equal(result.exit, 1);
  }
  const unsafe = await run(["--run-db"], { BILLING_DIAGNOSTICS_DATABASE_URL: "postgresql://localhost/dealmind_test" }, false, true);
  assert.equal(unsafe.constructions, 0); assert.equal(unsafe.exit, 1);
  const sqlite = await run(["--run-db"], { BILLING_DIAGNOSTICS_DATABASE_URL: "postgresql://localhost/dealmind_test" }, false, false, "sqlite");
  assert.equal(sqlite.runtimeImports, 0); assert.equal(sqlite.constructions, 0); assert.equal(sqlite.inspections, 0); assert.equal(sqlite.exit, 1);
}

async function runDatabase() {
  stage = "isolated guards";
  assertE2ETarget(process.env.BASE_URL ?? "http://localhost:3115"); assertCleanE2EWorkspace(); assertNoExternalE2ECredentials(); assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.BILLING_DIAGNOSTICS_DATABASE_URL, process.env.TEST_DATABASE_URL);
  const { createBillingClient } = await import("../src/lib/payments/billing-client");
  const { inspectBillingDiagnostics } = await import("../src/lib/payments/billing-diagnostics");
  const db = createBillingClient(process.env.TEST_DATABASE_URL!);
  const prefix = `e2e-diagnostics-${randomUUID()}`; const userIds: string[] = [];
  let ownsScheduleState = false;
  const id = () => `${prefix}-${randomUUID()}`;
  const ago = (hours: number) => new Date(fixedNow.getTime() - hours * 3600000);
  const captured: string[] = [];
  const readOnlyDatabase: any = { $transaction: async (fn: any, options: any) => db.$transaction(async tx => fn({
    $executeRaw: (parts: TemplateStringsArray, ...values: any[]) => { const sql = parts.join("?"); captured.push(sql); assert(/^SET (TRANSACTION READ ONLY|LOCAL statement_timeout|LOCAL TIME ZONE)/i.test(sql.trim())); return tx.$executeRaw(parts, ...values); },
    $queryRaw: (parts: TemplateStringsArray, ...values: any[]) => { const sql = parts.join("?"); assert(/SELECT/i.test(sql)); assert(!/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i.test(sql)); captured.push("SELECT"); return tx.$queryRaw(parts, ...values); },
  }), options) };
  try {
    stage = "baseline read-only snapshot";
    const baseline = await inspectBillingDiagnostics(readOnlyDatabase, { now: fixedNow }); privacy(baseline);
    assert.equal(await db.billingMaintenanceState.count(), 0, "Dedicated diagnostic DB must have no pre-existing scheduler state.");
    await db.billingMaintenanceState.create({ data: { id: "billing-maintenance-v1",
      workerToken: "synthetic-private-scheduler-token", leaseUntil: ago(1),
      lastStartedAt: ago(3), lastCompletedAt: ago(2), lastOutcome: "FAILED",
      nextAttemptAt: new Date(fixedNow.getTime() + 60000) } });
    ownsScheduleState = true;
    async function intent(status: string, hours: number, extras: Record<string, any> = {}) {
      const user = await db.user.create({ data: { email: `${id()}@example.invalid`, name: "합성 읽기전용 진단" } }); userIds.push(user.id);
      return db.billingIntent.create({ data: { id: id(), userId: user.id, reservationKey: id(), operation: "INITIAL", plan: "solo", cycle: "monthly", anchor: ago(24 * 30), periodIndex: 0,
        periodStart: ago(24 * 30), periodEnd: new Date(fixedNow.getTime() + 86400000), amount: 99000, currency: "KRW", orderId: id(), idempotencyKey: id(), customerRef: id(), paymentMethodRef: id(),
        status, createdAt: ago(hours), expiresAt: ago(hours - 0.5), ...extras } });
    }
    stage = "synthetic count and age fixtures";
    await intent("HOLD", 0.5); await intent("HOLD", 2); await intent("HOLD", 48); await intent("HOLD", 200);
    await intent("UNKNOWN", 2, { firstChargeAt: ago(2) });
    await intent("PROCESSING", 48, { firstChargeAt: ago(48), workerToken: "synthetic-expired-worker", leaseUntil: ago(1) });
    const policyIntent = await intent("SUCCEEDED", 200);
    await db.billingPayment.create({ data: { id: id(), userId: policyIntent.userId, intentId: policyIntent.id, paymentKey: id(), orderId: policyIntent.orderId, amount: policyIntent.amount, currency: "KRW", status: "POLICY_HOLD", createdAt: ago(200) } });
    for (const status of ["ISSUING", "HOLD"]) {
      const checkoutOwner = await intent("PREPARED", 48);
      await db.billingCheckoutSession.create({ data: { id: id(), userId: checkoutOwner.userId, activeUserId: checkoutOwner.userId, plan: "solo", cycle: "monthly", anchor: ago(48), periodStart: ago(48), periodEnd: new Date(fixedNow.getTime() + 86400000), amount: 99000,
        customerRef: id(), paymentMethodRef: id(), intentId: id(), orderId: id(), idempotencyKey: id(), callbackOrigin: "http://localhost:3115", status, createdAt: ago(48), expiresAt: ago(47), leaseUntil: ago(1) } });
    }
    // Original UTC month-end anchor: April 30 -> May 30 -> June 30.
    // Existing next reservation mismatches the successful stored receipt price;
    // diagnostics cannot assert current server catalog or verify any provider.
    const priced = await intent("SUCCEEDED", 48);
    const anchor = new Date("2026-04-30T12:00:00.000Z"), periodEnd = new Date("2026-05-30T12:00:00.000Z");
    const sub = await db.billingSubscription.create({ data: { id: id(), userId: priced.userId, plan: "solo", cycle: "monthly", anchor, paidThroughIndex: 0, periodStart: anchor, periodEnd, status: "ACTIVE" } });
    await db.billingIntent.update({ where: { id: priced.id }, data: { anchor, periodStart: anchor, periodEnd, subscriptionId: sub.id, firstChargeAt: ago(48) } });
    await db.billingPayment.create({ data: { id: id(), userId: priced.userId, intentId: priced.id, subscriptionId: sub.id, paymentKey: id(), orderId: priced.orderId, amount: 99000, currency: "KRW", status: "APPLIED", createdAt: ago(48) } });
    await db.billingIntent.create({ data: { ...priced, id: id(), reservationKey: id(), orderId: id(), idempotencyKey: id(), operation: "RENEWAL", subscriptionId: sub.id, subscriptionVersion: sub.version, anchor, periodIndex: 1, periodStart: periodEnd, periodEnd: new Date("2026-06-30T12:00:00.000Z"), amount: 1, status: "PREPARED" } });
    const missed = await intent("SUCCEEDED", 200);
    await db.billingSubscription.create({ data: { id: id(), userId: missed.userId, plan: "solo", cycle: "monthly", anchor: new Date("2026-03-31T12:00:00.000Z"), paidThroughIndex: 0, periodStart: new Date("2026-03-31T12:00:00.000Z"), periodEnd: new Date("2026-04-30T12:00:00.000Z"), status: "ACTIVE" } });
    const snapshot = async () => ({
      intents: await db.billingIntent.findMany({ where: { userId: { in: userIds } }, orderBy: { id: "asc" } }),
      checkouts: await db.billingCheckoutSession.findMany({ where: { userId: { in: userIds } }, orderBy: { id: "asc" } }),
      payments: await db.billingPayment.findMany({ where: { userId: { in: userIds } }, orderBy: { id: "asc" } }),
      subscriptions: await db.billingSubscription.findMany({ where: { userId: { in: userIds } }, orderBy: { id: "asc" } }),
      scheduler: await db.billingMaintenanceState.findUnique({ where: { id: "billing-maintenance-v1" } }),
    });
    const before = await snapshot();
    stage = "actual aggregate SELECT and no fixture mutation";
    const report = await inspectBillingDiagnostics(readOnlyDatabase, { now: fixedNow }); privacy(report);
    assert.equal(report.counts.intentHold - baseline.counts.intentHold, 4);
    for (const age of ageKeys) { stage = `intent HOLD age ${age}`; assert.equal(report.ageBuckets.intentHold[age] - baseline.ageBuckets.intentHold[age], 1); }
    stage = "UNKNOWN count";
    assert.equal(report.counts.intentUnknown - baseline.counts.intentUnknown, 1);
    stage = "expired processing count"; assert.equal(report.counts.intentProcessingExpired - baseline.counts.intentProcessingExpired, 1);
    stage = "receipt hold count"; assert.equal(report.counts.receiptPolicyHold - baseline.counts.receiptPolicyHold, 1);
    stage = "expired checkout count"; assert.equal(report.counts.checkoutIssuanceExpired - baseline.counts.checkoutIssuanceExpired, 1);
    stage = "checkout hold count"; assert.equal(report.counts.checkoutHold - baseline.counts.checkoutHold, 1);
    stage = "overdue renewal count"; assert.equal(report.counts.renewalOverdue - baseline.counts.renewalOverdue, 2);
    stage = "canonical month-end missed period count"; assert.equal(report.counts.renewalMissedPeriod - baseline.counts.renewalMissedPeriod, 1);
    stage = "stored price policy blocker"; assert.equal(report.blockers.renewalStoredPriceMismatch - baseline.blockers.renewalStoredPriceMismatch, 1);
    stage = "scheduler aggregate delay and lease indicators";
    assert.equal(baseline.blockers.maintenanceNeverStarted, 1); assert.equal(report.blockers.maintenanceNeverStarted, 0);
    assert.equal(report.blockers.maintenanceLeaseExpired, 1); assert.equal(report.blockers.maintenanceCompletionDelayed, 1);
    assert.equal(report.blockers.maintenanceBackoffActive, 1);
    assert.deepEqual(await snapshot(), before);
    assert.equal(captured.length, 8); assert.equal(captured.filter(call => call === "SELECT").length, 2);
    const serialized = JSON.stringify(report); assert(!serialized.includes(prefix)); assert(!serialized.includes("synthetic-expired-worker"));
    assert(!serialized.includes("synthetic-private-scheduler-token"));
    console.log("Synthetic PostgreSQL billing diagnostics COUNT/age and read-only snapshot PASS; fixture setup/cleanup only writes, provider calls zero.");
  } finally {
    try { if (ownsScheduleState) await db.billingMaintenanceState.deleteMany({ where: { id: "billing-maintenance-v1" } });
      await db.$transaction([db.billingCheckoutSession.deleteMany({ where: { userId: { in: userIds } } }), db.billingPayment.deleteMany({ where: { userId: { in: userIds } } }), db.billingIntent.deleteMany({ where: { userId: { in: userIds } } }), db.billingSubscription.deleteMany({ where: { userId: { in: userIds } } }), db.user.deleteMany({ where: { id: { in: userIds } } })]); }
    finally { await db.$disconnect(); }
  }
}
(process.argv.includes("--run-db") ? runDatabase() : offline()).catch(error => {
  const scalar = (value: unknown) => typeof value === "number" || typeof value === "boolean" ? value : "WITHHELD";
  const diagnostic = error instanceof assert.AssertionError ? { kind: "ASSERTION", actual: scalar(error.actual), expected: scalar(error.expected) } : "DETAILS_WITHHELD";
  console.error(JSON.stringify({ result: "BILLING_DIAGNOSTICS_TEST_FAILED", stage, diagnostic })); process.exitCode = 1;
});

