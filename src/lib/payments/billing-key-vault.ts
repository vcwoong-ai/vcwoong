import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { TextDecoder } from "node:util";

interface VaultEnvelope {
  version: 1; algorithm: "A256GCM"; keyId: string;
  nonce: string; ciphertext: string; tag: string;
}
interface VaultBinding { userId: string; methodRef: string }
// TS "private" properties are enumerable at runtime. Keep master material off the
// instance so accidental JSON serialization or object inspection cannot reveal it.
const vaultStates = new WeakMap<object, { key: Buffer; keyId: string; destroyed: boolean }>();
function stateFor(vault: object) {
  const state = vaultStates.get(vault);
  if (!state) throw new BillingKeyVaultError();
  return state;
}

export class BillingKeyVaultError extends Error {
  constructor() { super("Billing key storage unavailable"); this.name = "BillingKeyVaultError"; }
}

function bindingAAD(binding: VaultBinding, keyId: string): Buffer {
  if (!binding || typeof binding.userId !== "string" || typeof binding.methodRef !== "string" ||
      !binding.userId || !binding.methodRef || binding.userId.length > 128 || binding.methodRef.length > 128) {
    throw new BillingKeyVaultError();
  }
  return Buffer.from(JSON.stringify(["dealmind-billing-key", 1, "A256GCM", keyId, binding.userId, binding.methodRef]), "utf8");
}

function decodeCanonical(value: unknown, length?: number): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new BillingKeyVaultError();
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value || (length !== undefined && bytes.length !== length)) throw new BillingKeyVaultError();
  return bytes;
}

/** Explicit key injection only; no env, DB, logging, automatic migration or network calls.
 * Caller owns a cryptographically random 32-byte key, rotation/secret-manager access,
 * and must authenticate the binding first. Length checking does not prove key entropy.
 * JS strings/crypto internal buffers cannot be reliably erased: decrypted strings must remain
 * short-lived and server-only. destroy() wipes only this object's copied master-key buffer.
 */
export class BillingKeyVault {
  constructor(options: { key: Uint8Array; keyId: string }) {
    if (!options || !(options.key instanceof Uint8Array) || options.key.length !== 32 ||
        typeof options.keyId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(options.keyId)) throw new BillingKeyVaultError();
    vaultStates.set(this, { key: Buffer.from(options.key), keyId: options.keyId, destroyed: false });
  }

  /** Non-secret selector for an explicitly configured key registry. */
  get keyVersion(): string { return stateFor(this).keyId; }

  seal(input: VaultBinding & { billingKey: string }): string {
    let plaintext: Buffer | undefined;
    try {
      const state = stateFor(this);
      if (state.destroyed || typeof input?.billingKey !== "string" || !input.billingKey.trim() || input.billingKey.length > 200) {
        throw new BillingKeyVaultError();
      }
      plaintext = Buffer.from(input.billingKey, "utf8");
      // Reject lone-surrogate strings which UTF-8 encoding would silently replace.
      if (plaintext.toString("utf8") !== input.billingKey) throw new BillingKeyVaultError();
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", state.key, nonce, { authTagLength: 16 });
      cipher.setAAD(bindingAAD(input, state.keyId));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const envelope: VaultEnvelope = { version: 1, algorithm: "A256GCM", keyId: state.keyId,
        nonce: nonce.toString("base64url"), ciphertext: ciphertext.toString("base64url"),
        tag: cipher.getAuthTag().toString("base64url") };
      return JSON.stringify(envelope);
    } catch { throw new BillingKeyVaultError(); }
    finally { plaintext?.fill(0); }
  }

  open(input: VaultBinding & { envelope: string }): string {
    let plaintext: Buffer | undefined;
    let partial: Buffer | undefined;
    let final: Buffer | undefined;
    try {
      const state = stateFor(this);
      if (state.destroyed || typeof input?.envelope !== "string" || input.envelope.length > 2048) throw new BillingKeyVaultError();
      const envelope = JSON.parse(input.envelope) as VaultEnvelope;
      if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) ||
          Object.keys(envelope).sort().join(",") !== "algorithm,ciphertext,keyId,nonce,tag,version" ||
          envelope.version !== 1 || envelope.algorithm !== "A256GCM" || envelope.keyId !== state.keyId) throw new BillingKeyVaultError();
      const nonce = decodeCanonical(envelope.nonce, 12);
      const tag = decodeCanonical(envelope.tag, 16);
      const ciphertext = decodeCanonical(envelope.ciphertext);
      if (ciphertext.length > 800) throw new BillingKeyVaultError();
      const decipher = createDecipheriv("aes-256-gcm", state.key, nonce, { authTagLength: 16 });
      decipher.setAAD(bindingAAD(input, state.keyId));
      decipher.setAuthTag(tag);
      partial = decipher.update(ciphertext);
      final = decipher.final();
      plaintext = Buffer.concat([partial, final]);
      const result = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(plaintext);
      if (!result.trim() || result.length > 200) throw new BillingKeyVaultError();
      return result;
    } catch { throw new BillingKeyVaultError(); }
    finally { plaintext?.fill(0); partial?.fill(0); final?.fill(0); }
  }

  destroy(): void { const state = stateFor(this); state.key.fill(0); state.destroyed = true; }
}
