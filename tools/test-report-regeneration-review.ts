/** Synthetic persistence and AI only; never imports live Prisma, env or provider modules. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file: string, modules: Record<string, unknown>): any {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Date, setInterval: () => ({ unref() {} }), clearInterval() {}, process: { env: {} }, console: { log() {}, warn() {}, error() {} }, require: (name: string) => {
    assert(name in modules, "All dependencies must be mocked"); return modules[name];
  } }, { filename: file });
  return exports;
}

async function main() {
  let cache = true;
  let report = { id: "report", dealId: "deal", agentType: "AI", status: "FINAL", generationClaim: null as string | null, generationLeaseExpiresAt: null as Date | null, updatedAt: new Date(1000), deal: {
    id: "deal", companyName: "Synthetic", sector: "IT", documents: [],
  } };
  let section = { id: "section", reportId: "report", sectionKey: "OPINION_SUMMARY", title: "Synthetic", order: 1,
    content: "Synthetic old body", status: "APPROVED", updatedAt: new Date(1000) };
  let changeDuringAI = false;
  let failAI = false, providerCalls = 0, usageCalls = 0;
  let lockConflict = false;
  let sectionConflict = false;
  let noExistingSection = false;
  let mutateDuringQuality: (() => void) | undefined;
  let newClaimAfterRollback = false;
  let cleanupSectionsIncomplete = false;
  const writes: string[] = [];
  const matches = (where: any, item: any): boolean => Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as any[]).some(clause => matches(clause, item));
    if (key === "AND") return (value as any[]).every(clause => matches(clause, item));
    if (value instanceof Date) return item[key]?.getTime() === value.getTime();
    if (typeof value === "object" && value && "not" in value) return item[key] !== (value as any).not;
    if (typeof value === "object" && value && "lte" in value) return item[key] <= (value as any).lte;
    if (typeof value === "object" && value && "lt" in value) return item[key] < (value as any).lt;
    if (typeof value === "object" && value && "gte" in value) return item[key] >= (value as any).gte;
    if (typeof value === "object" && value && "in" in value) return (value as any).in.includes(item[key]);
    if (typeof value === "object" && value && "gt" in value) return item[key] > (value as any).gt;
    return item[key] === value;
  });
  const tx: any = {
    deal: { updateMany: async () => ({ count: 1 }) },
    report: {
      findFirst: async ({ where }: any) => matches(where, report) ? { ...report } : null, findUnique: async () => ({ ...report }),
      updateMany: async ({ where, data }: any) => {
        writes.push("report");
        if (lockConflict || !matches(where, report)) return { count: 0 };
        report = { ...report, ...data }; return { count: 1 };
      },
      update: async ({ data }: any) => { report = { ...report, ...data }; return { ...report }; },
    },
    reportSection: {
      findFirst: async () => ({ ...section }), findMany: async () => noExistingSection || cleanupSectionsIncomplete ? [] : [{ ...section }],
      create: async ({ data }: any) => {
        writes.push("create");
        section = { ...section, ...data, id: "section", updatedAt: new Date(3000) };
        return { ...section };
      },
      updateMany: async ({ where, data }: any) => {
        writes.push("section");
        if (sectionConflict || !matches(where, section)) return { count: 0 };
        section = { ...section, ...data }; return { count: 1 };
      },
    },
    reportEvidenceCheck: { deleteMany: async () => { writes.push("cache"); cache = false; return { count: 1 }; } },
  };
  const prisma = {
    ...tx,
    report: { ...tx.report, findFirst: async () => ({ ...report, sections: [{ ...section }] }) },
    $transaction: async (fn: (client: any) => Promise<unknown>) => {
      const before = { report: { ...report }, section: { ...section }, cache };
      try { return await fn(tx); } catch (error) {
        report = before.report; section = before.section; cache = before.cache;
        if (newClaimAfterRollback) {
          newClaimAfterRollback = false;
          report = { ...report, generationClaim: "worker-b", updatedAt: new Date(report.updatedAt.getTime() + 1000) };
        }
        throw error;
      }
    },
  };
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) } },
    "next-auth": { getServerSession: async () => ({ user: { id: "synthetic-user" } }) },
    "zod": require("zod"), "@/lib/auth": { authOptions: {} },
    "@prisma/client": { SectionKey: { OPINION_SUMMARY: "OPINION_SUMMARY" }, SectionStatus: { DRAFT: "DRAFT", APPROVED: "APPROVED" },
      ReportStatus: { FINAL: "FINAL", EXPORTED: "EXPORTED", REVIEW: "REVIEW", DRAFT: "DRAFT", PENDING: "PENDING", GENERATING: "GENERATING" } },
    "@/lib/prisma": { prisma },
    "node:crypto": require("node:crypto"),
    "@/agents": { getAgent: () => ({ generateSection: async () => {
      providerCalls++;
      if (failAI) throw new Error("Synthetic provider failure");
      if (changeDuringAI) { section = { ...section, content: "Synthetic concurrent edit", updatedAt: new Date(2000) }; }
      return { sectionKey: "OPINION_SUMMARY", content: "Synthetic generated body", modelUsed: "synthetic", tokensUsed: 0 };
    } }) },
    "@/lib/shared-facts": { extractSharedFacts: () => ({}), formatSharedFactsForPrompt: () => "" },
    "@/lib/report-quality": { evaluateSection: () => ({}), evaluateReport: () => {
      mutateDuringQuality?.();
      return { overallScore: 80, criticalIssues: [], suggestions: [] };
    } },
    "@/lib/quotas": { checkQuota: async () => ({ allowed: false }) },
    "@/lib/rate-limit": { checkRateLimit: async () => ({ allowed: true }), RATE_LIMITS: { sectionRegenerate: { limit: 10, windowMs: 1000 } } },
    "@/lib/section-context": { buildPriorSectionSummary: () => "" },
    "@/lib/claude": { resolveModelChainForTier: () => [], isPaidPlanKey: () => false, isAIConfigured: () => true, AIServiceUnavailableError: class extends Error {}, envDurationMs: (_: unknown, fallback: number) => fallback, REQUEST_TIMEOUT_MS: 1000, MODEL: "synthetic" },
    "@/lib/subscription": { getUserPlanKey: async () => "free" },
    "@/agents/base-agent": { resolveTaskTierForSection: () => "balanced" },
    "@/lib/usage-log": { recordAIAttempts() { usageCalls++; } },
    "@/lib/team-access": { getUserTeamContext: async () => ({}), reportWriteWhere: () => ({}), permissionDeniedMessage: () => "Denied" },
    "@/types": { SECTION_META: [{ key: "OPINION_SUMMARY", title: "Synthetic", order: 1 }] },
    "@/lib/generation-progress": { setCurrentSection() {} },
  };
  modules["@/lib/report-generation-lease"] = load("src/lib/report-generation-lease.ts", modules);
  const generation = load("src/lib/report-generation.ts", modules);
  const runAutomatic = async () => {
    report.status = "GENERATING";
    report.generationClaim = "worker-a";
    report.generationLeaseExpiresAt = new Date(Date.now() + 300000);
    await generation.generateSectionsAsync("report", report.deal, "AI", undefined, undefined, "worker-a");
  };
  modules["@/lib/report-generation"] = generation;
  const route = load("src/app/api/reports/[id]/sections/regenerate/route.ts", modules);
  const regenerate = () => route.POST(new Request("http://offline.invalid", { method: "POST", body: JSON.stringify({ sectionKey: "OPINION_SUMMARY" }) }), { params: { id: "report" } });
  assert.equal((await regenerate()).status, 200);
  assert.equal(report.status, "REVIEW", "regeneration invalidates completed report state");
  assert.equal(section.status, "DRAFT");
  assert.equal(cache, false, "regeneration clears stale evidence");
  assert.equal(writes[0], "report", "report lock precedes section write");
  const beforeDuplicate = providerCalls;
  report.generationClaim = "synthetic-live-section"; report.generationLeaseExpiresAt = new Date(Date.now() + 300000);
  assert.equal((await regenerate()).status, 409);
  assert.equal(providerCalls, beforeDuplicate, "losing section claim does not call a model");
  report.generationClaim = null; report.generationLeaseExpiresAt = null;
  const beforeFailure = section.content, beforeUsage = usageCalls;
  failAI = true; assert.equal((await regenerate()).status, 500); failAI = false;
  assert.equal(section.content, beforeFailure); assert.equal(report.generationClaim, null); assert.equal(report.generationLeaseExpiresAt, null);
  assert.equal(usageCalls, beforeUsage + 1, "failure attempts are recorded once before release");
  assert.equal((await regenerate()).status, 200, "released failed reservation can retry");
  report.status = "EXPORTED";
  section.content = "Synthetic exported content";
  assert.equal((await regenerate()).status, 200);
  assert.equal(report.status, "REVIEW");
  cache = true;
  changeDuringAI = true;
  assert.equal((await regenerate()).status, 409);
  assert.equal(section.content, "Synthetic concurrent edit", "AI cannot replace an intervening manual edit");
  assert(cache);
  changeDuringAI = false;
  lockConflict = true;
  assert.equal((await regenerate()).status, 409);
  lockConflict = false;
  sectionConflict = true;
  const beforeConflict = report.updatedAt;
  assert.equal((await regenerate()).status, 409);
  assert(report.updatedAt >= beforeConflict, "reservation revision survives a rolled-back content write");
  assert.equal(report.generationClaim, null, "failed content write releases only its own section reservation");
  sectionConflict = false;

  report.status = "GENERATING";
  section.status = "APPROVED";
  cache = true;
  await runAutomatic();
  assert.equal(section.status, "DRAFT", "automatic opinion quality-note content change requires approval again");
  assert.equal(cache, false);
  const afterNote = section.content;
  section.status = "APPROVED";
  cache = true;
  await runAutomatic();
  assert.equal(section.content, afterNote, "quality notes do not accumulate");
  assert.equal(section.status, "APPROVED", "unchanged quality-note body preserves approval");
  assert.equal(cache, true, "unchanged body does not invalidate evidence");
  noExistingSection = true;
  report.status = "GENERATING";
  cache = true;
  writes.length = 0;
  await runAutomatic();
  assert.equal(writes[0], "report", "new section creation first locks the report");
  assert(writes.includes("create"));
  assert.equal(cache, false, "new section invalidates evidence snapshot");
  assert.equal(section.status, "DRAFT");
  assert.equal(report.status, "DRAFT");
  noExistingSection = false;
  mutateDuringQuality = () => { section = { ...section, content: "Synthetic concurrent review" }; };
  report.status = "GENERATING";
  await runAutomatic();
  assert.equal(report.status, "DRAFT", "completed conflicting worker clears GENERATING");
  assert.equal(section.content, "Synthetic concurrent review");
  assert.equal((report as any).currentSectionTitle, null);

  mutateDuringQuality = () => {
    section = { ...section, content: "Synthetic concurrent review incomplete" };
    cleanupSectionsIncomplete = true;
  };
  report.status = "GENERATING";
  await runAutomatic();
  assert.equal(report.status, "PENDING", "incomplete conflicting worker allows resumption");
  cleanupSectionsIncomplete = false;

  mutateDuringQuality = () => { section = { ...section, content: "Synthetic new claimant content" }; };
  newClaimAfterRollback = true;
  report.status = "GENERATING";
  const beforeClaim = report.updatedAt.getTime();
  await runAutomatic();
  assert.equal(report.status, "GENERATING", "newer claimant status must survive cleanup");
  assert.equal(report.updatedAt.getTime(), beforeClaim + 1000);
  console.log("PASS offline regeneration/report-review/evidence/opinion-note regression");
}
main().catch(() => { console.error("FAIL offline regeneration review regression"); process.exitCode = 1; });
