/**
 * sourcing.ts의 클라이언트 안전 부분만 분리한 파일.
 *
 * sourcing.ts는 최상단에서 `@/lib/claude`(generateText)를 import하는데, 이
 * 파일 안의 라벨·톤 상수와 순수 헬퍼(SOURCE_LABEL, scoreTone 등)는 클라이언트
 * 컴포넌트(sourcing-page-client.tsx)에서도 쓰인다. 같은 파일에서 가져오면
 * webpack이 claude.ts(및 그 안의 Node 전용 API)까지 클라이언트 번들에 끌고
 * 들어가려 하다가 빌드가 깨진다 — 그래서 AI 호출이 필요 없는 부분만 이
 * 파일로 뽑아뒀다. 서버 쪽 코드는 그대로 sourcing.ts를 쓰면 된다(이 파일의
 * 내용을 재-export함).
 */
import { DealSector, DealSourceType, InboundStatus } from "@prisma/client";

export const SOURCE_LABEL: Record<DealSourceType, string> = {
  INBOUND: "인바운드",
  REFERRAL: "레퍼럴",
  DEMO_DAY: "데모데이",
  ACCELERATOR: "액셀러레이터",
  OUTREACH: "아웃리치",
  PARTNER: "파트너",
  OTHER: "기타",
};

export const INBOUND_STATUS_LABEL: Record<InboundStatus, string> = {
  NEW: "신규",
  REVIEWING: "검토 중",
  QUALIFIED: "적격",
  PROMOTED: "딜 전환",
  REJECTED: "보류",
};

export const INBOUND_STATUS_TONE: Record<InboundStatus, string> = {
  NEW: "bg-blue-50 text-blue-700 border-blue-200",
  REVIEWING: "bg-amber-50 text-amber-700 border-amber-200",
  QUALIFIED: "bg-green-50 text-green-700 border-green-200",
  PROMOTED: "bg-purple-50 text-purple-700 border-purple-200",
  REJECTED: "bg-gray-100 text-gray-500 border-gray-200",
};

const SECTOR_KEYWORDS: Array<{ sector: DealSector; words: string[] }> = [
  {
    sector: DealSector.BIO,
    words: ["임상", "신약", "바이오", "제약", "헬스케어", "의료기기", "FDA"],
  },
  {
    sector: DealSector.CLIMATE,
    words: ["탄소", "기후", "ESG", "재생에너지", "넷제로", "폐열", "배출권"],
  },
  {
    sector: DealSector.FINTECH,
    words: ["결제", "핀테크", "대출", "보험", "TPV", "전자금융"],
  },
  {
    sector: DealSector.CONSUMER,
    words: ["D2C", "소비재", "브랜드", "이커머스", "GMV", "뷰티", "패션"],
  },
  {
    sector: DealSector.CONTENT,
    words: ["콘텐츠", "웹툰", "게임", "엔터", "IP", "OTT", "팬덤"],
  },
  {
    sector: DealSector.MANUFACTURING,
    words: ["제조", "공장", "양산", "부품", "OEM", "ODM", "BOM"],
  },
  {
    sector: DealSector.DEEPTECH,
    words: ["LLM", "인공지능", "딥러닝", "반도체", "로봇", "양자", "GPU"],
  },
  {
    sector: DealSector.IT,
    words: ["SaaS", "ARR", "구독", "클라우드", "플랫폼", "API"],
  },
];

/** 키워드 기반 섹터 추정 (AI 없이 동작) */
export function guessSector(text: string): DealSector {
  const lower = text.toLowerCase();
  let best: { sector: DealSector; hits: number } = {
    sector: DealSector.GENERAL,
    hits: 0,
  };
  for (const { sector, words } of SECTOR_KEYWORDS) {
    const hits = words.filter((w) => lower.includes(w.toLowerCase())).length;
    if (hits > best.hits) best = { sector, hits };
  }
  return best.hits > 0 ? best.sector : DealSector.GENERAL;
}

export interface ScreeningResult {
  score: number;
  notes: string;
  suggestedSector: DealSector;
  modelUsed: string;
}

export function parseScore(text: string): number {
  const block = /\[점수\]\s*([\s\S]*?)(?=\n\s*\[|$)/.exec(text)?.[1] ?? text;
  const n = /(\d{1,3})/.exec(block);
  if (!n) return 50;
  return Math.max(0, Math.min(100, Number(n[1])));
}

export function parseNotes(text: string): string {
  return /\[코멘트\]\s*([\s\S]*?)(?=\n\s*\[|$)/.exec(text)?.[1]?.trim() ?? "";
}

export function scoreTone(score: number | null): string {
  if (score == null) return "bg-gray-100 text-gray-500";
  if (score >= 75) return "bg-green-100 text-green-700";
  if (score >= 55) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-600";
}
