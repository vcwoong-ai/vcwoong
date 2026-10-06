/** Actual route in VM, synthetic auth/storage/AI only; no environment/provider/DB access. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

async function main() {
  let authenticated = true, configured = true, authorized = true, allowRate = true;
  let claimAllowed = true, aiFails = false, saveConflict = false, releaseFails = false;
  let claims = 0, aiCalls = 0, saves = 0, releases = 0, reads = 0, usageRecords = 0;
  const sequence: string[] = [];
  const token = "synthetic-worker-private-token";
  const before = new Date(1000), after = new Date(2000);
  const original = { id: "section-synthetic", reportId: "report-synthetic", sectionKey: "OPINION_SUMMARY",
    title: "Synthetic", order: 1, content: "Synthetic original body", status: "APPROVED", updatedAt: before };
  let report = { id: "report-synthetic", status: "FINAL", agentType: "AI", updatedAt: before,
    generationClaim: null, generationLeaseExpiresAt: null, deal: { id: "deal-synthetic", companyName: "Synthetic",
      sector: "IT", investRound: null, investAmount: null, valuation: null, documents: [] }, sections: [original] };
  class GeneratedSectionConflict extends Error {}
  class GenerationLeaseLost extends Error {}
  class AIServiceUnavailableError extends Error {}
  const tx = {};
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "next-auth": { getServerSession: async () => authenticated ? { user: { id: "user-synthetic" } } : null },
    "zod": require("zod"), "@prisma/client": { SectionKey: { OPINION_SUMMARY: "OPINION_SUMMARY" } },
    "@/lib/auth": { authOptions: {} },
    "@/lib/prisma": { prisma: { report: { findFirst: async ({ where }: any) => {
      reads++; assert.equal(where.ownerId, "user-synthetic"); return authorized ? { ...report } : null;
    } }, $transaction: async (fn: (client: unknown) => unknown) => fn(tx) } },
    "@/lib/team-access": { getUserTeamContext: async () => ({ teamId: null, role: "ANALYST" }),
      reportWriteWhere: (userId: string) => ({ ownerId: userId }), permissionDeniedMessage: () => "Denied" },
    "@/lib/rate-limit": { checkRateLimit: async () => ({ allowed: allowRate, retryAfterSec: 2 }),
      RATE_LIMITS: { sectionRegenerate: { limit: 20, windowMs: 60000 } } },
    "@/lib/claude": { isAIConfigured: () => configured, AIServiceUnavailableError,
      resolveModelChainForTier: () => [], isPaidPlanKey: () => false },
    "@/lib/subscription": { getUserPlanKey: async () => "free" },
    "@/agents/base-agent": { resolveTaskTierForSection: () => "balanced" },
    "@/lib/shared-facts": { extractSharedFacts: () => ({}), formatSharedFactsForPrompt: () => "" },
    "@/lib/section-context": { buildPriorSectionSummary: () => "" },
    "@/lib/report-quality": { evaluateSection: () => ({ score: 80 }) },
    "@/lib/usage-log": { recordAIAttempts() { usageRecords++; } },
    "@/lib/report-generation-lease": { GenerationLeaseLost,
      claimSectionGeneration: async (client: unknown, id: string, staleMs: number, expected: Date) => {
        claims++; sequence.push("claim"); assert.equal(client, tx); assert.equal(id, report.id);
        assert(staleMs > 0); assert.equal(expected.getTime(), before.getTime());
        return claimAllowed ? { token, updatedAt: after } : null;
      },
      releaseSectionGeneration: async (id: string, supplied: string) => {
        releases++; sequence.push("release"); assert.equal(id, report.id); assert.equal(supplied, token);
        if (releaseFails) throw new Error("Synthetic private release diagnostic");
      },
    },
    "@/agents": { getAgent: () => ({ generateSection: async () => {
      aiCalls++; sequence.push("ai"); assert(claims > 0, "claim must precede paid AI");
      if (aiFails) throw new Error("Synthetic private provider diagnostic");
      return { sectionKey: "OPINION_SUMMARY", content: "Synthetic generated body", modelUsed: "synthetic" };
    } }) },
    "@/lib/report-generation": { STALE_GENERATION_MS: 270000, GeneratedSectionConflict,
      saveGeneratedSection: async (id: string, expected: any, content: string, stamp: Date, fullToken: unknown, sectionToken: string) => {
        saves++; sequence.push("save"); assert.equal(id, report.id); assert.equal(expected.content, original.content);
        assert.equal(expected.updatedAt.getTime(), before.getTime()); assert.equal(stamp.getTime(), after.getTime());
        assert.equal(fullToken, undefined); assert.equal(sectionToken, token);
        if (saveConflict) throw new GeneratedSectionConflict();
        return { ...original, content, status: "DRAFT", updatedAt: after };
      },
    },
  };
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/app/api/reports/[id]/sections/regenerate/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Date, process: { env: { NODE_ENV: "production" } }, console: { error() {}, warn() {}, log() {} }, require: (name: string) => {
    assert(name in modules, "Every import must be mocked"); return modules[name];
  } });
  const call = (body: string = JSON.stringify({ sectionKey: "OPINION_SUMMARY" })) => exports.POST(
    new Request("https://offline.invalid/api/reports/report-synthetic/sections/regenerate", { method: "POST", body }),
    { params: { id: report.id } });
  authenticated = false; assert.equal((await call()).status, 401); assert.equal(reads, 0);
  authenticated = true; authorized = false; assert.equal((await call()).status, 403);
  authorized = true;
  assert.equal((await call(JSON.stringify({ sectionKey: "NOT_A_SECTION" }))).status, 400);
  assert.equal((await call("invalid JSON")).status, 400);
  assert.equal(claims, 0); assert.equal(aiCalls, 0);
  configured = false; assert.equal((await call()).status, 503); assert.equal(claims, 0); assert.equal(aiCalls, 0);
  configured = true;
  report.sections = []; assert.equal((await call()).status, 404); assert.equal(claims, 0);
  report.sections = [original]; allowRate = false; assert.equal((await call()).status, 429); assert.equal(claims, 0);
  allowRate = true; report.status = "GENERATING"; assert.equal((await call()).status, 409); assert.equal(aiCalls, 0);
  report.status = "FINAL"; claimAllowed = false; assert.equal((await call()).status, 409);
  assert.equal(aiCalls, 0); assert.equal(releases, 0, "loser cannot release winner's claim"); assert.equal(usageRecords, 0);
  claimAllowed = true; sequence.length = 0;
  const success = await call(); assert.equal(success.status, 200);
  assert.deepEqual(sequence, ["claim", "ai", "save", "release"]);
  const rendered = await success.text(); assert(!rendered.includes(token)); assert(!rendered.includes("generationClaim"));
  assert.equal(saves, 1); assert.equal(releases, 1);
  saveConflict = true; const conflict = await call(); assert.equal(conflict.status, 409); assert.equal(releases, 2);
  assert(!(await conflict.text()).includes(token)); saveConflict = false;
  aiFails = true; const failure = await call(); assert.equal(failure.status, 500); assert.equal(releases, 3);
  assert(!(await failure.text()).includes("Synthetic private provider diagnostic"));
  assert.equal(usageRecords, 3, "success, failed CAS and provider failure record attempts once each");
  aiFails = false; releaseFails = true; assert.equal((await call()).status, 200, "release failure cannot replace saved response");
  console.log("PASS section regeneration guards: synthetic auth/readiness/body/claim-before-AI/postclaim CAS/finally release/private token");
}
main().catch(() => { console.error("FAIL synthetic section regeneration guards"); process.exitCode = 1; });
