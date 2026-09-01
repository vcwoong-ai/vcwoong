"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ArrowLeft } from "lucide-react";
import {
  PUBLIC_PLANS,
  monthlyEquivalent,
  type BillingCycle,
} from "@/lib/plans";
import { BRAND } from "@/lib/brand";

const FAQ = [
  {
    q: "무료로 어디까지 쓸 수 있나요?",
    a: "Free 플랜에서 월 5건까지 투자심의보고서를 생성하고 DOCX로 내보낼 수 있습니다. 6개 섹터 AI 에이전트와 딜소싱 인박스도 그대로 사용합니다.",
  },
  {
    q: "회사 양식 재현은 어떤 플랜부터인가요?",
    a: "Sector Pro 플랜부터 업로드한 DOCX·PPTX 양식의 섹션 구조에 맞춰 보고서를 생성합니다.",
  },
  {
    q: "LP 리포팅은 언제 필요한가요?",
    a: "펀드 단위로 포트폴리오 실적을 집계해 분기 LP 보고서를 만들려면 Multi-Sector 이상이 필요합니다.",
  },
  {
    q: "연간 결제는 얼마나 할인되나요?",
    a: "연간 결제 시 2개월분이 무료입니다 (월가 × 10). 설정 페이지에서 월간/연간을 선택할 수 있습니다.",
  },
  {
    q: "언제든 해지할 수 있나요?",
    a: "설정 페이지에서 즉시 해지할 수 있고, 해지 시 Free 플랜으로 전환됩니다. 위약금은 없습니다.",
  },
];

export function PricingClient() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            {BRAND.name}
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/login" className="text-gray-600 hover:text-gray-900">
              로그인
            </Link>
            <Link
              href="/register"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              무료로 시작
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/illustrations/pricing-hero.svg"
            alt=""
            className="w-40 mx-auto mb-6"
          />
          <h1 className="text-4xl font-bold text-gray-900">요금제</h1>
          <p className="text-gray-500 mt-3">
            가격을 공개합니다. 영업 미팅 없이 바로 시작하고, 필요할 때 올리세요.
          </p>
          <div className="inline-flex items-center gap-3 mt-6">
            <span className={`text-sm ${cycle === "monthly" ? "text-gray-900 font-medium" : "text-gray-400"}`}>
              월간
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={cycle === "yearly"}
              onClick={() => setCycle(cycle === "monthly" ? "yearly" : "monthly")}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                cycle === "yearly" ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  cycle === "yearly" ? "translate-x-6" : "translate-x-0"
                }`}
              />
            </button>
            <span className={`text-sm ${cycle === "yearly" ? "text-gray-900 font-medium" : "text-gray-400"}`}>
              연간 <span className="text-green-600">· 2개월 무료</span>
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {PUBLIC_PLANS.map((plan) => {
            const price = cycle === "yearly" ? plan.yearlyPrice : plan.price;
            const equiv =
              cycle === "yearly" && plan.price > 0
                ? monthlyEquivalent(plan, "yearly")
                : null;
            return (
              <div
                key={plan.key}
                className={`rounded-2xl p-6 flex flex-col ${
                  plan.highlight
                    ? "bg-slate-900 text-white relative shadow-xl scale-[1.02]"
                    : "border border-gray-200"
                }`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-6 bg-blue-500 text-white text-xs px-3 py-1 rounded-full font-medium">
                    추천
                  </span>
                )}
                <h2 className={`text-lg font-semibold ${plan.highlight ? "text-white" : "text-gray-900"}`}>
                  {plan.name}
                </h2>
                <p className={`text-sm mt-1 ${plan.highlight ? "text-slate-400" : "text-gray-500"}`}>
                  {plan.tagline}
                </p>
                <p className={`text-3xl font-bold mt-4 ${plan.highlight ? "text-white" : "text-gray-900"}`}>
                  {price === 0 ? "무료" : `₩${price.toLocaleString()}`}
                  {price > 0 && (
                    <span className={`text-sm font-normal ${plan.highlight ? "text-slate-500" : "text-gray-400"}`}>
                      /{cycle === "yearly" ? "년" : "월"}
                    </span>
                  )}
                </p>
                {equiv != null && (
                  <p className={`text-xs mt-1 ${plan.highlight ? "text-emerald-400" : "text-green-700"}`}>
                    월 환산 ₩{equiv.toLocaleString()}
                  </p>
                )}
                <ul className="mt-6 space-y-2 flex-1">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className={`flex items-start gap-2 text-sm ${
                        plan.highlight ? "text-slate-300" : "text-gray-600"
                      }`}
                    >
                      <Check
                        className={`w-4 h-4 mt-0.5 shrink-0 ${
                          plan.highlight ? "text-blue-400" : "text-blue-600"
                        }`}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.key === "free" ? "/register" : "/settings#subscription"}
                  className={`mt-6 text-center text-sm py-2.5 rounded-lg font-medium ${
                    plan.highlight
                      ? "bg-blue-500 text-white hover:bg-blue-400"
                      : "border hover:bg-gray-50"
                  }`}
                >
                  {plan.key === "free" ? "무료로 시작" : "구독하기"}
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-20 max-w-2xl mx-auto">
          <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">자주 묻는 질문</h2>
          <div className="space-y-4">
            {FAQ.map((item) => (
              <div key={item.q} className="border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-colors">
                <h3 className="font-semibold text-gray-900 flex items-start gap-2">
                  <span className="text-blue-600 text-sm font-bold flex-shrink-0 mt-0.5">Q.</span>
                  {item.q}
                </h3>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed pl-5">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
