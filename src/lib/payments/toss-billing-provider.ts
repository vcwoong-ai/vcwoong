import type { BillingIntent, BillingProvider, ProviderPayment } from "./billing-lifecycle";

export interface TossBillingPorts {
  /** Explicit injection only; importing this module never reads env or contacts Toss. */
  fetch(url: string, init: RequestInit): Promise<Response>;
  authorization(): Promise<string>;
  resolvePaymentMethod(reference: string, userId: string): Promise<string>;
  /** Webhook lookups use a smaller budget; charging always retains the approval budget. */
  lookupTimeoutMs?: number;
}

function paymentFromResponse(value: unknown): ProviderPayment {
  if (!value || typeof value !== "object") throw new Error("Payment response unavailable");
  const data = value as Record<string, unknown>;
  if (typeof data.orderId !== "string" || typeof data.paymentKey !== "string" ||
      typeof data.totalAmount !== "number" || !Number.isSafeInteger(data.totalAmount) ||
      typeof data.currency !== "string" || typeof data.status !== "string") throw new Error("Payment response unavailable");
  return { orderId: data.orderId, paymentKey: data.paymentKey, amount: data.totalAmount, currency: data.currency,
    status: data.status === "DONE" || data.status === "CANCELED" || data.status === "PARTIAL_CANCELED" ? data.status : "PENDING" };
}

/** Prepared adapter, not wired into checkout. Provider docs checked 2026-10-05:
 * POST billing accepts Idempotency-Key; GET payments/orders/{orderId} supports reconciliation.
 * https://docs.tosspayments.com/reference/using-api/authorization
 * https://docs.tosspayments.com/reference
 * Approval can take 60s: integration must choose route/runtime budget > this 65s timeout.
 */
export function createTossBillingProvider(ports: TossBillingPorts): BillingProvider {
  const request = async (path: string, init: RequestInit, timeoutMs = 65_000): Promise<Response> => {
    try {
      const authorization = await ports.authorization();
      if (!authorization.startsWith("Basic ")) throw new Error("Payment configuration unavailable");
      return await ports.fetch(`https://api.tosspayments.com/v1${path}`, {
        ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(timeoutMs),
        headers: { ...init.headers, Authorization: authorization },
      });
    } catch { throw new Error("Payment provider unavailable"); }
  };
  return {
    async charge(intent: Readonly<BillingIntent>) {
      if (!/^[a-zA-Z0-9_-]{6,64}$/.test(intent.orderId) ||
          !intent.idempotencyKey || intent.idempotencyKey.length > 300) throw new Error("Payment request unavailable");
      let billingKey: string;
      try { billingKey = await ports.resolvePaymentMethod(intent.paymentMethodRef, intent.userId); }
      catch { throw new Error("Payment method unavailable"); }
      if (!billingKey) throw new Error("Payment method unavailable");
      const response = await request(`/billing/${encodeURIComponent(billingKey)}`, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": intent.idempotencyKey },
        body: JSON.stringify({ customerKey: intent.customerRef, amount: intent.amount,
          orderId: intent.orderId, orderName: `DealMind ${intent.plan} ${intent.cycle}` }),
      });
      if (!response.ok) throw new Error("Payment approval unavailable");
      try { return paymentFromResponse(await response.json()); }
      catch { throw new Error("Payment response unavailable"); }
    },
    async lookupByOrder(intent: Readonly<BillingIntent>) {
      const response = await request(`/payments/orders/${encodeURIComponent(intent.orderId)}`, { method: "GET" }, ports.lookupTimeoutMs ?? 65_000);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Payment lookup unavailable");
      try { return paymentFromResponse(await response.json()); }
      catch { throw new Error("Payment response unavailable"); }
    },
  };
}
