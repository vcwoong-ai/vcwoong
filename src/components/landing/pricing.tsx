import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PLANS = [
  {
    id: "solo",
    name: "Solo",
    price: "9.9만원",
    period: "/월",
    desc: "1개 섹터 집중",
    features: ["보고서 20건/월", "섹터 에이전트 1개", "양식 3개 등록", "이메일 지원"],
    cta: "시작하기",
    highlight: false,
  },
  {
    id: "sector_pro",
    name: "Sector Pro",
    price: "29만원",
    period: "/월",
    desc: "1섹터 + 풀사이클",
    features: ["보고서 50건/월", "섹터 에이전트 1개", "양식 10개 등록", "풀사이클 기능", "채팅 지원"],
    cta: "시작하기",
    highlight: false,
  },
  {
    id: "multi",
    name: "Multi-Sector",
    price: "79만원",
    period: "/월",
    desc: "가장 인기",
    features: ["보고서 100건/월", "섹터 에이전트 3개 선택", "양식 30개 등록", "풀사이클", "우선 지원"],
    cta: "지금 시작",
    highlight: true,
  },
  {
    id: "full",
    name: "Full-Stack",
    price: "149만원",
    period: "/월",
    desc: "6개 섹터 전체",
    features: ["보고서 300건/월", "6개 에이전트 전체", "무제한 양식", "풀사이클", "전담 지원"],
    cta: "시작하기",
    highlight: false,
  },
];

export function Pricing() {
  return (
    <section className="py-20 px-4 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">투명한 가격 정책</h2>
        <p className="text-center text-gray-500 mb-12">숨겨진 비용 없이, 필요한 만큼만 사용하세요</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-xl p-6 border ${
                plan.highlight
                  ? "border-blue-500 bg-white shadow-lg ring-2 ring-blue-500"
                  : "border-gray-200 bg-white"
              }`}
            >
              {plan.highlight && (
                <Badge className="bg-blue-500 text-white mb-3">가장 인기</Badge>
              )}
              <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
              <p className="text-gray-500 text-sm mb-3">{plan.desc}</p>
              <div className="mb-4">
                <span className="text-2xl font-bold text-gray-900">{plan.price}</span>
                <span className="text-gray-500 text-sm">{plan.period}</span>
              </div>
              <ul className="space-y-1.5 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="text-sm text-gray-600 flex items-center gap-1.5">
                    <span className="text-green-500">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/register">
                <Button
                  className={`w-full ${
                    plan.highlight ? "bg-blue-500 hover:bg-blue-600 text-white" : ""
                  }`}
                  variant={plan.highlight ? "default" : "outline"}
                >
                  {plan.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-gray-500 mt-6">
          Bio Premium (19.9만원/월): BIO 딥다이브 풀 패키지 별도 문의
        </p>
      </div>
    </section>
  );
}
