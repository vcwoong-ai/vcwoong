/** Synthetic ports + actual webhook module; never reads provider keys or connects to DB. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { BillingEventService, type BillingEventTarget } from "../src/lib/payments/billing-events";
import type { BillingIntent, ProviderPayment } from "../src/lib/payments/billing-lifecycle";

async function main() {
  const now = new Date("2024-02-01T00:00:00Z");
  const intent: BillingIntent = { id: "intent-synthetic", userId: "user-synthetic", operation: "INITIAL",
    plan: "solo", cycle: "monthly", anchor: now, periodIndex: 0, periodStart: now,
    periodEnd: new Date("2024-03-01T00:00:00Z"), subscriptionId: null, subscriptionVersion: null,
    amount: 99000, currency: "KRW", orderId: "order-synthetic", idempotencyKey: "idempotency-synthetic",
    customerRef: "customer-synthetic", paymentMethodRef: "method-synthetic", status: "SUCCEEDED",
    version: 4, createdAt: now, expiresAt: new Date(now.getTime() + 60000), firstChargeAt: now,
    workerToken: null, leaseUntil: null };
  const receipt = { id: "receipt-synthetic", userId: intent.userId, intentId: intent.id,
    subscriptionId: "subscription-synthetic", paymentKey: "payment-synthetic", orderId: intent.orderId,
    amount: intent.amount, currency: intent.currency, status: "APPLIED" };
  let target: BillingEventTarget | null = { intent, receipt, subscription: null };
  let payment: ProviderPayment | null = { orderId: intent.orderId, paymentKey: receipt.paymentKey,
    amount: intent.amount, currency: "KRW", status: "DONE" };
  let providerCalls = 0, holds = 0, claims = 0, commits = 0, finishes = 0;
  let allowed = true, globalAllowed = true, throwLookup = false, claimAllowed = true;
  const rateKeys: string[] = [];
  const service = new BillingEventService({ now: () => now, newId: () => "worker-synthetic",
    allow: async key => { rateKeys.push(key); return key.endsWith(":global") ? globalAllowed : allowed; },
    lookupByOrder: async stored => { providerCalls++; assert.equal(stored.orderId, intent.orderId);
      if (throwLookup) throw new Error("Synthetic private provider diagnostic"); return payment; },
    repository: {
      findEventTarget: async () => target,
      holdVerifiedCancellation: async (saved, verified) => {
        assert.equal(saved.receipt?.paymentKey, verified.paymentKey); holds++;
        return holds === 1 ? "RECORDED" : "DUPLICATE";
      },
      claim: async input => { claims++; assert.equal(input.mode, "reconcile");
        return claimAllowed ? { intent: { ...intent, version: intent.version + 1 }, workerToken: input.workerToken, leaseUntil: input.leaseUntil } : null; },
      commitPaid: async () => { commits++; return "COMMITTED"; },
      finish: async (_lease, status) => { assert.equal(status, "HOLD"); finishes++; return true; },
    } });
  const event = { eventType: "PAYMENT_STATUS_CHANGED", data: { orderId: intent.orderId,
    paymentKey: receipt.paymentKey, status: "CANCELED", totalAmount: 1, customerKey: "untrusted-user" } };
  assert.equal(await service.handle({ eventType: "BILLING_DELETED", data: { customerKey: "untrusted", billingKey: "synthetic-secret" } }), "UNVERIFIED");
  assert.equal(providerCalls, 0); assert.equal(holds, 0);
  assert.equal(await service.handle({ eventType: "unknown" }), "IGNORED");
  assert.equal(await service.handle({ eventType: "PAYMENT_STATUS_CHANGED", data: {} }), "MISSING");
  assert.equal(await service.handle(event), "DUPLICATE", "payload cancelled status never overrides provider DONE");
  assert.equal(holds, 0);
  assert(rateKeys.every(key => !key.includes(intent.orderId) && !key.includes(receipt.paymentKey)));
  assert(rateKeys.some(key => /^billing-events:order:[a-f0-9]{64}$/.test(key)));
  const snapshot = { ...payment! };
  for (const patch of [{ amount: 1 }, { currency: "USD" }, { orderId: "another-order" }, { paymentKey: "another-payment" }]) {
    payment = { ...snapshot, ...patch }; assert.equal(await service.handle(event), "HOLD");
  }
  assert.equal(holds, 0);
  payment = { ...snapshot, status: "CANCELED" };
  assert.equal(await service.handle(event), "RECORDED");
  assert.equal(await service.handle(event), "DUPLICATE");
  payment = { ...snapshot, status: "PARTIAL_CANCELED" };
  assert.equal(await service.handle(event), "DUPLICATE");
  const knownCalls = providerCalls;
  assert.equal(await service.handle({ ...event, data: { orderId: "another-order" } }), "MISSING");
  target = null; assert.equal(await service.handle(event), "MISSING");
  assert.equal(providerCalls, knownCalls, "unknown/tampered local order cannot invoke provider");
  target = { intent, receipt, subscription: null };
  globalAllowed = false; assert.equal(await service.handle(event), "RATE_LIMITED");
  globalAllowed = true; allowed = false; assert.equal(await service.handle(event), "RATE_LIMITED");
  assert.equal(providerCalls, knownCalls); allowed = true;
  throwLookup = true; assert.equal(await service.handle(event), "RETRY"); throwLookup = false;
  payment = null; assert.equal(await service.handle(event), "RETRY");
  payment = snapshot;
  target = { intent: { ...intent, status: "PREPARED", firstChargeAt: null }, receipt: null, subscription: null };
  assert.equal(await service.handle(event), "HOLD"); assert.equal(claims, 0);
  target = { ...target, intent: { ...intent, status: "UNKNOWN" } };
  assert.equal(await service.handle(event), "SUCCEEDED"); assert.equal(claims, 1); assert.equal(commits, 1);
  claimAllowed = false; assert.equal(await service.handle(event), "STALE"); assert.equal(commits, 1);
  claimAllowed = true; payment = { ...snapshot, status: "PARTIAL_CANCELED" };
  assert.equal(await service.handle(event), "HOLD"); assert.equal(finishes, 1);

  let ready = false, factoryCalls = 0, outcome: string | null = "RECORDED";
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/payments/checkout-readiness": { isSubscriptionCheckoutReady: () => ready },
    "@/lib/payments/billing-runtime": { withBillingEventService: async () => { factoryCalls++; return outcome; } },
  };
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/app/api/payments/webhook/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, TextDecoder, Uint8Array, require: (name: string) => { assert(name in modules); return modules[name]; } });
  const request = (body: string) => new Request("https://synthetic.invalid/api/payments/webhook", { method: "POST", body });
  assert.equal((await exports.POST(request(JSON.stringify(event)))).status, 503);
  assert.equal(factoryCalls, 0, "hard hold never constructs provider/repository");
  assert.equal((await exports.POST(request(JSON.stringify({ eventType: "BILLING_DELETED", data: { customerKey: "untrusted", billingKey: "synthetic-secret" } })))).status, 202);
  assert.equal(factoryCalls, 0);
  assert.equal((await exports.POST(request("invalid"))).status, 400);
  assert.equal((await exports.POST(request("x".repeat(32769)))).status, 400);
  ready = true;
  for (const [result, status] of [["RECORDED", 200], ["DUPLICATE", 200], ["HOLD", 200], ["RETRY", 503], ["STALE", 503], ["RATE_LIMITED", 429], [null, 503]] as const) {
    outcome = result; const response = await exports.POST(request(JSON.stringify(event)));
    assert.equal(response.status, status); assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal((await response.text()).includes(receipt.paymentKey), false);
  }
  console.log("PASS billing events: synthetic verified lookup, duplicate/stale/rate fences, no payload deletion or fresh charge, bounded route hard hold");
}
main().catch(() => { console.error("FAIL synthetic billing event regression"); process.exitCode = 1; });
