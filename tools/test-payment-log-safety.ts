/** Execute real webhook and lookup code with synthetic failures; no DB/provider calls. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";

function load(file: string, imports: Record<string, unknown>, globals: Record<string, unknown>) {
  const exports: Record<string, any> = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, ...globals, require: (name: string) => {
    assert(name in imports, `Unexpected dependency: ${name}`); return imports[name];
  } });
  return exports;
}

async function main() {
  const marker = "synthetic-private-payment-marker";
  const logs: unknown[][] = [];
  const logger = { error: (...args: unknown[]) => logs.push(args), warn: (...args: unknown[]) => logs.push(args) };
  let throwLookup = false;
  const webhook = load("src/app/api/payments/webhook/route.ts", {
    "next/server": { NextRequest, NextResponse },
    "@/lib/payments/checkout-readiness": { isSubscriptionCheckoutReady: () => true },
    "@/lib/payments/billing-runtime": { withBillingEventService: async () => { if (throwLookup) throw new Error(marker); return "MISSING"; } },
  }, { console: logger, TextDecoder, Uint8Array });
  const request = () => new NextRequest("http://localhost/api/payments/webhook", {
    method: "POST", body: JSON.stringify({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey: marker } }),
    headers: { "Content-Type": "application/json" },
  });
  assert.equal((await webhook.POST(request())).status, 200);
  throwLookup = true;
  assert.equal((await webhook.POST(request())).status, 503);
  const toss = load("src/lib/payments/toss.ts", {
    "@prisma/client": {}, "@/lib/prisma": {}, "@/lib/brand": {}, "@/lib/plans": {},
    "@/lib/secure-compare": {}, "@/lib/payments/provider-configuration": {},
  }, { console: logger, process: { env: { TOSS_SECRET_KEY: marker } }, Buffer,
    AbortSignal, fetch: async () => { throw new Error(marker); } });
  assert.equal(await toss.getPayment(marker), null);
  assert.equal(logs.length, 1);
  assert(!JSON.stringify(logs).includes(marker), "Payment identifiers or exception contents leaked into logs");
  console.log("Synthetic webhook and lookup failure logs exclude private identifiers and raw errors.");
}
main().catch(() => { console.error("Payment log safety regression failed."); process.exitCode = 1; });
