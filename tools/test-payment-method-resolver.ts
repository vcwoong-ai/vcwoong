import assert from "node:assert/strict";
import { BillingKeyVault } from "../src/lib/payments/billing-key-vault";
import { createPaymentMethodResolver, type StoredBillingMethod } from "../src/lib/payments/payment-method-resolver";

async function main() {
  const vault = new BillingKeyVault({ key: new Uint8Array(32).fill(19), keyId: "synthetic-v1" });
  const marker = "synthetic-private-billing-key";
  const original: StoredBillingMethod = { id: "synthetic-method", userId: "synthetic-owner", customerRef: "synthetic-customer",
    keyVersion: "synthetic-v1", revokedAt: null,
    encryptedBillingKey: vault.seal({ billingKey: marker, userId: "synthetic-owner", methodRef: "synthetic-method" }) };
  let row: StoredBillingMethod | null = original;
  const resolve = createPaymentMethodResolver({ vault, keyVersion: "synthetic-v1", store: {
    getMethodForUser: async () => row,
  } });
  assert.equal(await resolve(original.id, original.userId), marker);
  const rejected = async (ref = original.id, user = original.userId) => {
    await assert.rejects(resolve(ref, user), (error: unknown) => error instanceof Error && error.message === "Payment method unavailable");
  };
  await rejected(original.id, "another-owner");
  await rejected("another-method");
  row = { ...original, revokedAt: new Date() }; await rejected();
  row = { ...original, keyVersion: "unavailable-key" }; await rejected();
  row = { ...original, encryptedBillingKey: marker }; await rejected();
  row = null; await rejected();
  vault.destroy(); row = original; await rejected();
  console.log("Synthetic payment method resolver enforces ownership, revocation, key version and safe errors.");
}
main().catch(() => { console.error("Payment method resolver regression failed."); process.exitCode = 1; });
