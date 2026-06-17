import {
  BIO_PIPELINE_SECTION,
  buildDrCellSystemPrompt,
  buildPipelineUserPrompt,
} from "./bio-agent";

export interface ReportSection {
  key: string;
  title: string;
  charLimit: number;
  description: string;
}

export const REPORT_SECTIONS: ReportSection[] = [
  {
    key: "overview",
    title: "회사 개요",
    charLimit: 800,
    description: "회사의 기본 정보, 설립 배경, 핵심 사업 내용을 간결하게 요약",
  },
  {
    key: "business_model",
    title: "비즈니스 모델",
    charLimit: 1200,
    description: "수익 창출 구조, 주요 고객군, 가치 제안, 핵심 파트너십 분석",
  },
  {
    key: "market_analysis",
    title: "시장 분석",
    charLimit: 1000,
    description: "TAM/SAM/SOM 분석, 시장 성장률, 주요 트렌드 및 기회 요인",
  },
  {
    key: "competitive_landscape",
    title: "경쟁 환경",
    charLimit: 900,
    description: "주요 경쟁사 분석, 차별화 요소, 경쟁 우위 분석",
  },
  {
    key: "technology",
    title: "기술 및 제품",
    charLimit: 1000,
    description: "핵심 기술 스택, 제품/서비스 현황, 개발 로드맵, 지적재산권",
  },
  {
    key: "team",
    title: "경영진 및 팀",
    charLimit: 800,
    description: "창업팀 배경, 핵심 역량, 조직 구조 및 채용 계획",
  },
  {
    key: "financials",
    title: "재무 현황",
    charLimit: 1000,
    description: "매출 실적, 수익성 지표, 자금 소모율, 재무 전망",
  },
  {
    key: "investment_terms",
    title: "투자 조건",
    charLimit: 700,
    description: "투자 금액, 지분율, 밸류에이션 근거, 사용 계획",
  },
  {
    key: "risk_factors",
    title: "리스크 요인",
    charLimit: 800,
    description: "주요 사업 리스크, 시장 리스크, 규제 리스크 및 대응 방안",
  },
  {
    key: "investment_opinion",
    title: "투자 의견",
    charLimit: 600,
    description: "종합 평가, 투자 추천 여부, 핵심 투자 논거 및 조건",
  },
];

export const BIO_KEYWORDS = [
  "임상", "IND", "FDA", "rNPV", "파이프라인", "신약", "바이오", "의약품",
  "임상시험", "승인", "허가", "플랫폼기술", "치료제", "진단", "헬스케어",
  "의료기기", "CMO", "CRO", "API", "생물학적", "항체", "유전자",
];

export function detectSector(text: string): string {
  const lowerText = text.toLowerCase();
  const bioScore = BIO_KEYWORDS.filter((kw) =>
    text.includes(kw) || lowerText.includes(kw.toLowerCase())
  ).length;

  if (bioScore >= 3) return "BIO";
  return "GENERAL";
}

/**
 * Returns the ordered list of sections to generate for a given sector.
 * For BIO/healthcare the Dr. Cell pipeline section is inserted after
 * 'technology' and before 'team', so pipeline analysis flows naturally
 * in the report structure.
 */
export function getSectionsForSector(sector: string): ReportSection[] {
  if (sector !== "BIO") return REPORT_SECTIONS;

  const sections = [...REPORT_SECTIONS];
  const techIdx = sections.findIndex((s) => s.key === "technology");
  const insertAt = techIdx >= 0 ? techIdx + 1 : sections.length;
  sections.splice(insertAt, 0, BIO_PIPELINE_SECTION);
  return sections;
}

export function buildPrompt(
  section: ReportSection,
  extractedText: string,
  sector: string
): { system: string; user: string } {
  const isBio = sector === "BIO";

  // Pipeline section uses a dedicated Dr. Cell prompt
  if (isBio && section.key === "bio_pipeline") {
    return {
      system: buildDrCellSystemPrompt(section.title, section.charLimit),
      user: buildPipelineUserPrompt(extractedText),
    };
  }

  const system = isBio
    ? buildDrCellSystemPrompt(section.title, section.charLimit)
    : `당신은 한국 벤처캐피탈 심사역 보조 AI입니다. 투자심의보고서의 '${section.title}' 섹션을 작성합니다. 한글 1자=1.0, 영문=0.5로 계산하여 ${section.charLimit}자 이내로 작성하세요. 전문적이고 객관적인 한국어로 작성하세요.`;

  const user =
    `다음 자료를 바탕으로 투자심의보고서의 '${section.title}' 섹션을 작성하세요.\n\n` +
    `작성 지침: ${section.description}\n\n` +
    `--- 자료 시작 ---\n${extractedText.slice(0, 8000)}\n--- 자료 끝 ---\n\n` +
    `출력 형식(JSON만 출력):\n` +
    `{"title": "${section.title}", "content": "섹션 내용 (${section.charLimit}자 이내)", "keyPoints": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"]}`;

  return { system, user };
}
