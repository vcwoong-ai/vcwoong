/** Actual PE signoff modules with synthetic VM dependency ports; no DB/provider/browser. */
/* eslint-disable @typescript-eslint/no-explicit-any -- VM module exports and Prisma transaction spies are test-only dynamic ports. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { webcrypto, createHash } from "node:crypto";

let stage = "PE signoff request version";
const currentFingerprint = "a".repeat(64), staleFingerprint = "b".repeat(64);
const breakdown = { overall: currentFingerprint, financial: "financial", qoe: "qoe", lbo: "lbo", dd: "dd", evidence: "evidence", questions: "questions" };
const pack = { status: "ok", data: { pack: { fingerprintBreakdown: breakdown, decision: { questions: [] } } } };
const review = { id: "synthetic-review", maDealId: "synthetic-deal", reviewerId: "synthetic-reviewer", status: "REVIEWED" };
function load(file: string, dependencies: Record<string, any>) {
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Date, TextEncoder, Uint8Array, crypto: webcrypto, console: { error() {} }, require(name: string) { assert(name in dependencies, "unexpected synthetic dependency"); return dependencies[name]; } });
  return exports;
}
async function routeCases() {
  let writes = 0, fail = false;
  const api = load("src/app/api/ma-deals/[id]/ic-review-signoff/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "next-auth": { getServerSession: async () => ({ user: { id: "synthetic-reviewer" } }) },
    "@/lib/auth": { authOptions: {} }, "@/lib/team-access": { getUserTeamContext: async () => ({ teamId: null, role: "PARTNER" }) },
    "@/lib/prisma": { prisma: { user: { findUnique: async () => ({ name: "synthetic", email: null }) } } },
    "@/lib/pe/pe-committee-pack-loader": { loadPECommitteePackForDeal: async () => pack },
    "@/lib/pe/pe-ic-review-signoff-repository": { upsertOwnPEICReview: async (_actor: any, _id: string, input: any) => { if (fail) throw new Error("SYNTHETIC_PRIVATE_DETAIL"); if (input.expectedFingerprint !== currentFingerprint) return { status: "conflict" }; writes++; return { status: "ok", data: review, breakdown }; } },
    "@/lib/pe/pe-ic-review-signoff-types": { PE_IC_REVIEW_SIGNOFF_STATUSES: ["NOT_REVIEWED", "IN_REVIEW", "CHANGES_REQUESTED", "REVIEWED"], toPEICReviewView: (row: any) => row },
    "@/lib/pe/pe-ic-review-audit": { extractOpenQuestionSummary: () => ({ codes: [], count: 0, p0Count: 0 }) }, zod: { z },
  });
  for (const expectedFingerprint of [undefined, "", "invalid", "A".repeat(64), "a".repeat(63)]) {
    stage = "missing or invalid reviewed version rejected before writes";
    const result = await api.PATCH({ json: async () => ({ status: "REVIEWED", expectedFingerprint }) }, { params: { id: "synthetic-deal" } }); assert.equal(result.status, 400); assert.equal(writes, 0);
  }
  stage = "stale reviewed version returns conflict with no write";
  const stale = await api.PATCH({ json: async () => ({ status: "REVIEWED", expectedFingerprint: staleFingerprint }) }, { params: { id: "synthetic-deal" } }); assert.equal(stale.status, 409); assert.equal(writes, 0);
  stage = "same reviewed version succeeds through authoritative repository";
  const valid = await api.PATCH({ json: async () => ({ status: "REVIEWED", expectedFingerprint: currentFingerprint }) }, { params: { id: "synthetic-deal" } }); assert.equal(valid.status, 200); assert.equal(writes, 1);
  stage = "route unknown failure uses fixed private safe response"; fail = true;
  const failed = await api.PATCH({ json: async () => ({ status: "REVIEWED", expectedFingerprint: currentFingerprint }) }, { params: { id: "synthetic-deal" } }); assert.equal(failed.status, 500); assert.equal((await failed.text()).includes("SYNTHETIC_PRIVATE_DETAIL"), false); assert.equal(writes, 1);
}
async function repositoryCases() {
  let attempts = 0, committed = 0, writes = 0, failCode = "", canonical = currentFingerprint, failAudit = false;
  const tx: any = { user: { findUnique: async () => ({ role: "PARTNER", teamRole: "PARTNER", teamId: null, team: null }) }, mADeal: { findFirst: async () => ({ id: "synthetic-deal" }) }, pEICReview: { upsert: async (input: any) => { writes++; assert.equal(input.create.reviewedFingerprint, canonical); return review; } } };
  const repository = load("src/lib/pe/pe-ic-review-signoff-repository.ts", {
    "@/lib/prisma": { prisma: { $transaction: async (callback: any, options: any) => { attempts++; assert.equal(options.isolationLevel, "Serializable"); writes = 0; const result = await callback(tx); if (failCode) throw { code: failCode }; committed += writes; return result; } } },
    "./ma-team-access": { maDealReadWhere: () => ({}), maDealWriteWhere: () => ({}) },
    "./pe-ic-review-signoff": { collectSignoffTransitionIssues: () => [], collectReviewCommentIssues: () => [] },
    "./pe-committee-pack-loader": { loadPECommitteePackForDeal: async (_actor: any, _id: string, client: any) => { assert.equal(client, tx); return { status: "ok", data: { pack: { fingerprintBreakdown: { ...breakdown, overall: canonical }, decision: { questions: [] } } } }; } },
    "./pe-ic-review-audit": { extractOpenQuestionSummary: () => ({ codes: [], count: 0, p0Count: 0 }) },
    "./pe-ic-review-audit-repository": { isUniqueConstraintConflict: (error: any) => error.code === "P2002", createReviewSnapshotInTransaction: async (client: any, input: any) => { assert.equal(client, tx); assert.equal(input.fingerprint, canonical); writes++; return { id: "synthetic-snapshot" }; }, recordAuditEvent: async (client: any) => { assert.equal(client, tx); if (failAudit) throw new Error("SYNTHETIC_PRIVATE_DETAIL"); writes++; } },
  });
  const actor = { userId: "synthetic-reviewer", teamId: null, role: "PARTNER" };
  const submit = (expectedFingerprint: string | undefined) => repository.upsertOwnPEICReview(actor, "synthetic-deal", { status: "REVIEWED", expectedFingerprint });
  stage = "repository validates version before transaction";
  assert.equal((await submit(undefined)).status, "invalid"); assert.equal(attempts, 0);
  stage = "canonical stale version has no transaction writes";
  assert.equal((await submit(staleFingerprint)).status, "conflict"); assert.equal(committed, 0); assert.equal(writes, 0);
  stage = "same canonical version writes review snapshot audit together";
  assert.equal((await submit(currentFingerprint)).status, "ok"); assert.equal(committed, 3);
  for (const code of ["P2002", "P2034"]) {
    stage = "bounded serialization conflict retries with no committed writes"; failCode = code; const before: number = attempts;
    assert.equal((await submit(currentFingerprint)).status, "conflict"); assert.equal(attempts - before, 3); assert.equal(committed, 3);
  }
  failCode = ""; canonical = staleFingerprint;
  stage = "subsequent canonical revision remains fenced";
  assert.equal((await submit(currentFingerprint)).status, "conflict"); assert.equal(committed, 3);
  canonical = currentFingerprint; failAudit = true;
  stage = "audit failure rolls back synthetic transaction and hides raw detail";
  await assert.rejects(submit(currentFingerprint), (error: Error) => !error.message.includes("SYNTHETIC_PRIVATE_DETAIL")); assert.equal(committed, 3);
}
async function materialCases() {
  stage = "displayed WebCrypto material matches server canonical hash";
  const material = load("src/lib/pe/pe-committee-pack-material.ts", {});
  const server = load("src/lib/pe/pe-committee-pack-fingerprint.ts", { crypto: { createHash }, "./pe-committee-pack-material": material, "./pe-committee-pack": {} });
  const decision: any = { financial: { amount: 0 }, qoe: null, lbo: null, dd: { title: "합성 검토 자료" }, evidence: [], questions: [] };
  const requests = [{ id: "b", status: "OPEN", reviewItemSourceId: "source", linkedDocumentId: null }, { id: "a", status: "CLOSED", reviewItemSourceId: "source", linkedDocumentId: null }];
  const first = await material.fingerprintDisplayedCommitteePack(decision, requests);
  assert.equal(first, server.computeCommitteePackFingerprint(decision, requests));
  assert.equal(first, await material.fingerprintDisplayedCommitteePack(decision, [...requests].reverse()));
  assert.notEqual(first, await material.fingerprintDisplayedCommitteePack({ ...decision, dd: { title: "합성 수정 자료" } }, requests));
  assert.notEqual(first, await material.fingerprintDisplayedCommitteePack(decision, [{ ...requests[0], status: "CLOSED" }, requests[1]]));
  assert.equal(await material.fingerprintDisplayedCommitteePack(decision, []), server.computeCommitteePackFingerprint(decision, []));
}
async function main() { await routeCases(); await repositoryCases(); await materialCases(); console.log("PASS offline PE signoff version guards, Serializable transaction ports, retry fencing and displayed/server hash parity; no DB/provider/browser"); }
main().catch(error => { const scalar = (value: unknown) => typeof value === "number" || typeof value === "boolean" ? value : "WITHHELD"; console.error(JSON.stringify({ result: "PE_SIGNOFF_VERSION_FAILED", stage, diagnostic: error instanceof assert.AssertionError ? { actual: scalar(error.actual), expected: scalar(error.expected) } : "DETAILS_WITHHELD" })); process.exitCode = 1; });
