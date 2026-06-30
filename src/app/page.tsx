import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import {
  Zap,
  CheckCircle,
  ArrowRight,
  Star,
  Database,
  Brain,
  LayoutTemplate,
  FlaskConical,
} from "lucide-react";

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900">DealSync</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-600">
            <a href="#features" className="hover:text-gray-900 transition-colors">기능</a>
            <a href="#agents" className="hover:text-gray-900 transition-colors">AI 에이전트</a>
            <a href="#pricing" className="hover:text-gray-900 transition-colors">가격</a>
            <a href="#faq" className="hover:text-gray-900 transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              로그인
            </Link>
            <Link
              href="/register"
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              무료 시작
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 bg-gradient-to-b from-slate-900 to-slate-800 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-500/30 rounded-full px-4 py-1.5 text-sm text-blue-300 mb-8">
            <Star className="w-3.5 h-3.5" />
            섹터별 전문 AI 심사역 6명을 고용하세요
          </div>
          <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6">
            투자심의보고서,<br />
            <span className="text-blue-400">AI가 초안을 씁니다</span>
          </h1>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">
            BIO·IT·AI·제조·콘텐츠·핀테크 6개 섹터 전문 AI가<br className="hidden md:block" />
            PubMed·ClinicalTrials·OpenFDA 실시간 데이터로 10섹션 IC 보고서를 자동 작성합니다.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-4 rounded-xl transition-colors text-lg"
            >
              무료로 시작하기
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white font-semibold px-8 py-4 rounded-xl transition-colors text-lg"
            >
              데모 계정으로 체험
            </Link>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            신용카드 불필요 · 5분 이내 설정 · 월 5건 무료
          </p>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-3 gap-8 border-t border-slate-700 pt-12">
            {[
              { value: "10분", label: "보고서 1건 생성 시간" },
              { value: "6개", label: "섹터 전문 AI 에이전트" },
              { value: "3개", label: "연동 외부 데이터베이스" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-bold text-blue-400">{stat.value}</div>
                <div className="text-sm text-slate-400 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">4가지 핵심 차별화</h2>
            <p className="text-gray-500 mt-3">경쟁사가 제공하지 않는 DealSync만의 기능</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                icon: Brain,
                color: "bg-purple-100 text-purple-600",
                title: "섹터 전문 AI 에이전트 6명",
                desc: "범용 AI가 아닌 BIO·IT·AI/딥테크·제조·콘텐츠·핀테크 각 분야 전문 심사역 AI. Dr. Cell은 임상 성공 확률(PoS)로 rNPV를 직접 계산합니다.",
                badge: "핵심 차별화",
              },
              {
                icon: Database,
                color: "bg-blue-100 text-blue-600",
                title: "실시간 외부 데이터 자동 주입",
                desc: "PubMed 논문, ClinicalTrials.gov 임상 현황, OpenFDA 허가 약물 데이터를 자동 조회해 보고서에 NCT 번호와 함께 인용합니다.",
                badge: "Dr. Cell 전용",
              },
              {
                icon: LayoutTemplate,
                color: "bg-green-100 text-green-600",
                title: "기존 양식 1:1 재현",
                desc: "사용 중인 IC 보고서 DOCX를 업로드하면 AI가 섹션 구조를 분석해 동일한 순서와 제목으로 보고서를 생성합니다. 승인 없이 바로 사용 가능.",
                badge: "양식 재현 엔진",
              },
              {
                icon: FlaskConical,
                color: "bg-amber-100 text-amber-600",
                title: "딜 소싱 → 사후관리 풀사이클",
                desc: "스크리닝부터 IC 준비, 심의, 투자 완료까지 딜 파이프라인 전 단계를 하나의 플랫폼에서 관리합니다.",
                badge: "풀사이클",
              },
            ].map((feat) => (
              <div key={feat.title} className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${feat.color}`}>
                    <feat.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-bold text-gray-900">{feat.title}</h3>
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                        {feat.badge}
                      </span>
                    </div>
                    <p className="text-gray-600 text-sm leading-relaxed">{feat.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Agents */}
      <section id="agents" className="py-24 px-6 bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold">전문 AI 심사역 6명</h2>
            <p className="text-slate-400 mt-3">섹터별로 다른 분석 프레임워크를 사용합니다</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {[
              { name: "Dr. Cell", sector: "BIO/헬스케어", dot: "bg-purple-400", desc: "rNPV · 임상 단계 · PubMed · FDA", special: "외부 DB 연동" },
              { name: "Code", sector: "IT/SaaS", dot: "bg-blue-400", desc: "ARR · NRR · LTV/CAC · Magic Number", special: "SaaS 지표" },
              { name: "Neuron", sector: "AI/딥테크", dot: "bg-cyan-400", desc: "TRL · GPU 유닛이코노믹스 · 딥테크 IP", special: "TRL 분석" },
              { name: "Maker", sector: "제조/하드웨어", dot: "bg-orange-400", desc: "BOM · Capex · 공급망 · ROCE", special: "원가 구조" },
              { name: "Story", sector: "콘텐츠/엔터", dot: "bg-pink-400", desc: "IP 가치 · 팬덤 경제 · K-콘텐츠", special: "IP 밸류" },
              { name: "Vault", sector: "핀테크/금융", dot: "bg-emerald-400", desc: "TPV · 신용 리스크 · NIM · 규제", special: "금융 규제" },
            ].map((agent) => (
              <div key={agent.name} className="bg-slate-800 rounded-xl p-6 border border-slate-700 hover:border-slate-500 transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${agent.dot}`} />
                  <span className="font-bold text-white">{agent.name}</span>
                  <span className="ml-auto text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full">
                    {agent.special}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mb-2">{agent.sector}</p>
                <p className="text-xs text-slate-500">{agent.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">경쟁사 비교</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">기능</th>
                  <th className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center">
                        <Zap className="w-3 h-3 text-white" />
                      </div>
                      <span className="font-bold text-blue-600">DealSync</span>
                    </div>
                  </th>
                  <th className="py-3 px-4 text-center text-gray-500 font-medium">VCNote</th>
                  <th className="py-3 px-4 text-center text-gray-500 font-medium">Skywork</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["섹터 전문 AI (6개)", true, "일부", false],
                  ["기존 양식 1:1 재현", true, false, false],
                  ["PubMed/ClinicalTrials 연동", true, false, false],
                  ["rNPV 자동 계산", true, false, false],
                  ["한국 VC 보고서 특화", true, true, false],
                  ["가격 공개 (셀프서브)", true, false, false],
                  ["DOCX 내보내기", true, true, true],
                ].map(([feature, ds, vcnote, skywork], i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-700">{feature as string}</td>
                    {[ds, vcnote, skywork].map((val, j) => (
                      <td key={j} className="py-3 px-4 text-center">
                        {val === true ? (
                          <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                        ) : val === false ? (
                          <span className="text-gray-300 text-lg">—</span>
                        ) : (
                          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{val as string}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">투명한 가격 정책</h2>
            <p className="text-gray-500 mt-3">모든 플랜에 6개 AI 에이전트 포함</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                name: "Free",
                price: "₩0",
                period: "/월",
                desc: "개인 심사역 체험",
                features: [
                  "월 5건 보고서",
                  "6개 AI 에이전트",
                  "DOCX 내보내기",
                  "문서 업로드 50MB",
                ],
                cta: "무료로 시작",
                href: "/register",
                highlight: false,
              },
              {
                name: "Pro",
                price: "₩99,000",
                period: "/월",
                desc: "활성 VC 심사역",
                features: [
                  "월 50건 보고서",
                  "6개 AI 에이전트",
                  "양식 재현 엔진",
                  "PubMed/FDA 연동",
                  "우선 지원",
                ],
                cta: "Pro 시작하기",
                href: "/register",
                highlight: true,
              },
              {
                name: "Team",
                price: "₩299,000",
                period: "/월",
                desc: "VC 팀 전체",
                features: [
                  "월 무제한 보고서",
                  "팀원 최대 10명",
                  "공유 양식 라이브러리",
                  "딜 공동 편집",
                  "LP 리포팅",
                  "전담 온보딩",
                ],
                cta: "팀 플랜 문의",
                href: "/register",
                highlight: false,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-8 border-2 ${
                  plan.highlight
                    ? "bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-200"
                    : "bg-white border-gray-200"
                }`}
              >
                <div className="mb-6">
                  <p className={`text-sm font-semibold mb-1 ${plan.highlight ? "text-blue-200" : "text-gray-500"}`}>
                    {plan.name}
                  </p>
                  <div className="flex items-end gap-1">
                    <span className={`text-4xl font-bold ${plan.highlight ? "text-white" : "text-gray-900"}`}>
                      {plan.price}
                    </span>
                    <span className={`text-sm mb-1 ${plan.highlight ? "text-blue-200" : "text-gray-400"}`}>
                      {plan.period}
                    </span>
                  </div>
                  <p className={`text-sm mt-1 ${plan.highlight ? "text-blue-200" : "text-gray-500"}`}>
                    {plan.desc}
                  </p>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle className={`w-4 h-4 flex-shrink-0 ${plan.highlight ? "text-blue-200" : "text-green-500"}`} />
                      <span className={plan.highlight ? "text-blue-100" : "text-gray-700"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`block text-center py-3 rounded-xl font-semibold text-sm transition-colors ${
                    plan.highlight
                      ? "bg-white text-blue-600 hover:bg-blue-50"
                      : "bg-gray-900 text-white hover:bg-gray-700"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 px-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-16">자주 묻는 질문</h2>
          <div className="space-y-6">
            {[
              {
                q: "AI가 생성한 보고서를 그대로 IC에 제출할 수 있나요?",
                a: "아니요, 초안으로 활용하세요. DealSync는 심사역의 분석 시간을 80% 단축하는 도구입니다. AI가 생성한 초안을 심사역이 검토하고 편집한 후 최종 제출하는 방식을 권장합니다.",
              },
              {
                q: "기존에 사용하던 IC 보고서 양식을 그대로 쓸 수 있나요?",
                a: "네, 양식 재현 엔진을 통해 DOCX 또는 PPTX를 업로드하면 AI가 섹션 구조를 분석해 동일한 순서로 보고서를 생성합니다.",
              },
              {
                q: "BIO 섹터 보고서는 어떻게 다른가요?",
                a: "Dr. Cell 에이전트는 PubMed 논문, ClinicalTrials.gov 임상 현황, OpenFDA 승인 약물 데이터를 실시간 조회해 NCT 번호와 함께 인용합니다. rNPV 계산기도 내장되어 있습니다.",
              },
              {
                q: "데이터는 안전하게 보관되나요?",
                a: "업로드된 문서와 보고서는 암호화되어 저장되며, 귀사의 데이터로 AI 모델을 학습하지 않습니다. 팀 외부로 데이터가 공유되지 않습니다.",
              },
              {
                q: "팀 플랜은 몇 명까지 사용할 수 있나요?",
                a: "기본 팀 플랜은 10명까지 지원합니다. 대형 VC 펀드의 경우 별도 문의를 통해 맞춤 계약이 가능합니다.",
              },
            ].map((faq, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-6 hover:border-gray-300 transition-colors">
                <h3 className="font-semibold text-gray-900 mb-2 flex items-start gap-2">
                  <span className="text-blue-600 text-sm font-bold flex-shrink-0 mt-0.5">Q.</span>
                  {faq.q}
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed pl-5">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Bottom */}
      <section className="py-20 px-6 bg-blue-600 text-white">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">지금 무료로 시작하세요</h2>
          <p className="text-blue-200 mb-8">
            신용카드 없이 5분 안에 첫 번째 투자심의보고서를 생성할 수 있습니다.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-white text-blue-600 font-bold px-8 py-4 rounded-xl hover:bg-blue-50 transition-colors text-lg"
          >
            무료로 시작하기
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-white">DealSync</span>
              </div>
              <p className="text-sm">섹터별 전문 AI 심사역 6명을 고용하는<br />VC용 투자심사보고서 자동화 SaaS</p>
            </div>
            <div className="grid grid-cols-2 gap-8 text-sm">
              <div>
                <p className="text-white font-medium mb-3">제품</p>
                <div className="space-y-2">
                  <a href="#features" className="block hover:text-white transition-colors">기능</a>
                  <a href="#agents" className="block hover:text-white transition-colors">AI 에이전트</a>
                  <a href="#pricing" className="block hover:text-white transition-colors">가격</a>
                </div>
              </div>
              <div>
                <p className="text-white font-medium mb-3">계정</p>
                <div className="space-y-2">
                  <Link href="/login" className="block hover:text-white transition-colors">로그인</Link>
                  <Link href="/register" className="block hover:text-white transition-colors">회원가입</Link>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-800 mt-8 pt-8 text-xs text-center">
            © 2026 DealSync. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
