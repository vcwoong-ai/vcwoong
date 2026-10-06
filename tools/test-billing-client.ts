/** Inspect constructor options without opening a connection or loading credentials. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

let options: { datasources: { db: { url: string } }; log: unknown[] } | undefined;
let fail = false;
const exports: { createBillingClient?: (url: string) => unknown } = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/payments/billing-client.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, URL, require: (name: string) => {
  assert.equal(name, "@prisma/client");
  return { PrismaClient: class {
    constructor(input: typeof options) { if (fail) throw new Error("synthetic-private-db-url"); options = input; }
  } };
} });
assert(exports.createBillingClient);
exports.createBillingClient("postgresql://127.0.0.1/dealmind_test");
assert.equal(options?.datasources.db.url, "postgresql://127.0.0.1/dealmind_test");
assert.equal(options?.log.length, 0);
for (const input of ["", "file:./dev.db", "not-a-url"]) {
  assert.throws(() => exports.createBillingClient!(input), (error: unknown) => (error as Error).message === "Billing storage unavailable");
}
fail = true;
assert.throws(() => exports.createBillingClient!("postgresql://127.0.0.1/dealmind_test"),
  (error: unknown) => (error as Error).message === "Billing storage unavailable");
console.log("Billing client uses explicit PostgreSQL configuration, no automatic query/error logging and safe constructor errors.");
