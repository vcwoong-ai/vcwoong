import { NextRequest, NextResponse } from "next/server";
import { withBillingEventService } from "@/lib/payments/billing-runtime";
import { isSubscriptionCheckoutReady } from "@/lib/payments/checkout-readiness";

export const maxDuration = 10;
const headers = { "Cache-Control": "private, no-store" };

/** Bound unauthenticated input before parsing. Never retain/log keys, provider bodies or refs. */
async function readEvent(request: NextRequest): Promise<unknown> {
  if (!request.body) throw new Error("Invalid event");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 32_768) throw new Error("Invalid event");
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** General payment webhooks have no documented Toss signature/custom shared-secret header.
 * Body fields only locate a known intent; the service verifies status through a server GET.
 * https://docs.tosspayments.com/reference/using-api/webhook-events
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await readEvent(request); }
  catch { return NextResponse.json({ error: "invalid_event" }, { status: 400, headers }); }
  if (body && typeof body === "object" && !Array.isArray(body) &&
      (body as Record<string, unknown>).eventType === "BILLING_DELETED") {
    // No independent deletion proof: even customer/billing-key-shaped bodies have no effects.
    return NextResponse.json({ ok: true, reviewRequired: true }, { status: 202, headers });
  }
  if (!isSubscriptionCheckoutReady()) {
    return NextResponse.json({ error: "not_ready" }, { status: 503, headers });
  }
  try {
    const outcome = await withBillingEventService(service => service.handle(body));
    if (!outcome || ["RETRY", "STALE"].includes(outcome)) {
      return NextResponse.json({ error: "retry_required" }, { status: 503, headers });
    }
    if (outcome === "RATE_LIMITED") return NextResponse.json({ error: "rate_limited" }, { status: 429, headers });
    return NextResponse.json({ ok: true, reviewRequired: ["UNVERIFIED", "HOLD"].includes(outcome) }, { headers });
  } catch {
    return NextResponse.json({ error: "retry_required" }, { status: 503, headers });
  }
}
