import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/** 로그인 없이 접근 가능한 마케팅 페이지만 포함한다 — 앱 내부 경로는 어차피 로그인 필수라 색인 대상이 아니다. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = BRAND.url;
  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/irr-calculator`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/register`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
