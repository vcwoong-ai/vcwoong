/** API integration only. No browser launch, UI automation, production targets or paid AI. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { SECTION_META } from "../src/types";
import { checkGenerationGate } from "../src/lib/section-generation-gate";
import { reportReviewVersion } from "../src/lib/report-review-version";
import { assessDemoMockGate, freeCustomerFixture, MANUAL_BROWSER_CHECKS } from "./helpers/free-customer-fixture";
import { assertCleanE2EWorkspace, assertE2ETarget, assertNoExternalE2ECredentials } from "./helpers/e2e-environment";
import { startSyntheticSourceApi, SYNTHETIC_MODEL } from "./helpers/synthetic-generation";

let stage = "offline preflight";
function preflight() {
  const legacy = assessDemoMockGate();
  const gates = assessDemoMockGate(true);
  assert.equal(gates.length, SECTION_META.length);
  assert(gates.every(gate => gate.demoNotice), "every synthetic section must retain its demo notice");
  console.log(JSON.stringify({ mode: "synthetic-only-offline-preflight", actualAIQuality: "not-tested", legacyDemoMockGates: legacy, syntheticStorageGates: gates, manualBrowserChecks: MANUAL_BROWSER_CHECKS }));
  assert(gates.every(gate => gate.ok), "Explicit synthetic adapter must pass the unchanged minimum storage gates.");
}

async function runApi() {
  // A client guard cannot establish the environment of an existing localhost server.
  // The supervising runner must start a fresh copied app and disposable DB first.
  assert(process.argv.includes("--fresh-isolated-server"), "Explicit fresh isolated server confirmation is required.");
  const base = process.env.BASE_URL ?? "http://localhost:3100";
  assertE2ETarget(base);
  assertCleanE2EWorkspace();
  assertNoExternalE2ECredentials();
  assert.equal(process.env.STORAGE_MODE, "local");
  assert.equal(process.env.UPLOAD_DIR, "./.e2e-uploads");
  assert.equal(process.env.NODE_ENV, "test", "Source-route synthetic integration requires an explicit test process, never a production process.");
  preflight(); // Fail before any HTTP/DB mutation if synthetic content violates quality gates.
  const { PrismaClient } = await import("@prisma/client");
  const { deleteStoredFile } = await import("../src/lib/storage");
  const db = new PrismaClient();
  const fixture = freeCustomerFixture();
  const testIp = `2001:db8:5::${fixture.prefix.replace(/[^a-f0-9]/g, "").slice(-4)}`;
  const jar = new Map<string, string>();
  let userId: string | undefined;
  let reportId: string | undefined;

  async function request(route: string, init: RequestInit = {}) {
    assert(route.startsWith("/api/") && !route.startsWith("//"));
    const headers = new Headers(init.headers);
    headers.set("x-forwarded-for", testIp);
    if (jar.size) headers.set("cookie", [...jar].map(([key, value]) => `${key}=${value}`).join("; "));
    const response = await fetch(new URL(route, base), { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(30000) });
    assert.equal(response.headers.get("x-dealmind-test-harness"), SYNTHETIC_MODEL, "API journey must connect to the explicit source-route synthetic harness");
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const at = pair.indexOf("=");
      if (at > 0) jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    // Redirects are never followed, so responses cannot route this test off loopback.
    return response;
  }
  async function json(route: string, method = "GET", body?: unknown, expected = 200) {
    const response = await request(route, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    assert.equal(response.status, expected, `${stage}: HTTP status`);
    const result = await response.json();
    assert(!JSON.stringify(result).includes('"generationClaim"'), "worker claims are never exposed by customer APIs");
    return result;
  }
  async function login(password = fixture.password) {
    const { csrfToken } = await json("/api/auth/csrf");
    const response = await request("/api/auth/callback/credentials", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken, email: fixture.email, password, json: "true" }),
    });
    assert([200, 302].includes(response.status));
    const session = await json("/api/auth/session");
    assert.equal(session.user?.id, userId, "login uses the account registered in this journey");
  }
  try {
    // Read-only attestation before creating a fixture: ordinary app servers are refused.
    await json("/api/auth/csrf");
    stage = "FREE registration";
    const registered = await json("/api/auth/register", "POST", { name: fixture.name, email: fixture.email, password: fixture.password }, 201);
    userId = registered.data.id;
    const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, subscriptionPlan: true, role: true } });
    assert.equal(user.email, fixture.email);
    assert.equal(user.subscriptionPlan, "FREE", "no subscription is upgraded by the fixture");
    assert.equal(user.role, "ANALYST");
    await login();
    const quotaBefore = (await json("/api/usage")).data.quota;
    assert.equal(quotaBefore.plan, "free");
    assert.equal(quotaBefore.reports.limit, 5);
    assert.equal(quotaBefore.reports.used, 0);

    stage = "owned deal creation";
    const deal = (await json("/api/deals", "POST", fixture.deal, 201)).data;
    assert.equal(deal.userId, userId);
    assert.equal(deal.teamId, null);
    stage = "synthetic local upload";
    const form = new FormData();
    form.append("dealId", deal.id);
    form.append("file", new Blob([fixture.text], { type: "text/plain" }), fixture.fileName);
    const uploaded = await request("/api/upload", { method: "POST", body: form });
    assert.equal(uploaded.status, 201);
    const document = (await uploaded.json()).data;
    assert.equal(document.parsedText, fixture.text);
    assert(!JSON.stringify(document).includes("private-local:"));
    const download = await request(`/api/documents/${document.id}/download`);
    assert.equal(download.status, 200);
    assert.equal(await download.text(), fixture.text);

    stage = "demo generation and quality";
    const created = await json(`/api/deals/${deal.id}/reports`, "POST", { agentType: "GENERAL" }, 201);
    reportId = created.data.id;
    const deadline = Date.now() + 120000;
    let status;
    do {
      status = (await json(`/api/reports/${reportId}/status`)).data;
      if (status.status === "completed") break;
      assert.equal(status.status, "generating", "synthetic generation must complete without partial/error masking");
      await new Promise(resolve => setTimeout(resolve, 500));
    } while (Date.now() < deadline);
    assert.equal(status.status, "completed", "bounded generation poll completed");
    assert.equal(status.completed, SECTION_META.length);
    const report = (await json(`/api/reports/${reportId}`)).data;
    assert.equal(report.templateId, null, "FREE uses standard export, not the paid template engine");
    assert.equal(report.sections.length, SECTION_META.length);
    assert.deepEqual(report.sections.map((section: { sectionKey: string }) => section.sectionKey).sort(), SECTION_META.map(meta => meta.key).sort());
    for (const section of report.sections) {
      assert(section.content.includes("데모 모드"));
      assert(section.content.includes(fixture.prefix), "generated sections identify only the synthetic fixture");
      assert(checkGenerationGate(section.sectionKey, section.content).ok, `generated section ${section.sectionKey} must pass the real minimum gate`);
    }
    // ReportSection has no model field. The explicit harness + adapter unit tests
    // establish model replacement; the production logger records actual attempts
    // only, so this no-provider override must not invent any UsageLog rows.
    assert.equal(await db.usageLog.count({ where: { userId, reportId } }), 0, "synthetic generation records no fake provider attempts");
    const usage = (await json("/api/usage")).data;
    assert.equal(usage.quota.reports.used, 1);
    assert.equal(usage.total.tokens, 0, "synthetic demo generation consumes no provider tokens");
    assert.equal(usage.total.calls, 0, "synthetic override makes no real model calls");

    stage = "section edit and review";
    const section = report.sections[0];
    const marker = `합성 검토 편집 ${fixture.prefix}`;
    const editedContent = `${marker}\n실제 투자 판단이 아니며 자료 확인이 필요합니다.\n\n${section.content}`;
    await json(`/api/reports/${reportId}/sections`, "PATCH", { sectionId: section.id, content: editedContent, status: "APPROVED", expectedReviewVersion: await reportReviewVersion([section]) });
    const reviewed = (await json(`/api/reports/${reportId}`)).data;
    assert.equal(reviewed.sections.find((item: { id: string }) => item.id === section.id).status, "DRAFT", "editing always invalidates an existing approval");
    await json(`/api/reports/${reportId}`, "PATCH", { status: "FINAL", approveAllSections: true }, 409);
    await json(`/api/reports/${reportId}`, "PATCH", { status: "FINAL", approveAllSections: true, expectedReviewVersion: await reportReviewVersion(report.sections) }, 409);
    await json(`/api/reports/${reportId}`, "PATCH", { status: "FINAL", approveAllSections: true, expectedReviewVersion: await reportReviewVersion(reviewed.sections) });
    assert((await json(`/api/reports/${reportId}/decision`)).data.decision, "read-only review endpoint returns an assessment");

    stage = "standard DOCX/PPTX export";
    for (const ext of ["docx", "pptx"] as const) {
      const response = await request(`/api/reports/${reportId}/export/${ext}`, { method: "POST" });
      assert.equal(response.status, 200);
      assert(response.headers.get("content-disposition")?.includes(ext));
      const zip = await JSZip.loadAsync(await response.arrayBuffer());
      const paths = ext === "docx" ? ["word/document.xml"] : Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
      assert(paths.length > 0);
      const xml = (await Promise.all(paths.map(name => zip.file(name)!.async("text")))).join("\n");
      assert(xml.includes(marker), `${ext} includes the specific persisted edit, not just the original fixture name`);
      assert(xml.includes("데모 모드"), `${ext} retains the synthetic demo notice`);
    }

    stage = "fresh-session persistence";
    const { csrfToken } = await json("/api/auth/csrf");
    await request("/api/auth/signout", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, json: "true" }) });
    jar.clear();
    assert.equal((await request(`/api/reports/${reportId}`)).status, 401);
    await login();
    const reopened = (await json(`/api/reports/${reportId}`)).data;
    assert.equal(reopened.sections.find((item: { id: string }) => item.id === section.id)?.content, editedContent);
    assert(reopened.sections.every((item: { status: string }) => item.status === "APPROVED"));
    assert.equal(reopened.status, "EXPORTED");

    stage = "synthetic password-hash session revocation";
    const { default: bcrypt } = await import("bcryptjs");
    const changedPassword = `${randomUUID()}aA1!`;
    await db.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(changedPassword, 4) } });
    assert.equal((await request(`/api/reports/${reportId}`)).status, 401, "existing JWT loses report access after the synthetic user's password hash changes");
    assert.deepEqual(await json("/api/auth/session"), {}, "the revoked session no longer exposes a user");
    jar.clear();
    await login(changedPassword);
    assert.equal((await json(`/api/reports/${reportId}`)).data.id, reportId, "new credentials restore owned report access");
    console.log("Synthetic-only FREE source-route API registration/deal/upload/generation/edit/review/DOCX/PPTX/fresh-session persistence and password-hash session revocation passed. Actual reset email, AI quality and real Next browser UI remain untested.");
  } finally {
    try {
      const owned = userId ? await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true } }) : await db.user.findUnique({ where: { email: fixture.email }, select: { id: true, email: true } });
      if (owned) {
        assert.equal(owned.email, fixture.email);
        const docs = await db.document.findMany({ where: { deal: { userId: owned.id } }, select: { url: true } });
        for (const doc of docs) assert(doc.url.startsWith("private-local:"), "cleanup only removes owned synthetic local objects");
        const removals = await Promise.allSettled(docs.map(doc => deleteStoredFile(doc.url)));
        await db.$transaction([
          db.deal.deleteMany({ where: { userId: owned.id } }),
          db.user.delete({ where: { id: owned.id } }),
          db.rateLimit.deleteMany({ where: { key: { in: [`register:${testIp}`, `login:${testIp}`, `report-gen:${owned.id}`] } } }),
        ]);
        assert(removals.every(result => result.status === "fulfilled" && result.value), "synthetic upload cleanup succeeds");
      }
    } finally { await db.$disconnect(); }
  }
}

async function main() {
  if (process.argv.includes("--serve-source-api")) {
    const base = process.env.BASE_URL ?? "http://localhost:3100";
    assertE2ETarget(base);
    assertCleanE2EWorkspace();
    assertNoExternalE2ECredentials();
    assert.equal(process.env.STORAGE_MODE, "local");
    assert.equal(process.env.UPLOAD_DIR, "./.e2e-uploads");
    assert.equal(process.env.NODE_ENV, "test", "Synthetic source API may only run as a dedicated test process.");
    preflight();
    await startSyntheticSourceApi(base);
  } else if (process.argv.includes("--run-api")) await runApi();
  else {
    assert(process.argv.length === 2 || process.argv.includes("--preflight"), "Use --preflight or explicit --run-api --fresh-isolated-server.");
    preflight();
  }
}
main().catch(error => { console.error(`FREE journey stage: ${stage}`); console.error(error instanceof assert.AssertionError ? error.message : "Synthetic journey failed; credentials and response bodies are not logged."); process.exitCode = 1; });
