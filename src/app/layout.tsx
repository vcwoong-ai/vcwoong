import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { BRAND } from "@/lib/brand";

/**
 * 숫자·영문 전용. 한글은 Pretendard가 받는다.
 *
 * Inter는 latin subset뿐이라 한글 글자가 오면 OS 기본 폰트(윈도우 맑은 고딕,
 * 맥 애플 SD 산돌고딕)로 폴백된다. 기기마다 자간·굵기가 달라 보이고 특히
 * 윈도우에서 조판이 무너져 보이는 원인이라, 한글은 Pretendard로 고정한다.
 * variable 옵션으로 CSS 변수를 받아 font-family 폴백 체인 앞단에 둔다.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

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
    "투자심의위원회 보고서",
    "바이오 투자",
    "DealMind",
    "딜마인드",
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
    <html lang="ko" className={inter.variable}>
      <head>
        {/* Pretendard(한글) — unicode-range 다이나믹 서브셋 368개라 실제 쓰인
            글자 구간만 내려받는다(보통 3~6개, 수십 KB).
            next/font/local은 파일마다 unicode-range를 지정할 수 없어 이
            방식을 쓸 수 없다. 한글 폰트를 통째로(750KB×4웨이트) 받는 것보다
            이쪽이 훨씬 가벼워서 규칙을 끈다. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/fonts/pretendard/pretendard.css" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
