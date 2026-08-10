import type { Metadata, Viewport } from "next";
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

/**
 * viewport 설정이 없으면 모바일 브라우저가 데스크톱 폭(약 980px)으로 렌더한
 * 뒤 축소해서 보여줘, 글자가 읽을 수 없을 만큼 작아진다.
 * 확대는 접근성을 위해 막지 않는다(maximumScale 미지정).
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
