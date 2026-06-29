import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { Pricing } from "@/components/landing/pricing";
import { Footer } from "@/components/landing/footer";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "DealSync — 섹터별 AI 심사역 SaaS",
  description:
    "바이오/IT/AI/제조/콘텐츠/핀테크 6개 섹터 전문 AI가 투자심사보고서를 자동 생성합니다.",
  keywords: ["VC", "벤처캐피탈", "AI 심사역", "투자심사보고서", "바이오 투자"],
  openGraph: {
    title: "DealSync",
    description: "섹터별 전문 AI 심사역 6명을 고용하세요",
  },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-slate-900/80 backdrop-blur border-b border-white/10 px-6 py-3 flex items-center justify-between">
        <span className="text-white font-bold text-lg">DealSync</span>
        <div className="flex items-center gap-3">
          <Button variant="ghost" asChild className="text-gray-300 hover:text-white">
            <Link href="/login">로그인</Link>
          </Button>
          <Button asChild className="bg-blue-500 hover:bg-blue-600 text-white">
            <Link href="/register">무료 시작</Link>
          </Button>
        </div>
      </nav>

      <main className="flex-1 pt-14">
        <Hero />
        <Features />
        <Pricing />
      </main>

      <Footer />
    </div>
  );
}
