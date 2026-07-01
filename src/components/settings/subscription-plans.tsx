"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { PLANS } from "@/lib/subscription";
import type { PlanKey } from "@/lib/quotas";

interface SubscriptionPlansProps {
  userId: string;
  currentPlan: PlanKey;
  hasBillingKey: boolean;
}

const PLAN_ORDER: PlanKey[] = [
  "free",
  "solo",
  "sector_pro",
  "multi",
  "full",
  "bio_premium",
];

export function SubscriptionPlans({
  userId,
  currentPlan,
  hasBillingKey,
}: SubscriptionPlansProps) {
  const searchParams = useSearchParams();
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const payment = searchParams.get("payment");
    const plan = searchParams.get("plan");
    if (payment === "success" && plan) {
      setMessage(`${PLANS[plan as PlanKey]?.name ?? plan} 플랜이 활성화되었습니다.`);
    } else if (payment === "fail") {
      setMessage(
        searchParams.get("message") ?? "결제에 실패했습니다. 다시 시도해 주세요."
      );
    } else if (payment === "not_configured") {
      setMessage("결제 시스템이 아직 설정되지 않았습니다. (TOSS_SECRET_KEY)");
    } else if (payment === "error") {
      setMessage("결제 처리 중 오류가 발생했습니다.");
    }
  }, [searchParams]);

  async function handleUpgrade(planKey: PlanKey) {
    if (planKey === "free" || planKey === currentPlan) return;

    const plan = PLANS[planKey];
    if (!plan || plan.price === 0) return;

    setLoadingPlan(planKey);
    setMessage(null);

    try {
      const { loadTossPayments } = await import("@tosspayments/payment-sdk");
      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
      if (!clientKey) {
        setMessage("NEXT_PUBLIC_TOSS_CLIENT_KEY가 설정되지 않았습니다.");
        return;
      }

      const tossPayments = await loadTossPayments(clientKey);
      const customerKey = `dealsync-${userId}`;

      await tossPayments.requestBillingAuth("카드", {
        customerKey,
        successUrl: `${window.location.origin}/api/payments/success?plan=${planKey}`,
        failUrl: `${window.location.origin}/api/payments/fail`,
      });
    } catch (error) {
      console.error("Billing auth error:", error);
      setMessage("결제창을 열 수 없습니다. 다시 시도해 주세요.");
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            message.includes("활성화")
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {message}
        </div>
      )}

      {hasBillingKey && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          등록된 결제 수단이 있습니다. 플랜 변경 시 즉시 청구됩니다.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {PLAN_ORDER.map((key) => {
          const plan = PLANS[key];
          const isCurrent = key === currentPlan;
          const isUpgrade =
            PLAN_ORDER.indexOf(key) > PLAN_ORDER.indexOf(currentPlan);

          return (
            <div
              key={key}
              className={`rounded-lg border p-4 ${
                isCurrent ? "border-primary bg-primary/5" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-semibold">{plan.name}</h4>
                  <p className="text-lg font-bold mt-1">
                    {plan.price === 0
                      ? "무료"
                      : `₩${plan.price.toLocaleString()}/월`}
                  </p>
                </div>
                {isCurrent && <Badge>현재 플랜</Badge>}
              </div>

              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              {isUpgrade && key !== "free" && (
                <Button
                  className="w-full mt-4"
                  size="sm"
                  disabled={loadingPlan !== null}
                  onClick={() => handleUpgrade(key)}
                >
                  {loadingPlan === key ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      처리 중...
                    </>
                  ) : (
                    "업그레이드"
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
