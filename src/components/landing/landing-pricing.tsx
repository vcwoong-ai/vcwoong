"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import {
  PUBLIC_PLANS,
  monthlyEquivalent,
  type BillingCycle,
} from "@/lib/plans";

/** 랜딩 #pricing — /pricing 과 동일하게 월간/연간 토글 */
export function LandingPricing() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <section id="pricing" className="py-24 px-6 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-gray-900">투명한 가격 정책</h2>
          <p className="text-gray-500 mt-3">모든 플랜에 6개 AI 에이전트 포함</p>
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 mt-6 bg-white">
            <button
              type="button"
              onClick={() => setCycle("monthly")}
              className={`text-sm px-4 py-2 rounded-md transition-colors ${
                cycle === "monthly" ? "bg-gray-900 text-white" : "text-gray-600"
              }`}
            >
              월간
            </button>
            <button
              type="button"
              onClick={() => setCycle("yearly")}
              className={`text-sm px-4 py-2 rounded-md transition-colors ${
                cycle === "yearly" ? "bg-gray-900 text-white" : "text-gray-600"
              }`}
            >
              연간 · 2개월 무료
            </button>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {PUBLIC_PLANS.slice(0, 3).map((plan) => {
            const price = cycle === "yearly" ? plan.yearlyPrice : plan.price;
            const equiv =
              cycle === "yearly" && plan.price > 0
                ? monthlyEquivalent(plan, "yearly")
                : null;
            return (
              <div
                key={plan.key}
                className={`rounded-2xl p-8 border-2 ${
                  plan.highlight
                    ? "bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-200"
                    : "bg-white border-gray-200"
                }`}
              >
                <div className="mb-6">
                  <p
                    className={`text-sm font-semibold mb-1 ${
                      plan.highlight ? "text-blue-200" : "text-gray-500"
                    }`}
                  >
                    {plan.name}
                  </p>
                  <div className="flex items-end gap-1">
                    <span
                      className={`text-4xl font-bold ${
                        plan.highlight ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {price === 0 ? "₩0" : `₩${price.toLocaleString()}`}
                    </span>
                    <span
                      className={`text-sm mb-1 ${
                        plan.highlight ? "text-blue-200" : "text-gray-400"
                      }`}
                    >
                      /{cycle === "yearly" ? "년" : "월"}
                    </span>
                  </div>
                  {equiv != null && (
                    <p
                      className={`text-xs mt-1 ${
                        plan.highlight ? "text-blue-100" : "text-green-700"
                      }`}
                    >
                      월 환산 ₩{equiv.toLocaleString()}
                    </p>
                  )}
                  <p
                    className={`text-sm mt-1 ${
                      plan.highlight ? "text-blue-200" : "text-gray-500"
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
                          plan.highlight ? "text-blue-200" : "text-green-500"
                        }`}
                      />
                      <span className={plan.highlight ? "text-blue-100" : "text-gray-700"}>
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.price === 0 ? "/register" : "/settings#subscription"}
                  className={`block text-center py-3 rounded-xl font-semibold text-sm transition-colors ${
                    plan.highlight
                      ? "bg-white text-blue-600 hover:bg-blue-50"
                      : "bg-gray-900 text-white hover:bg-gray-700"
                  }`}
                >
                  {plan.price === 0 ? "무료로 시작" : `${plan.name} 시작하기`}
                </Link>
              </div>
            );
          })}
        </div>
        <p className="text-center mt-10">
          <Link href="/pricing" className="text-sm text-blue-600 hover:underline font-medium">
            전체 6개 플랜 비교 보기 →
          </Link>
        </p>
      </div>
    </section>
  );
}
