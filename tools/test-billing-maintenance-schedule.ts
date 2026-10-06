/** Actual scheduler wrapper in VM; synthetic metadata and maintenance only, no DB/provider/env. */
/* eslint-disable @typescript-eslint/no-explicit-any -- VM module and Prisma-shaped synthetic metadata ports are runtime-only test boundaries. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

async function main() {
  let now = new Date("2024-02-01T00:00:00Z");
  let state: any = null, writes = 0, scans = 0, executions = 0, failStore = false, serial = 0;
  const current = (): any => state; // Async mock callbacks populate the state outside TypeScript narrowing.
  const counts = { examined: 0, renewals: 0, reconciliations: 0, succeeded: 0, unknown: 0,
    held: 0, skipped: 0, failed: 0, budgetStopped: 0 };
  function matches(where: any, row: any): boolean {
    return Object.entries(where).every(([key, value]: any) => {
      if (key === "AND") return value.every((part: any) => matches(part, row));
      if (key === "OR") return value.some((part: any) => matches(part, row));
      if (value && typeof value === "object" && !(value instanceof Date)) {
        if ("gt" in value) return row[key] != null && row[key] > value.gt;
        if ("lte" in value) return row[key] != null && row[key] <= value.lte;
        throw new Error("Unexpected synthetic predicate");
      }
      return value instanceof Date ? row[key]?.getTime() === value.getTime() : row[key] === value;
    });
  }
  const store = {
    upsert: async ({ create }: any) => {
      if (failStore) throw new Error("Synthetic private missing table diagnostic");
      if (!state) state = { ...create, renewalCursor: null, reconciliationCursor: null, reconcileFirst: true,
        workerToken: null, leaseUntil: null, nextAttemptAt: null, failureStreak: 0, lastOutcome: "NEVER",
        lastStartedAt: null, lastCompletedAt: null };
      return { ...state };
    },
    updateMany: async ({ where, data }: any) => {
      if (failStore) throw new Error("Synthetic private storage diagnostic");
      if (!state || !matches(where, state)) return { count: 0 };
      writes++; state = { ...state, ...data }; return { count: 1 };
    },
    findFirst: async ({ where }: any) => state && matches(where, state) ? { ...state } : null,
    findUnique: async () => state ? { ...state } : null,
  };
  let behavior: (ports: any) => Promise<typeof counts> = async () => ({ ...counts });
  const maintenanceModule = { BillingMaintenance: class { constructor(private ports: any) {} async run() { scans++; return behavior(this.ports); } } };
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/payments/billing-maintenance-schedule.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Date, require: (name: string) => {
    assert.equal(name, "./billing-maintenance", "Every import must be synthetic");
    return maintenanceModule;
  } });
  const fresh = () => new exports.PrismaBillingMaintenanceSchedule({ billingMaintenanceState: store }, {
    repository: {}, lifecycle: {}, now: () => now, newId: () => `synthetic-worker-${++serial}`, monotonicMs: () => 0,
  });
  const reset = () => { state = null; writes = 0; scans = 0; executions = 0; failStore = false; };
  const safeError = (error: any) => error?.message === "Billing scheduling unavailable";
  assert.equal((await fresh().run({ timeBudgetMs: 69999 })).budgetStopped, 1);
  assert.equal(state, null); assert.equal(scans, 0); assert.equal(writes, 0);
  await assert.rejects(fresh().run({ batchLimit: 3 }), safeError); assert.equal(state, null);
  await fresh().run(); assert.equal(current().workerToken, null); assert.equal(current().lastOutcome, "OK");
  assert.equal(current().nextAttemptAt.getTime() - now.getTime(), 60000);
  const cooldown = await fresh().run(); assert.equal(cooldown.backoff, 1); assert.equal(scans, 1);
  assert(!JSON.stringify(cooldown).includes("synthetic-worker"));

  reset(); let unblock!: () => void, entered!: () => void;
  const pending = new Promise<void>(resolve => { unblock = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  behavior = async ports => { entered(); await pending; await ports.schedule.assertOwned(); return { ...counts }; };
  const first = fresh().run(); await started;
  assert.equal(current().leaseUntil.getTime() - now.getTime(), 180000);
  const competing = await fresh().run(); assert.equal(competing.busy, 1); assert.equal(scans, 1);
  unblock(); await first; assert.equal(current().workerToken, null);

  reset(); behavior = async ports => {
    assert.equal(ports.schedule.state.renewalCursor, undefined);
    await ports.schedule.checkpoint({ kind: "renew", cursor: "synthetic-subscription-20" });
    await ports.schedule.checkpoint({ kind: "reconcile", cursor: "synthetic-intent-10" });
    await ports.schedule.assertOwned(); executions++; return { ...counts, examined: 2, skipped: 2 };
  };
  const visited = await fresh().run(); assert.equal(visited.skipped, 2);
  assert.equal(current().renewalCursor, "synthetic-subscription-20"); assert.equal(current().reconciliationCursor, "synthetic-intent-10");
  now = new Date(current().nextAttemptAt);
  behavior = async ports => {
    assert.equal(ports.schedule.state.renewalCursor, "synthetic-subscription-20");
    assert.equal(ports.schedule.state.reconciliationCursor, "synthetic-intent-10");
    assert.equal(ports.schedule.state.reconcileFirst, false); return { ...counts };
  };
  const restarted = await fresh().run();
  assert(!JSON.stringify(restarted).includes("synthetic-subscription")); assert(!JSON.stringify(restarted).includes("synthetic-intent"));

  reset(); behavior = async ports => {
    current().workerToken = "synthetic-new-owner"; current().leaseUntil = new Date(now.getTime() + 180000);
    await ports.schedule.checkpoint({ kind: "renew", cursor: "old-worker-cursor" });
    executions++; return { ...counts };
  };
  await assert.rejects(fresh().run(), safeError);
  assert.equal(current().workerToken, "synthetic-new-owner"); assert.equal(current().renewalCursor, null);
  assert.equal(current().nextAttemptAt, null); assert.equal(executions, 0, "old worker cannot checkpoint/release new owner");
  reset(); behavior = async ports => {
    now = new Date(now.getTime() + 180001); await ports.schedule.assertOwned(); executions++; return { ...counts };
  };
  await assert.rejects(fresh().run(), safeError); assert.equal(executions, 0);
  assert.equal(current().nextAttemptAt, null, "expired owner cannot write final cooldown");
  behavior = async () => ({ ...counts }); await fresh().run(); assert.equal(current().workerToken, null, "expired claim can be replaced");

  reset(); behavior = async ports => {
    await ports.schedule.checkpoint({ kind: "renew", cursor: "synthetic-progress" });
    throw new Error("Synthetic private maintenance diagnostic");
  };
  await assert.rejects(fresh().run(), safeError);
  assert.equal(current().renewalCursor, "synthetic-progress"); assert.equal(current().lastOutcome, "FAILED");
  assert.equal(current().failureStreak, 1); assert.equal(current().workerToken, null);
  behavior = async () => ({ ...counts, failed: 1 });
  for (let failure = 2; failure <= 8; failure++) {
    now = new Date(current().nextAttemptAt); await fresh().run();
    assert.equal(current().failureStreak, failure);
    assert.equal(current().nextAttemptAt.getTime() - now.getTime(), Math.min(900000, 60000 * 2 ** (failure - 1)));
  }
  now = new Date(current().nextAttemptAt); behavior = async () => ({ ...counts, unknown: 1 }); await fresh().run();
  assert.equal(current().failureStreak, 0); assert.equal(current().lastOutcome, "UNKNOWN");
  assert.equal(current().nextAttemptAt.getTime() - now.getTime(), 60000, "UNKNOWN is query-only uncertainty, not failed invocation backoff");
  reset(); failStore = true; await assert.rejects(fresh().run(), safeError); assert.equal(scans, 0);
  failStore = false; await store.upsert({ create: { id: "billing-maintenance-v1" } });
  current().workerToken = "synthetic-invalid"; current().leaseUntil = null;
  await assert.rejects(fresh().run(), safeError); assert.equal(scans, 0);

  // Actual maintenance connects persisted checkpoints to the financial execution boundary.
  class BillingPolicyHold extends Error {}
  const actual: any = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/payments/billing-maintenance.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: actual, Date, require: (name: string) => {
    assert.equal(name, "./billing-lifecycle"); return { BillingPolicyHold };
  } });
  maintenanceModule.BillingMaintenance = actual.BillingMaintenance;
  reset(); const candidates = Array.from({ length: 25 }, (_, index) => ({
    id: `synthetic-sub-${String(index + 1).padStart(3, "0")}`, userId: "synthetic-user", version: 0,
  }));
  const visits: string[] = [];
  let loseBeforeExecute = false;
  const repository = {
    listReconciliationCandidates: async () => [],
    listRenewalCandidates: async (_now: Date, take: number, afterId?: string) => candidates.filter(item => !afterId || item.id > afterId).slice(0, take),
    getRenewalContext: async (candidate: any) => {
      visits.push(candidate.id);
      if (candidate.id !== "synthetic-sub-025") return null;
      if (loseBeforeExecute) { current().workerToken = "synthetic-replacement"; current().leaseUntil = new Date(now.getTime() + 180000); }
      return { existingIntent: { id: "synthetic-existing-intent" } };
    }, getIntent: async () => null,
  };
  const real = () => new exports.PrismaBillingMaintenanceSchedule({ billingMaintenanceState: store }, {
    repository, lifecycle: { prepare: async () => { throw new Error("Unexpected fresh reservation"); },
      execute: async () => { assert(current().workerToken); executions++; return "SUCCEEDED"; } },
    now: () => now, newId: () => `synthetic-worker-${++serial}`, monotonicMs: () => 0,
  });
  const pageOne = await real().run(); assert.equal(pageOne.skipped, 20); assert.equal(executions, 0);
  assert.equal(current().renewalCursor, "synthetic-sub-020");
  // Deleting the prior cursor record cannot break value-based ID pagination.
  candidates.splice(19, 1); now = new Date(current().nextAttemptAt);
  const pageTwo = await real().run(); assert.equal(pageTwo.succeeded, 1); assert.equal(executions, 1);
  assert.equal(current().renewalCursor, "synthetic-sub-025"); assert(visits.includes("synthetic-sub-021"));
  now = new Date(current().nextAttemptAt); visits.length = 0;
  await real().run(); assert.equal(visits[0], "synthetic-sub-001", "end-of-lane wraps after a fresh runtime");
  now = new Date(current().nextAttemptAt); current().renewalCursor = "synthetic-sub-024";
  loseBeforeExecute = true; const executed = executions;
  await assert.rejects(real().run(), safeError);
  assert.equal(executions, executed, "ownership lost during context lookup stops financial execution");
  assert.equal(current().workerToken, "synthetic-replacement", "old finalizer cannot release replacement");
  reset(); visits.length = 0;
  let clockReads = 0, candidateReads = 0;
  const budgeted = new exports.PrismaBillingMaintenanceSchedule({ billingMaintenanceState: store }, {
    repository: { ...repository,
      listReconciliationCandidates: async () => { candidateReads++; return []; },
      listRenewalCandidates: async () => { candidateReads++; return []; } },
    lifecycle: { execute: async () => { throw new Error("Unexpected execution"); } },
    now: () => now, newId: () => `synthetic-worker-${++serial}`,
    monotonicMs: () => clockReads++ === 0 ? 0 : 40000,
  });
  const exhausted = await budgeted.run({ timeBudgetMs: 105000 });
  assert.equal(exhausted.budgetStopped, 1);
  assert.equal(candidateReads, 0, "state acquisition consumes the same budget before candidate scans");
  assert.equal(current().workerToken, null);
  console.log("PASS billing maintenance schedule: synthetic restart/checkpoint/busy/cooldown/backoff/expired-old-worker/private-counts/missing-table guards");
}
main().catch(() => { console.error("FAIL synthetic billing maintenance schedule regression"); process.exitCode = 1; });
