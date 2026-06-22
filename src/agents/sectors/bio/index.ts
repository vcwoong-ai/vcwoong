import { calculatePipelineNPV, type Pipeline } from "./pipeline-npv";
import { searchFDAApprovals } from "./fda-benchmark";
import { searchPubmed, summarizeArticles } from "./pubmed-search";
import { searchClinicalTrials } from "./competing-pipelines";
import { generateText } from "@/lib/claude";

export const DR_CELL_SYSTEM_PROMPT = `당신은 Dr. Cell, 20년 경력의 한국 바이오 전문 VC 심사역입니다.
임상약리학 박사 + 임상시험 100건 분석 경험을 보유하고 있습니다.

분석 시 반드시 포함:
1. 파이프라인의 임상 단계와 IND/NDA 상태
2. 적응증의 시장 규모와 미충족 의료수요(unmet need)
3. 작용기전(MoA)의 과학적 타당성과 차별점
4. 임상시험 디자인의 적절성 (1차 평가변수, 환자 수)
5. 경쟁 파이프라인 대비 우위
6. 라이선스아웃/M&A 가능성 (글로벌 빅파마 관심도)

전문 용어 정확히 사용: PoC, MoA, IND, NDA, Endpoint, EMA, KOL, BLA, BTD, ODD, Orphan, Fast Track`;

export type BioAnalysisOutput = {
  pipelineAssessment: string;
  scientificMerit: string;
  regulatoryStrategy: string;
  competitiveLandscape: string;
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
        content: `다음 바이오 스타트업을 분석하세요.

회사명: ${companyName}
자료:
${documentContext}

파이프라인 NPV: ${JSON.stringify(npvResults, null, 2)}
FDA 유사 승인: ${JSON.stringify(fdaApprovals, null, 2)}
경쟁 임상: ${JSON.stringify(competingTrials.slice(0, 10), null, 2)}
관련 논문: ${JSON.stringify(summarized, null, 2)}

JSON으로만 응답:
{
  "pipelineAssessment": "파이프라인 종합 평가 (500자)",
  "scientificMerit": "과학적 타당성 (300자)",
  "regulatoryStrategy": "규제 전략 평가 (300자)",
  "competitiveLandscape": "경쟁 환경 (300자)",
  "keyOpinionLeaders": ["KOL 추천 3명"],
  "criticalRisks": ["주요 리스크 3가지"],
  "questionsForFounders": ["창업자에게 물을 질문 5개"],
  "investmentRecommendation": "투자의견 (300자)"
}`,
      },
    ],
    { systemPrompt: DR_CELL_SYSTEM_PROMPT, maxTokens: 4096 }
  );

  let analysis: BioAnalysisOutput;
  try {
    analysis = JSON.parse(analysisResult.content);
  } catch {
    analysis = {
      pipelineAssessment: analysisResult.content,
      scientificMerit: "",
      regulatoryStrategy: "",
      competitiveLandscape: "",
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
