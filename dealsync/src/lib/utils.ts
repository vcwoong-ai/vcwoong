import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  amount: number | null | undefined,
  currency: string = "KRW"
): string {
  if (amount == null) return "-";
  if (currency === "KRW") {
    if (amount >= 100000000) {
      return `${(amount / 100000000).toFixed(1)}억원`;
    } else if (amount >= 10000) {
      return `${(amount / 10000).toFixed(0)}만원`;
    }
    return `${amount.toLocaleString()}원`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatDateShort(date: Date | string): string {
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export const SECTORS = [
  "핀테크",
  "헬스케어",
  "AI/ML",
  "SaaS",
  "커머스",
  "에듀테크",
  "모빌리티",
  "에너지/클린테크",
  "엔터테인먼트",
  "부동산테크",
  "푸드테크",
  "HR테크",
  "사이버보안",
  "블록체인/Web3",
  "딥테크",
  "소비재",
  "기타",
];

export const STAGES = [
  "Pre-Seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C",
  "Series D+",
  "Pre-IPO",
  "기타",
];

export const DEAL_STATUSES = {
  draft: { label: "초안", color: "bg-gray-100 text-gray-700" },
  reviewing: { label: "검토중", color: "bg-blue-100 text-blue-700" },
  report_generated: { label: "보고서 완료", color: "bg-purple-100 text-purple-700" },
  approved: { label: "투자 승인", color: "bg-green-100 text-green-700" },
  rejected: { label: "투자 거절", color: "bg-red-100 text-red-700" },
  on_hold: { label: "보류", color: "bg-yellow-100 text-yellow-700" },
} as const;

export type DealStatus = keyof typeof DEAL_STATUSES;
