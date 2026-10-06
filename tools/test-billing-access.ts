/** Synthetic subscription and route modules only; no Prisma/database/provider access. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { billingAccessView, type StoredBillingAccess } from "../src/lib/payments/billing-access";

async function main() {
  const now = new Date("2024-02-01T00:00:00Z");
  const legacy = { subscriptionPlan: "FULL", subscriptionStatus: "ACTIVE" };
  const paid: StoredBillingAccess = { plan: "solo", cycle: "monthly", status: "ACTIVE", anchor: new Date("2024-01-31T00:00:00Z"),
    paidThroughIndex: 0, periodStart: new Date("2024-01-31T00:00:00Z"), periodEnd: new Date("2024-02-29T00:00:00Z"),
    version: 4, cancelAtPeriodEnd: false };
  assert.equal(billingAccessView(null, legacy, now).plan, "full");
  assert.equal(billingAccessView(null, { ...legacy, subscriptionPlan: "constructor" }, now).plan, "free");
  assert.equal(billingAccessView(null, { ...legacy, subscriptionStatus: "CANCELED" }, now).plan, "free");
  assert.equal(billingAccessView(paid, legacy, now).plan, "solo");
  assert.equal(billingAccessView(paid, legacy, paid.periodStart).plan, "solo");
  assert.equal(billingAccessView(paid, legacy, paid.periodEnd).plan, "free");
  assert.equal(billingAccessView(paid, legacy, new Date(paid.periodStart.getTime() - 1)).plan, "free");
  assert.equal(billingAccessView({ ...paid, cancelAtPeriodEnd: true }, legacy, now).plan, "solo");
  for (const patch of [{ status: "CANCELLED" }, { status: "UNKNOWN" }, { plan: "unknown" }, { cycle: "unknown" },
    { periodEnd: new Date(paid.periodEnd.getTime() + 1) }, { version: -1 }, { paidThroughIndex: -1 }]) {
    assert.equal(billingAccessView({ ...paid, ...patch }, legacy, now).plan, "free", "present bad durable row cannot revive legacy paid plan");
  }

  let stored: StoredBillingAccess | null = { ...paid };
  let legacyUser = { ...legacy, billingKey: "synthetic-private-legacy-key" };
  let authenticated = true, failRead = false, failCAS = false, legacyCancels = 0, durableCancels = 0;
  class FixedDate extends Date {
    constructor(value?: string | number | Date) { super(value === undefined ? now.getTime() : value instanceof Date ? value.getTime() : value); }
  }
  const modules: Record<string, unknown> = {
    "@prisma/client": { SubscriptionPlan: { FREE: "FREE", SOLO: "SOLO", SECTOR_PRO: "SECTOR_PRO", MULTI: "MULTI", FULL: "FULL", BIO_PREMIUM: "BIO_PREMIUM" } },
    "@/lib/prisma": { prisma: {
      billingSubscription: { findUnique: async ({ select }: any) => {
        assert(!select.billingKey && !select.customerRef && !select.paymentMethodRef);
        if (failRead) throw new Error("Synthetic private storage diagnostic"); return stored ? { ...stored } : null;
      } },
      billingPaymentMethod: { count: async () => 1 },
      user: { findUnique: async () => ({ ...legacyUser }), update: async ({ data }: any) => {
        legacyCancels++; legacyUser = { ...legacyUser, ...data }; return { ...legacyUser };
      } },
    } },
    "@/lib/quotas": { PLAN_LIMITS: {} },
    "@/lib/payments/billing-access": { billingAccessView },
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "next-auth": { getServerSession: async () => authenticated ? { user: { id: "synthetic-user" } } : null },
    "@/lib/auth": { authOptions: {} },
    "@/lib/payments/billing-runtime": { withBillingRepository: async (fn: (repository: any) => unknown) => fn({
      cancelAtPeriodEnd: async (userId: string, version: number) => {
        durableCancels++; assert.equal(userId, "synthetic-user");
        if (failCAS || !stored || stored.version !== version) return false;
        stored = { ...stored, version: stored.version + 1, cancelAtPeriodEnd: true }; return true;
      },
    }) },
  };
  function load(file: string): any {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { exports, URL, Date: FixedDate, require: (name: string) => { assert(name in modules); return modules[name]; } });
    return exports;
  }
  const subscriptions = load("src/lib/subscription.ts");
  modules["@/lib/subscription"] = subscriptions;
  assert.equal(await subscriptions.getUserPlanKey("synthetic-user"), "solo");
  const view = await subscriptions.getUserSubscription("synthetic-user");
  assert.equal(view.hasBillingKey, true);
  assert.equal(view.subscriptionPlan, "SOLO");
  assert.equal("billingKey" in view, false);
  stored = { ...paid, periodEnd: new Date(now.getTime() - 1) };
  assert.equal(await subscriptions.getUserPlanKey("synthetic-user"), "free");
  stored = { ...paid };
  const cancel = load("src/app/api/payments/cancel/route.ts");
  const sameOrigin = new Request("https://synthetic.invalid/api/payments/cancel", { method: "POST", headers: { Origin: "https://synthetic.invalid" } });
  assert.equal((await cancel.POST(new Request(sameOrigin.url, { method: "POST", headers: { Origin: "https://other.invalid" } }))).status, 403);
  assert.equal((await cancel.POST(new Request(sameOrigin.url, { method: "POST" }))).status, 403);
  assert.equal(durableCancels, 0);
  const response = await cancel.POST(sameOrigin);
  assert.equal(response.status, 200);
  const cancelled = (await response.json()).data;
  assert.equal(cancelled.paidUntil, paid.periodEnd.toISOString());
  assert.equal(cancelled.plan, "SOLO");
  assert.equal(cancelled.cancelAtPeriodEnd, true);
  assert.equal(await subscriptions.getUserPlanKey("synthetic-user"), "solo");
  assert.equal(legacyCancels, 0);
  assert.equal((await cancel.POST(sameOrigin)).status, 200);
  assert.equal(durableCancels, 1, "repeated cancellation is idempotent");
  stored = { ...paid, anchor: new Date("2023-01-31T00:00:00Z"),
    periodStart: new Date("2023-01-31T00:00:00Z"), periodEnd: new Date("2023-02-28T00:00:00Z") };
  assert.equal(await subscriptions.getUserPlanKey("synthetic-user"), "free");
  assert.equal((await cancel.POST(sameOrigin)).status, 200, "expired access can still stop a future renewal");
  assert.equal(stored.cancelAtPeriodEnd, true);
  stored = { ...paid, periodEnd: new Date(paid.periodEnd.getTime() + 1) };
  assert.equal((await cancel.POST(sameOrigin)).status, 400, "invalid stored period is never used for cancellation");
  stored = { ...paid }; failCAS = true;
  assert.equal((await cancel.POST(sameOrigin)).status, 409);
  assert.equal(stored.cancelAtPeriodEnd, false);
  failCAS = false; authenticated = false;
  assert.equal((await cancel.POST(sameOrigin)).status, 401);
  authenticated = true; failRead = true;
  await assert.rejects(subscriptions.getUserPlanKey("synthetic-user"));
  assert.equal((await cancel.POST(sameOrigin)).status, 500);
  failRead = false; stored = null;
  assert.equal(await subscriptions.getUserPlanKey("synthetic-user"), "full");
  const legacyView = await subscriptions.getUserSubscription("synthetic-user");
  assert.equal(legacyView.hasBillingKey, true);
  assert.equal(JSON.stringify(legacyView).includes(legacyUser.billingKey), false);
  assert.equal((await cancel.POST(sameOrigin)).status, 200);
  assert.equal(legacyCancels, 1);
  assert.equal(await subscriptions.getUserPlanKey("synthetic-user"), "free");
  console.log("PASS billing access: synthetic paid-window/legacy/fail-closed/private-key/cancellation-CAS regressions");
}
main().catch(() => { console.error("FAIL synthetic billing access regression"); process.exitCode = 1; });
