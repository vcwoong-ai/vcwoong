/** Offline placeholders only: no environment, provider, DB, auth or credentials. */
import assert from "node:assert/strict";
import { inspectTossConfiguration } from "../src/lib/payments/provider-configuration";
import { isSubscriptionCheckoutReady } from "../src/lib/payments/checkout-readiness";

for (const mode of ["test", "live"] as const) {
  const env = { NEXT_PUBLIC_TOSS_CLIENT_KEY: `${mode}_ck_synthetic_only`, TOSS_SECRET_KEY: `${mode}_sk_synthetic_only` };
  assert.deepEqual(inspectTossConfiguration(env), { ready: true, mode, reason: "MATCHING_MODE" });
  assert.equal(isSubscriptionCheckoutReady(), false, "matching provider mode cannot activate held checkout");
  assert(!JSON.stringify(inspectTossConfiguration(env)).includes("synthetic_only"), "diagnostics never include keys");
}
for (const [client, secret] of [["test", "live"], ["live", "test"]]) {
  assert.equal(inspectTossConfiguration({ NEXT_PUBLIC_TOSS_CLIENT_KEY: `${client}_ck_fixture`, TOSS_SECRET_KEY: `${secret}_sk_fixture` }).reason, "MIXED_MODES");
}
assert.equal(inspectTossConfiguration({}).reason, "MISSING_KEYS");
assert.equal(inspectTossConfiguration({ NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_ck_fixture" }).reason, "MISSING_KEYS");
for (const [client, secret] of [["test_gck_fixture", "test_gsk_fixture"], ["test_ck_", "test_sk_fixture"], ["test_ck_fixture", "test_sk_"], [" test_ck_fixture", "test_sk_fixture"], ["test_ck_fixture", "unrecognized"]]) {
  assert.equal(inspectTossConfiguration({ NEXT_PUBLIC_TOSS_CLIENT_KEY: client, TOSS_SECRET_KEY: secret }).reason, "UNSUPPORTED_KEYS");
}
console.log("PASS offline payment provider key-mode format checks; MID, contract and network remain unverified.");
