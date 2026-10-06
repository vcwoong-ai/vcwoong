export interface TossIssuancePorts {
  fetch(url: string, init: RequestInit): Promise<Response>;
  authorization(): Promise<string>;
}

/** One-shot issuance only. The persistent session must be claimed before calling.
 * Timeout or any ambiguous result must never trigger an automatic reissue.
 * Provider fields and errors are never logged or forwarded.
 * Reference: https://docs.tosspayments.com/reference#인증-정보authkey로-빌링키-발급
 */
export function createTossBillingIssuer(ports: TossIssuancePorts) {
  return async (authKey: string, customerRef: string): Promise<{ billingKey: string }> => {
    try {
      if (!authKey || authKey.length > 300 || !/^[A-Za-z0-9_\-=.@]{2,50}$/.test(customerRef)) throw new Error();
      const authorization = await ports.authorization();
      if (!authorization.startsWith("Basic ")) throw new Error();
      const response = await ports.fetch("https://api.tosspayments.com/v1/billing/authorizations/issue", {
        method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000),
        headers: { Authorization: authorization, "Content-Type": "application/json" },
        body: JSON.stringify({ authKey, customerKey: customerRef }),
      });
      if (!response.ok) throw new Error();
      const value: unknown = await response.json();
      if (!value || typeof value !== "object") throw new Error();
      const data = value as Record<string, unknown>;
      if (data.customerKey !== customerRef || typeof data.billingKey !== "string" ||
          !data.billingKey.trim() || data.billingKey.length > 200) throw new Error();
      return { billingKey: data.billingKey };
    } catch { throw new Error("Billing authorization requires review"); }
  };
}
