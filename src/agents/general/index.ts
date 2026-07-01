import { generateText } from "@/lib/claude";

const GENERAL_AGENT_PROMPT = `당신은 DealSync의 VC 투자심사 AI 에이전트입니다.
10년 이상 경력의 한국 VC 심사역 관점에서 투자심사보고서를 작성합니다.

작성 원칙:
- 실제 투자심사보고서 형식 (SGC파트너스, 에스지씨케이알넷제로 수준)으로 작성
- 투자포인트는 구체적 수치와 고객 레퍼런스 포함
- 리스크는 → 대응방안 형식으로 서술
- 재무 데이터가 있으면 반드시 인용 (없으면 "확인 필요"로 표시)
- 심사역 손익 추정은 회사 추정 대비 보수적으로 적용 (통상 50~70% 수준)
- Peer Group은 유사 국내 상장사 기준 PER/EV-Multiple로 산정
- 한국 VC 업계 용어 사용: RCPS, Pre/Post-money, IRR, Multiple, 구주/신주, Cap Table, YTM, Refixing`;

export type GeneralAnalysisOutput = {
  investmentOverview: string;
  investmentTermsDetail: string;
  investmentPurpose: string;
  businessSummary: string;
  companyHistory: string;
  businessModel: string;
  keyCustomerReferences: string;
  marketAnalysis: string;
  competitiveLandscape: string;
  teamAssessment: string;
  financialAnalysis: string;
  ipPortfolio: string;
  investmentPoint1: string;
  investmentPoint2: string;
  investmentPoint3: string;
  risk1: string;
  risk2: string;
  risk3: string;
  companyPnLProjection: string;
  reviewerPnLProjection: string;
  peerGroupAnalysis: string;
  valuationOpinion: string;
  investmentScenarios: string;
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
${documentContext.slice(0, 14000)}

=== 작성 지시 ===
실제 한국 VC 투자심사보고서 형식(알트에이, SENSEE, 빅텍스 수준)으로 작성하세요.

중요 작성 기준:
1. 심사역 손익 추정은 회사 추정에서 연도별 보수적 할인을 적용하여 독립적으로 산출 (예: "회사 추정의 70% 적용", "판관비 20% 추가 반영" 등 가정 명시)
2. 투자포인트는 (1) 제목 + 상세 근거 + 수치 + 고객 레퍼런스 형식
3. 리스크는 위험요인 서술 후 "→ 대응방안:" 형식으로 미티게이션 명시
4. Peer Group은 유사 국내/글로벌 상장사 3~5개 명시하고 적용 Multiple 근거 설명
5. 연혁은 "연도 - 주요 마일스톤" 형식의 타임라인

JSON으로만 응답:
{
  "investmentOverview": "투자개요 요약 (투자형태, 금액/단가/기업가치, 공동투자기관, 투자재원, 자금사용용도. 자료 기반, 400자)",
  "investmentTermsDetail": "투자조건 상세 (존속기간, 상환조건/YTM, 전환조건, Refixing 조건, 배당조건, 위약벌%, 청산우선권, Tag Along 등. 자료에서 확인된 항목만, 400자)",
  "investmentPurpose": "투자 목적 및 전략적 의의 (당사 투자 목적: 예: 초기 창투사 House Track 확보, 섹터 전문성 강화, 포트폴리오 시너지 등. 전략적 투자 포인트 중심, 200자)",
  "businessSummary": "회사 사업 개요 (설립일, 대표자, 주요사업, 임직원수, 핵심 서비스/제품 설명, 500자)",
  "companyHistory": "회사 연혁 (연도별 주요 마일스톤. 형식: '2020년: 설립\\n2021년: Pre-A 유치' 등. 자료 기반, 확인된 내용만, 300자)",
  "businessModel": "비즈니스 모델 (B2C/B2B/B2B2C/B2G 모델, 수익 구조, Unit Economics, 주요 계약 구조, 500자)",
  "keyCustomerReferences": "주요 고객 레퍼런스 (고객사명, 계약 내용/금액, 매출 기여도 등. 자료 기반, 없으면 '확인 필요', 400자)",
  "marketAnalysis": "시장 분석 (TAM/SAM/SOM 수치, 시장 성장률(CAGR), 정책/규제 환경, 수요 촉진 요인, 500자)",
  "competitiveLandscape": "경쟁 환경 (주요 경쟁사 3~5개, 각사 특징/강약점, 동사 포지셔닝, 차별화 근거, 400자)",
  "teamAssessment": "팀 평가 (대표자 학력/경력, 핵심 인력 구성, 팀의 강점, 보완 필요 사항, 300자)",
  "financialAnalysis": "재무 현황 (최근 2~3년 매출/영업이익/자산 주요 수치 인용, 부채비율, 런웨이, 400자)",
  "ipPortfolio": "IP/특허 현황 (등록 특허 수, 주요 특허명, 인증 현황, 국책과제, 없으면 '확인 필요', 200자)",
  "investmentPoint1": "투자포인트 (1) 제목: [포인트 제목]\\n상세 근거와 수치 포함 (400자, 핵심 경쟁 우위)",
  "investmentPoint2": "투자포인트 (2) 제목: [포인트 제목]\\n상세 근거와 수치 포함 (400자, 시장/성장 관점)",
  "investmentPoint3": "투자포인트 (3) 제목: [포인트 제목]\\n상세 근거와 수치 포함 (400자, Exit/수익성 관점)",
  "risk1": "리스크 (1) [위험요인 제목]\\n◼ RISK: 위험요인 상세 서술\\n◼ RESOLUTION: 대응방안 및 미티게이션 전략 (300자)",
  "risk2": "리스크 (2) [위험요인 제목]\\n◼ RISK: 위험요인 상세 서술\\n◼ RESOLUTION: 대응방안 및 미티게이션 전략 (300자)",
  "risk3": "리스크 (3) [위험요인 제목]\\n◼ RISK: 위험요인 상세 서술\\n◼ RESOLUTION: 대응방안 및 미티게이션 전략 (300자)",
  "companyPnLProjection": "회사 추정 손익 (회사가 제시한 연도별 매출/영업이익 추정치. 표 형식: 연도 | 매출 | 영업이익 | 영업이익률. 없으면 분석 기반 추정, 300자)",
  "reviewerPnLProjection": "심사역 추정 손익 (회사 추정에 대한 심사역 보수적 할인 적용. 각 연도 가정 명시. 예: 매출 70%, 판관비 20% 추가. 표 형식으로, 300자)",
  "peerGroupAnalysis": "Peer Group 분석 (유사 국내/글로벌 상장사 3~5개 선정. 각 기업명, 적용 PER/EV-Multiple, 비교 근거 명시. 예: 'InterDigital 26.7x vs 동사 18.5x, 44.6% 저렴'. 비상장 할인 30% 적용, 도출된 Valuation 범위, 400자)",
  "valuationOpinion": "기업가치 평가 의견 (현재 Valuation 적정성, Peer Group 대비 분석, 심사역 추정 기반 Multiple, 400자)",
  "investmentScenarios": "시나리오별 투자수익 분석. 형식:\\n시나리오 | 보수적 | 중립적 | 공격적\\nPER | X.X | X.X | X.X\\n예상 기업가치(억원) | XXX | XXX | XXX\\nExpected IRR(%) | XX% | XX% | XX%\\nMultiple(x) | X.X | X.X | X.X\\n회수금액(백만원) | XXX | XXX | XXX\\n가정: 보수적(IPO 할인 30%, PER 보수), 중립(시장 평균), 공격(섹터 Premium). 자료 기반으로 수치 산출, 300자",
  "exitStrategy": "Exit 전략 (IPO 일정/목표 시장, M&A 시나리오, 락업 해제 이후 회수 가정, 400자)",
  "investmentRecommendation": "종합 투자의견 (투자 찬반 및 핵심 근거, 조건부 사항, 모니터링 포인트, 500자)",
  "questionsForFounders": [
    "창업자 확인 질문 1 (재무/수익성 관련)",
    "창업자 확인 질문 2 (기술/IP 관련)",
    "창업자 확인 질문 3 (고객/영업 관련)",
    "창업자 확인 질문 4 (팀/거버넌스 관련)",
    "창업자 확인 질문 5 (Exit/IPO 계획 관련)"
  ]
}`,
      },
    ],
    {
      systemPrompt: GENERAL_AGENT_PROMPT,
      maxTokens: 10000,
    }
  );

  let analysis: GeneralAnalysisOutput;
  try {
    const raw = result.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    analysis = JSON.parse(raw);
  } catch {
    analysis = {
      investmentOverview: result.content.slice(0, 500),
      investmentTermsDetail: "",
      investmentPurpose: "",
      businessSummary: companyName + " - 자료 분석 중",
      companyHistory: "",
      businessModel: "",
      keyCustomerReferences: "",
      marketAnalysis: "",
      competitiveLandscape: "",
      teamAssessment: "",
      financialAnalysis: "",
      ipPortfolio: "",
      investmentPoint1: "",
      investmentPoint2: "",
      investmentPoint3: "",
      risk1: "",
      risk2: "",
      risk3: "",
      companyPnLProjection: "",
      reviewerPnLProjection: "",
      peerGroupAnalysis: "",
      valuationOpinion: "",
      investmentScenarios: "",
      exitStrategy: "",
      investmentRecommendation: "",
      questionsForFounders: [],
    };
  }

  return { analysis };
}
