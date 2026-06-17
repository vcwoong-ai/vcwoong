import {
  Deal,
  Document,
  Report,
  ReportSection,
  User,
  Team,
  AgentType,
  DealSector,
  DealStage,
  DealStatus,
  DocumentType,
  ReportStatus,
  SectionKey,
  SectionStatus,
  UserRole,
} from "@prisma/client";

// Re-export Prisma enums
export {
  AgentType,
  DealSector,
  DealStage,
  DealStatus,
  DocumentType,
  ReportStatus,
  SectionKey,
  SectionStatus,
  UserRole,
};

// Extended types with relations
export type DealWithRelations = Deal & {
  user: User;
  documents: Document[];
  reports: Report[];
  team?: Team | null;
};

export type ReportWithSections = Report & {
  sections: ReportSection[];
  deal: Deal;
};

export type DocumentWithDeal = Document & {
  deal: Deal;
};

// IC Report section metadata
export interface SectionMeta {
  key: SectionKey;
  title: string;       // Korean title
  titleEn: string;     // English title
  order: number;
  description: string;
  minChars: number;
  maxChars: number;
}

export const SECTION_META: SectionMeta[] = [
  {
    key: SectionKey.INVESTMENT_OVERVIEW,
    title: "투자개요",
    titleEn: "Investment Overview",
    order: 1,
    description: "투자 딜의 핵심 조건 및 투자 포인트 요약",
    minChars: 300,
    maxChars: 800,
  },
  {
    key: SectionKey.COMPANY_OVERVIEW,
    title: "회사개요",
    titleEn: "Company Overview",
    order: 2,
    description: "설립 배경, 경영진, 조직 구조, 주요 연혁",
    minChars: 500,
    maxChars: 1200,
  },
  {
    key: SectionKey.PRODUCT_TECHNOLOGY,
    title: "제품/기술",
    titleEn: "Product & Technology",
    order: 3,
    description: "핵심 제품/서비스, 기술 차별성, 특허/IP",
    minChars: 600,
    maxChars: 1500,
  },
  {
    key: SectionKey.MARKET_ANALYSIS,
    title: "시장분석",
    titleEn: "Market Analysis",
    order: 4,
    description: "TAM/SAM/SOM, 경쟁사 분석, 시장 성장률",
    minChars: 500,
    maxChars: 1200,
  },
  {
    key: SectionKey.FINANCIAL_STATUS,
    title: "재무현황",
    titleEn: "Financial Status",
    order: 5,
    description: "매출, 영업이익, 현금흐름, 재무비율",
    minChars: 400,
    maxChars: 1000,
  },
  {
    key: SectionKey.VALUATION,
    title: "밸류에이션",
    titleEn: "Valuation",
    order: 6,
    description: "투자 전/후 기업가치, 비교 밸류에이션, DCF",
    minChars: 400,
    maxChars: 1000,
  },
  {
    key: SectionKey.RISK_ANALYSIS,
    title: "리스크",
    titleEn: "Risk Analysis",
    order: 7,
    description: "핵심 리스크 식별 및 완화 방안",
    minChars: 400,
    maxChars: 1000,
  },
  {
    key: SectionKey.INVESTMENT_TERMS,
    title: "투자조건",
    titleEn: "Investment Terms",
    order: 8,
    description: "투자 구조, 주요 조건, 우선주 조건",
    minChars: 300,
    maxChars: 800,
  },
  {
    key: SectionKey.OPINION_SUMMARY,
    title: "의견종합",
    titleEn: "Opinion Summary",
    order: 9,
    description: "투자 의견, 핵심 투자 포인트, 우려 사항",
    minChars: 300,
    maxChars: 800,
  },
  {
    key: SectionKey.APPENDIX,
    title: "별첨",
    titleEn: "Appendix",
    order: 10,
    description: "보조 자료, 참고 데이터, 추가 분석",
    minChars: 0,
    maxChars: 2000,
  },
];

// API response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// File upload types
export interface UploadedFile {
  id: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  parsedText?: string;
}

// AI generation types
export interface GenerationRequest {
  dealId: string;
  agentType: AgentType;
  sectionKey?: SectionKey;
  additionalContext?: string;
}

export interface GenerationResult {
  sectionKey: SectionKey;
  content: string;
  tokensUsed: number;
}

// Korean character width counting
// 한글 = 1.0, 영문/숫자 = 0.5
export function getKoreanVisualWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    // Korean Unicode range: 가-힣 (AC00-D7A3), Hangul Jamo, Compatibility Jamo
    if (
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x3130 && code <= 0x318f) ||
      (code >= 0xa960 && code <= 0xa97f) ||
      (code >= 0xd7b0 && code <= 0xd7ff)
    ) {
      width += 1.0;
    } else {
      width += 0.5;
    }
  }
  return Math.ceil(width);
}

export interface DealFormData {
  name: string;
  companyName: string;
  sector: DealSector;
  stage?: DealStage;
  description?: string;
  investAmount?: number;
  investRound?: string;
  valuation?: number;
}
