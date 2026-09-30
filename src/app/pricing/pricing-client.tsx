"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Minus, ArrowLeft } from "lucide-react";
import {
  FEATURE_LABEL,
  PUBLIC_PLANS,
  hasFeature,
  monthlyEquivalent,
  type BillingCycle,
  type PlanFeature,
} from "@/lib/plans";
import { PLAN_LIMITS } from "@/lib/quotas";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * 업무 단위 비교 — 플랜별로 "어떤 검토 업무까지 가능한가"를 보여준다.
 * 값은 전부 lib/plans.ts(hasFeature)와 lib/quotas.ts(PLAN_LIMITS)에서 읽는다.
 * 여기서 새 한도·기능을 정의하지 않으므로, 실제 제공 범위와 표가 어긋날 수 없다.
 */
const WORK_ROWS: Array<{ group: string; label: string; feature?: PlanFeature; limit?: "reports" | "templates" }> = [
  { group: "VC 보고서", label: "월 보고서 생성", limit: "reports" },
  { group: "VC 보고서", label: "저장 가능한 양식 수", limit: "templates" },
  { group: "VC 보고서", label: FEATURE_LABEL.templateEngine, feature: "templateEngine" },
  { group: "VC 보고서", label: FEATURE_LABEL.bioExternalData, feature: "bioExternalData" },
  { group: "딜 파이프라인", label: FEATURE_LABEL.sourcing, feature: "sourcing" },
  { group: "딜 파이프라인", label: FEATURE_LABEL.portfolio, feature: "portfolio" },
  { group: "딜 파이프라인", label: FEATURE_LABEL.lpReporting, feature: "lpReporting" },
  { group: "팀", label: FEATURE_LABEL.teamCollaboration, feature: "teamCollaboration" },
];

const FAQ = [
  {
    q: "무료로 어디까지 쓸 수 있나요?",
    a: `Free 플랜에서 월 ${PLAN_LIMITS.free.reports}건까지 VC 투자심의보고서를 생성하고 DOCX로 내보낼 수 있습니다. 6개 섹터 AI 에이전트와 딜소싱 인박스도 그대로 사용합니다.`,
  },
  {
    q: "PE/M&A 워크스페이스도 플랜에 따라 달라지나요?",
    a: "현재 PE/M&A 워크스페이스(재무·QoE·LBO·DART·위원회 자료)는 별도의 플랜 제한 없이 사용할 수 있습니다. 위 표의 월 보고서 한도는 VC 보고서 생성에 적용됩니다.",
  },
  {
    q: "회사 양식 재현은 어떤 플랜부터인가요?",
    a: "Sector Pro 플랜부터 업로드한 DOCX·PPTX 양식의 섹션 구조에 맞춰 VC 보고서를 생성합니다. PE/M&A 위원회 자료에는 아직 적용되지 않습니다.",
  },
  {
    q: "LP 리포팅은 언제 필요한가요?",
    a: "펀드 단위로 포트폴리오 실적을 집계해 분기 LP 보고서를 만들려면 Multi-Sector 이상이 필요합니다.",
  },
  {
    q: "연간 결제는 얼마나 할인되나요?",
    a: "연간 결제 시 2개월분이 무료입니다(월가 × 10). 설정 페이지에서 월간/연간을 선택할 수 있습니다.",
  },
  {
    q: "언제든 해지할 수 있나요?",
    a: "설정 페이지에서 즉시 해지할 수 있고, 해지 시 Free 플랜으로 전환됩니다. 위약금은 없습니다.",
  },
];

