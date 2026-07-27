import Link from "next/link";
import { Check, ArrowLeft } from "lucide-react";
import { PUBLIC_PLANS } from "@/lib/plans";
import { BRAND } from "@/lib/brand";

export const metadata = {
  title: `가격 — ${BRAND.name}`,
  description:
    "Vcwoong 요금제. 무료로 시작하고, 필요할 때 섹터·양식·LP 리포팅을 확장하세요.",
};

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
    q: "언제든 해지할 수 있나요?",
    a: "설정 페이지에서 즉시 해지할 수 있고, 해지 시 Free 플랜으로 전환됩니다. 위약금은 없습니다.",
  },
  {
    q: "연간 계약이나 온프레미스도 가능한가요?",
    a: "가능합니다. 팀 규모와 보안 요건에 따라 별도 협의합니다.",
  },
];

export default function PricingPage() {
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
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900">요금제</h1>
          <p className="text-gray-500 mt-3">
            가격을 공개합니다. 영업 미팅 없이 바로 시작하고, 필요할 때 올리세요.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {PUBLIC_PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`rounded-2xl border p-6 flex flex-col ${
                plan.highlight
                  ? "border-blue-500 ring-2 ring-blue-100 relative"
                  : "border-gray-200"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-6 bg-blue-600 text-white text-xs px-3 py-1 rounded-full">
                  가장 많이 선택
                </span>
              )}
              <h2 className="text-lg font-bold text-gray-900">{plan.name}</h2>
              <p className="text-xs text-gray-500 mt-1">{plan.tagline}</p>
              <p className="mt-4">
                <span className="text-3xl font-bold text-gray-900">
                  {plan.price === 0
                    ? "₩0"
                    : `₩${plan.price.toLocaleString()}`}
                </span>
                {plan.price > 0 && (
                  <span className="text-sm text-gray-400"> /월</span>
                )}
              </p>

              <ul className="mt-6 space-y-2 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.price === 0 ? "/register" : "/settings"}
                className={`mt-6 block text-center py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  plan.highlight
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {plan.price === 0 ? "무료로 시작" : "이 플랜 선택"}
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          모든 금액은 VAT 별도입니다. 플랜은 언제든 변경·해지할 수 있습니다.
        </p>
      </section>

      <section className="border-t bg-gray-50">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
            자주 묻는 질문
          </h2>
          <div className="space-y-5">
            {FAQ.map((item) => (
              <div key={item.q} className="bg-white rounded-xl border p-5">
                <p className="font-semibold text-gray-900">{item.q}</p>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
