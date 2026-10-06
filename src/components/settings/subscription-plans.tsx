"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { PLANS } from "@/lib/subscription";
import type { PlanKey } from "@/lib/quotas";
import { BRAND } from "@/lib/brand";
import {
  PUBLIC_PLANS,
  monthlyEquivalent,
  type BillingCycle,
} from "@/lib/plans";
import { useConfirm } from "@/hooks/use-confirm";
import { SUBSCRIPTION_CHECKOUT_NOTICE } from "@/lib/payments/checkout-readiness";

interface SubscriptionPlansProps {
  userId: string;
  currentPlan: PlanKey;
  hasBillingKey: boolean;
  checkoutReady: boolean;
  billingPeriodInfo?: { paidUntil: string; cancelAtPeriodEnd: boolean };
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
  currentPlan,
  hasBillingKey,
  checkoutReady,
  billingPeriodInfo,
}: SubscriptionPlansProps) {
  const searchParams = useSearchParams();
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const confirm = useConfirm();

  async function handleCancel() {
    const ok = await confirm({
      title: "구독을 해지할까요?",
      description: billingPeriodInfo
        ? "다음 갱신을 중단합니다. 이미 결제한 기간이 끝날 때까지 유료 기능을 이용할 수 있습니다. 자동 환불은 제공되지 않습니다."
        : "Free 플랜으로 전환되며 유료 기능을 쓸 수 없게 됩니다.",
      confirmLabel: billingPeriodInfo ? "갱신 중단" : "구독 해지",
      destructive: true,
    });
    if (!ok) return;
    setCanceling(true);
    setMessage(null);
    try {
      const res = await fetch("/api/payments/cancel", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "해지 실패");
      }
      window.location.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "해지 중 오류가 발생했습니다");
      setCanceling(false);
    }
  }

  useEffect(() => {
    const payment = searchParams.get("payment");
    if (payment === "success") {
      setMessage("결제 처리가 완료되었습니다. 아래에서 현재 플랜을 확인해 주세요.");
    } else if (payment === "fail") {
      setMessage("결제 수단 인증이 완료되지 않았습니다. 기존 결제 요청의 상태를 먼저 확인해 주세요.");
    } else if (payment === "pending") {
      setMessage("결제 결과를 확인하고 있습니다. 새로 결제하지 마시고 잠시 후 구독 상태를 확인해 주세요.");
    } else if (payment === "hold") {
      setMessage(`결제 요청에 확인이 필요합니다. 새로 결제하지 마시고 ${BRAND.supportEmail}으로 문의해 주세요.`);
    } else if (payment === "not_configured") {
      setMessage("결제 서비스 연결이 준비되지 않았습니다. 서비스 관리자에게 문의해 주세요.");
    } else if (payment === "not_ready") {
      setMessage(SUBSCRIPTION_CHECKOUT_NOTICE);
    } else if (payment === "charged_not_activated") {
      // 결제는 성사됐는데 활성화가 실패한 경우 — 여기서 "다시 시도"를
      // 안내하면 이중 결제로 이어진다.
      setMessage(
        `결제는 완료됐지만 플랜 활성화 처리에 실패했습니다. ` +
          `다시 결제하지 마시고 ${BRAND.supportEmail}으로 문의해 주세요. 확인 후 바로 적용해 드립니다.`
      );
    } else if (payment === "error") {
      setMessage("결제 처리 중 오류가 발생했습니다.");
    }
  }, [searchParams]);

  async function handleUpgrade(planKey: PlanKey) {
    if (!checkoutReady) {
      setMessage(SUBSCRIPTION_CHECKOUT_NOTICE);
      return;
    }
    if (planKey === "free" || planKey === currentPlan) return;

    const plan = PLANS[planKey];
    if (!plan || plan.price === 0) return;

    setLoadingPlan(planKey);
    setMessage(null);

    try {
      const prepared = await fetch("/api/payments/checkout", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: planKey, cycle }) });
      if (!prepared.ok) {
        setMessage(prepared.status === 409
          ? `기존 결제 요청을 확인해야 합니다. 새로 결제하지 마시고 ${BRAND.supportEmail}으로 문의해 주세요.`
          : "결제 요청을 준비할 수 없습니다. 서비스 관리자에게 문의해 주세요.");
        return;
      }
      const checkout = await prepared.json() as { customerKey: string; successUrl: string; failUrl: string };
      if (typeof checkout.customerKey !== "string" || !checkout.customerKey ||
          new URL(checkout.successUrl).origin !== window.location.origin ||
          new URL(checkout.failUrl).origin !== window.location.origin) throw new Error("Checkout unavailable");
      const { loadTossPayments } = await import("@tosspayments/payment-sdk");
      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
      if (!clientKey) {
        setMessage("결제 서비스 연결이 준비되지 않았습니다. 서비스 관리자에게 문의해 주세요.");
        return;
      }

      const tossPayments = await loadTossPayments(clientKey);
      await tossPayments.requestBillingAuth("카드", {
        customerKey: checkout.customerKey,
        successUrl: checkout.successUrl,
        failUrl: checkout.failUrl,
      });
    } catch {
      setMessage("결제창을 열 수 없습니다. 기존 결제 요청의 상태를 먼저 확인해 주세요.");
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="space-y-4">
      {!checkoutReady && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="status">
          {SUBSCRIPTION_CHECKOUT_NOTICE}
        </p>
      )}
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

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">결제 주기</span>
        <div className="inline-flex rounded-lg border p-0.5">
          <button
            type="button"
            onClick={() => setCycle("monthly")}
            className={`text-xs px-3 py-1.5 rounded-md ${
              cycle === "monthly" ? "bg-gray-900 text-white" : "text-gray-600"
            }`}
          >
            월간
          </button>
          <button
            type="button"
            onClick={() => setCycle("yearly")}
            className={`text-xs px-3 py-1.5 rounded-md ${
              cycle === "yearly" ? "bg-gray-900 text-white" : "text-gray-600"
            }`}
          >
            연간 · 2개월 무료
          </button>
        </div>
      </div>

      {hasBillingKey && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          등록된 결제 수단이 있습니다.
        </p>
      )}

      {(currentPlan !== "free" || billingPeriodInfo) && (
        <div className="rounded-lg border p-3 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {billingPeriodInfo
              ? `결제된 이용 기간의 종료일은 ${new Date(billingPeriodInfo.paidUntil).toLocaleDateString("ko-KR")}입니다. ${billingPeriodInfo.cancelAtPeriodEnd ? "갱신 중단이 예약되었습니다." : "갱신을 중단해도 이미 결제한 기간은 유지됩니다."}`
              : "구독을 해지하면 즉시 Free 플랜으로 전환됩니다. 위약금은 없습니다."}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={canceling || billingPeriodInfo?.cancelAtPeriodEnd}
            onClick={handleCancel}
          >
            {canceling ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            {billingPeriodInfo?.cancelAtPeriodEnd ? "갱신 중단 예약됨" : billingPeriodInfo ? "갱신 중단" : "구독 해지"}
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {PLAN_ORDER.map((key) => {
          const plan = PLANS[key];
          const pub = PUBLIC_PLANS.find((p) => p.key === key);
          const isCurrent = key === currentPlan;
          const isUpgrade =
            PLAN_ORDER.indexOf(key) > PLAN_ORDER.indexOf(currentPlan);
          const displayPrice =
            cycle === "yearly" && pub
              ? pub.yearlyPrice
              : plan.price;
          const equiv =
            cycle === "yearly" && pub && pub.price > 0
              ? monthlyEquivalent(pub, "yearly")
              : null;

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
                    {displayPrice === 0
                      ? "무료"
                      : cycle === "yearly"
                        ? `₩${displayPrice.toLocaleString()}/년`
                        : `₩${displayPrice.toLocaleString()}/월`}
                  </p>
                  {equiv != null && (
                    <p className="text-xs text-green-700 mt-0.5">
                      월 환산 ₩{equiv.toLocaleString()} (2개월 무료)
                    </p>
                  )}
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
                  disabled={!checkoutReady || loadingPlan !== null}
                  onClick={() => handleUpgrade(key)}
                >
                  {!checkoutReady ? "유료 구독 준비 중" : loadingPlan === key ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      처리 중...
                    </>
                  ) : cycle === "yearly" ? (
                    "연간 업그레이드"
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
