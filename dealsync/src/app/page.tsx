import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  BarChart3,
  Brain,
  CheckCircle2,
  FileText,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "AI 보고서 자동 생성",
    description:
      "딜 정보를 입력하면 GPT-4 기반 AI가 전문적인 투자심사보고서를 수분 내에 작성합니다.",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: FileText,
    title: "한국 VC 표준 양식",
    description:
      "국내 주요 벤처캐피탈의 투자심사 기준에 맞춘 구조화된 보고서 형식을 제공합니다.",
    color: "bg-purple-50 text-purple-600",
  },
  {
    icon: BarChart3,
    title: "딜 파이프라인 관리",
    description:
      "모든 투자 검토 건을 한 곳에서 체계적으로 관리하고 진행 상황을 추적합니다.",
    color: "bg-green-50 text-green-600",
  },
  {
    icon: Zap,
    title: "빠른 초안 생성",
    description:
      "기존에 3-5일 걸리던 보고서 초안 작성을 30분 내로 단축해 심사 속도를 높입니다.",
    color: "bg-yellow-50 text-yellow-600",
  },
  {
    icon: Shield,
    title: "보안 데이터 관리",
    description:
      "기업 비공개 정보와 투자 검토 데이터를 안전하게 암호화하여 보관합니다.",
    color: "bg-red-50 text-red-600",
  },
  {
    icon: Users,
    title: "팀 협업 기능",
    description:
      "심사역, 파트너 등 팀원 간 실시간 공유 및 검토 의견 반영이 가능합니다.",
    color: "bg-indigo-50 text-indigo-600",
  },
];

const stats = [
  { value: "90%", label: "보고서 작성 시간 절감" },
  { value: "500+", label: "처리된 딜 건수" },
  { value: "30분", label: "평균 보고서 생성 시간" },
  { value: "98%", label: "사용자 만족도" },
];

const steps = [
  {
    number: "01",
    title: "딜 정보 입력",
    description: "스타트업 정보, 팀, 재무 현황, 투자 조건 등을 구조화된 양식에 입력합니다.",
  },
  {
    number: "02",
    title: "AI 분석 실행",
    description: "AI가 시장 분석, 경쟁사 비교, 리스크 평가 등을 자동으로 수행합니다.",
  },
  {
    number: "03",
    title: "보고서 완성",
    description: "투자심사보고서 초안이 생성되면 검토 후 수정하여 최종 완성합니다.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">DealSync</span>
            </div>
            <div className="hidden md:flex items-center gap-6 text-sm text-gray-600">
              <a href="#features" className="hover:text-gray-900 transition-colors">기능</a>
              <a href="#how-it-works" className="hover:text-gray-900 transition-colors">사용 방법</a>
              <a href="#pricing" className="hover:text-gray-900 transition-colors">요금제</a>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/auth/signin">
                <Button variant="ghost" size="sm">로그인</Button>
              </Link>
              <Link href="/auth/signup">
                <Button size="sm">무료로 시작하기</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/50 to-white pt-20 pb-32">
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.02]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm">
            <Sparkles className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
            GPT-4 기반 AI 투자심사 자동화
          </Badge>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight">
            투자심사보고서를
            <br />
            <span className="text-blue-600">AI가 대신 써드립니다</span>
          </h1>
          <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed">
            딜 정보만 입력하면 한국 VC 표준에 맞는 전문 투자심사보고서가
            <br className="hidden sm:block" />
            30분 내에 자동 생성됩니다. 심사역의 시간을 핵심 업무에 집중시키세요.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/auth/signup">
              <Button size="xl" className="gap-2">
                지금 무료로 시작하기
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button size="xl" variant="outline" className="gap-2">
                데모 보기
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-gray-400">신용카드 불필요 · 14일 무료 체험</p>
        </div>

        {/* Hero Image */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-16">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
              <span className="ml-4 text-xs text-gray-400 font-mono">dealsync.ai/dashboard</span>
            </div>
            <div className="p-6 bg-white">
              {/* Mock Dashboard */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: "전체 딜", value: "24", color: "bg-blue-50 text-blue-700" },
                  { label: "검토중", value: "8", color: "bg-yellow-50 text-yellow-700" },
                  { label: "보고서 완료", value: "12", color: "bg-purple-50 text-purple-700" },
                  { label: "승인", value: "4", color: "bg-green-50 text-green-700" },
                ].map((stat) => (
                  <div key={stat.label} className={`${stat.color} rounded-xl p-4`}>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <div className="text-sm mt-1 opacity-80">{stat.label}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {[
                  { name: "테크스타트업 A", sector: "AI/ML", stage: "Series A", amount: "50억원", status: "보고서 완료", statusColor: "bg-purple-100 text-purple-700" },
                  { name: "헬스케어 B", sector: "헬스케어", stage: "Seed", amount: "15억원", status: "검토중", statusColor: "bg-yellow-100 text-yellow-700" },
                  { name: "핀테크 C", sector: "핀테크", stage: "Series B", amount: "120억원", status: "투자 승인", statusColor: "bg-green-100 text-green-700" },
                ].map((deal) => (
                  <div key={deal.name} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{deal.name}</div>
                        <div className="text-xs text-gray-500">{deal.sector} · {deal.stage}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-semibold text-gray-700">{deal.amount}</div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${deal.statusColor}`}>
                        {deal.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-blue-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-4xl font-bold text-white mb-2">{stat.value}</div>
                <div className="text-blue-200 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">주요 기능</Badge>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              투자심사의 모든 과정을 효율화
            </h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              DealSync는 한국 벤처캐피탈의 투자심사 프로세스를 깊이 이해하고
              설계된 전문 도구입니다.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-2xl border border-gray-100 hover:border-blue-100 hover:shadow-lg transition-all duration-300"
              >
                <div className={`w-12 h-12 rounded-xl ${feature.color} flex items-center justify-center mb-4`}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">사용 방법</Badge>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              3단계로 완성되는 투자심사보고서
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div key={step.number} className="relative">
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-1/2 w-full h-0.5 bg-blue-100" />
                )}
                <div className="bg-white rounded-2xl p-8 border border-gray-100 relative">
                  <div className="text-5xl font-bold text-blue-100 mb-4">{step.number}</div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">{step.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-gradient-to-br from-blue-600 to-blue-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-white mb-4">
            지금 바로 시작하세요
          </h2>
          <p className="text-blue-200 text-lg mb-8 max-w-2xl mx-auto">
            DealSync로 투자심사 프로세스를 혁신하고 더 많은 딜을 더 빠르게 검토하세요.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/signup">
              <Button size="xl" variant="outline" className="bg-white text-blue-600 hover:bg-blue-50 border-white gap-2">
                무료로 시작하기
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
          </div>
          <div className="mt-8 flex items-center justify-center gap-6 text-blue-200 text-sm">
            {["14일 무료 체험", "신용카드 불필요", "언제든 취소 가능"].map((text) => (
              <div key={text} className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                {text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-bold text-gray-900">DealSync</span>
            </div>
            <p className="text-gray-400 text-sm">
              © 2024 DealSync. 한국 벤처캐피탈을 위한 AI 투자심사 자동화 플랫폼
            </p>
            <div className="flex gap-4 text-sm text-gray-400">
              <a href="#" className="hover:text-gray-600">개인정보처리방침</a>
              <a href="#" className="hover:text-gray-600">이용약관</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
