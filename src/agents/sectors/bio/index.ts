import { calculatePipelineNPV, type Pipeline } from "./pipeline-npv";
import { searchFDAApprovals } from "./fda-benchmark";
import { searchPubmed, summarizeArticles } from "./pubmed-search";
import { searchClinicalTrials } from "./competing-pipelines";
import { generateText } from "@/lib/claude";

export const DR_CELL_SYSTEM_PROMPT = `당신은 Dr. Cell, 20년 경력의 한국 바이오 전문 VC 심사역입니다.
임상약리학 박사 + 임상시험 100건 분석 경험, 바이오 투자심사보고서 200건 작성 경험을 보유합니다.

투자심사 관점 분석 원칙:
1. 파이프라인의 임상 단계(IND/PoC/P1/P2/P3/NDA)와 핵심 데이터 요약
2. 적응증 시장 규모(TAM/SAM)와 미충족 의료수요(unmet need) — 수치 포함
3. 작용기전(MoA)의 과학적 타당성 및 First-in-class / Best-in-class 여부
4. 경쟁 파이프라인 대비 우위 (임상 데이터 비교)
5. 라이선스아웃/M&A 가능성 — 글로벌 빅파마 Deal 사례 Reference
6. VC 투자 관점 밸류에이션 근거 (rNPV, Comparable Deal)
7. 주요 리스크 및 촉매 이벤트 (Catalyst)

실제 VC 투자심사보고서 어투 사용:
- "~로 판단됨", "~할 것으로 예상됨", "확인이 필요한 사항임"
- 투자포인트는 구체적 수치와 KOL 의견 포함
- 리스크는 위험요인 + VC 대응전략까지 서술

전문 용어: PoC, MoA, IND, NDA, Endpoint, EMA, KOL, BLA, BTD, ODD, Orphan, Fast Track, rNPV, Milestones, Deal Value`;

export type BioAnalysisOutput = {
  investmentOverview: string;
  investmentTermsDetail: string;
  businessSummary: string;
  companyHistory: string;
  pipelineAssessment: string;
  scientificMerit: string;
  regulatoryStrategy: string;
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
  exitStrategy: string;
  keyOpinionLeaders: string[];
  criticalRisks: string[];
  questionsForFounders: string[];
  investmentRecommendation: string;
};

export type BioAnalysisResult = {
  pipelines: Pipeline[];
  npvResults: Array<{ pipeline: Pipeline; npv: ReturnType<typeof calculatePipelineNPV> }>;
  fdaApprovals: Awaited<ReturnType<typeof searchFDAApprovals>>;
  pubmedArticles: Awaited<ReturnType<typeof summarizeArticles>>;
  competingTrials: Awaited<ReturnType<typeof searchClinicalTrials>>;
  analysis: BioAnalysisOutput;
};

