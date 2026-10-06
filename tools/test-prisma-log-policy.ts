/** Execute the actual singleton module with a constructor spy; no Prisma runtime or DB. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync("src/lib/prisma.ts", "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(environment: string, cache: { prisma?: object } = {}) {
  const calls: unknown[] = [], exports: { prisma?: object } = {};
  class SyntheticClient { constructor(options: unknown) { calls.push(options); } }
  vm.runInNewContext(code, { exports, globalThis: cache, process: { env: { NODE_ENV: environment } }, require(name: string) {
    assert.equal(name, "@prisma/client"); return { PrismaClient: SyntheticClient };
  } });
  return { calls, instance: exports.prisma, cache };
}
try {
  for (const environment of ["development", "test", "production"]) {
    const first = load(environment); assert.equal(first.calls.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(first.calls[0])), { log: [] }, "singleton must opt out of raw query, warning and error logs");
    if (environment === "production") assert.equal(first.cache.prisma, undefined);
    else { assert.equal(first.cache.prisma, first.instance); const repeat = load(environment, first.cache); assert.equal(repeat.calls.length, 0); assert.equal(repeat.instance, first.instance); }
    const existing = {}; const cached = load(environment, { prisma: existing }); assert.equal(cached.calls.length, 0); assert.equal(cached.instance, existing);
  }
  console.log("PASS offline Prisma singleton: dev/test/prod log opt-out, cache reuse, no real runtime or DB");
} catch {
  console.error("PRISMA_LOG_POLICY_FAILED: constructor policy assertion; details withheld."); process.exitCode = 1;
}
