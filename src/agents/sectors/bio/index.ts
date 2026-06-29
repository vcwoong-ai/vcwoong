import { callClaudeJSON } from "@/lib/claude";
import type { StructuredData } from "@/lib/structurize";
import { calculatePipelineNPV, type Pipeline } from "./pipeline-npv";
import { searchFDAApprovals } from "./fda-benchmark";
import { searchPubmed, summarizeArticles } from "./pubmed-search";
import { searchClinicalTrials } from "./competing-pipelines";

export const DR_CELL_SYSTEM_PROMPT = `당신은 Dr. Cell, 20년 경력의 한국 바이오 전문 VC 심사역입니다.
임상약리학 박사 + 생물통계학 석사, 임상시험 100건+ 분석 경험을 보유하고 있습니다.

분석 시 반드시 포함:
1. 파이프라인의 임상 단계와 IND/NDA 상태
2. 적응증의 시장 규모와 미충족 의료수요(unmet need)
3. 작용기전(MoA)의 과학적 타당성과 차별점
4. 임상시험 디자인의 적절성 (1차 평가변수, 환자 수)
5. 경쟁 파이프라인 대비 우위
6. 라이선스아웃/M&A 가능성

전문 용어 정확히 사용: PoC, MoA, IND, NDA, Endpoint, EMA, KOL, BLA, BTD, ODD, Orphan, Fast Track
과학적 근거 없는 단정 금지.`;

type BioAnalysisOutput = {
  pipelineAssessment: string;
  scientificMerit: string;
  regulatoryStrategy: string;
  competitiveLandscape: string;
  keyOpinionLeaders: string[];
  criticalRisks: string[];
  questionsForFounders: string[];
  investmentRecommendation: string;
};

async function extractPipelinesFromData(data: StructuredData): Promise<Pipeline[]> {
  try {
    const { data: result } = await callClaudeJSON<{ pipelines: Pipeline[] }>({
      system: DR_CELL_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `다음 자료에서 파이프라인 정보를 추출하세요:\n${JSON.stringify(data)}\n\n각 파이프라인: { name, indication, currentStage, estimatedLaunchYear, peakSalesEstimate (백만달러) }\nindication은 다음 중 하나: oncology, cardiovascular, cns, infectious, metabolic, autoimmune, rare_disease, ophthalmology, respiratory, hematology, others\ncurrentStage: preclinical | P1 | P2 | P3 | NDA | approved\n\nJSON: { "pipelines": [...] }`,
        },
      ],
      maxTokens: 2048,
    });
    return result.pipelines ?? [];
  } catch {
    return [];
  }
}

export async function runBioAnalysis(data: StructuredData) {
  const pipelines = await extractPipelinesFromData(data);
  const npvResults = pipelines.map((p) => ({ pipeline: p, npv: calculatePipelineNPV(p) }));

  const firstIndication = pipelines[0]?.indication ?? "";
  const [fdaApprovals, pubmedArticles, competingTrials] = await Promise.all([
    firstIndication ? searchFDAApprovals(firstIndication) : [],
    firstIndication
      ? searchPubmed(`${firstIndication} ${data.business?.products?.[0] ?? ""}`, 5)
      : [],
    firstIndication ? searchClinicalTrials(firstIndication) : [],
  ]);

  const summarizedArticles = await summarizeArticles(
    pubmedArticles,
    `${firstIndication} 치료제 개발`
  );

  const { data: analysis } = await callClaudeJSON<BioAnalysisOutput>({
    system: DR_CELL_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `다음 바이오 스타트업을 분석하세요:\n\n구조화 데이터: ${JSON.stringify(data)}\n파이프라인 NPV: ${JSON.stringify(npvResults)}\nFDA 유사 승인: ${JSON.stringify(fdaApprovals)}\n경쟁 임상: ${JSON.stringify(competingTrials.slice(0, 10))}\n관련 논문: ${JSON.stringify(summarizedArticles)}\n\nJSON:\n{\n  "pipelineAssessment": "파이프라인 종합 평가 (500자)",\n  "scientificMerit": "과학적 타당성 (300자)",\n  "regulatoryStrategy": "규제 전략 평가 (300자)",\n  "competitiveLandscape": "경쟁 환경 (300자)",\n  "keyOpinionLeaders": ["KOL 추천 3명"],\n  "criticalRisks": ["주요 리스크 3가지"],\n  "questionsForFounders": ["창업자 질문 5개"],\n  "investmentRecommendation": "투자의견 (300자)"\n}`,
      },
    ],
    maxTokens: 4096,
  });

  return { pipelines, npvResults, fdaApprovals, pubmedArticles: summarizedArticles, competingTrials, analysis };
}

export type BioAnalysisResult = Awaited<ReturnType<typeof runBioAnalysis>>;
