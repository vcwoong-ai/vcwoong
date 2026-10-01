"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { PUBLIC_PLANS, monthlyEquivalent, type BillingCycle } from "@/lib/plans";
import { cn } from "@/lib/utils";

/**
 * 랜딩 #pricing — /pricing 과 같은 정의(PUBLIC_PLANS)를 읽고 월간/연간 토글도 같다.
 * 가격·한도·포함 기능은 lib/plans.ts가 유일한 소스이며, 여기서는 표현만 한다.
 */
export function LandingPricing() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <section id="pricing" className="px-6 py-20" aria-labelledby="pricing-title">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 id="pricing-title" className="text-2xl font-semibold tracking-tight md:text-3xl">
              가격을 공개합니다
            </h2>
            <p className="mt-3 max-w-xl text-muted-foreground">
              영업 미팅 없이 바로 시작하고, 필요할 때 올리세요. 모든 플랜에 6개 섹터 AI 에이전트가 포함됩니다.
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="결제 주기">
            {([
              ["monthly", "월간"],
              ["yearly", "연간 · 2개월 무료"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCycle(key)}
                aria-pressed={cycle === key}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  cycle === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PUBLIC_PLANS.slice(0, 3).map((plan) => {
            const price = cycle === "yearly" ? plan.yearlyPrice : plan.price;
            const equiv = cycle === "yearly" && plan.price > 0 ? monthlyEquivalent(plan, "yearly") : null;
            return (
              <div
                key={plan.key}
                className={cn(
                  "relative flex flex-col rounded-xl border bg-card p-7",
                  plan.highlight ? "border-primary ring-1 ring-primary" : "border-border"
                )}
              >
                {plan.highlight && (
                  <span className="absolute right-4 top-4 rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    추천
                  </span>
                )}
                <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                <p className="mt-5 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tabular-nums text-foreground">
                    {price === 0 ? "₩0" : `₩${price.toLocaleString()}`}
                  </span>
                  <span className="text-sm text-muted-foreground">/{cycle === "yearly" ? "년" : "월"}</span>
                </p>
                {equiv != null && (
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">월 환산 ₩{equiv.toLocaleString()}</p>
                )}
                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.price === 0 ? "/register" : `/register?plan=${plan.key}`}
                  className={cn(
                    "mt-7 block rounded-lg py-2.5 text-center text-sm font-medium transition-colors",
                    plan.highlight
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-input bg-card text-foreground hover:bg-muted"
                  )}
                >
                  {plan.price === 0 ? "무료로 시작" : `${plan.name} 시작하기`}
                </Link>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          월 보고서 한도는 VC 보고서 생성에 적용됩니다. PE/M&A 워크스페이스는 현재 별도의 플랜 제한 없이 사용할 수 있습니다.{" "}
          <Link href="/pricing" className="font-medium text-primary hover:underline">
            업무별 플랜 비교와 전체 6개 플랜 보기 →
          </Link>
        </p>
      </div>
    </section>
  );
}
