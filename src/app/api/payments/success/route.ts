import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCheckoutRuntime } from "@/lib/payments/billing-runtime";
import { isSubscriptionCheckoutReady } from "@/lib/payments/checkout-readiness";

export const maxDuration = 120;

function redirect(request: NextRequest, result: string) {
  const response = NextResponse.redirect(new URL(`/settings?payment=${result}`, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.redirect(new URL("/login", request.url));
  if (!isSubscriptionCheckoutReady()) return redirect(request, "not_ready");
  const params = new URL(request.url).searchParams;
  const sessionId = params.get("session");
  const authKey = params.get("authKey");
  const customerKey = params.get("customerKey");
  if (!sessionId || !authKey || !customerKey) return redirect(request, "missing_params");
  const runtime = await getCheckoutRuntime();
  if (!runtime) return redirect(request, "not_configured");
  try {
    // Callback URL plan/cycle/amount fields are ignored. Only the owned persisted session binds them.
    const outcome = await runtime.callback({ userId: session.user.id, sessionId, authKey, customerKey });
    if (outcome === "SUCCEEDED") return redirect(request, "success");
    if (["UNKNOWN", "BUSY", "STALE"].includes(outcome)) return redirect(request, "pending");
    if (outcome === "MISSING") return redirect(request, "missing_params");
    return redirect(request, "hold");
  } catch {
    // Do not echo provider/auth-key errors or advise a fresh checkout after an ambiguous callback.
    return redirect(request, "hold");
  }
}
