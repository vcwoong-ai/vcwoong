/** Actual issuance helper VM, synthetic persistence/crypto ports; no DB/email/provider. */
/* eslint-disable @typescript-eslint/no-explicit-any -- Transpiled helper and transaction ports are dynamic test-only interfaces. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
let stage = "concurrent issuance leaves one active token";
const email = "synthetic-issuance@example.invalid", sentinel = "SYNTHETIC_PRIVATE_DETAIL";
function load(prisma: any, cryptoPort: any = crypto, logs: unknown[][] = []) {
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/password-reset.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Date, Buffer, console: { error: (...args: unknown[]) => logs.push(args), warn: (...args: unknown[]) => logs.push(args) }, require(name: string) { if (name === "crypto") return cryptoPort; if (name === "@/lib/prisma") return { prisma }; throw new Error("unexpected issuance port"); } });
  return exports;
}
async function main() {
  let records: any[] = [], attempts = 0, randomCalls = 0, failuresRemaining = 0, failCode = "";
  let queue: Promise<unknown> = Promise.resolve();
  const logs: unknown[][] = [], creations: any[] = [];
  const tx = { verificationToken: { deleteMany: async ({ where }: any) => { assert.equal(where.identifier, `password-reset:${email}`); const before = records.length; records = records.filter(record => record.identifier !== where.identifier); return { count: before - records.length }; }, create: async ({ data }: any) => { creations.push({ ...data }); if (failCode === "CREATE") throw new Error(sentinel); records.push({ ...data }); return data; } } };
  const helper = load({ $transaction(callback: any, options: any) {
    const work = queue.then(async () => {
      attempts++; assert.equal(options.isolationLevel, "Serializable"); assert.equal(options.maxWait, 5000); assert.equal(options.timeout, 10000);
      const before = records.map(record => ({ ...record }));
      try { const result = await callback(tx); if (failuresRemaining > 0) { failuresRemaining--; throw { code: failCode, message: sentinel }; } return result; } catch (error) { records = before; throw error; }
    }); queue = work.catch(() => {}); return work;
  } }, { ...crypto, randomBytes: (size: number) => { assert.equal(size, 32); return Buffer.alloc(32, ++randomCalls); } }, logs);
  const before = Date.now(); const raw = await Promise.all([helper.createResetToken(email), helper.createResetToken(email)]); const after = Date.now();
  assert.equal(records.length, 1); assert.equal(randomCalls, 2); assert.equal(raw.length, 2); assert.notEqual(raw[0], raw[1]);
  assert.equal(records[0].token, crypto.createHash("sha256").update(raw[1]).digest("hex")); assert.equal(raw.includes(records[0].token), false);
  assert(records[0].expires.getTime() >= before + 30 * 60000 && records[0].expires.getTime() <= after + 30 * 60000);
  stage = "serialization retry keeps same hash and expiry request material"; failuresRemaining = 2; failCode = "P2034";
  const createBefore = creations.length, randomBefore = randomCalls, attemptBefore = attempts;
  await helper.createResetToken(email); const retried = creations.slice(createBefore);
  assert.equal(attempts - attemptBefore, 3); assert.equal(randomCalls - randomBefore, 1); assert.equal(retried.length, 3);
  assert(retried.every(record => record.token === retried[0].token && record.expires.getTime() === retried[0].expires.getTime())); assert.equal(records.length, 1);
  const existingToken = records[0].token;
  for (const code of ["CREATE", "P2002", "P2034"]) {
    stage = "failed issuance rolls back old token and emits fixed error"; failCode = code; failuresRemaining = code === "CREATE" ? 0 : 10; const start = attempts;
    await assert.rejects(helper.createResetToken(email), (error: Error) => error.message === "Password reset token could not be issued" && !error.message.includes(sentinel));
    assert.equal(records.length, 1); assert.equal(records[0].token, existingToken); assert.equal(attempts - start, code === "P2034" ? 3 : 1);
  }
  assert.equal(logs.length, 0);
  stage = "later explicit issuance after rollback still succeeds"; failuresRemaining = 0; failCode = ""; await helper.createResetToken(email); assert.equal(records.length, 1); assert.notEqual(records[0].token, existingToken);
  console.log("PASS password reset issuance actual helper VM Serializable ports, one active token, fixed retry material, rollback and expiry/hash; no DB/email/provider");
}
main().catch(() => { console.error(`PASSWORD_RESET_ISSUANCE_FAILED at ${stage}; exception details withheld.`); process.exitCode = 1; });
