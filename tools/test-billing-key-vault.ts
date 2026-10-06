/** Synthetic keys only. Never reads env/DB/network or migrates existing billing keys. */
import assert from "node:assert/strict";
import { BillingKeyVault, BillingKeyVaultError } from "../src/lib/payments/billing-key-vault";

function main() {
  const key = new Uint8Array(32).fill(17);
  const vault = new BillingKeyVault({ key, keyId: "synthetic-version" });
  assert.equal(vault.keyVersion, "synthetic-version");
  assert.equal(JSON.stringify(vault), "{}", "master material is not an enumerable instance property");
  assert.deepEqual(Object.keys(vault), []);
  const binding = { userId: "synthetic-user", methodRef: "synthetic-method" };
  const billingKey = "synthetic-billing-key";
  const envelope = vault.seal({ ...binding, billingKey });
  assert.equal(vault.open({ ...binding, envelope }), billingKey);
  assert.equal(envelope.includes(billingKey), false);
  assert.equal(envelope.includes(binding.userId), false);
  assert.equal(envelope.includes(binding.methodRef), false);
  assert.notEqual(vault.seal({ ...binding, billingKey }), envelope, "fresh random GCM nonce per seal");
  // Constructor copies the key; caller-buffer changes do not silently rotate the vault.
  key.fill(0);
  assert.equal(vault.open({ ...binding, envelope }), billingKey);
  const wrongKey = new BillingKeyVault({ key: new Uint8Array(32).fill(18), keyId: "synthetic-version" });
  const wrongVersion = new BillingKeyVault({ key: new Uint8Array(32).fill(17), keyId: "other-version" });
  for (const action of [
    () => wrongKey.open({ ...binding, envelope }),
    () => wrongVersion.open({ ...binding, envelope }),
    () => vault.open({ ...binding, userId: "different-user", envelope }),
    () => vault.open({ ...binding, methodRef: "different-method", envelope }),
    () => vault.open({ ...binding, envelope: "malformed" }),
    () => vault.open({ ...binding, envelope: "null" }),
    () => vault.open({ ...binding, envelope: "[]" }),
    () => vault.open({ ...binding, envelope: "x".repeat(2049) }),
    () => vault.seal({ ...binding, billingKey: "" }),
    () => vault.seal({ ...binding, billingKey: "x".repeat(201) }),
    () => vault.seal({ ...binding, billingKey: "\ud800" }),
    () => new BillingKeyVault({ key: new Uint8Array(31), keyId: "synthetic-version" }),
    () => new BillingKeyVault({ key: new Uint8Array(32), keyId: "" }),
  ]) assert.throws(action, { name: "BillingKeyVaultError", message: "Billing key storage unavailable" });
  const parsed = JSON.parse(envelope);
  for (const field of ["nonce", "ciphertext", "tag"]) {
    const bytes = Buffer.from(parsed[field], "base64url"); bytes[0] ^= 1;
    assert.throws(() => vault.open({ ...binding, envelope: JSON.stringify({ ...parsed, [field]: bytes.toString("base64url") }) }), BillingKeyVaultError);
  }
  for (const patch of [{ version: 2 }, { algorithm: "AES-CBC" }, { extra: true },
    { nonce: "AA" }, { tag: "AA" }, { ciphertext: parsed.ciphertext + "=" }]) {
    assert.throws(() => vault.open({ ...binding, envelope: JSON.stringify({ ...parsed, ...patch }) }), BillingKeyVaultError);
  }
  const unicode = "synthetic-한글-key";
  assert.equal(vault.open({ ...binding, envelope: vault.seal({ ...binding, billingKey: unicode }) }), unicode);
  vault.destroy();
  assert.throws(() => vault.open({ ...binding, envelope }), BillingKeyVaultError);
  assert.throws(() => vault.seal({ ...binding, billingKey }), BillingKeyVaultError);
  wrongKey.destroy(); wrongVersion.destroy();
  console.log("PASS billing-key vault: synthetic AES-GCM binding/tamper/key/version/malformed checks; no existing key migration");
}
try { main(); } catch { console.error("FAIL synthetic billing-key vault regression"); process.exitCode = 1; }