export function PricingClient() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {BRAND.name}
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/login" className="text-muted-foreground hover:text-foreground">
              로그인
            </Link>
            <Link href="/register" className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90">
              무료로 시작
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-14">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">요금제</h1>
          <p className="mt-3 text-muted-foreground">
            가격을 공개합니다. 영업 미팅 없이 바로 시작하고, 필요한 업무가 생길 때 올리세요.
          </p>
          <div className="mt-6 inline-flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="결제 주기">
            {([
              ["monthly", "월간"],
              ["yearly", "연간 · 2개월 무료"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={cycle === key}
                onClick={() => setCycle(key)}
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

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="pricing-plans">
          {PUBLIC_PLANS.map((plan) => {
            const price = cycle === "yearly" ? plan.yearlyPrice : plan.price;
            const equiv = cycle === "yearly" && plan.price > 0 ? monthlyEquivalent(plan, "yearly") : null;
            return (
              <section
                key={plan.key}
                aria-labelledby={`plan-${plan.key}`}
                className={cn(
                  "relative flex flex-col rounded-xl border bg-card p-6",
                  plan.highlight ? "border-primary ring-1 ring-primary" : "border-border"
                )}
              >
                {plan.highlight && (
                  <span className="absolute right-4 top-4 rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    추천
                  </span>
                )}
                <h2 id={`plan-${plan.key}`} className="text-lg font-semibold text-foreground">
                  {plan.name}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tabular-nums text-foreground">
                    {price === 0 ? "무료" : `₩${price.toLocaleString()}`}
                  </span>
                  {price > 0 && (
                    <span className="text-sm text-muted-foreground">/{cycle === "yearly" ? "년" : "월"}</span>
                  )}
                </p>
                {equiv != null && <p className="mt-1 text-xs tabular-nums text-muted-foreground">월 환산 ₩{equiv.toLocaleString()}</p>}
                <ul className="mt-5 flex-1 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.key === "free" ? "/register" : `/register?plan=${plan.key}`}
                  className={cn(
                    "mt-6 rounded-lg py-2.5 text-center text-sm font-medium transition-colors",
                    plan.highlight
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-input bg-card text-foreground hover:bg-muted"
                  )}
                >
                  {plan.key === "free" ? "무료로 시작" : "가입하고 구독하기"}
                </Link>
              </section>
            );
          })}
        </div>

        {/* 업무 단위 비교 */}
        <section className="mt-16" aria-labelledby="compare-title">
          <h2 id="compare-title" className="text-xl font-semibold tracking-tight">
            어떤 업무까지 가능한가
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            기능 이름이 아니라 검토 업무 단위로 플랜을 비교합니다. 표의 값은 실제 적용되는 한도·권한과 같은 정의에서 읽어 옵니다.
          </p>
          <div className="relative mt-5 overflow-x-auto rounded-lg border border-border bg-card" data-testid="pricing-compare">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">플랜별 업무 범위 비교</caption>
              <thead>
                <tr className="border-b border-border bg-muted/60 text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">업무</th>
                  {PUBLIC_PLANS.map((plan) => (
                    <th key={plan.key} scope="col" className="px-3 py-3 text-center font-semibold text-foreground">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WORK_ROWS.map((row, i) => {
                  const showGroup = i === 0 || WORK_ROWS[i - 1].group !== row.group;
                  return (
                    <tr key={row.label} className="border-b border-border last:border-0">
                      <th scope="row" className="px-4 py-3 text-left font-normal text-foreground">
                        {showGroup && <span className="mb-0.5 block text-xs font-medium text-muted-foreground">{row.group}</span>}
                        {row.label}
                      </th>
                      {PUBLIC_PLANS.map((plan) => (
                        <td key={plan.key} className="px-3 py-3 text-center tabular-nums">
                          {row.limit ? (
                            <span className="font-medium text-foreground">{PLAN_LIMITS[plan.key][row.limit]}</span>
                          ) : row.feature && hasFeature(plan.key, row.feature) ? (
                            <>
                              <Check className="mx-auto h-4 w-4 text-primary" aria-hidden="true" />
                              <span className="sr-only">포함</span>
                            </>
                          ) : (
                            <>
                              <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" aria-hidden="true" />
                              <span className="sr-only">미포함</span>
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            PE/M&A 워크스페이스(재무 · QoE · LBO · DART · 위원회 자료)는 현재 플랜과 관계없이 사용할 수 있습니다. 월 보고서 한도는 VC 보고서 생성에 적용됩니다.
          </p>
        </section>

        <section className="mt-16 max-w-3xl" aria-labelledby="pricing-faq-title">
          <h2 id="pricing-faq-title" className="text-xl font-semibold tracking-tight">
            자주 묻는 질문
          </h2>
          <div className="mt-4 divide-y divide-border border-y border-border">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-medium text-foreground [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
