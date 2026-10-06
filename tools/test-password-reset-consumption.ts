/** Actual reset modules with synthetic transaction ports; no DB/email/provider. */
/* eslint-disable @typescript-eslint/no-explicit-any -- Transpiled module ports are deliberately dynamic in this offline harness. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
import { z } from "zod";
let stage = "concurrent token consumption";
const email = "synthetic-reset@example.invalid", token = "synthetic-reset-token-only", sentinel = "SYNTHETIC_PRIVATE_DETAIL";
function load(file: string, imports: Record<string, any>, logs: unknown[][] = []) {
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
    { exports, Date, Buffer, console: { error: (...args: unknown[]) => logs.push(args) }, require(name: string) { assert(name in imports, "unexpected reset port"); return imports[name]; } });
  return exports;
}
async function main() {
  const makeRecord = (raw = token, expires = Date.now() + 60000) => ({ identifier: `password-reset:${email}`, token: crypto.createHash("sha256").update(raw).digest("hex"), expires: new Date(expires) });
  let records = [makeRecord()], userWrites = 0, accountMissing = false, userFailure = false, countZero = false;
  let queue: Promise<unknown> = Promise.resolve();
  const match = (record: any, where: any): boolean => Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === "AND") return value.every((part: any) => match(record, part));
    if (value instanceof Date) return record[key].getTime() === value.getTime();
    if (value && typeof value === "object") return Object.entries(value).every(([operator, expected]: [string, any]) => operator === "gt" ? record[key].getTime() > expected.getTime() : operator === "lte" ? record[key].getTime() <= expected.getTime() : operator === "equals" ? record[key].getTime() === expected.getTime() : false);
    return record[key] === value;
  });
  const tx = { verificationToken: {
    findFirst: async ({ where }: any) => { const found = records.find(record => match(record, where)); return found ? { ...found } : null; },
    deleteMany: async ({ where }: any) => { if (countZero) return { count: 0 }; const before = records.length; records = records.filter(record => !match(record, where)); return { count: before - records.length }; },
  }, user: { updateMany: async () => { if (userFailure) throw new Error(sentinel); if (accountMissing) return { count: 0 }; userWrites++; return { count: 1 }; } } };
  const helper = load("src/lib/password-reset.ts", { crypto, "@/lib/prisma": { prisma: { $transaction: (callback: any) => {
    const work = queue.then(async () => { const before = [...records], writesBefore = userWrites; try { return await callback(tx); } catch (error) { records = before; userWrites = writesBefore; throw error; } }); queue = work.catch(() => {}); return work;
  } } } });
  const reset = (raw = token) => helper.resetPasswordWithToken(email, raw, "synthetic-hash-not-secret");
  stage = "concurrent atomic token consumption one winner";
  const results = await Promise.all([reset(), reset()]); assert.equal(results.filter(result => result === "updated").length, 1); assert.equal(userWrites, 1); assert.equal(records.length, 0);
  stage = "reuse invalid without user write"; assert.equal(await reset(), "invalid"); assert.equal(userWrites, 1);
  stage = "invalid token preserves valid token"; records = [makeRecord()]; assert.equal(await reset("synthetic-wrong-token"), "invalid"); assert.equal(records.length, 1);
  stage = "expired token cannot delete newer exact identifier token"; records = [makeRecord(token, Date.now() - 60000), makeRecord("synthetic-new-token")]; assert.equal(await reset(), "invalid"); assert.equal(records.length, 1); assert.equal(records[0].token, makeRecord("synthetic-new-token").token);
  stage = "old token absent does not delete new token"; assert.equal(await reset(), "invalid"); assert.equal(records.length, 1);
  stage = "consume CAS count zero no user write"; records = [makeRecord()]; countZero = true; assert.equal(await reset(), "invalid"); assert.equal(records.length, 1); assert.equal(userWrites, 1); countZero = false;
  stage = "missing account transaction rollback preserves token"; accountMissing = true; assert.equal(await reset(), "account_missing"); assert.equal(records.length, 1); accountMissing = false;
  stage = "user update throw transaction rollback preserves token"; userFailure = true; await assert.rejects(reset()); assert.equal(records.length, 1); userFailure = false;
  stage = "rollback token usable on later explicit reset"; assert.equal(await reset(), "updated"); assert.equal(records.length, 0);
  await routeCases();
  console.log("PASS password reset actual helper/route VM atomic consumption, rollback, exact token guards and fixed errors; synthetic transaction ports, no DB/provider");
}
async function routeCases() {
  let rateFails = false, resetFails = false, outcome = "updated", calls = 0;
  const logs: unknown[][] = [];
  const route = load("src/app/api/auth/reset-password/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } }, bcryptjs: { hash: async () => "synthetic-hash-not-secret" }, zod: { z },
    "@/lib/prisma": { prisma: { rateLimit: { deleteMany: async () => ({ count: 0 }) } } },
    "@/lib/password-reset": { resetPasswordWithToken: async () => { calls++; if (resetFails) throw new Error(sentinel); return outcome; } },
    "@/lib/rate-limit": { clientIp: () => "127.0.0.1", checkRateLimit: async () => { if (rateFails) throw new Error(sentinel); return { allowed: true }; } },
  }, logs);
  const call = (valid = true): Promise<Response> => route.POST({ json: async () => valid ? { email, token, password: "SyntheticOnly123" } : {} });
  stage = "malformed request400 no reset call"; assert.equal((await call(false)).status, 400); assert.equal(calls, 0);
  for (const result of ["updated", "invalid", "account_missing"]) { outcome = result; stage = "mapped reset outcome"; assert.equal((await call()).status, result === "updated" ? 200 : 400); }
  stage = "reset exception fixed500 logs safe"; resetFails = true; let response = await call(); assert.equal(response.status, 500); assert.equal((await response.text()).includes(sentinel), false);
  stage = "rate failure fixed500 logs safe"; resetFails = false; rateFails = true; response = await call(); assert.equal(response.status, 500); assert.equal((await response.text()).includes(sentinel), false); assert.equal(JSON.stringify(logs).includes(sentinel), false);
}
main().catch(() => { console.error(`PASSWORD_RESET_CONSUMPTION_FAILED at ${stage}; exception details withheld.`); process.exitCode = 1; });
