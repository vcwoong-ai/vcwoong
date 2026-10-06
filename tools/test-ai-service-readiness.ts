/** Transpiles the actual AI module with synthetic environment and no network-capable client. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { AsyncLocalStorage } from "node:async_hooks";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

async function main() {
  const env: Record<string, string | undefined> = { NODE_ENV: "production" };
  let mockCalls = 0;
  class NoNetworkClient { constructor() { throw new Error("Network client forbidden in this test"); } }
  const imports: Record<string, unknown> = {
    "node:async_hooks": { AsyncLocalStorage }, openai: NoNetworkClient,
    "./mock-generator": { generateMockContent: () => { mockCalls++; return "Synthetic content"; } },
    "./brand": { BRAND: { name: "Synthetic fixture" } },
    "./ai-cost": { calculateEstimatedCost: () => 0 },
  };
  const exports: { generateText?: (messages: unknown[], options?: { validate?: (content: string) => { ok: boolean; reason?: string } }) => Promise<{ content: string; usedModel: string }> } = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/claude.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, process: { env }, setTimeout: (callback: () => void) => { callback(); return 0; },
    console: { log() {}, warn() {}, error() {} },
    require: (name: string) => { assert(name in imports, `Unexpected import: ${name}`); return imports[name]; },
  });
  assert(exports.generateText);
  await assert.rejects(() => exports.generateText!([{ role: "user", content: "fixture" }]), { name: "AIServiceUnavailableError" });
  assert.equal(mockCalls, 0, "Production must not create sample reports when AI is unavailable");
  env.NODE_ENV = "development";
  const result = await exports.generateText([{ role: "user", content: "fixture" }], { validate: () => ({ ok: true }) });
  assert.equal(result.usedModel, "demo-mock");
  assert.equal(result.content, "Synthetic content");
  await assert.rejects(() => exports.generateText!([], { validate: () => ({ ok: false, reason: "TOO_SHORT" }) }), { name: "QualityGateError" });

  env.NODE_ENV = "production";
  let reportWrites = 0;
  let authenticated = true;
  let authorized = true;
  const routes: Record<string, unknown> = {
    "node:crypto": { randomUUID: () => { throw new Error("Generation claim must not start"); } },
    "next/server": { NextRequest, NextResponse }, zod: { z },
    "@/lib/claude": { isAIConfigured: () => false, AIServiceUnavailableError: class extends Error { constructor() { super("AI service unavailable"); } } },
    "@vercel/functions": { waitUntil: () => { throw new Error("Generation must not start"); } },
    "next-auth": { getServerSession: async () => authenticated ? { user: { id: "fixture" } } : null },
    "@/lib/auth": { authOptions: {} },
    "@/lib/prisma": { prisma: { deal: { findFirst: async () => authorized ? { documents: [{ name: "fixture.txt", parsedText: "fixture" }] } : null },
      report: { updateMany: async () => { reportWrites++; throw new Error("Report write forbidden"); }, create: async () => { reportWrites++; throw new Error("Report write forbidden"); } } } },
    "@prisma/client": { AgentType: { GENERAL: "GENERAL" }, ReportStatus: { GENERATING: "GENERATING", PENDING: "PENDING" } },
    "@/agents": { inferAgentType: () => "GENERAL" },
    "@/lib/report-generation": { STALE_GENERATION_MS: 300000, generateSectionsAsync: () => { throw new Error("Generation must not start"); } },
    "@/lib/report-generation-lease": { GENERATION_LEASE_MS: 300000, activeGenerationWhere: () => { throw new Error("Lease query forbidden"); }, staleGenerationWhere: () => { throw new Error("Lease query forbidden"); }, publicGenerationReport: () => { throw new Error("No report should be created"); } },
    "@/lib/quotas": { checkQuota: async () => ({ allowed: true }) },
    "@/lib/rate-limit": { checkRateLimit: async () => ({ allowed: true }), RATE_LIMITS: { reportGeneration: { limit: 10, windowMs: 60000 } } },
    "@/lib/team-access": { getUserTeamContext: async () => ({}), dealWriteWhere: () => ({}), templateReadWhere: () => ({}), permissionDeniedMessage: () => "Denied" },
  };
  const routeExports: { POST?: (request: NextRequest, params: { params: { id: string } }) => Promise<NextResponse> } = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/app/api/deals/[id]/reports/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: routeExports, process: { env }, Date,
    console: { error() {}, warn() {} }, require: (name: string) => { assert(name in routes, `Unexpected route import: ${name}`); return routes[name]; },
  });
  assert(routeExports.POST);
  const request = () => new NextRequest("http://localhost:3111/api/deals/fixture/reports", { method: "POST", body: "{}" });
  assert.equal((await routeExports.POST(request(), { params: { id: "fixture" } })).status, 503);
  assert.equal(reportWrites, 0, "Unavailable production AI must not create or reset reports");
  authorized = false;
  assert.equal((await routeExports.POST(request(), { params: { id: "fixture" } })).status, 403);
  authenticated = false;
  assert.equal((await routeExports.POST(request(), { params: { id: "fixture" } })).status, 401);
  console.log("Offline production AI readiness and demo quality-gate regressions passed.");
}
main().catch(() => { console.error("Offline AI service readiness regression failed."); process.exitCode = 1; });
