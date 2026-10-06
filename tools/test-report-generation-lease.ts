/** Durable lease + real generator regression with fake persistence/provider barrier. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
type Row = Record<string, any>;
function load(file: string, modules: Row): any {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, Date, process: { env: {} }, setInterval: () => ({ unref() {} }), clearInterval() {}, console: { log() {}, warn() {}, error() {} },
    require: (name: string) => { assert(name in modules, `Unmocked dependency ${name}`); return modules[name]; },
  }, { filename: file });
  return exports;
}
async function main() {
  let report: Row = { id: "report", dealId: "deal", status: "PENDING", generationClaim: null, generationLeaseExpiresAt: null, updatedAt: new Date(), generatedAt: null };
  let sections: Row[] = [], cache = true, providerCalls = 0, usageCalls = 0;
  let pause = false, rejectPaused = false;
  let release: (() => void) | undefined, entered: (() => void) | undefined;
  const match = (row: Row, where: Row): boolean => Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((clause: Row) => match(row, clause));
    if (key === "AND") return value.every((clause: Row) => match(row, clause));
    if (value instanceof Date) return row[key]?.getTime() === value.getTime();
    if (value && typeof value === "object") {
      if ("not" in value) return row[key] !== value.not;
      if ("gt" in value) return row[key] > value.gt;
      if ("gte" in value) return row[key] >= value.gte;
      if ("lte" in value) return row[key] <= value.lte;
      if ("lt" in value) return row[key] < value.lt;
    }
    return row[key] === value;
  });
  const tx = {
    deal: { updateMany: async () => ({ count: 1 }) },
    report: {
      findFirst: async ({ where }: Row) => match(report, where) ? { ...report } : null,
      updateMany: async ({ where, data }: Row) => {
        if (!match(report, where)) return { count: 0 };
        report = { ...report, ...data, updatedAt: data.updatedAt ?? new Date() }; return { count: 1 };
      },
    },
    reportSection: {
      findMany: async () => sections.map((section) => ({ ...section })),
      findFirst: async ({ where }: Row) => { const row = sections.find((section) => match(section, where)); return row ? { ...row } : null; },
      create: async ({ data }: Row) => { const row = { id: "section", ...data, updatedAt: new Date() }; sections.push(row); return { ...row }; },
      updateMany: async ({ where, data }: Row) => {
        const rows = sections.filter((section) => match(section, where)); rows.forEach((section) => Object.assign(section, data, { updatedAt: new Date() })); return { count: rows.length };
      },
    },
    reportEvidenceCheck: { deleteMany: async () => { cache = false; return { count: 1 }; } },
  };
  let queue = Promise.resolve();
  const prisma = { ...tx, $transaction: <T>(fn: (client: typeof tx) => Promise<T>) => {
    const job = queue.then(async () => {
      const before = { report: { ...report }, sections: sections.map((section) => ({ ...section })), cache };
      try { return await fn(tx); } catch (error) { report = before.report; sections = before.sections; cache = before.cache; throw error; }
    });
    queue = job.then(() => undefined, () => undefined); return job;
  } };
  const modules: Row = {
    "node:crypto": require("node:crypto"), "@/lib/prisma": { prisma },
    "@prisma/client": { ReportStatus: { PENDING: "PENDING", GENERATING: "GENERATING", DRAFT: "DRAFT", FINAL: "FINAL", EXPORTED: "EXPORTED", REVIEW: "REVIEW" }, SectionStatus: { DRAFT: "DRAFT" } },
    "@/types": { SECTION_META: [{ key: "OPINION_SUMMARY", title: "Opinion", order: 1 }] },
    "@/agents": { getAgent: () => ({ generateSection: async () => {
      providerCalls++;
      const old = pause;
      if (old) { pause = false; entered?.(); await new Promise<void>((resolve) => { release = resolve; }); if (rejectPaused) throw new Error("Synthetic provider failure"); }
      return { sectionKey: "OPINION_SUMMARY", content: old ? "OLD worker text" : "NEW worker text", tokensUsed: 1 };
    } }) },
    "@/lib/shared-facts": { extractSharedFacts: () => ({}), formatSharedFactsForPrompt: () => "" },
    "@/lib/report-quality": { evaluateReport: () => ({ overallScore: 80, criticalIssues: [], suggestions: [] }) },
    "@/lib/claude": { envDurationMs: (_: unknown, fallback: number) => fallback, REQUEST_TIMEOUT_MS: 1000, MODEL: "fixture", isPaidPlanKey: () => false, resolveModelChainForTier: () => [] },
    "@/lib/subscription": { getUserPlanKey: async () => "free" },
    "@/agents/base-agent": { resolveTaskTierForSection: () => "balanced" },
    "@/lib/usage-log": { recordAIAttempts() { usageCalls++; } },
  };
  const lease = load("src/lib/report-generation-lease.ts", modules); modules["@/lib/report-generation-lease"] = lease;
  const generation = load("src/lib/report-generation.ts", modules);
  const tokens = await Promise.all([generation.claimPendingGeneration("report"), generation.claimPendingGeneration("report")]);
  assert.equal(tokens.filter(Boolean).length, 1, "concurrent claims have one winner");
  const original = tokens.find(Boolean)!;
  report.updatedAt = new Date(0);
  assert.equal(await generation.claimPendingGeneration("report"), null, "live lease wins over old unrelated updatedAt");
  report.generationLeaseExpiresAt = new Date(0); report.updatedAt = new Date();
  const replacement = await generation.claimPendingGeneration("report");
  assert(replacement && replacement !== original, "expired lease is reclaimable despite fresh unrelated updatedAt");
  await assert.rejects(lease.renewGenerationLease("report", original), /lease lost/);
  await lease.renewGenerationLease("report", replacement, "Current owner");
  assert.equal(report.currentSectionTitle, "Current owner");
  await assert.rejects(lease.renewGenerationLease("report", original, "Stale progress"), /lease lost/);
  assert.equal(report.currentSectionTitle, "Current owner");
  const publicReport = lease.publicGenerationReport(report);
  assert(!("generationClaim" in publicReport) && !("generationLeaseExpiresAt" in publicReport));
  await generation.generateSectionsAsync("report", { id: "deal", documents: [] }, "AI");
  assert.equal(providerCalls, 0, "missing claim cannot call provider");

  report = { ...report, status: "FINAL", generationClaim: null, generationLeaseExpiresAt: null };
  const sectionClaims = await Promise.all([0, 1].map(() => prisma.$transaction(client => lease.claimSectionGeneration(client, "report", 300000, report.updatedAt))));
  assert.equal(sectionClaims.filter(Boolean).length, 1, "report-wide section claim has one winner");
  const sectionClaim = sectionClaims.find(Boolean)! as { token: string; updatedAt: Date };
  assert.equal(report.status, "FINAL", "section reservation preserves review status");
  assert.equal(await generation.claimPendingGeneration("report"), null, "whole report cannot claim a live section lease");
  assert.equal(await lease.releaseSectionGeneration("report", "synthetic-wrong-token"), false);
  const revision = report.updatedAt;
  assert.equal(await lease.releaseSectionGeneration("report", sectionClaim.token), true);
  assert.equal(report.updatedAt, revision, "release preserves content revision");
  assert.equal(report.generationClaim, null);

  for (const failOld of [false, true]) {
    sections = []; cache = true; report = { ...report, status: "PENDING", generationClaim: null, generationLeaseExpiresAt: null, generatedAt: null };
    const old = await generation.claimPendingGeneration("report");
    pause = true; rejectPaused = failOld;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const pending = generation.generateSectionsAsync("report", { id: "deal", documents: [] }, "AI", undefined, "fixture-user", old);
    await ready;
    report.generationLeaseExpiresAt = new Date(0);
    const fresh = await generation.claimPendingGeneration("report"); assert(fresh);
    await generation.generateSectionsAsync("report", { id: "deal", documents: [] }, "AI", undefined, "fixture-user", fresh);
    assert.equal(report.status, "DRAFT"); assert(report.generatedAt);
    assert.equal(report.generationClaim, null); assert.equal(report.generationLeaseExpiresAt, null);
    assert(sections[0].content.includes("NEW") && !sections[0].content.includes("OLD"));
    cache = true;
    const afterNew = JSON.stringify({ report, sections, cache });
    release!(); await pending;
    assert.equal(JSON.stringify({ report, sections, cache }), afterNew, "old success/failure cannot change new sections/opinion/status/cache");
  }
  assert.equal(usageCalls, 4, "stale provider attempts are still counted, without charging a new report");
  assert.equal(generation.selectResumableCandidates([{ id: "complete-unfinalized", completedSections: 10, autoResumeCount: 0, generatedAt: null }], { totalSections: 10, maxAutoResumeAttempts: 30 }).length, 1);
  assert.equal(generation.selectResumableCandidates([{ id: "complete", completedSections: 10, autoResumeCount: 0, generatedAt: new Date() }], { totalSections: 10, maxAutoResumeAttempts: 30 }).length, 0);
  console.log("PASS offline generation lease claim/heartbeat/progress/expired recovery/stale success-failure/opinion-cache fence/usage/finalization/privacy regression");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
