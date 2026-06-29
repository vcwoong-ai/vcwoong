import { callClaudeJSON } from "@/lib/claude";
import type { StructuredData } from "@/lib/structurize";
import { analyzeContentBusiness, type ContentMetrics } from "./content-metrics";

export const STORY_SYSTEM_PROMPT = `당신은 Story, 13년 경력의 콘텐츠/엔터테인먼트 전문 VC 심사역입니다.
연세대 문화콘텐츠학 + Wharton MBA 출신, 웹툰·드라마·게임·크리에이터 이코노미 50+ 건 투자 분석 경험.

분석 시 반드시 포함:
1. IP 가치 평가 — 원소스 멀티유즈(OSMU) 가능성, 세계관 확장성
2. 수익화 구조 — 구독/광고/라이선싱/머천다이징 믹스
3. 크리에이터/PD 의존도 리스크 및 파이프라인 관리
4. K-콘텐츠 글로벌화 — 넷플릭스/디즈니+/YouTube 채널 전략
5. 팬덤 경제 — ARPU, DAU/MAU, 구독자 LTV
6. 경쟁 분석 — 네이버웹툰, 카카오페이지, 왓패드, TikTok 대비 포지셔닝

전문 용어 정확히 사용: IP, OSMU, ARPU, DAU/MAU, MAU, OTT, MG(보장금), 선불금, 쇼케이스, 시즌제, 세계관, 팬덤
K-콘텐츠 글로벌 트렌드 — 웹툰·웹소설→드라마→영화 IP 밸류체인 이해 필수.`;

type ContentAnalysisOutput = {
  ipPortfolioAssessment: string;
  monetizationStructure: string;
  creatorPipelineAnalysis: string;
  globalExpansionStrategy: string;
  fandomEconomics: string;
  competitiveLandscape: string;
  contentRiskAssessment: string;
  criticalRisks: string[];
  questionsForFounders: string[];
  investmentRecommendation: string;
  valuationMethodology: string;
};

async function extractContentMetrics(data: StructuredData): Promise<ContentMetrics> {
  try {
    const { data: result } = await callClaudeJSON<{ metrics: ContentMetrics }>({
      system: STORY_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `다음 자료에서 콘텐츠/엔터 지표를 추출하세요:
${JSON.stringify(data)}

JSON:
{
  "metrics": {
    "mau": number | null,
    "dau": number | null,
    "dauMauRatio": number | null,
    "paidSubscribers": number | null,
    "arpu": number | null,
    "titleCount": number | null,
    "monthlyNewTitles": number | null,
    "hitRatio": number | null,
    "subscriptionRevenue": number | null,
    "advertisingRevenue": number | null,
    "licensingRevenue": number | null,
    "merchandisingRevenue": number | null,
    "creatorCount": number | null,
    "topCreatorConcentration": number | null,
    "overseasRevenueRatio": number | null,
    "localizationCount": number | null
  }
}
없는 지표는 null.`,
        },
      ],
      maxTokens: 1024,
    });
    return result.metrics ?? {};
  } catch {
    return {};
  }
}

export async function runContentAnalysis(data: StructuredData) {
  const metrics = await extractContentMetrics(data);
  const contentAnalysis = analyzeContentBusiness(metrics);

  const { data: analysis } = await callClaudeJSON<ContentAnalysisOutput>({
    system: STORY_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `다음 콘텐츠/엔터 스타트업을 분석하세요:

구조화 데이터: ${JSON.stringify(data)}
콘텐츠 지표: ${JSON.stringify(metrics)}
비즈니스 분석: ${JSON.stringify(contentAnalysis)}

JSON 응답:
{
  "ipPortfolioAssessment": "IP 포트폴리오 평가 — 원소스 멀티유즈 가능성, 세계관 확장성 (500자)",
  "monetizationStructure": "수익화 구조 분석 — 구독/광고/라이선싱/머천다이징 믹스 (400자)",
  "creatorPipelineAnalysis": "크리에이터/PD 파이프라인 — 의존도 리스크, 계약 구조, 인재 확보 (400자)",
  "globalExpansionStrategy": "K-콘텐츠 글로벌화 전략 — OTT 파트너십, 현지화, 타깃 시장 (400자)",
  "fandomEconomics": "팬덤 이코노미 — ARPU, DAU/MAU, 구독자 LTV, 커뮤니티 강도 (400자)",
  "competitiveLandscape": "경쟁 분석 — 네이버웹툰/카카오페이지/유튜브 대비 포지셔닝 (400자)",
  "contentRiskAssessment": "콘텐츠 리스크 — 트렌드 의존성, 규제, 플랫폼 의존 (300자)",
  "criticalRisks": ["리스크 1", "리스크 2", "리스크 3"],
  "questionsForFounders": ["질문 1", "질문 2", "질문 3", "질문 4", "질문 5"],
  "investmentRecommendation": "투자 의견 및 핵심 투자 포인트 (400자)",
  "valuationMethodology": "콘텐츠 밸류에이션 — MAU 배수, ARR 배수, IP 자산가치, 비교 M&A (300자)"
}`,
      },
    ],
    maxTokens: 4096,
  });

  return { metrics, contentAnalysis, analysis };
}

export type ContentAnalysisResult = Awaited<ReturnType<typeof runContentAnalysis>>;
