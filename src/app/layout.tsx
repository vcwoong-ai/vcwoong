import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { BRAND } from "@/lib/brand";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: BRAND.fullTitle,
    template: `%s | ${BRAND.name}`,
  },
  description: BRAND.description,
  keywords: [
    "VC",
    "벤처캐피털",
    "AI 심사역",
    "투자심의보고서",
    "IC Report",
    "바이오 투자",
    "Axiom",
    "액시엄",
  ],
  authors: [{ name: BRAND.name }],
  openGraph: {
    title: BRAND.fullTitle,
    description: "섹터별 전문 AI 심사역 6명을 고용하세요",
    url: BRAND.url,
    siteName: BRAND.name,
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND.name,
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
