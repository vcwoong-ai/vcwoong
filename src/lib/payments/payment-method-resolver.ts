import type { BillingKeyVault } from "./billing-key-vault";

export interface StoredBillingMethod {
  id: string; userId: string; customerRef: string;
  encryptedBillingKey: string; keyVersion: string; revokedAt: Date | null;
}
export interface BillingMethodStore {
  getMethodForUser(id: string, userId: string): Promise<StoredBillingMethod | null>;
}

/** Server-only adapter for TossBillingPorts.resolvePaymentMethod.
 * The authenticated coordinator must supply userId; never accept it from a client body.
 * Store rows and decrypted provider keys must not be returned in HTTP responses.
 */
export function createPaymentMethodResolver(options: {
  store: BillingMethodStore; vault: Pick<BillingKeyVault, "open">; keyVersion: string;
}): (reference: string, userId: string) => Promise<string> {
  return async (reference, userId) => {
    try {
      if (!reference || !userId || !options.keyVersion) throw new Error();
      const method = await options.store.getMethodForUser(reference, userId);
      if (!method || method.id !== reference || method.userId !== userId || method.revokedAt !== null ||
          !method.customerRef || method.keyVersion !== options.keyVersion) throw new Error();
      return options.vault.open({ userId, methodRef: reference, envelope: method.encryptedBillingKey });
    } catch { throw new Error("Payment method unavailable"); }
  };
}
