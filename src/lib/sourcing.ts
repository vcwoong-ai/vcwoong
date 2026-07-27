import { DealSector, DealSourceType, InboundStatus } from "@prisma/client";
import { generateText } from "@/lib/claude";

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

/**
 * 인바운드 딜 1차 스크리닝.
 * 팀·시장·제품·트랙션·라운드 적합성을 100점 만점으로 채점한다.
 */
export async function screenInboundDeal(input: {
  companyName: string;
  sector?: DealSector;
  summary?: string | null;
  rawText?: string | null;
}): Promise<ScreeningResult> {
  const body = [input.summary, input.rawText].filter(Boolean).join("\n\n");
  const suggestedSector = input.sector ?? guessSector(`${input.companyName} ${body}`);

  const prompt = `## 인바운드 딜 1차 스크리닝
- 기업: ${input.companyName}
- 추정 섹터: ${suggestedSector}

## 제출 자료
${body.slice(0, 6000) || "제출 자료 없음"}

## 채점 기준 (각 20점)
1. 팀 — 도메인 적합성·실행 이력
2. 시장 — 규모·성장성·타이밍
3. 제품/기술 — 차별성·진입장벽
4. 트랙션 — 매출·고객·리텐션 등 검증 지표
5. 라운드 적합성 — 단계·규모·밸류 합리성

## 출력 형식 (정확히 이 형식)
[점수]
(0~100 사이 정수 하나만)

[코멘트]
- 강점: (1~2개)
- 약점: (1~2개)
- 추가 확인: (1~2개)

규칙: 자료에 없는 수치를 만들지 말 것. 정보가 부족하면 점수를 보수적으로 매기고 "자료 부족"을 명시.`;

  const result = await generateText([{ role: "user", content: prompt }], {
    systemPrompt:
      "당신은 한국 VC의 딜소싱 담당 심사역입니다. 인바운드 딜을 빠르고 보수적으로 1차 선별합니다.",
    maxTokens: 1200,
    temperature: 0.2,
  });

  return {
    score: parseScore(result.content),
    notes: parseNotes(result.content) || result.content.slice(0, 800),
    suggestedSector,
    modelUsed: result.usedModel,
  };
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
