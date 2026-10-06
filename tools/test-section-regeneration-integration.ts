/** Disposable PostgreSQL/source API with synthetic model only; default does not connect. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { generateText } from "../src/lib/claude";
import { SECTION_META } from "../src/types";
import { assertCleanE2EWorkspace, assertE2ETarget, assertNoExternalE2ECredentials } from "./helpers/e2e-environment";
import { reportReviewVersion } from "../src/lib/report-review-version";
import { controlSyntheticGeneration, SYNTHETIC_MODEL, withSyntheticModel } from "./helpers/synthetic-generation";

let stage = "offline";
async function until<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeout = 60000): Promise<T> {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 40)); }
  throw new Error("Synthetic stage deadline");
}
async function offline() {
  const marker = `e2e-gen-${randomUUID()}`;
  controlSyntheticGeneration(marker, "arm");
  const pending = withSyntheticModel(() => generateText([{ role: "user", content: marker }], { logContext: { section: "COMPANY_OVERVIEW" } }));
  await until(async () => controlSyntheticGeneration(marker, "status"), state => state.entered);
  assert.equal(controlSyntheticGeneration(marker, "status").calls, 1);
  controlSyntheticGeneration(marker, "release"); await pending; controlSyntheticGeneration(marker, "remove");
  console.log("Section regeneration barrier offline PASS; PostgreSQL, HTTP, actual AI quality and browser not executed.");
}
async function runApi() {
  stage = "isolated guards"; assert(process.argv.includes("--fresh-isolated-server"));
  const base = process.env.BASE_URL ?? "http://localhost:3116";
  assertE2ETarget(base); assertCleanE2EWorkspace(); assertNoExternalE2ECredentials(); assert.equal(process.env.NODE_ENV, "test");
  const { createBillingClient } = await import("../src/lib/payments/billing-client");
  const db = createBillingClient(process.env.TEST_DATABASE_URL!);
  const prefix = `e2e-gen-${randomUUID()}`, email = `${prefix}@example.invalid`, password = `Synthetic-${randomUUID()}-Aa1!`, ip = `2001:db8:8::${randomUUID().slice(0, 4)}`;
  const jar = new Map<string, string>(); let userId = "", armed = false;
  const knownTokens = new Set<string>();
  const active = new Set<Promise<Response>>();
  function hidden(body: unknown) { const text = JSON.stringify(body); assert(!text.includes('"generationClaim"')); assert(!text.includes('"generationLeaseExpiresAt"')); assert([...knownTokens].every(token => !text.includes(token))); }
  async function request(route: string, method = "GET", body?: unknown): Promise<Response> {
    assert(route.startsWith("/api/") && !route.startsWith("//"));
    const headers = new Headers({ "x-forwarded-for": ip });
    if (jar.size) headers.set("cookie", [...jar].map(([key, value]) => `${key}=${value}`).join("; "));
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetch(new URL(route, base), { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "manual", signal: AbortSignal.timeout(120000) });
    assert.equal(response.headers.get("x-dealmind-test-harness"), SYNTHETIC_MODEL);
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0], at = pair.indexOf("="); if (at > 0) jar.set(pair.slice(0, at), pair.slice(at + 1)); }
    return response;
  }
  async function json(route: string, method = "GET", body?: unknown, expected = 200) { const response = await request(route, method, body); assert.equal(response.status, expected); const result = await response.json(); hidden(result); return result; }
  const control = async (action: "arm" | "arm-failure" | "status" | "release" | "remove") => {
    const state = (await json("/api/__test/generation-control", "POST", { marker: prefix, action })).data;
    if (action === "arm" || action === "arm-failure") armed = true; if (action === "remove") armed = false; return state;
  };
  function track(promise: Promise<Response>) { active.add(promise); void promise.then(() => active.delete(promise), () => active.delete(promise)); return promise; }
  async function finish(promise: Promise<Response>, expected: number) { const response = await promise; assert.equal(response.status, expected); hidden(await response.json()); }
  async function resetBarrier() { await control("release"); await until(() => control("status"), state => state.pendingWorkers === 0); await control("remove"); }
  try {
    stage = "synthetic registration and actual session";
    await json("/api/auth/csrf");
    userId = (await json("/api/auth/register", "POST", { name: "합성 섹션 동시성 검증", email, password }, 201)).data.id;
    const csrf = (await json("/api/auth/csrf")).csrfToken;
    const auth = await fetch(new URL("/api/auth/callback/credentials", base), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "x-forwarded-for": ip, cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; ") }, body: new URLSearchParams({ csrfToken: csrf, email, password, json: "true" }), redirect: "manual" });
    assert.equal(auth.headers.get("x-dealmind-test-harness"), SYNTHETIC_MODEL); assert([200, 302].includes(auth.status));
    for (const cookie of auth.headers.getSetCookie()) { const pair = cookie.split(";")[0], at = pair.indexOf("="); if (at > 0) jar.set(pair.slice(0, at), pair.slice(at + 1)); }
    assert.equal((await json("/api/auth/session")).user?.id, userId);
    const deal = await db.deal.create({ data: { userId, name: prefix, companyName: prefix, sector: "GENERAL" } });
    await db.document.create({ data: { dealId: deal.id, name: `${prefix}.txt`, type: "IR_DECK", mimeType: "text/plain", url: `private-local:${prefix}/not-a-file.txt`, size: 1, parsedText: `${prefix}\n합성 검증 자료; 실제 기업자료와 AI 판단이 아닙니다.` } });
    async function fixture(suffix: string) { return db.report.create({ data: { dealId: deal.id, title: `${prefix}-${suffix}`, agentType: "GENERAL", status: "FINAL", sections: { create: SECTION_META.map(meta => ({ sectionKey: meta.key, title: meta.title, order: meta.order, content: `${prefix} 합성 원본 ${meta.key}`, status: "APPROVED" as const })) } }, include: { sections: { orderBy: { order: "asc" } } } }); }
    const report = await fixture("concurrency"), second = await fixture("same-deal");
    const route = (id = report.id) => `/api/reports/${id}/sections/regenerate`;
    const body = { sectionKey: "COMPANY_OVERVIEW" };

    stage = "section lease excludes duplicate section, other section, same deal and whole report";
    await control("arm"); const old = track(request(route(), "POST", body));
    await until(() => control("status"), state => state.entered);
    const held = await db.report.findUniqueOrThrow({ where: { id: report.id } }); assert(held.generationClaim); assert.equal(held.status, "FINAL");
    knownTokens.add(held.generationClaim);
    hidden((await json(`/api/reports/${report.id}`)).data);
    await json(route(), "POST", body, 409);
    await json(route(), "POST", { sectionKey: "MARKET_ANALYSIS" }, 409);
    await json(route(second.id), "POST", body, 409);
    await json(`/api/reports/${report.id}/run`, "POST", { mode: "restart" }, 409);
    assert.equal((await control("status")).calls, 1);
    await control("release"); await finish(old, 200); await resetBarrier();
    const released = await db.report.findUniqueOrThrow({ where: { id: report.id } }); assert.equal(released.generationClaim, null); assert.equal(released.generationLeaseExpiresAt, null);

    stage = "whole report lease excludes section before a model call";
    await control("arm"); await json(`/api/reports/${report.id}/run`, "POST", { mode: "restart" });
    await until(() => control("status"), state => state.entered);
    const wholeCalls = (await control("status")).calls;
    await json(route(), "POST", body, 409); assert.equal((await control("status")).calls, wholeCalls, "rejected section request adds no model work");
    await control("release"); await until(() => control("status"), state => state.pendingWorkers === 0, 120000); await resetBarrier();

    stage = "manual section edit survives held obsolete generation";
    await control("arm"); const editing = track(request(route(), "POST", body)); await until(() => control("status"), state => state.entered);
    const section = await db.reportSection.findFirstOrThrow({ where: { reportId: report.id, sectionKey: "COMPANY_OVERVIEW" } });
    const manual = `${prefix} 합성 사용자 편집 보존`;
    await json(`/api/reports/${report.id}/sections`, "PATCH", { sectionId: section.id, content: manual, expectedReviewVersion: await reportReviewVersion([section]) });
    await control("release"); await finish(editing, 409); await resetBarrier();
    assert.equal((await db.reportSection.findUniqueOrThrow({ where: { id: section.id } })).content, manual);
    assert.equal((await db.report.findUniqueOrThrow({ where: { id: report.id } })).generationClaim, null);

    stage = "expired old worker cannot overwrite new section worker or release its lease";
    await control("arm"); const expired = track(request(route(), "POST", body)); await until(() => control("status"), state => state.entered);
    const owner = await db.report.findUniqueOrThrow({ where: { id: report.id } }); assert(owner.generationClaim);
    knownTokens.add(owner.generationClaim);
    assert.equal((await db.report.updateMany({ where: { id: report.id, generationClaim: owner.generationClaim, deal: { userId } }, data: { generationLeaseExpiresAt: new Date(Date.now() - 1000) } })).count, 1);
    await json(route(), "POST", body);
    const before = await db.report.findUniqueOrThrow({ where: { id: report.id }, include: { sections: { orderBy: { order: "asc" } } } });
    assert(before.sections.find(item => item.sectionKey === "COMPANY_OVERVIEW")?.content.includes("합성 작업 세대: NEW"));
    await control("release"); await finish(expired, 409); await resetBarrier();
    assert.deepEqual(await db.report.findUniqueOrThrow({ where: { id: report.id }, include: { sections: { orderBy: { order: "asc" } } } }), before);

    stage = "model failure releases lease and permits a subsequent retry";
    await control("arm-failure"); const failing = track(request(route(), "POST", body)); await until(() => control("status"), state => state.entered);
    const beforeFailure = await db.reportSection.findUniqueOrThrow({ where: { id: section.id } });
    await control("release"); await finish(failing, 500); await resetBarrier();
    assert.deepEqual(await db.reportSection.findUniqueOrThrow({ where: { id: section.id } }), beforeFailure);
    const afterFailure = await db.report.findUniqueOrThrow({ where: { id: report.id } }); assert.equal(afterFailure.generationClaim, null); assert.equal(afterFailure.generationLeaseExpiresAt, null);
    await json(route(), "POST", body);
    assert.equal(await db.usageLog.count({ where: { userId } }), 0);
    console.log("Synthetic PostgreSQL/source API section regeneration PASS: duplicate/same-deal/whole claims, manual-edit CAS, expired-worker fence, failure release/retry and response privacy. Real model quality, paid calls and browser remain unverified.");
  } finally {
    try {
      if (armed) await control("release"); await Promise.allSettled([...active]);
      if (armed) await resetBarrier();
      const user = await db.user.findUnique({ where: { email }, select: { id: true } }); if (user) { assert.equal(user.id, userId);
        await db.$transaction([db.deal.deleteMany({ where: { userId: user.id } }), db.user.delete({ where: { id: user.id } }), db.rateLimit.deleteMany({ where: { key: { in: [`register:${ip}`, `login:${ip}`, `section-regen:${user.id}`, `report-gen:${user.id}`] } } })]); }
    } finally { await db.$disconnect(); }
  }
}
(process.argv.includes("--run-api") ? runApi() : offline()).catch(error => { const scalar = (value: unknown) => typeof value === "number" || typeof value === "boolean" ? value : "WITHHELD"; console.error(JSON.stringify({ result: "SYNTHETIC_SECTION_FAILED", stage, diagnostic: error instanceof assert.AssertionError ? { expected: scalar(error.expected), actual: scalar(error.actual) } : "DETAILS_WITHHELD" })); process.exitCode = 1; });
