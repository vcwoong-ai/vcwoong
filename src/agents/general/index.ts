import { generateText } from "@/lib/claude";

const GENERAL_AGENT_PROMPT = `당신은 DealSync의 VC 투자심사 AI 에이전트입니다.
10년 이상 경력의 한국 VC 심사역 관점에서 투자심사보고서를 작성합니다.

작성 원칙:
- 실제 투자심사보고서 형식(SGC파트너스, 한국투자파트너스 수준)으로 작성
- 투자포인트는 구체적 수치와 근거 포함
- 리스크는 해결방안까지 서술
- 재무 데이터가 있으면 반드시 인용
- 없는 정보는 "확인 필요" 또는 업계 평균으로 대체
- 한국 VC 업계 용어 사용: RCPS, Pre/Post-money, IRR, Multiple, 구주/신주, Cap Table`;

export type GeneralAnalysisOutput = {
  investmentOverview: string;
  businessSummary: string;
  businessModel: string;
  marketAnalysis: string;
  competitiveLandscape: string;
  teamAssessment: string;
  financialAnalysis: string;
  investmentPoint1: string;
  investmentPoint2: string;
  investmentPoint3: string;
  risk1: string;
  risk2: string;
  risk3: string;
  valuationOpinion: string;
  exitStrategy: string;
  investmentRecommendation: string;
  questionsForFounders: string[];
};

export type GeneralAnalysisResult = {
  analysis: GeneralAnalysisOutput;
};

export async function runGeneralAnalysis(
  documentContext: string,
  companyName: string,
  sector: string = "일반"
): Promise<GeneralAnalysisResult> {
  const result = await generateText(
    [
      {
        role: "user",
        content: `다음 자료를 바탕으로 ${companyName}(섹터: ${sector})에 대한 투자심사보고서를 작성하세요.

=== 자료 ===
${documentContext.slice(0, 12000)}

=== 작성 지시 ===
실제 한국 VC 투자심사보고서 형식으로 작성하세요. 각 항목을 충실히 작성하되:
- 수치가 있으면 반드시 포함
- "~로 판단됨", "~할 것으로 예상됨" 등 심사역 어투 사용
- 투자포인트는 각각 제목 + 본문 형태로 작성 (예: "① 시장 내 독보적 1위 지위\n본문...")
- 리스크는 위험요인 + 대응방안 형태로 작성

JSON으로만 응답:
{
  "investmentOverview": "투자개요 요약 (투자형태, 금액, 기업가치, 투자재원, 공동투자자 등 자료에서 확인된 내용, 300자)",
  "businessSummary": "회사개요 및 사업 요약 (설립일, 대표자, 주요사업, 핵심서비스 설명, 500자)",
  "businessModel": "비즈니스 모델 (수익 구조, B2C/B2B/B2B2C 모델, Unit Economics, 주요 고객, 500자)",
  "marketAnalysis": "시장 분석 (TAM/SAM/SOM, 시장 규모 수치, 성장률, 정책/트렌드 환경, 500자)",
  "competitiveLandscape": "경쟁환경 분석 (주요 경쟁사 비교, 차별화 포인트, 시장 포지셔닝, 400자)",
  "teamAssessment": "팀 평가 (대표자 경력, 핵심 인력, 팀 역량 강점/약점, 300자)",
  "financialAnalysis": "재무 현황 (매출액, 영업이익, 현금 보유, 주요 재무 지표, 성장률, 있는 데이터 기준, 400자)",
  "investmentPoint1": "투자포인트 1: 제목과 근거 (400자, 가장 강력한 포인트)",
  "investmentPoint2": "투자포인트 2: 제목과 근거 (400자)",
  "investmentPoint3": "투자포인트 3: 제목과 근거 (400자)",
  "risk1": "리스크 1: 위험요인 + 대응방안 (300자)",
  "risk2": "리스크 2: 위험요인 + 대응방안 (300자)",
  "risk3": "리스크 3: 위험요인 + 대응방안 (300자)",
  "valuationOpinion": "기업가치 평가 (현재 Valuation의 적정성, 비교 기업 대비 분석, 상대가치/DCF 간략 언급, 400자)",
  "exitStrategy": "Exit 전략 (예상 Exit 경로, 상장/M&A 시나리오, 예상 Multiple/IRR, 타임라인, 400자)",
  "investmentRecommendation": "투자의견 (투자 찬반 의견, 핵심 근거, 조건부 사항, 투자 권고안, 500자)",
  "questionsForFounders": [
    "창업자에게 확인할 질문 1",
    "창업자에게 확인할 질문 2",
    "창업자에게 확인할 질문 3",
    "창업자에게 확인할 질문 4",
    "창업자에게 확인할 질문 5"
  ]
}`,
      },
    ],
    {
      systemPrompt: GENERAL_AGENT_PROMPT,
      maxTokens: 8000,
    }
  );

  let analysis: GeneralAnalysisOutput;
  try {
    const raw = result.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    analysis = JSON.parse(raw);
  } catch {
    analysis = {
      investmentOverview: result.content.slice(0, 500),
      businessSummary: companyName + " - 자료 분석 중",
      businessModel: "",
      marketAnalysis: "",
      competitiveLandscape: "",
      teamAssessment: "",
      financialAnalysis: "",
      investmentPoint1: "",
      investmentPoint2: "",
      investmentPoint3: "",
      risk1: "",
      risk2: "",
      risk3: "",
      valuationOpinion: "",
      exitStrategy: "",
      investmentRecommendation: "",
      questionsForFounders: [],
    };
  }

  return { analysis };
}
