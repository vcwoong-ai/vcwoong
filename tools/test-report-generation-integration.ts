/** Test-only source API and disposable PostgreSQL; no real model or browser claims. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { generateText } from "../src/lib/claude";
import { checkGenerationGate } from "../src/lib/section-generation-gate";
import { SECTION_META } from "../src/types";
import { assertCleanE2EWorkspace, assertE2ETarget, assertNoExternalE2ECredentials } from "./helpers/e2e-environment";
import { controlSyntheticGeneration, withSyntheticModel, SYNTHETIC_MODEL } from "./helpers/synthetic-generation";

const pause = () => new Promise(resolve => setTimeout(resolve, 50));
async function until<T>(read: () => Promise<T>, accept: (value: T) => boolean, message: string, timeout = 30000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await read(); if (accept(value)) return value; await pause(); }
  throw new Error(message);
}
async function preflight() {
  const marker = `e2e-gen-${randomUUID()}`;
  assert.throws(() => controlSyntheticGeneration("customer-data", "arm"));
  controlSyntheticGeneration(marker, "arm");
  const call = () => withSyntheticModel(() => generateText([{ role: "user", content: marker }], { logContext: { section: "COMPANY_OVERVIEW" } }));
  const old = call();
  await until(async () => controlSyntheticGeneration(marker, "status"), state => state.entered, "offline barrier entered");
  const fresh = await call();
  assert(fresh.content.includes("합성 작업 세대: NEW"));
  assert(checkGenerationGate("COMPANY_OVERVIEW", fresh.content).ok);
  controlSyntheticGeneration(marker, "release");
  const previous = await old;
  assert(previous.content.includes("합성 작업 세대: OLD"));
  assert.equal(previous.inputTokens + previous.outputTokens, 0);
  assert(controlSyntheticGeneration(marker, "remove").oldReturned);
  console.log("Generation barrier offline PASS; source API, PostgreSQL, quota, actual AI quality and browser not executed by preflight.");
}

let stage = "guards";
let diagnostic: { expected: number; actual: number[] } | undefined;
async function runApi() {
  assert(process.argv.includes("--fresh-isolated-server"));
  const base = process.env.BASE_URL ?? "http://localhost:3112";
  assertE2ETarget(base); assertCleanE2EWorkspace(); assertNoExternalE2ECredentials();
  assert.equal(process.env.NODE_ENV, "test"); assert.equal(process.env.STORAGE_MODE, "local"); assert.equal(process.env.UPLOAD_DIR, "./.e2e-uploads");
  await preflight();
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  const fixtures = [0, 1].map(index => ({ prefix: `e2e-gen-${randomUUID()}`, email: `e2e-gen-${randomUUID()}@example.invalid`, password: `Synthetic-${randomUUID()}-Aa1!`, ip: `2001:db8:7::${index + 1}:${randomUUID().slice(0, 4)}`, jar: new Map<string, string>(), id: "" }));
  type Fixture = typeof fixtures[number];
  const armed = new Set<string>();
  function hidden(value: unknown, token?: string | null) {
    const serialized = JSON.stringify(value);
    assert(!serialized.includes('"generationClaim"'), "generation claims never appear in API bodies");
    if (token) assert(!serialized.includes(token), "worker tokens never appear in API bodies");
  }
  async function request(fixture: Fixture, route: string, method = "GET", body?: unknown) {
    assert(route.startsWith("/api/") && !route.startsWith("//"));
    const headers = new Headers({ "x-forwarded-for": fixture.ip });
    if (fixture.jar.size) headers.set("cookie", [...fixture.jar].map(([key, value]) => `${key}=${value}`).join("; "));
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetch(new URL(route, base), { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "manual", signal: AbortSignal.timeout(30000) });
    assert.equal(response.headers.get("x-dealmind-test-harness"), SYNTHETIC_MODEL);
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0]; const at = pair.indexOf("="); if (at > 0) fixture.jar.set(pair.slice(0, at), pair.slice(at + 1)); }
    return response;
  }
  async function json(fixture: Fixture, route: string, method = "GET", body?: unknown, expected = 200) {
    const response = await request(fixture, route, method, body); diagnostic = { expected, actual: [response.status] };
    assert.equal(response.status, expected); diagnostic = undefined;
    const result = await response.json(); hidden(result); return result;
  }
  const control = async (fixture: Fixture, action: string) => (await json(fixture, "/api/__test/generation-control", "POST", { marker: fixture.prefix, action })).data;
  async function register(fixture: Fixture) {
    await json(fixture, "/api/auth/csrf"); // read-only attestation before writes
    fixture.id = (await json(fixture, "/api/auth/register", "POST", { name: "합성 생성 경쟁 테스트", email: fixture.email, password: fixture.password }, 201)).data.id;
    const csrf = (await json(fixture, "/api/auth/csrf")).csrfToken;
    const response = await fetch(new URL("/api/auth/callback/credentials", base), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "x-forwarded-for": fixture.ip, cookie: [...fixture.jar].map(([key, value]) => `${key}=${value}`).join("; ") }, body: new URLSearchParams({ csrfToken: csrf, email: fixture.email, password: fixture.password, json: "true" }), redirect: "manual", signal: AbortSignal.timeout(30000) });
    assert.equal(response.headers.get("x-dealmind-test-harness"), SYNTHETIC_MODEL); assert([200, 302].includes(response.status));
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0]; const at = pair.indexOf("="); if (at > 0) fixture.jar.set(pair.slice(0, at), pair.slice(at + 1)); }
    assert.equal((await json(fixture, "/api/auth/session")).user?.id, fixture.id);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: fixture.id } })).subscriptionPlan, "FREE");
  }
  async function deal(fixture: Fixture, suffix: string) {
    const created = (await json(fixture, "/api/deals", "POST", { name: `${fixture.prefix}-${suffix}`, companyName: fixture.prefix, sector: "GENERAL", investAmount: 10, valuation: 100, shareWithTeam: false }, 201)).data;
    // Parsed synthetic fixture only, deliberately no physical upload or storage calls.
    await db.document.create({ data: { dealId: created.id, name: `${fixture.prefix}.txt`, type: "IR_DECK", mimeType: "text/plain", url: `private-local:${fixture.prefix}/not-a-file.txt`, size: 64, parsedText: `${fixture.prefix}\n합성 테스트 문서. 실제 기업 자료와 AI 투자 판단이 아닙니다.` } });
    return created;
  }
  async function recoverRace(fixture: Fixture, reportId: string, duplicate: boolean) {
    await until(() => control(fixture, "status"), state => state.entered && state.pendingWorkers === 1, "held old worker observed");
    const original = await db.report.findFirstOrThrow({ where: { id: reportId, deal: { userId: fixture.id } } });
    assert(original.generationClaim); hidden((await json(fixture, `/api/reports/${reportId}`)).data, original.generationClaim);
    hidden((await json(fixture, `/api/deals/${original.dealId}/reports`)).data, original.generationClaim);
    // Expire ONLY the exact synthetic owner's held claim. Never reset source clocks/global leases.
    const changed = await db.report.updateMany({ where: { id: reportId, generationClaim: original.generationClaim, deal: { userId: fixture.id } }, data: { generationLeaseExpiresAt: new Date(Date.now() - 1000) } });
    assert.equal(changed.count, 1);
    const runs = await Promise.all(Array.from({ length: duplicate ? 2 : 1 }, () => request(fixture, `/api/reports/${reportId}/run`, "POST", { mode: "resume", trigger: "auto" })));
    diagnostic = { expected: 200, actual: runs.map(response => response.status) };
    assert.equal(runs.filter(response => response.status === 200).length, 1); assert(runs.every(response => [200, 409].includes(response.status))); diagnostic = undefined;
    for (const response of runs) hidden(await response.json(), original.generationClaim);
    await until(async () => (await json(fixture, `/api/reports/${reportId}/status`)).data, status => status.status === "completed", "new claim completes", 120000);
    await until(() => control(fixture, "status"), state => state.pendingWorkers === 1, "new worker settles before old release");
    // A cache produced AFTER the new worker completes must survive an obsolete writer.
    // This is a synthetic stored marker, not a fabricated AI verification result.
    await db.reportEvidenceCheck.create({ data: { reportId, verdicts: [], modelUsed: SYNTHETIC_MODEL } });
    const before = await db.report.findUniqueOrThrow({ where: { id: reportId }, include: { sections: { orderBy: { order: "asc" } }, evidenceCheck: true } });
    assert.equal(before.sections.length, SECTION_META.length);
    assert(before.sections.every(section => section.content.includes("합성 작업 세대: NEW") && !section.content.includes("합성 작업 세대: OLD")));
    assert(before.sections.every(section => checkGenerationGate(section.sectionKey, section.content).ok));
    await control(fixture, "release");
    await until(() => control(fixture, "status"), state => state.oldReturned && state.pendingWorkers === 0, "both actual waitUntil worker promises settle");
    const after = await db.report.findUniqueOrThrow({ where: { id: reportId }, include: { sections: { orderBy: { order: "asc" } }, evidenceCheck: true } });
    assert.deepEqual(after, before, "stale worker cannot change any section/opinion content, evidence cache, status, progress, dates or claim fields");
    await control(fixture, "remove"); armed.delete(fixture.prefix);
  }
  try {
    stage = "register synthetic FREE accounts";
    for (const fixture of fixtures) await register(fixture);
    const [first, quota] = fixtures;
    const firstDeal = await deal(first, "duplicate");
    await control(first, "arm"); armed.add(first.prefix);
    stage = "same deal concurrent report creation";
    const creates = await Promise.all(Array.from({ length: 2 }, () => request(first, `/api/deals/${firstDeal.id}/reports`, "POST", { agentType: "GENERAL" })));
    diagnostic = { expected: 201, actual: creates.map(response => response.status) };
    assert.deepEqual(creates.map(response => response.status).sort(), [201, 409]); diagnostic = undefined;
    const created = await creates.find(response => response.status === 201)!.json(); hidden(created);
    assert.equal(await db.report.count({ where: { deal: { userId: first.id } } }), 1);
    assert.equal(await db.reportQuotaAdmission.count({ where: { userId: first.id } }), 1);
    assert.equal((await json(first, "/api/usage")).data.quota.reports.used, 1);
    stage = "same report claim race and stale worker fencing";
    await recoverRace(first, created.data.id, true);
    assert.equal(await db.reportQuotaAdmission.count({ where: { userId: first.id } }), 1, "claim recovery reuses the original quota admission");

    stage = "near-limit FREE quota concurrent different deals";
    const quotaDeals = await Promise.all([deal(quota, "quota-A"), deal(quota, "quota-B")]);
    await db.report.createMany({ data: Array.from({ length: 4 }, (_, index) => ({ dealId: quotaDeals[0].id, title: `${quota.prefix}-seed-${index}`, agentType: "GENERAL" as const, status: "PENDING" as const })) });
    await control(quota, "arm"); armed.add(quota.prefix);
    const quotaCreates = await Promise.all(quotaDeals.map(item => request(quota, `/api/deals/${item.id}/reports`, "POST", { agentType: "GENERAL" })));
    diagnostic = { expected: 201, actual: quotaCreates.map(response => response.status) };
    assert.deepEqual(quotaCreates.map(response => response.status).sort(), [201, 429]); diagnostic = undefined;
    const quotaReport = await quotaCreates.find(response => response.status === 201)!.json(); hidden(quotaReport);
    assert.equal(await db.report.count({ where: { deal: { userId: quota.id } } }), 5);
    assert.equal(await db.reportQuotaAdmission.count({ where: { userId: quota.id } }), 1, "four legacy rows plus one linked admission are counted once");
    const usage = (await json(quota, "/api/usage")).data.quota.reports;
    assert.equal(usage.used, 5); assert.equal(usage.limit, 5);
    stage = "resume existing report at full quota without new usage";
    await recoverRace(quota, quotaReport.data.id, false);
    assert.equal(await db.reportQuotaAdmission.count({ where: { userId: quota.id } }), 1);
    assert.equal(await db.report.count({ where: { deal: { userId: quota.id } } }), 5);
    assert.equal(await db.usageLog.count({ where: { userId: { in: fixtures.map(fixture => fixture.id) } } }), 0);
    console.log("Synthetic PostgreSQL/source API generation PASS: duplicate create/claim CAS, expired worker fencing after actual promise settlement, FREE quota race and full-quota resume. No actual AI quality, paid provider or browser verification.");
  } finally {
    try {
      // Never delete fixtures while an observed old/background worker can still write.
      for (const fixture of fixtures) if (armed.has(fixture.prefix)) await control(fixture, "release");
      for (const fixture of fixtures) if (armed.has(fixture.prefix)) { await until(() => control(fixture, "status"), state => state.pendingWorkers === 0, "fixture workers settle before cleanup", 120000); await control(fixture, "remove"); }
      const users = await db.user.findMany({ where: { email: { in: fixtures.map(fixture => fixture.email) } }, select: { id: true, email: true } });
      assert(users.every(user => user.email !== null && fixtures.some(fixture => fixture.email === user.email)));
      const ids = users.map(user => user.id);
      await db.$transaction([
        db.deal.deleteMany({ where: { userId: { in: ids } } }), db.user.deleteMany({ where: { id: { in: ids } } }),
        db.rateLimit.deleteMany({ where: { key: { in: [...fixtures.flatMap(fixture => [`register:${fixture.ip}`, `login:${fixture.ip}`]), ...ids.map(id => `report-gen:${id}`)] } } }),
      ]);
      assert.equal(await db.user.count({ where: { email: { in: fixtures.map(fixture => fixture.email) } } }), 0);
    } finally { await db.$disconnect(); }
  }
}
(process.argv.includes("--run-api") ? runApi() : preflight()).catch(() => { console.error(JSON.stringify({ result: "SYNTHETIC_GENERATION_FAILED", stage, diagnostic: diagnostic ?? "NON_HTTP_ASSERTION_OR_RUNTIME" })); process.exitCode = 1; });