export async function runBioAnalysis(
  documentContext: string,
  companyName: string
): Promise<BioAnalysisResult> {
  const pipelines = await extractPipelinesFromContext(documentContext, companyName);

  const npvResults = pipelines.map((p) => ({
    pipeline: p,
    npv: calculatePipelineNPV(p),
  }));

  const firstPipeline = pipelines[0];
  const [fdaApprovals, pubmedArticles, competingTrials] = await Promise.all([
    firstPipeline
      ? searchFDAApprovals(firstPipeline.indication, "", 5)
      : Promise.resolve([]),
    firstPipeline
      ? searchPubmed(`${firstPipeline.indication} ${companyName}`, 5)
      : Promise.resolve([]),
    firstPipeline
      ? searchClinicalTrials(firstPipeline.indication, undefined, firstPipeline.currentStage)
      : Promise.resolve([]),
  ]);

  const summarized = await summarizeArticles(
    pubmedArticles,
    `${firstPipeline?.indication ?? ""} 치료제 개발`
  );

  const analysisResult = await generateText(
    [
      {
        role: "user",
        content: `다음 바이오/헬스케어 스타트업에 대한 투자심사보고서를 작성하세요.

회사명: ${companyName}

=== 첨부 자료 ===
${documentContext.slice(0, 10000)}

=== 외부 분석 데이터 ===
파이프라인 rNPV 분석: ${JSON.stringify(npvResults, null, 2)}
FDA 유사 승인 사례: ${JSON.stringify(fdaApprovals.slice(0, 3), null, 2)}
경쟁 임상: ${JSON.stringify(competingTrials.slice(0, 5), null, 2)}
관련 논문 요약: ${JSON.stringify(summarized, null, 2)}

실제 한국 VC 투자심사보고서(알트에이, SENSEE 수준) 어투로 작성하세요. JSON으로만 응답:
{
  "investmentOverview": "투자개요 요약 (투자형태, 금액, 기업가치, 공동투자, 투자재원, 300자)",
  "investmentTermsDetail": "투자조건 상세 (존속기간, 상환조건/YTM, 전환조건, Refixing, 배당조건, 위약벌%, Tag Along, 300자)",
  "businessSummary": "회사 및 파이프라인 개요 (설립일, 대표자, 핵심 파이프라인, 적응증, 임상 단계, 500자)",
  "companyHistory": "회사 연혁 타임라인 (연도: 마일스톤 형식. 자료 기반만, 300자)",
  "pipelineAssessment": "파이프라인 종합 평가 (임상 단계, 핵심 데이터, Catalyst, Milestone, 600자)",
  "scientificMerit": "과학적 타당성 (MoA 차별성, PoC 데이터, First/Best-in-class 여부, 400자)",
  "regulatoryStrategy": "규제 전략 (FDA/식약처 전략, ODD/BTD/Fast Track, IND 상태, 400자)",
  "keyCustomerReferences": "주요 파트너/고객 레퍼런스 (협업 기관, 기술이전 계약, 임상 협력, 없으면 확인 필요, 300자)",
  "marketAnalysis": "시장 분석 (적응증 TAM/SAM 수치, unmet need, 시장 성장률, 경쟁약 출시 현황, 400자)",
  "competitiveLandscape": "경쟁 환경 (동일 적응증 파이프라인 3~5개, 임상 데이터 비교, 차별화 포인트, 400자)",
  "teamAssessment": "팀 평가 (대표자/CSO 경력, 임상 개발 경험, KOL 네트워크, 보완 필요 사항, 300자)",
  "financialAnalysis": "재무 현황 (최근 2~3년 재무 수치, 런웨이, 자금조달 이력 라운드별, 300자)",
  "ipPortfolio": "IP/특허 현황 (등록 특허 수, 핵심 특허, 국책과제, 기술이전 가능성, 200자)",
  "investmentPoint1": "투자포인트 (1) 제목: [파이프라인 경쟁력]\\n근거/수치/rNPV 결과 (400자)",
  "investmentPoint2": "투자포인트 (2) 제목: [시장 기회/글로벌 L/O]\\n근거/수치/Deal 사례 (400자)",
  "investmentPoint3": "투자포인트 (3) 제목: [팀/기술 차별성 또는 M&A 가능성]\\n근거 (400자)",
  "risk1": "리스크 (1) [임상 위험]\\n상세 위험요인\\n→ 대응방안: [VC 대응 전략] (300자)",
  "risk2": "리스크 (2) [규제/경쟁 위험]\\n상세 위험요인\\n→ 대응방안: [대응 전략] (300자)",
  "risk3": "리스크 (3) [재무/Exit 위험]\\n상세 위험요인\\n→ 대응방안: [대응 전략] (300자)",
  "companyPnLProjection": "회사 추정 매출/비용 전망 (연도별 표: 연도|매출|영업이익|영업이익률, 자료 기반, 300자)",
  "reviewerPnLProjection": "심사역 보수적 추정 (가정 명시: 매출 X%, 판관비 Y% 추가 등. 연도별 독립 산출, 300자)",
  "peerGroupAnalysis": "Peer Group 분석 (비교 바이오 상장사/Deal 3~5개, EV/Sales 또는 rNPV Multiple, 비상장 할인, Valuation 범위, 300자)",
  "valuationOpinion": "기업가치 평가 의견 (rNPV, Peer Group 대비 적정성, 심사역 추정 기반 Multiple, 400자)",
  "exitStrategy": "Exit 전략 (기술이전/L/O 시나리오, M&A 대상 빅파마, 코스닥/나스닥 상장, IRR/Multiple, 400자)",
  "keyOpinionLeaders": ["KOL 추천 3명 (분야/소속)"],
  "criticalRisks": ["핵심 리스크 단문 3가지"],
  "questionsForFounders": [
    "창업자 확인 질문 1 (임상 데이터/디자인)",
    "창업자 확인 질문 2 (IP/특허 전략)",
    "창업자 확인 질문 3 (빅파마 파트너십)",
    "창업자 확인 질문 4 (재무/런웨이)",
    "창업자 확인 질문 5 (Exit/상장 계획)"
  ],
  "investmentRecommendation": "종합 투자의견 (찬반, 핵심 thesis, 조건부 사항, 모니터링 포인트, 600자)"
}`,
      },
    ],
    { systemPrompt: DR_CELL_SYSTEM_PROMPT, maxTokens: 8000 }
  );

  let analysis: BioAnalysisOutput;
  try {
    const raw = analysisResult.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    analysis = JSON.parse(raw);
  } catch {
    analysis = {
      investmentOverview: "",
      investmentTermsDetail: "",
      businessSummary: companyName,
      companyHistory: "",
      pipelineAssessment: analysisResult.content,
      scientificMerit: "",
      regulatoryStrategy: "",
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
      exitStrategy: "",
      keyOpinionLeaders: [],
      criticalRisks: [],
      questionsForFounders: [],
      investmentRecommendation: "",
    };
  }

  return {
    pipelines,
    npvResults,
    fdaApprovals,
    pubmedArticles: summarized,
    competingTrials,
    analysis,
  };
}

async function extractPipelinesFromContext(
  documentContext: string,
  companyName: string
): Promise<Pipeline[]> {
  try {
    const result = await generateText(
      [
        {
          role: "user",
          content: `다음 자료에서 파이프라인 정보를 추출하세요.
회사명: ${companyName}
자료: ${documentContext.slice(0, 4000)}

각 파이프라인: { name, indication, currentStage, estimatedLaunchYear, peakSalesEstimate (백만달러) }
indication은: oncology, cardiovascular, cns, infectious, metabolic, autoimmune, rare_disease, ophthalmology, respiratory, hematology, others 중 하나
currentStage: preclinical, P1, P2, P3, NDA, approved 중 하나

JSON으로만 응답: { "pipelines": [...] }
정보가 부족하면 빈 배열 반환.`,
        },
      ],
      { systemPrompt: DR_CELL_SYSTEM_PROMPT, maxTokens: 2048 }
    );
    const parsed = JSON.parse(result.content);
    return parsed.pipelines || [];
  } catch {
    return [];
  }
}
