/** Actual export lifecycle with synthetic transaction ports only; no DB/provider. */
/* eslint-disable @typescript-eslint/no-explicit-any -- Dynamic VM modules and fake Prisma transaction ports are test-only. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { webcrypto, createHash } from "node:crypto";
let stage = "export captured version";
function load(file: string, imports: Record<string, unknown>) {
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Date, TextEncoder, Uint8Array, crypto: webcrypto, require: (name: string) => { assert(name in imports, "unexpected export-state port"); return imports[name]; } });
  return exports;
}
async function main() {
  const version = load("src/lib/report-review-version.ts", {});
  const section = { id: "synthetic-section", sectionKey: "overview", title: "합성 개요", content: "합성 A", order: 0, status: "APPROVED" };
  const row: any = { id: "fixture", status: "FINAL", updatedAt: new Date(1000), sections: [{ ...section }], deal: { companyName: "합성회사" } };
  let attempts = 0, updates = 0, retryCode = "", updateWhere: any, initialProjection: unknown;
  const tx = { report: {
    findUnique: async (query: any) => { assert.equal(query.include, initialProjection); return { ...row, sections: row.sections.map((s: any) => ({ ...s })) }; },
    updateMany: async ({ where, data }: any) => { updateWhere = where; if (row.status !== where.status || row.updatedAt.getTime() !== where.updatedAt.getTime() || !row.sections.length || row.sections.some((s: any) => s.status !== "APPROVED")) return { count: 0 }; updates++; row.status = data.status; return { count: 1 }; },
  } };
  const common = load("src/lib/report-export-common.ts", {
    "@/lib/decision-context": { REPORT_MEETING_REFERENCE_INCLUDE: {} },
    "next/server": {}, "@/lib/plans": {}, "@/lib/subscription": {}, "@/lib/team-access": { getUserTeamContext: async () => ({ teamId: null }), reportReadWhere: () => ({}) }, "@/lib/vc-decision-loader": { computeReportDecision: () => ({ decision: {}, sectionRefs: [] }) }, "@/lib/report-presentation": { buildReportPresentation: () => ({ sections: [], charts: [] }) }, "@/lib/report-review-version": version, "node:crypto": { createHash },
    "@prisma/client": { ReportStatus: { FINAL: "FINAL", EXPORTED: "EXPORTED" } },
    "@/lib/prisma": { prisma: { report: { findFirst: async (query: any) => { initialProjection = query.include; return row; } }, $transaction: async (callback: any, options: any) => {
      attempts++; assert.equal(options.isolationLevel, "Serializable"); const status = row.status, count = updates; const result = await callback(tx);
      if (retryCode) { row.status = status; updates = count; throw { code: retryCode, message: "SYNTHETIC_PRIVATE_DETAIL" }; }
      return result;
    } } },
  });
  const capture = async () => ({ eligible: row.status === "FINAL" && row.sections.length > 0 && row.sections.every((s: any) => s.status === "APPROVED"), updatedAt: new Date(row.updatedAt), contentVersion: await version.reportReviewVersion(row.sections), artifactVersion: createHash("sha256").update(JSON.stringify(["dealmind-export-input-v1", row])).digest("hex") });
  const initial = await capture();
  const loaded = await common.loadReportForExport("synthetic-owner", row.id);
  assert.equal(loaded.exportState.contentVersion, initial.contentVersion); assert.equal(loaded.exportState.artifactVersion, initial.artifactVersion); assert.equal(loaded.exportState.eligible, true);
  stage = "export A cannot finalize edited reapproved B"; row.sections[0].content = "합성 B"; row.updatedAt = new Date(2000);
  await common.markExported(row.id, initial); assert.equal(row.status, "FINAL"); assert.equal(updates, 0);
  stage = "same timestamp different body fenced"; row.updatedAt = new Date(1000); await common.markExported(row.id, initial); assert.equal(updates, 0);
  row.sections = [{ ...section }]; row.updatedAt = new Date(1000);
  stage = "memo input changes without report timestamp preserve final";
  row.icQuestions = { questions: [{ question: "합성 변경" }] }; await common.markExported(row.id, initial); assert.equal(updates, 0); delete row.icQuestions;
  stage = "approved meeting revision and research result changes fence stale export";
  row.deal.meetings = [{ id: "meeting-fixture", version: 2, minutes: "new reviewed statement" }];
  assert.equal(await common.markExported(row.id, initial), false); assert.equal(updates, 0); delete row.deal.meetings;
  row.deepDive = { claims: [{ claim: "new research" }] };
  assert.equal(await common.markExported(row.id, initial), false); assert.equal(updates, 0); delete row.deepDive;
  stage = "same reviewed body transitions once"; await common.markExported(row.id, initial); assert.equal(row.status, "EXPORTED"); assert.equal(updates, 1);
  await common.markExported(row.id, initial); assert.equal(updates, 1); assert.equal(updateWhere.status, "FINAL"); assert.equal(updateWhere.sections.every.status, "APPROVED"); assert.equal(updateWhere.updatedAt.getTime(), initial.updatedAt.getTime());
  for (const status of ["DRAFT", "REVIEW", "PENDING", "GENERATING", "FAILED"]) { stage = "nonfinal state preserved"; row.status = status; await common.markExported(row.id, await capture()); assert.equal(row.status, status); assert.equal(updates, 1); }
  row.status = "FINAL";
  for (const sections of [[], [{ ...section, status: "DRAFT" }]]) { stage = "empty unapproved final preserved"; row.sections = sections; await common.markExported(row.id, await capture()); assert.equal(row.status, "FINAL"); assert.equal(updates, 1); }
  row.sections = [{ ...section }]; stage = "missing captured version failclosed"; const beforeMissing = attempts;
  await common.markExported(row.id); assert.equal(attempts, beforeMissing); assert.equal(row.status, "FINAL");
  stage = "serialization conflict skips completion without retry or committed writes"; retryCode = "P2034"; const beforeConflict = attempts; assert.equal(await common.markExported(row.id, initial), false); assert.equal(attempts - beforeConflict, 1); assert.equal(row.status, "FINAL"); assert.equal(updates, 1);
  stage = "unexpected transaction failure hides raw detail"; retryCode = "P2002"; await assert.rejects(common.markExported(row.id, initial), (error: Error) => !error.message.includes("SYNTHETIC_PRIVATE_DETAIL")); assert.equal(row.status, "FINAL"); assert.equal(updates, 1);
  const { isReportFinalized } = load("src/lib/report-completion.ts", {});
  for (const status of ["DRAFT", "REVIEW", "PENDING", "GENERATING", "FINAL", "EXPORTED"]) { assert.equal(isReportFinalized(status, [{ status: "APPROVED" }]), status === "FINAL" || status === "EXPORTED"); assert.equal(isReportFinalized(status, [{ status: "APPROVED" }, { status: "DRAFT" }]), false); assert.equal(isReportFinalized(status, []), false); }
  for (const file of ["src/components/reports/report-editor.tsx", "src/app/reports/page.tsx"]) assert(fs.readFileSync(file, "utf8").includes("isReportFinalized("));
  console.log("PASS actual export-state VM captured body/date/artifact fencing, completion, Serializable conflict skip and safe failure; no DB/provider");
}
main().catch(() => { console.error(`REPORT_EXPORT_STATE_FAILED at ${stage}; exception details withheld.`); process.exitCode = 1; });
