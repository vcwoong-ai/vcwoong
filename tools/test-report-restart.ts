/** Real route handlers with mocked persistence/session/generation; no DB, keys or network. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

async function main() {
  const env = { NODE_ENV: "development" };
  let authorized = true;
  let claimAllowed = true;
  let transactionCount = 0;
  let generationCount = 0;
  let sectionCount = 10;
  const report = {
    id: "restart-fixture", status: "DRAFT", updatedAt: new Date(),
    generatedAt: new Date("2026-01-01T00:00:00Z"), currentSectionTitle: "Previous section",
    autoResumeCount: 4, agentType: "ICT",
    deal: { id: "fixture-deal", documents: [{ name: "fixture.txt", parsedText: "Offline fixture" }] },
    _count: { sections: sectionCount },
  } as Record<string, any>;
  const prisma = {
    report: { findFirst: async () => authorized ? { ...report, _count: { sections: sectionCount } } : null },
    $transaction: async (operation: (tx: any) => Promise<unknown>) => {
      transactionCount++;
      return operation({
        reportSection: { deleteMany: async () => { const count = sectionCount; sectionCount = 0; return { count }; } },
        report: { updateMany: async ({ data }: any) => { Object.assign(report, data); return { count: 1 }; } },
        reportEvidenceCheck: { deleteMany: async () => ({ count: 0 }) },
      });
    },
  };
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) } },
    "@vercel/functions": { waitUntil: () => undefined },
    "next-auth": { getServerSession: async () => ({ user: { id: "fixture-user" } }) },
    "zod": require("zod"),
    "@/lib/auth": { authOptions: {} },
    "@/lib/prisma": { prisma },
    "@prisma/client": { ReportStatus: { GENERATING: "GENERATING" } },
    "@/types": { SECTION_META: Array.from({ length: 10 }) },
    "@/lib/quotas": { checkQuota: async () => ({ allowed: true }) },
    "@/lib/report-generation-lease": {
      claimGeneration: async () => { if (!claimAllowed) return null; report.status = "GENERATING"; report.generationClaim = "claim-fixture"; report.generationLeaseExpiresAt = new Date(Date.now() + 300000); return report.generationClaim; },
      generationLeaseWhere: () => ({}),
    },
    "@/lib/claude": { isAIConfigured: () => false, AIServiceUnavailableError: class extends Error { constructor() { super("AI service unavailable"); } } },
    "@/lib/rate-limit": {
      checkRateLimit: async () => ({ allowed: true }),
      RATE_LIMITS: { reportGeneration: { limit: 10, windowMs: 3600000 } },
      isAutoResumeExemptFromRateLimit: () => false,
    },
    "@/lib/team-access": { getUserTeamContext: async () => ({}), reportReadWhere: () => ({}), reportWriteWhere: () => ({}), permissionDeniedMessage: () => "Denied" },
    "@/lib/report-generation": {
      STALE_GENERATION_MS: 300000,
      claimPendingGeneration: async () => { if (claimAllowed) report.status = "GENERATING"; return claimAllowed; },
      generateSectionsAsync: async (_id: string, _deal: unknown, _agent: string, _context: unknown, _user: string, token: string) => {
        assert.equal(token, "claim-fixture", "caller passes exactly its newly claimed token");
        generationCount++;
        assert.equal(sectionCount, 0, "sections removed before new generation starts");
        assert.equal(report.generatedAt, null, "old completion marker cleared before generation");
        assert.equal(report.currentSectionTitle, null);
        assert.equal(report.autoResumeCount, 0);
      },
    },
  };
  function loadRoute(relativePath: string): any {
    const source = fs.readFileSync(path.resolve(relativePath), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    vm.runInNewContext(compiled, {
      exports, Date, process: { env }, console: { log() {}, error() {} },
      require: (name: string) => { assert(name in modules, `unmocked import ${name}`); return modules[name]; },
    }, { filename: relativePath });
    return exports;
  }
  const run = loadRoute("src/app/api/reports/[id]/run/route.ts");
  const status = loadRoute("src/app/api/reports/[id]/status/route.ts");
  const request = () => new Request("http://offline.invalid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "restart" }) });
  const params = { params: { id: report.id } };
  assert.equal((await run.POST(request(), params)).status, 200);
  assert.equal(transactionCount, 1);
  assert.equal(generationCount, 1);
  assert.equal((await (await status.GET(request(), params)).json()).data.status, "generating");

  for (const state of ["GENERATING", "PENDING", "DRAFT", "REVIEW", "FINAL", "EXPORTED"]) {
    report.status = state;
    report.generatedAt = new Date();
    const data = (await (await status.GET(request(), params)).json()).data;
    assert.equal(data.status, state === "GENERATING" ? "generating" : state === "PENDING" ? "error" : "completed", `${state} with stale/current generatedAt`);
  }
  report.status = "DRAFT";
  report.generatedAt = null;
  assert.equal((await (await status.GET(request(), params)).json()).data.status, "error", "draft without completed generation stays incomplete");
  report.status = "GENERATING";
  report.generationLeaseExpiresAt = new Date(0);
  report.updatedAt = new Date();
  const expiredProgress = (await (await status.GET(request(), params)).json()).data;
  assert.equal(expiredProgress.status, "error", "expired lease is not kept alive by unrelated updatedAt");
  assert(!JSON.stringify(expiredProgress).includes("claim-fixture"), "progress does not disclose server claim");
  report.generationLeaseExpiresAt = new Date(Date.now() + 300000);
  report.updatedAt = new Date(0);
  assert.equal((await (await status.GET(request(), params)).json()).data.status, "generating", "live heartbeat lease wins over old updatedAt");
  report.status = "DRAFT";
  sectionCount = 10;
  claimAllowed = false;
  assert.equal((await run.POST(request(), params)).status, 409);
  assert.equal(sectionCount, 10, "losing claim must preserve sections");
  assert.equal(transactionCount, 2);
  authorized = false;
  assert.equal((await run.POST(request(), params)).status, 403);
  assert.equal(transactionCount, 2, "unauthorized restart must not mutate report");
  authorized = true;
  env.NODE_ENV = "production";
  assert.equal((await run.POST(request(), params)).status, 503);
  assert.equal(sectionCount, 10, "unconfigured production restart must preserve previous sections");
  assert.equal(transactionCount, 2);
  assert.equal(generationCount, 1);
  console.log("Offline report restart transaction/completion polling/claim/authorization regression passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
