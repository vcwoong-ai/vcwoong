/** Real callback with mocked billing only; no payment provider, DB or actual keys. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import { isSubscriptionCheckoutReady } from "../src/lib/payments/checkout-readiness";

async function main() {
  let authenticated = true;
  let mutations = 0;
  const imports: Record<string, unknown> = {
    "next/server": { NextRequest, NextResponse },
    "next-auth": { getServerSession: async () => authenticated ? { user: { id: "fixture" } } : null },
    "@/lib/auth": { authOptions: {} },
    "@/lib/payments/checkout-readiness": { isSubscriptionCheckoutReady },
    "@/lib/payments/billing-runtime": { getCheckoutRuntime: async () => { mutations++; throw new Error("Readiness hold bypassed"); } },
    "@/lib/payments/toss": {
      isTossConfigured: () => true, planAmount: () => 99000,
      issueBillingKey: async () => { mutations++; return { billingKey: "synthetic-billing" }; },
      chargeBilling: async () => { mutations++; return { paymentKey: "synthetic-payment", totalAmount: 99000 }; },
      recordPayment: async () => { mutations++; },
    },
    "@/lib/subscription": { activateSubscription: async () => { mutations++; }, planParamToEnum: () => "SOLO" },
    "@/lib/brand": { brandCustomerKey: (id: string) => `synthetic-${id}` },
  };
  const exports: { GET?: (request: NextRequest) => Promise<NextResponse> } = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/app/api/payments/success/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, URL, Date, console: { error() {}, warn() {} },
    require: (name: string) => { assert(name in imports, `Unexpected import: ${name}`); return imports[name]; },
  });
  assert(exports.GET);
  const request = () => new NextRequest("http://localhost:3111/api/payments/success?authKey=synthetic-auth&customerKey=synthetic-fixture&plan=solo");
  const response = await exports.GET(request());
  assert.equal(new URL(response.headers.get("location")!).searchParams.get("payment"), "not_ready");
  assert.equal(mutations, 0, "A configured key must not bypass lifecycle readiness");
  authenticated = false;
  assert.equal(new URL((await exports.GET(request())).headers.get("location")!).pathname, "/login");
  assert.equal(mutations, 0);
  const ui = fs.readFileSync("src/components/settings/subscription-plans.tsx", "utf8");
  assert(ui.includes("!checkoutReady"), "Client must prevent opening the card authorization UI");
  console.log("Offline checkout readiness guard, authentication and zero-payment-mutation regressions passed.");
}
main().catch(() => { console.error("Offline checkout readiness regression failed."); process.exitCode = 1; });
