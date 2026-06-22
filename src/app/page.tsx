import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { ComparisonTable } from "@/components/landing/comparison-table";
import { Pricing } from "@/components/landing/pricing";
import { Footer } from "@/components/landing/footer";

export const metadata = {
  title: "DealSync - 섹터별 AI 심사역 SaaS",
  description:
    "바이오/IT/AI/제조/콘텐츠/핀테크 6개 섹터 전문 AI가 투자심사보고서를 자동 생성합니다.",
  keywords: ["VC", "벤처캐피털", "AI 심사역", "투자심사보고서", "바이오 투자"],
  openGraph: {
    title: "DealSync",
    description: "섹터별 전문 AI 심사역 6명을 고용하세요",
  },
};

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main>
      <Hero />
      <Features />
      <ComparisonTable />
      <Pricing />
      <Footer />
    </main>
  );
}
