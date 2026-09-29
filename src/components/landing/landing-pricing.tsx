"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CheckCircle } from "lucide-react";
import {
  PUBLIC_PLANS,
  monthlyEquivalent,
  type BillingCycle,
} from "@/lib/plans";

/** 랜딩 #pricing — /pricing 과 동일하게 월간/연간 토글 */
export function LandingPricing() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const { status } = useSession();
  /** 로그인 상태면 바로 설정으로, 아니면 가입부터 — 플랜 정보를 함께 넘겨
   * 가입 직후 그 플랜이 보이는 화면으로 이어지게 한다(비로그인 사용자가
   * /settings로 가면 로그인 화면에 막혀 어떤 플랜을 보려던 건지 사라졌었다). */
  const upgradeHref = (planKey: string) =>
    status === "authenticated" ? "/settings#subscription" : `/register?plan=${planKey}`;

  return (
    <section id="pricing" className="py-24 px-6 bg-white">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs font-mono tracking-[0.2em] text-black/40 mb-3 uppercase">Pricing</p>
        <div className="mb-10">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-black">투명한 가격 정책</h2>
          <p className="text-black/50 mt-3">모든 플랜에 6개 AI 에이전트 포함</p>
          <div className="inline-flex rounded-sm border border-black/15 p-0.5 mt-6 bg-white">
            <button
              type="button"
              onClick={() => setCycle("monthly")}
              className={`text-sm px-4 py-2 rounded-sm transition-colors ${
                cycle === "monthly" ? "bg-black text-white" : "text-black/60"
              }`}
            >
              월간
            </button>
            <button
              type="button"
              onClick={() => setCycle("yearly")}
              className={`text-sm px-4 py-2 rounded-sm transition-colors ${
                cycle === "yearly" ? "bg-black text-white" : "text-black/60"
              }`}
            >
              연간 · 2개월 무료
            </button>
          </div>
        </div>
        <div className="grid md:grid-cols-3 border-t border-l border-black/15">
          {PUBLIC_PLANS.slice(0, 3).map((plan) => {
            const price = cycle === "yearly" ? plan.yearlyPrice : plan.price;
            const equiv =
              cycle === "yearly" && plan.price > 0
                ? monthlyEquivalent(plan, "yearly")
                : null;
            return (
              <div
                key={plan.key}
                className={`relative p-8 border-b border-r border-black/15 ${
                  plan.highlight ? "bg-black text-white" : "bg-white"
                }`}
              >
                {plan.highlight && (
                  <span className="absolute top-4 right-4 text-[10px] font-mono tracking-wider uppercase text-black bg-white px-2.5 py-1 rounded-full">
                    가장 많이 선택
                  </span>
                )}
                <div className="mb-6">
                  <p
                    className={`text-xs font-mono tracking-wider uppercase mb-2 ${
                      plan.highlight ? "text-white/50" : "text-black/40"
                    }`}
                  >
                    {plan.name}
                  </p>
                  <div className="flex items-end gap-1">
                    <span
                      className={`text-4xl font-semibold font-mono ${
                        plan.highlight ? "text-white" : "text-black"
                      }`}
                    >
                      {price === 0 ? "₩0" : `₩${price.toLocaleString()}`}
                    </span>
                    <span
                      className={`text-sm mb-1 ${
                        plan.highlight ? "text-white/50" : "text-black/40"
                      }`}
                    >
                      /{cycle === "yearly" ? "년" : "월"}
                    </span>
                  </div>
                  {equiv != null && (
                    <p
                      className={`text-xs mt-1 font-mono ${
                        plan.highlight ? "text-white/60" : "text-black/50"
                      }`}
                    >
                      월 환산 ₩{equiv.toLocaleString()}
                    </p>
                  )}
                  <p
                    className={`text-sm mt-2 ${
                      plan.highlight ? "text-white/60" : "text-black/50"
                    }`}
                  >
                    {plan.tagline}
                  </p>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle
                        className={`w-4 h-4 flex-shrink-0 ${
                          plan.highlight ? "text-white/50" : "text-black/40"
                        }`}
                      />
                      <span className={plan.highlight ? "text-white/80" : "text-black/70"}>
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.price === 0 ? "/register" : upgradeHref(plan.key)}
                  className={`block text-center py-3 rounded-sm font-medium text-sm transition-colors ${
                    plan.highlight
                      ? "bg-white text-black hover:bg-white/90"
                      : "bg-black text-white hover:bg-black/80"
                  }`}
                >
                  {plan.price === 0 ? "무료로 시작" : `${plan.name} 시작하기`}
                </Link>
              </div>
            );
          })}
        </div>
        <p className="text-center mt-10">
          <Link href="/pricing" className="text-sm text-black/60 hover:text-black hover:underline font-medium">
            전체 6개 플랜 비교 보기 →
          </Link>
        </p>
      </div>
    </section>
  );
}
