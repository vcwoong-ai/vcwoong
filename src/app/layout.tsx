import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

const siteUrl = process.env.NEXTAUTH_URL ?? "https://dealsync-vcwoong.vercel.app";

export const metadata: Metadata = {
  title: {
    default: "DealSync — 섹터별 AI 심사역 SaaS",
    template: "%s | DealSync",
  },
  description:
    "바이오/IT/AI/제조/콘텐츠/핀테크 6개 섹터 전문 AI가 투자심의보고서를 자동 생성합니다. PubMed·ClinicalTrials·OpenFDA 실시간 연동.",
  keywords: [
    "VC",
    "벤처캐피털",
    "AI 심사역",
    "투자심의보고서",
    "IC Report",
    "바이오 투자",
    "DealSync",
  ],
  authors: [{ name: "DealSync" }],
  openGraph: {
    title: "DealSync — 섹터별 AI 심사역 SaaS",
    description: "섹터별 전문 AI 심사역 6명을 고용하세요",
    url: siteUrl,
    siteName: "DealSync",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DealSync",
    description: "AI 투자심의보고서 자동화 플랫폼",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
