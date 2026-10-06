/** Route-level fake persistence/AI regression; does not connect to any service. */
/* eslint-disable @typescript-eslint/no-explicit-any -- Actual transpiled route and synthetic Prisma ports are intentionally dynamic in this offline harness. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { reportReviewVersion } from "../src/lib/report-review-version";
import { z } from "zod";

function route(file: string, modules: Record<string, unknown>): any {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Date, console, require: (name: string) => {
    assert(name in modules, `Unmocked import ${name}`);
    return modules[name];
  } }, { filename: file });
  return exports;
}

async function main() {
  let authorized = true, missing = false, conflict = false, reportConflict = false, cache = true;
  let status = "FINAL";
  let section = { id: "section", reportId: "report", sectionKey: "COMPANY_OVERVIEW", title: "Synthetic title", order: 1, content: "Old assertion 45억원", status: "APPROVED", updatedAt: new Date(1000) };
  let updatedAt = new Date(1000);
  let transactionCount = 0;
  const snapshots = () => ({ id: "report", status, updatedAt, sections: [{ ...section }], deal: { documents: [], investAmount: null, valuation: null }, evidenceCheck: { verdicts: [] } });
  const tx = {
    reportSection: {
      findFirst: async () => missing ? null : { ...section },
      findMany: async () => [{ ...section }],
      updateMany: async ({ where, data }: any) => {
        assert.equal(where.reportId, "report");
        assert.equal(where.updatedAt, section.updatedAt);
        assert.equal(where.status, section.status);
        if (conflict) return { count: 0 };
        section = { ...section, ...data };
        return { count: 1 };
      },
    },
    report: {
      findFirst: async () => authorized ? snapshots() : null,
      updateMany: async ({ where, data }: any) => {
        if (reportConflict && data.status === "FINAL") return { count: 0 };
        if (where.updatedAt && where.updatedAt.getTime() !== updatedAt.getTime()) return { count: 0 };
        if (where.status && (typeof where.status === "string" ? where.status !== status : !where.status.in.includes(status))) return { count: 0 };
        if (data.status) status = data.status;
        if (data.updatedAt) updatedAt = data.updatedAt;
        return { count: 1 };
      },
      update: async ({ data }: any) => { if (data.updatedAt) updatedAt = data.updatedAt; },
    },
    reportEvidenceCheck: {
      deleteMany: async () => { cache = false; return { count: 1 }; },
      upsert: async () => { cache = true; },
    },
  };
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) } },
    "next-auth": { getServerSession: async () => ({ user: { id: "fixture-user" } }) },
    "@/lib/auth": { authOptions: {} }, "zod": { z },
    "@/lib/report-review-version": { reportReviewVersion },
    "@/lib/report-generation-lease": { publicGenerationReport: (report: Record<string, unknown>) => Object.fromEntries(Object.entries(report).filter(([key]) => key !== "generationClaim" && key !== "generationLeaseExpiresAt")) },
    "@prisma/client": { SectionStatus: { DRAFT: "DRAFT", REVIEWED: "REVIEWED", APPROVED: "APPROVED" }, ReportStatus: { FINAL: "FINAL", EXPORTED: "EXPORTED", REVIEW: "REVIEW" } },
    "@/lib/team-access": { getUserTeamContext: async () => ({}), reportWriteWhere: () => ({}), reportReadWhere: () => ({}), permissionDeniedMessage: () => "Denied" },
    "@/lib/prisma": { prisma: { report: { findFirst: async () => authorized ? snapshots() : null }, $transaction: async (fn: (client: any) => unknown) => {
      transactionCount++;
      const before = { section: { ...section }, status, updatedAt, cache };
      try { return await fn(tx); } catch (error) { section = before.section; status = before.status; updatedAt = before.updatedAt; cache = before.cache; throw error; }
    } } },
  };
  const edit = route("src/app/api/reports/[id]/sections/route.ts", modules);
  const params = { params: { id: "report" } };
  const request = (data: unknown) => new Request("http://offline.invalid", { method: "PATCH", body: JSON.stringify({ sectionId: "section", ...data as object }) });
  const contentRequest = async (data: object) => request({ ...data, expectedReviewVersion: await reportReviewVersion([section]) });
  assert.equal((await edit.PATCH(request({ content: "Stale client overwrite" }), params)).status, 400,
    "content edits require the reviewed original version");
  assert.equal((await edit.PATCH(request({ content: "Stale client overwrite", expectedReviewVersion: "0".repeat(64) }), params)).status, 409);
  assert.equal(section.content, "Old assertion 45억원"); assert.equal(section.status, "APPROVED"); assert(cache);
  assert.equal((await edit.PATCH(request({ content: "Invalid version overwrite", expectedReviewVersion: "invalid" }), params)).status, 400);
  assert.equal((await edit.PATCH(request({ status: "APPROVED", expectedReviewVersion: "0".repeat(64) }), params)).status, 409,
    "approval of a stale reviewed body must be rejected");
  await edit.PATCH(await contentRequest({ content: section.content }), params);
  assert.equal(section.status, "APPROVED", "identical content preserves approval");
  assert.equal(status, "FINAL");
  assert(cache);
  assert.equal((await edit.PATCH(await contentRequest({ content: "Changed assertion 45억원", status: "APPROVED" }), params)).status, 200);
  assert.equal(section.status, "DRAFT", "content change overrides bundled approval request");
  assert.equal(status, "REVIEW");
  assert(!cache, "old numeric claim verdict is invalidated even if number stayed the same");
  assert.equal((await edit.PATCH(request({ status: "APPROVED" }), params)).status, 409, "legacy approvals require a reviewed version");
  await edit.PATCH(request({ status: "APPROVED", expectedReviewVersion: await reportReviewVersion([section]) }), params);
  assert.equal(section.status, "APPROVED", "explicit later approval preserved");
  status = "EXPORTED";
  await edit.PATCH(await contentRequest({ content: "Changed again" }), params);
  assert.equal(status, "REVIEW", "exported report requires review after editing");
  conflict = true;
  cache = true;
  assert.equal((await edit.PATCH(await contentRequest({ content: "Losing concurrent edit" }), params)).status, 409);
  assert.notEqual(section.content, "Losing concurrent edit");
  assert(cache, "losing edit must not delete valid cache");
  conflict = false;
  missing = true;
  assert.equal((await edit.PATCH(await contentRequest({ content: "Wrong report section" }), params)).status, 404);
  missing = false;
  authorized = false;
  const transactions = transactionCount;
  assert.equal((await edit.PATCH(await contentRequest({ content: "Unauthorized" }), params)).status, 403);
  assert.equal(transactionCount, transactions);
  authorized = true;

  const whole = route("src/app/api/reports/[id]/route.ts", modules);
  section.status = "DRAFT";
  status = "REVIEW";
  const reviewed = await reportReviewVersion([section]);
  section.content = "Synthetic newer content";
  assert.equal((await whole.PATCH(request({ approveAllSections: true, expectedReviewVersion: reviewed }), params)).status, 409);
  assert.equal(section.status, "DRAFT");
  assert.equal((await whole.PATCH(request({ approveAllSections: true }), params)).status, 409);
  assert.equal((await whole.PATCH(request({ approveAllSections: true, expectedReviewVersion: "malformed" }), params)).status, 400);
  assert.equal((await whole.PATCH(request({ status: "FINAL", expectedReviewVersion: await reportReviewVersion([section]) }), params)).status, 409,
    "FINAL without approval cannot skip draft sections");
  conflict = true;
  assert.equal((await whole.PATCH(request({ approveAllSections: true, expectedReviewVersion: await reportReviewVersion([section]) }), params)).status, 409);
  assert.equal(section.status, "DRAFT");
  conflict = false;
  reportConflict = true;
  assert.equal((await whole.PATCH(request({ status: "FINAL", approveAllSections: true, expectedReviewVersion: await reportReviewVersion([section]) }), params)).status, 409);
  assert.equal(section.status, "DRAFT", "report CAS conflict rolls back earlier section approvals");
  reportConflict = false;
  assert.equal((await whole.PATCH(request({ status: "FINAL", approveAllSections: true, expectedReviewVersion: await reportReviewVersion([section]) }), params)).status, 200);
  assert.equal(section.status, "APPROVED");
  assert.equal(status, "FINAL");
  assert.notEqual(await reportReviewVersion([section]), await reportReviewVersion([{ ...section, title: "Another title" }]));
  assert.notEqual(await reportReviewVersion([section]), await reportReviewVersion([{ ...section, order: 2 }]));
  assert.notEqual(await reportReviewVersion([section]), await reportReviewVersion([]));

  let mutateDuringAI: (() => void) | undefined;
  Object.assign(modules, {
    "@/lib/evidence": { traceReportEvidence: () => ({ claims: [{ confidence: "UNSUPPORTED" }] }) },
    "@/lib/evidence-ai": { verdictsToMap: () => new Map(), mergeVerdicts: () => [], verifyClaimsWithAI: async () => { mutateDuringAI?.(); return []; } },
    "@/lib/rate-limit": { checkRateLimit: async () => ({ allowed: true }), RATE_LIMITS: { evidenceVerify: { limit: 5, windowMs: 1000 } } },
  });
  const verify = route("src/app/api/reports/[id]/evidence/verify/route.ts", modules);
  cache = false;
  assert.equal((await verify.POST(request({}), params)).status, 200);
  assert(cache);
  cache = false;
  mutateDuringAI = () => { updatedAt = new Date(updatedAt.getTime() + 1); };
  assert.equal((await verify.POST(request({}), params)).status, 409);
  assert(!cache, "stale verifier cannot resurrect deleted cache");
  mutateDuringAI = () => { section.content = "Concurrent regeneration"; };
  assert.equal((await verify.POST(request({}), params)).status, 409);
  assert(!cache, "section content snapshot catches writers without report timestamp update");
  console.log("Offline edited approval/report review/cache invalidation/optimistic conflict/stale verifier regression passed.");
}
main().catch(() => { console.error("FAIL offline report edit/review regression"); process.exitCode = 1; });
