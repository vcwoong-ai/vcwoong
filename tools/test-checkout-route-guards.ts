/** Real routes with injected runtime only; no DB, SDK, credential reads or provider calls. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

function load(file: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const exports: Record<string, any> = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, URL, ...globals, require: (name: string) => {
    assert(name in imports, `Unexpected dependency: ${name}`); return imports[name];
  } });
  return exports;
}

async function main() {
  let authenticated = true, ready = false, runtimeCalls = 0, prepared = 0, callbacks = 0;
  let outcome = "SUCCEEDED";
  let callbackInput: Record<string, unknown> = {};
  const service = { prepare: async (input: { userId: string; plan: string; cycle: string; origin: string }) => {
    prepared++; assert.equal(input.userId, "synthetic-owner");
    return { customerKey: "synthetic-customer", successUrl: "http://localhost/api/payments/success?session=synthetic-session", failUrl: "http://localhost/api/payments/fail" };
  }, callback: async (input: Record<string, unknown>) => { callbacks++; callbackInput = input; return outcome; } };
  const imports = {
    "next/server": { NextRequest, NextResponse }, "zod": { z }, "@/lib/auth": { authOptions: {} },
    "next-auth": { getServerSession: async () => authenticated ? { user: { id: "synthetic-owner" } } : null },
    "@/lib/payments/checkout-readiness": { isSubscriptionCheckoutReady: () => ready, SUBSCRIPTION_CHECKOUT_NOTICE: "결제 준비 중" },
    "@/lib/payments/billing-runtime": { getCheckoutRuntime: async () => { runtimeCalls++; return service; } },
  };
  const checkout = load("src/app/api/payments/checkout/route.ts", imports);
  const success = load("src/app/api/payments/success/route.ts", imports);
  const request = (origin = "http://localhost", body: unknown = { plan: "solo", cycle: "monthly" }) => new NextRequest("http://localhost/api/payments/checkout", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  authenticated = false; assert.equal((await checkout.POST(request())).status, 401);
  authenticated = true; assert.equal((await checkout.POST(request("https://other.invalid"))).status, 403);
  assert.equal((await checkout.POST(request())).status, 503); assert.equal(runtimeCalls, 0);
  const callbackRequest = () => new NextRequest("http://localhost/api/payments/success?session=synthetic-session&authKey=synthetic-private-auth&customerKey=synthetic-customer&plan=full&amount=1");
  assert.equal(new URL((await success.GET(callbackRequest())).headers.get("location")!).searchParams.get("payment"), "not_ready");
  assert.equal(runtimeCalls, 0);
  ready = true;
  assert.equal((await checkout.POST(request("http://localhost", { plan: "solo", cycle: "monthly", amount: 1 }))).status, 400);
  const preparedResponse = await checkout.POST(request()); assert.equal(preparedResponse.status, 200);
  assert(preparedResponse.headers.get("cache-control")?.includes("no-store")); assert.equal(prepared, 1);
  for (outcome of ["SUCCEEDED", "UNKNOWN", "ISSUE_HOLD"]) {
    const response = await success.GET(callbackRequest());
    const location = new URL(response.headers.get("location")!);
    assert.equal(location.searchParams.get("payment"), outcome === "SUCCEEDED" ? "success" : outcome === "UNKNOWN" ? "pending" : "hold");
    assert(!location.href.includes("synthetic-private-auth"));
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert(response.headers.get("cache-control")?.includes("no-store"));
  }
  assert.equal(callbacks, 3); assert.equal(callbackInput.userId, "synthetic-owner");
  assert(!("plan" in callbackInput)); assert(!("amount" in callbackInput));
  const fail = load("src/app/api/payments/fail/route.ts", imports);
  assert.equal(new URL((await fail.GET(new NextRequest("http://localhost/api/payments/fail?message=synthetic-private-auth"))).headers.get("location")!).search, "?payment=fail");
  const blockedConstructor = () => { throw new Error("Runtime constructed during readiness hold"); };
  const runtimeImports: Record<string, unknown> = {};
  for (const moduleName of ["node:crypto", "../plans", "./billing-lifecycle", "./billing-client", "./billing-key-vault", "./prisma-billing-repository", "./payment-method-resolver", "./toss-billing-provider", "./toss-billing-issuer", "./checkout-session", "./provider-configuration", "./billing-maintenance-schedule", "./billing-events"]) {
    runtimeImports[moduleName] = new Proxy({}, { get: () => blockedConstructor });
  }
  runtimeImports["./checkout-readiness"] = { isSubscriptionCheckoutReady: () => false };
  const runtime = load("src/lib/payments/billing-runtime.ts", runtimeImports, { process: {
    env: new Proxy({}, { get() { throw new Error("Environment read during readiness hold"); } }),
  } });
  assert.equal(await runtime.getCheckoutRuntime(), null);
  assert.equal(await runtime.getBillingMaintenance(), null);
  assert.equal(await runtime.withBillingEventService(blockedConstructor), null);
  console.log("Checkout route authentication/origin/readiness, immutable callback inputs, safe redirects and runtime hold passed.");
}
main().catch(() => { console.error("Checkout route guard regression failed."); process.exitCode = 1; });
