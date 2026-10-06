import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import { secureCompare } from "../src/lib/secure-compare";

async function main() {
  let ready = false, runtimeCalls = 0, runs = 0;
  const imports: Record<string, unknown> = {
    "next/server": { NextResponse }, "@/lib/secure-compare": { secureCompare },
    "@/lib/payments/checkout-readiness": { isSubscriptionCheckoutReady: () => ready },
    "@/lib/payments/billing-runtime": { getBillingMaintenance: async () => {
      runtimeCalls++;
      return { run: async (options: unknown) => { runs++; assert.deepEqual(JSON.parse(JSON.stringify(options)), { batchLimit: 2, timeBudgetMs: 105000 }); return { examined: 1, succeeded: 1 }; } };
    } },
  };
  const exports: Record<string, any> = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/app/api/cron/billing-maintenance/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, process: { env: { CRON_SECRET: "synthetic-cron-secret" } }, require: (name: string) => { assert(name in imports); return imports[name]; } });
  const request = (token: string) => new Request("http://localhost/api/cron/billing-maintenance", { headers: { authorization: token } });
  assert.equal((await exports.GET(request("Bearer forged"))).status, 401);
  assert.equal((await exports.GET(request("Bearer synthetic-cron-secret"))).status, 503);
  assert.equal(runtimeCalls, 0);
  ready = true;
  const response = await exports.GET(request("Bearer synthetic-cron-secret"));
  assert.equal(response.status, 200); assert.equal(runs, 1);
  assert(response.headers.get("cache-control").includes("no-store"));
  assert.deepEqual(await response.json(), { data: { examined: 1, succeeded: 1 } });
  console.log("Billing maintenance authentication, hard hold, bounded options and aggregate response passed.");
}
main().catch(() => { console.error("Billing maintenance route guard regression failed."); process.exitCode = 1; });
