/** PG scheduler persistence only. Candidate execution is synthetic; no provider construction. */
/* eslint-disable @typescript-eslint/no-explicit-any -- Test-only scheduler port fixtures and VM persistence doubles; production source is untouched. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { assertCleanE2EWorkspace, assertE2ETarget, assertNoExternalE2ECredentials } from "./helpers/e2e-environment";

let stage = "offline";
const stateId = "billing-maintenance-v1";
const publicKeys = ["examined", "renewals", "reconciliations", "succeeded", "unknown", "held", "skipped", "failed", "budgetStopped", "busy", "backoff"];
function privacy(value: any) { assert.deepEqual(Object.keys(value).sort(), [...publicKeys].sort()); assert(Object.values(value).every(item => typeof item === "number" && Number.isSafeInteger(item) && item >= 0)); }
async function offline() {
  let touches = 0;
  const exports: any = {};
  stage = "offline module load";
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/payments/billing-maintenance-schedule.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Date,
    require: (name: string) => { assert.equal(name, "./billing-maintenance"); return { BillingMaintenance: class { async run() { throw new Error("Offline engine must not execute"); } } }; } });
  stage = "offline constructor";
  const subject = new exports.PrismaBillingMaintenanceSchedule({ billingMaintenanceState: new Proxy({}, { get() { touches++; throw new Error("Offline DB must not execute"); } }) }, { now: () => new Date(), newId: randomUUID });
  stage = "offline budget guard";
  privacy(await subject.run({ timeBudgetMs: 69999 })); assert.equal(touches, 0);
  stage = "offline argument guard";
  await assert.rejects(subject.run({ batchLimit: 3 })); assert.equal(touches, 0);
  console.log("Billing schedule offline minimum-budget/input guards PASS; PostgreSQL, candidates and providers not executed.");
}
async function runDatabase() {
  stage = "isolated guards"; assertE2ETarget(process.env.BASE_URL ?? "http://localhost:3118"); assertCleanE2EWorkspace(); assertNoExternalE2ECredentials(); assert.equal(process.env.NODE_ENV, "test");
  const { createBillingClient } = await import("../src/lib/payments/billing-client"); const db = createBillingClient(process.env.TEST_DATABASE_URL!);
  const { PrismaBillingMaintenanceSchedule } = await import("../src/lib/payments/billing-maintenance-schedule");
  const { PrismaBillingRepository } = await import("../src/lib/payments/prisma-billing-repository");
  const repo = new PrismaBillingRepository(db), prefix = `e2e-schedule-${randomUUID()}`;
  let clock = new Date("2026-06-15T12:00:00.000Z"), mono = 0; const now = () => new Date(clock);
  const ids: string[] = [], executed: string[] = [], observed: string[] = [];
  let scanFail = false, budgetInterrupt = false;
  let gate: Promise<void> | undefined, enter: (() => void) | undefined, release: (() => void) | undefined, holdContext = false;
  const scans: number[] = [];
  const ports: any = { now, newId: randomUUID, monotonicMs: () => mono,
    repository: {
      listReconciliationCandidates: async (date: Date, take: number, cursor?: string) => { if (scanFail) throw new Error("Synthetic scan unavailable"); const rows = await repo.listReconciliationCandidates(date, take, cursor); scans.push(rows.length); return rows; },
      listRenewalCandidates: async (date: Date, take: number, cursor?: string) => { if (scanFail) throw new Error("Synthetic scan unavailable"); const rows = await repo.listRenewalCandidates(date, take, cursor); scans.push(rows.length); return rows; },
      getIntent: repo.getIntent.bind(repo),
      getRenewalContext: async (candidate: { id: string; userId: string }) => {
        observed.push(candidate.id);
        if (holdContext) { holdContext = false; enter?.(); await gate; }
        if (budgetInterrupt) mono = 40000;
        const subscription = await repo.getSubscription(candidate.userId); assert(subscription);
        return { subscription, existingIntent: null, customerRef: "synthetic-only-customer", paymentMethodRef: "synthetic-only-method" };
      },
    },
    lifecycle: {
      prepare: async (input: { userId: string }) => { const sub = await repo.getSubscription(input.userId); assert(sub); return { id: sub.id }; },
      execute: async (id: string) => { executed.push(id); return id.includes("-reconcile-") ? "UNKNOWN" : "SUCCEEDED"; },
    },
  };
  const fresh = () => new PrismaBillingMaintenanceSchedule(db, ports);
  const state = () => db.billingMaintenanceState.findUniqueOrThrow({ where: { id: stateId } });
  async function advance() { const row = await state(); assert(row.nextAttemptAt); clock = new Date(row.nextAttemptAt); mono = 0; }
  const pending = new Set<Promise<unknown>>();
  let ownsState = false;
  try {
    stage = "pristine isolated singleton and synthetic candidate rows";
    assert.equal(await db.billingMaintenanceState.count(), 0); ownsState = true;
    for (const lane of ["reconcile", "renew"] as const) for (let index = 0; index < 24; index++) {
      const id = `${prefix}-${lane}-${String(index).padStart(3, "0")}`, userId = `${id}-owner`; ids.push(userId);
      await db.user.create({ data: { id: userId, email: `${userId}@example.invalid`, name: "합성 스케줄 검증" } });
      if (lane === "reconcile") await db.billingIntent.create({ data: { id, userId, reservationKey: id, operation: "INITIAL", plan: "solo", cycle: "monthly", anchor: new Date("2026-06-01T00:00:00Z"), periodIndex: 0, periodStart: new Date("2026-06-01T00:00:00Z"), periodEnd: new Date("2026-07-01T00:00:00Z"), amount: 99000, currency: "KRW", orderId: id, idempotencyKey: `${id}-idempotency`, customerRef: `${id}-customer`, paymentMethodRef: `${id}-method`, status: "UNKNOWN", createdAt: new Date("2026-06-01T00:00:00Z"), expiresAt: new Date("2026-06-01T00:30:00Z"), firstChargeAt: new Date("2026-06-01T00:00:01Z") } });
      else await db.billingSubscription.create({ data: { id, userId, plan: "solo", cycle: "monthly", anchor: new Date("2026-05-01T00:00:00Z"), paidThroughIndex: 0, periodStart: new Date("2026-05-01T00:00:00Z"), periodEnd: new Date("2026-06-01T00:00:00Z"), status: "ACTIVE" } });
    }
    stage = "new scheduler objects traverse more than twenty candidates in both lanes";
    for (let index = 0; index < 24; index++) { if (index) await advance(); privacy(await fresh().run()); }
    assert(scans.includes(20)); assert.equal(new Set(executed.filter(id => id.includes("-reconcile-"))).size, 24); assert.equal(new Set(executed.filter(id => id.includes("-renew-"))).size, 24);
    const cooled = await fresh().run(); privacy(cooled); assert.equal(cooled.backoff, 1);
    stage = "deleted checkpoint key still wraps with real repository keyset scans";
    const beforeDelete = await state(); assert(beforeDelete.reconciliationCursor); await db.billingIntent.delete({ where: { id: beforeDelete.reconciliationCursor } });
    await advance(); const beforeWrap = executed.length; privacy(await fresh().run()); assert.equal(executed.length, beforeWrap + 2);
    stage = "budget interruption persists selected cursor before execution";
    await advance(); budgetInterrupt = true; const beforeBudget = executed.length;
    const bounded = await fresh().run({ batchLimit: 2, timeBudgetMs: 105000 }); budgetInterrupt = false; privacy(bounded); assert.equal(bounded.budgetStopped, 1); assert(executed.length - beforeBudget <= 1);
    const budgetState = await state(); assert(budgetState.renewalCursor); assert.equal(budgetState.renewalCursor, observed[observed.length - 1], "interrupted selected candidate was durably checkpointed");
    const beforeResume = observed.length; await advance(); privacy(await fresh().run()); assert.equal((await state()).failureStreak, 0);
    assert.notEqual(observed[beforeResume], budgetState.renewalCursor, "cold restart continues past interrupted candidate before eventual wrap");
    stage = "live invocation is busy and expired takeover fences old checkpoint and finish";
    await advance(); holdContext = true; const entered = new Promise<void>(resolve => { enter = resolve; }); gate = new Promise<void>(resolve => { release = resolve; });
    const old = fresh().run(); pending.add(old); void old.then(() => pending.delete(old), () => pending.delete(old)); await entered;
    const liveState = await state(); assert(liveState.workerToken); const busy = await fresh().run(); privacy(busy); assert.equal(busy.busy, 1);
    clock = new Date(liveState.leaseUntil!.getTime() + 1); mono = 0;
    privacy(await fresh().run()); const afterTakeover = await state(), callsAfterTakeover = executed.length;
    release!(); await assert.rejects(old); assert.equal(executed.length, callsAfterTakeover); assert.deepEqual(await state(), afterTakeover);
    stage = "failed scans persist exponential cooldown capped at fifteen minutes";
    scanFail = true;
    for (let index = 0; index < 6; index++) { await advance(); const failed = await fresh().run(); privacy(failed); assert.equal(failed.failed, 1); const row = await state(); assert.equal(row.failureStreak, index + 1); assert.equal(row.nextAttemptAt!.getTime() - clock.getTime(), Math.min(900000, 60000 * 2 ** index)); }
    scanFail = false; await advance(); privacy(await fresh().run()); assert.equal((await state()).failureStreak, 0);
    assert(!JSON.stringify(cooled).includes(prefix));
    console.log("Synthetic PostgreSQL maintenance schedule PASS: real keyset scans over twenty candidates per lane, cold restart progress, deletion wrap, cooldown/busy, pre-work budget checkpoint, expired-owner fence and bounded failure backoff. Financial execution ports are synthetic; provider calls zero.");
  } finally {
    try { release?.(); await Promise.allSettled([...pending]); if (ownsState) await db.billingMaintenanceState.deleteMany({ where: { id: stateId } });
      await db.$transaction([db.billingIntent.deleteMany({ where: { userId: { in: ids } } }), db.billingSubscription.deleteMany({ where: { userId: { in: ids } } }), db.user.deleteMany({ where: { id: { in: ids } } })]);
    } finally { await db.$disconnect(); }
  }
}
(process.argv.includes("--run-db") ? runDatabase() : offline()).catch(error => { const scalar = (value: unknown) => typeof value === "number" || typeof value === "boolean" ? value : "WITHHELD"; console.error(JSON.stringify({ result: "SYNTHETIC_SCHEDULE_FAILED", stage, diagnostic: error instanceof assert.AssertionError ? { expected: scalar(error.expected), actual: scalar(error.actual) } : "DETAILS_WITHHELD" })); process.exitCode = 1; });
