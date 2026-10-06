/** Actual quota module with synthetic count ports; no generated client, DB, env or provider. */
/* eslint-disable @typescript-eslint/no-explicit-any -- VM exports and injected Prisma count arguments are runtime-only mock boundaries. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { kstStartOfMonth } from "../src/lib/utils";

async function main() {
  const now = new Date("2024-01-31T15:00:00.000Z"); // February 1, 00:00 KST.
  const before = new Date(now.getTime() - 1);
  const nextMonth = new Date("2024-02-29T15:00:00.000Z");
  const owner = "synthetic-deal-owner", actor = "synthetic-team-actor";
  const ledger = [
    { userId: owner, createdAt: now, reportId: "synthetic-linked" },
    { userId: owner, createdAt: now, reportId: null }, // Deleted report/deal admission remains.
    { userId: owner, createdAt: before, reportId: null },
    { userId: actor, createdAt: now, reportId: "synthetic-other" },
    { userId: owner, createdAt: nextMonth, reportId: "synthetic-future" },
  ];
  let reports = [
    { owner, createdAt: now, linked: true },
    { owner, createdAt: now, linked: false },
    { owner, createdAt: before, linked: false },
    { owner: actor, createdAt: now, linked: false },
    { owner, createdAt: nextMonth, linked: false },
  ];
  let legacyReads = 0, ledgerReads = 0, templateReads = 0, failLedger = false;
  const client = {
    reportQuotaAdmission: { count: async ({ where }: any) => {
      ledgerReads++;
      assert.equal(where.userId, owner);
      assert.equal(where.createdAt.gte.toISOString(), now.toISOString());
      assert.equal(where.createdAt.lt.toISOString(), nextMonth.toISOString());
      if (failLedger) throw new Error("Synthetic unavailable new table diagnostic");
      return ledger.filter(item => item.userId === where.userId && item.createdAt >= where.createdAt.gte && item.createdAt < where.createdAt.lt).length;
    } },
    report: { count: async ({ where }: any) => {
      legacyReads++;
      assert.equal(where.deal.userId, owner);
      assert.equal(where.quotaAdmission.is, null, "linked reports cannot be counted twice");
      assert.equal(where.createdAt.gte.toISOString(), now.toISOString());
      assert.equal(where.createdAt.lt.toISOString(), nextMonth.toISOString());
      return reports.filter(item => item.owner === where.deal.userId && !item.linked && item.createdAt >= where.createdAt.gte && item.createdAt < where.createdAt.lt).length;
    } },
    template: { count: async ({ where }: any) => {
      templateReads++;
      assert.equal(where.userId, owner); assert.equal(where.createdAt.gte.toISOString(), now.toISOString());
      assert.equal("quotaAdmission" in where, false); return 1;
    } },
  };
  let planReads = 0;
  const modules: Record<string, unknown> = {
    "@/lib/prisma": { prisma: client },
    "@/lib/subscription": { getUserPlanKey: async (userId: string) => { assert.equal(userId, owner); planReads++; return "free"; } },
    "@/lib/utils": { kstStartOfMonth },
  };
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/quotas.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Date, require: (name: string) => { assert(name in modules, "Every import must be mocked"); return modules[name]; } });
  assert.equal(kstStartOfMonth(now).toISOString(), "2024-01-31T15:00:00.000Z");
  assert.equal(kstStartOfMonth(before).toISOString(), "2023-12-31T15:00:00.000Z");
  assert.equal(kstStartOfMonth(new Date("2024-02-29T15:00:00.000Z")).toISOString(), "2024-02-29T15:00:00.000Z");
  const result = await exports.checkQuota(owner, "report", undefined, client, now);
  assert.equal(planReads, 1); assert.equal(result.used, 3); assert.equal(result.limit, 5); assert.equal(result.allowed, true);
  assert.equal(ledgerReads, 1); assert.equal(legacyReads, 1); assert.equal(templateReads, 0);
  reports = reports.filter(item => !item.linked);
  assert.equal((await exports.checkQuota(owner, "report", "free", client, now)).used, 3, "linked report deletion cannot recover quota");
  ledger.push({ userId: owner, createdAt: now, reportId: null }, { userId: owner, createdAt: now, reportId: null });
  const exhausted = await exports.checkQuota(owner, "report", "free", client, now);
  assert.equal(exhausted.used, 5); assert.equal(exhausted.allowed, false); assert.equal(exhausted.limit, 5);
  assert.equal((await exports.checkQuota(owner, "report", "solo", client, now)).limit, 20);
  const beforeLedger = ledgerReads, beforeLegacy = legacyReads;
  const template = await exports.checkQuota(owner, "template", "free", client, now);
  assert.equal(template.used, 1); assert.equal(template.limit, 2); assert.equal(template.allowed, true);
  assert.equal(ledgerReads, beforeLedger); assert.equal(legacyReads, beforeLegacy); assert.equal(templateReads, 1);
  failLedger = true;
  await assert.rejects(exports.checkQuota(owner, "report", "free", client, now), "missing ledger table cannot revive legacy-only allowance");
  const missingDelegate = { report: client.report, template: client.template };
  await assert.rejects(exports.checkQuota(owner, "report", "free", missingDelegate, now));
  // No migration/backfill reconstructs deleted unlinked legacy history; preserve this limitation.
  failLedger = false; reports = reports.filter(item => item.owner !== owner);
  assert.equal((await exports.checkQuota(owner, "report", "free", client, now)).used, 4);
  console.log("PASS report quota ledger: synthetic billed owner, retained deleted admissions, legacy dedupe, unchanged templates, KST boundaries, missing-table fail closed");
}
main().catch(() => { console.error("FAIL synthetic report quota ledger regression"); process.exitCode = 1; });
