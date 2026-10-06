/** Durable admission accounting, disposable PG/source API and synthetic model only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { kstStartOfMonth } from "../src/lib/utils";
import { assertCleanE2EWorkspace, assertE2ETarget, assertNoExternalE2ECredentials } from "./helpers/e2e-environment";
import { SYNTHETIC_MODEL } from "./helpers/synthetic-generation";

let stage = "offline";
async function preflight() {
  assert.equal(kstStartOfMonth(new Date("2026-06-30T14:59:59.999Z")).toISOString(), "2026-05-31T15:00:00.000Z");
  assert.equal(kstStartOfMonth(new Date("2026-06-30T15:00:00.000Z")).toISOString(), "2026-06-30T15:00:00.000Z");
  console.log("Report quota ledger KST boundary preflight PASS; PostgreSQL/source API/provider not executed.");
}
async function runApi() {
  assert(process.argv.includes("--fresh-isolated-server")); const base = process.env.BASE_URL ?? "http://localhost:3117";
  assertE2ETarget(base); assertCleanE2EWorkspace(); assertNoExternalE2ECredentials(); assert.equal(process.env.NODE_ENV, "test");
  const { createBillingClient } = await import("../src/lib/payments/billing-client"); const db = createBillingClient(process.env.TEST_DATABASE_URL!);
  const globals = globalThis as typeof globalThis & { prisma?: typeof db }; const previous = globals.prisma; globals.prisma = db;
  const fixtures = ["history", "race", "boundary", "rollback"].map(label => ({ marker: `e2e-gen-${randomUUID()}`, email: `e2e-ledger-${label}-${randomUUID()}@example.invalid`, password: `Synthetic-${randomUUID()}-Aa1!`, ip: `2001:db8:9::${randomUUID().slice(0, 4)}`, id: "", jar: new Map<string, string>() }));
  type Fixture = typeof fixtures[number];
  const armed = new Set<Fixture>();
  const sleep = () => new Promise(resolve => setTimeout(resolve, 40));
  async function until<T>(read: () => Promise<T>, accept: (value: T) => boolean) { const end = Date.now() + 120000; while (Date.now() < end) { const value = await read(); if (accept(value)) return value; await sleep(); } throw new Error("Synthetic stage deadline"); }
  function hidden(body: unknown) { const text = JSON.stringify(body); assert(!text.includes('"generationClaim"')); assert(!text.includes('"generationLeaseExpiresAt"')); }
  async function request(fixture: Fixture, route: string, method = "GET", body?: unknown) {
    assert(route.startsWith("/api/") && !route.startsWith("//")); const headers = new Headers({ "x-forwarded-for": fixture.ip });
    if (fixture.jar.size) headers.set("cookie", [...fixture.jar].map(([key, value]) => `${key}=${value}`).join("; ")); if (body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetch(new URL(route, base), { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "manual", signal: AbortSignal.timeout(120000) });
    assert.equal(response.headers.get("x-dealmind-test-harness"), SYNTHETIC_MODEL);
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0], at = pair.indexOf("="); if (at > 0) fixture.jar.set(pair.slice(0, at), pair.slice(at + 1)); } return response;
  }
  async function json(fixture: Fixture, route: string, method = "GET", body?: unknown, expected = 200) { const response = await request(fixture, route, method, body); assert.equal(response.status, expected); const result = await response.json(); hidden(result); return result; }
  const control = async (fixture: Fixture, action: "arm" | "release" | "remove" | "status") => { const value = (await json(fixture, "/api/__test/generation-control", "POST", { marker: fixture.marker, action })).data; if (action === "arm") armed.add(fixture); if (action === "remove") armed.delete(fixture); return value; };
  async function settle(fixture: Fixture) { await control(fixture, "release"); await until(() => control(fixture, "status"), state => state.pendingWorkers === 0); await control(fixture, "remove"); }
  async function register(fixture: Fixture) {
    await json(fixture, "/api/auth/csrf"); fixture.id = (await json(fixture, "/api/auth/register", "POST", { name: "합성 사용량 원장 검증", email: fixture.email, password: fixture.password }, 201)).data.id;
    const csrf = (await json(fixture, "/api/auth/csrf")).csrfToken;
    const response = await fetch(new URL("/api/auth/callback/credentials", base), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "x-forwarded-for": fixture.ip, cookie: [...fixture.jar].map(([key, value]) => `${key}=${value}`).join("; ") }, body: new URLSearchParams({ csrfToken: csrf, email: fixture.email, password: fixture.password, json: "true" }), redirect: "manual" });
    assert.equal(response.headers.get("x-dealmind-test-harness"), SYNTHETIC_MODEL); assert([200, 302].includes(response.status)); for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0], at = pair.indexOf("="); if (at > 0) fixture.jar.set(pair.slice(0, at), pair.slice(at + 1)); }
    assert.equal((await json(fixture, "/api/auth/session")).user?.id, fixture.id);
  }
  async function deal(fixture: Fixture, suffix: string) { const item = await db.deal.create({ data: { userId: fixture.id, name: `${fixture.marker}-${suffix}`, companyName: fixture.marker, sector: "GENERAL" } }); await db.document.create({ data: { dealId: item.id, name: `${fixture.marker}.txt`, type: "IR_DECK", mimeType: "text/plain", url: `private-local:${fixture.marker}/not-a-file.txt`, size: 1, parsedText: `${fixture.marker}\n합성 원장 테스트만 수행하며 실제 기업자료가 아닙니다.` } }); return item; }
  const used = async (fixture: Fixture) => (await json(fixture, "/api/usage")).data.quota.reports.used;
  async function create(fixture: Fixture, dealId: string) { await control(fixture, "arm"); const result = await json(fixture, `/api/deals/${dealId}/reports`, "POST", { agentType: "GENERAL" }, 201); await until(() => control(fixture, "status"), state => state.entered); await settle(fixture); return result.data; }
  try {
    stage = "synthetic accounts and guarded quota module"; for (const fixture of fixtures) await register(fixture);
    const { checkQuota } = await import("../src/lib/quotas"); assert.equal((await import("../src/lib/prisma")).prisma, db);
    const [history, race, boundary, rollback] = fixtures;
    stage = "new report and immutable admission are atomic and not double counted";
    const historyDeal = await deal(history, "retained"); const report = await create(history, historyDeal.id);
    const admission = await db.reportQuotaAdmission.findUniqueOrThrow({ where: { reportId: report.id } }); assert.equal(admission.userId, history.id); assert.equal(admission.admissionRef, report.id);
    assert.equal((await db.report.findUniqueOrThrow({ where: { id: report.id } })).createdAt.getTime(), admission.createdAt.getTime());
    assert.equal(await used(history), 1); assert.equal(await db.reportQuotaAdmission.count({ where: { userId: history.id } }), 1);
    stage = "resume and restart reuse one admission";
    await json(history, `/api/reports/${report.id}/run`, "POST", { mode: "resume" });
    await until(() => db.report.findUniqueOrThrow({ where: { id: report.id } }), row => row.generationClaim === null && row.status !== "GENERATING");
    await control(history, "arm"); await json(history, `/api/reports/${report.id}/run`, "POST", { mode: "restart" }); await until(() => control(history, "status"), state => state.entered); await settle(history);
    assert.equal(await db.reportQuotaAdmission.count({ where: { userId: history.id } }), 1); assert.equal(await used(history), 1);
    stage = "deleting report sets pointer null and does not refund usage";
    await db.report.delete({ where: { id: report.id } }); // No report DELETE HTTP endpoint exists.
    const retained = await db.reportQuotaAdmission.findUniqueOrThrow({ where: { admissionRef: report.id } }); assert.equal(retained.reportId, null); assert.equal(retained.userId, history.id); assert.equal(await used(history), 1);
    const deletedDeal = await deal(history, "deleted-deal"); const deletedReport = await create(history, deletedDeal.id);
    stage = "actual deal DELETE preserves admission used";
    await json(history, `/api/deals/${deletedDeal.id}`, "DELETE"); assert.equal(await used(history), 2); assert.equal((await db.reportQuotaAdmission.findUniqueOrThrow({ where: { admissionRef: deletedReport.id } })).reportId, null);
    stage = "legacy fallback and concurrent final slot have one winner";
    const raceDeals = await Promise.all([deal(race, "A"), deal(race, "B")]);
    await db.report.createMany({ data: Array.from({ length: 4 }, (_, index) => ({ dealId: raceDeals[0].id, title: `${race.marker}-legacy-${index}`, agentType: "GENERAL" as const, status: "DRAFT" as const })) }); assert.equal(await used(race), 4);
    await control(race, "arm"); const responses = await Promise.all(raceDeals.map(item => request(race, `/api/deals/${item.id}/reports`, "POST", { agentType: "GENERAL" })));
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 429]); for (const response of responses) hidden(await response.json()); await until(() => control(race, "status"), state => state.entered); await settle(race);
    assert.equal(await used(race), 5); assert.equal(await db.reportQuotaAdmission.count({ where: { userId: race.id } }), 1); assert.equal(await db.report.count({ where: { deal: { userId: race.id } } }), 5);
    stage = "KST month boundary retains old ledger and counts only new-month admissions";
    const monthEdge = new Date("2026-06-30T15:00:00.000Z"), monthBefore = new Date(monthEdge.getTime() - 1); const boundaryDeal = await deal(boundary, "boundary");
    for (const createdAt of [monthBefore, monthEdge]) { const seeded = await db.report.create({ data: { dealId: boundaryDeal.id, title: boundary.marker, agentType: "GENERAL", createdAt } }); await db.reportQuotaAdmission.create({ data: { userId: boundary.id, reportId: seeded.id, admissionRef: seeded.id, createdAt } }); }
    assert.equal((await checkQuota(boundary.id, "report", "free", db, monthBefore)).used, 1); assert.equal((await checkQuota(boundary.id, "report", "free", db, monthEdge)).used, 1);
    stage = "fixture-scoped admission failure rolls report creation back before model dispatch";
    const rollbackDeal = await deal(rollback, "rollback"); assert(/^[a-zA-Z0-9_-]+$/.test(rollback.id));
    const faultName = `e2e_ledger_fault_${randomUUID().replace(/-/g, "")}`;
    // Parent explicitly authorized DDL in this disposable DB only. Identifiers/user ID
    // are locally generated and allowlisted, not request/provider/environment values.
    // The trigger rejects only this fixture; fixed message contains no row data.
    try {
      await db.$executeRawUnsafe(`CREATE FUNCTION "${faultName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${rollback.id}' THEN RAISE EXCEPTION 'SYNTHETIC_ADMISSION_FAULT'; END IF; RETURN NEW; END $$`);
      await db.$executeRawUnsafe(`CREATE TRIGGER "${faultName}" BEFORE INSERT ON "ReportQuotaAdmission" FOR EACH ROW EXECUTE FUNCTION "${faultName}"()`);
      await control(rollback, "arm"); await json(rollback, `/api/deals/${rollbackDeal.id}/reports`, "POST", { agentType: "GENERAL" }, 500);
      assert.equal((await control(rollback, "status")).calls, 0); await settle(rollback);
      assert.equal(await db.report.count({ where: { deal: { userId: rollback.id } } }), 0); assert.equal(await db.reportQuotaAdmission.count({ where: { userId: rollback.id } }), 0); assert.equal(await used(rollback), 0);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${faultName}" ON "ReportQuotaAdmission"`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${faultName}"()`);
    }
    // Quota history survives report/deal deletion; account removal alone cascades it.
    assert.equal(await db.usageLog.count({ where: { userId: { in: fixtures.map(item => item.id) } } }), 0);
    console.log("Synthetic PostgreSQL/source API quota ledger PASS: atomic admission, report/deal deletion retention, resume/restart, legacy/no-double-count, final-slot race, KST month boundary and fixture-only insertion-failure rollback before dispatch. Actual providers/browser remain unverified.");
  } finally {
    try { for (const fixture of armed) await control(fixture, "release"); for (const fixture of [...armed]) await settle(fixture);
      const users = await db.user.findMany({ where: { email: { in: fixtures.map(item => item.email) } }, select: { id: true, email: true } }); assert(users.every(user => fixtures.some(item => item.email === user.email && item.id === user.id))); const ids = users.map(item => item.id);
      await db.$transaction([db.deal.deleteMany({ where: { userId: { in: ids } } }), db.user.deleteMany({ where: { id: { in: ids } } }), db.rateLimit.deleteMany({ where: { key: { in: fixtures.flatMap(item => [`register:${item.ip}`, `login:${item.ip}`, `report-gen:${item.id}`]) } } })]);
      assert.equal(await db.reportQuotaAdmission.count({ where: { userId: { in: ids } } }), 0);
    } finally { globals.prisma = previous; await db.$disconnect(); }
  }
}
(process.argv.includes("--run-api") ? runApi() : preflight()).catch(error => { const scalar = (value: unknown) => typeof value === "number" || typeof value === "boolean" ? value : "WITHHELD"; console.error(JSON.stringify({ result: "SYNTHETIC_QUOTA_LEDGER_FAILED", stage, diagnostic: error instanceof assert.AssertionError ? { expected: scalar(error.expected), actual: scalar(error.actual) } : "DETAILS_WITHHELD" })); process.exitCode = 1; });
