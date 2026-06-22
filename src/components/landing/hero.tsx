import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white py-24 px-4">
      <div className="max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-400/30 rounded-full px-4 py-1.5 text-sm text-blue-300 mb-6">
          🧬 바이오·IT·AI·제조·콘텐츠·핀테크 6개 섹터 전문 AI
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
          섹터별 전문 AI 심사역{" "}
          <span className="text-blue-400">6명</span>을<br />고용하세요
        </h1>
        <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto mb-8">
          IR 자료 한 번 업로드로, <strong className="text-white">우리 회사 양식에 맞춰</strong>{" "}
          완성된 투자심사보고서를 5분 안에 받아보세요.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/register">
            <Button size="lg" className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 text-base">
              무료로 시작하기
            </Button>
          </Link>
          <Link href="/login">
            <Button
              size="lg"
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-800 px-8 py-3 text-base"
            >
              로그인
            </Button>
          </Link>
        </div>
        <p className="text-xs text-slate-500 mt-4">신용카드 불필요 · 첫 보고서 1건 무료</p>
      </div>
    </section>
  );
}
