import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white py-24 px-6 text-center overflow-hidden">
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-400 to-transparent" />
      <div className="relative max-w-4xl mx-auto space-y-6">
        <div className="inline-flex items-center gap-2 bg-blue-900/50 border border-blue-700 rounded-full px-4 py-1.5 text-sm text-blue-300">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          현재 베타 모집 중
        </div>
        <h1 className="text-4xl md:text-6xl font-bold leading-tight">
          섹터별 전문 AI 심사역
          <br />
          <span className="text-blue-400">6명을 고용하세요</span>
        </h1>
        <p className="text-lg text-gray-300 max-w-2xl mx-auto">
          IR 자료 한 번 업로드로, 우리 회사 양식에 맞춰 완성된 투자심사보고서.
          BIO·IT·AI·제조·콘텐츠·핀테크 6개 섹터 전문 에이전트가 분석합니다.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button size="lg" asChild className="bg-blue-500 hover:bg-blue-600 text-white px-8">
            <Link href="/register">무료로 시작하기</Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="border-gray-600 text-gray-300 hover:bg-white/10">
            <Link href="/dashboard">데모 보기</Link>
          </Button>
        </div>
        <p className="text-xs text-gray-500">신용카드 불필요 · 첫 보고서 1건 무료</p>
      </div>
    </section>
  );
}
