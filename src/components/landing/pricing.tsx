import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    id: "solo",
    name: "Solo",
    price: "9.9만원",
    period: "/월",
    desc: "1개 섹터 집중",
    features: ["보고서 20건/월", "1개 섹터 선택", "양식 3개", "이메일 지원"],
    highlight: false,
  },
  {
    id: "multi",
    name: "Multi-Sector",
    price: "79만원",
    period: "/월",
    desc: "성장하는 VC를 위한 선택",
    features: ["보고서 100건/월", "3개 섹터 자유 선택", "양식 30개", "우선 지원"],
    highlight: true,
  },
  {
    id: "full",
    name: "Full-Stack",
    price: "149만원",
    period: "/월",
    desc: "6개 섹터 전체 이용",
    features: ["보고서 300건/월", "6개 섹터 전체", "양식 무제한", "전담 CS"],
    highlight: false,
  },
  {
    id: "bio_premium",
    name: "Bio-Premium",
    price: "199만원",
    period: "/월",
    desc: "BIO 전문 VC 딥다이브",
    features: ["Full-Stack 포함", "파이프라인 NPV 고급", "FDA/MFDS 심층 분석", "KOL 네트워크 연동"],
    highlight: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-20 px-6 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-3">투명한 가격</h2>
        <p className="text-center text-gray-500 mb-12">
          모든 플랜 첫 보고서 1건 무료 · 연간 결제 시 20% 할인
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "rounded-2xl border p-6 space-y-4 flex flex-col",
                plan.highlight
                  ? "border-blue-500 bg-blue-600 text-white shadow-lg scale-105"
                  : "border-gray-200 bg-white"
              )}
            >
              {plan.highlight && (
                <span className="text-xs bg-white text-blue-600 font-semibold px-2 py-0.5 rounded-full w-fit">
                  인기
                </span>
              )}
              <div>
                <h3 className="font-bold text-lg">{plan.name}</h3>
                <p className={cn("text-xs mt-0.5", plan.highlight ? "text-blue-200" : "text-gray-400")}>
                  {plan.desc}
                </p>
              </div>
              <div>
                <span className="text-3xl font-bold">{plan.price}</span>
                <span className={cn("text-sm", plan.highlight ? "text-blue-200" : "text-gray-400")}>
                  {plan.period}
                </span>
              </div>
              <ul className="space-y-1.5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className={cn("text-sm flex items-center gap-1.5", plan.highlight ? "text-blue-100" : "text-gray-600")}>
                    <span>✓</span> {f}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className={cn(
                  "w-full",
                  plan.highlight
                    ? "bg-white text-blue-600 hover:bg-blue-50"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                )}
              >
                <Link href="/register">무료로 시작하기</Link>
              </Button>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-gray-400 mt-8">
          엔터프라이즈 · 커스텀 양식 도입 문의:{" "}
          <a href="mailto:contact@dealsync.ai" className="underline hover:text-gray-600">
            contact@dealsync.ai
          </a>
        </p>
      </div>
    </section>
  );
}
