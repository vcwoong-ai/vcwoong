import type { PubmedArticle } from "./pubmed-search";
import type { DrugApproval } from "./fda-benchmark";
import type { ClinicalTrial } from "./competing-pipelines";

export type AppendixSection = {
  title: string;
  type: "table" | "comparison_chart" | "reference_list";
  data: unknown;
};

export function generateBioAppendix(analysis: {
  npvResults: Array<{
    pipeline: { name: string; indication: string; currentStage: string };
    npv: {
      cumulativeProbability: number;
      riskAdjustedNPV: number;
      benchmarkVsIndustry: Array<{ metric: string; company: number; industry: number }>;
    };
  }>;
  fdaApprovals: DrugApproval[];
  pubmedArticles: PubmedArticle[];
  competingTrials: ClinicalTrial[];
}): AppendixSection[] {
  return [
    {
      title: "파이프라인 Risk-Adjusted NPV 분석",
      type: "table",
      data: analysis.npvResults.map((r) => ({
        파이프라인: r.pipeline.name,
        적응증: r.pipeline.indication,
        현재단계: r.pipeline.currentStage,
        "누적 성공확률": `${(r.npv.cumulativeProbability * 100).toFixed(1)}%`,
        "Risk-Adj NPV": `$${(r.npv.riskAdjustedNPV / 1e6).toFixed(1)}M`,
      })),
    },
    {
      title: "임상단계 성공확률 (해당 회사 vs 산업 평균)",
      type: "comparison_chart",
      data: analysis.npvResults[0]?.npv.benchmarkVsIndustry,
    },
    {
      title: "FDA 유사 적응증 승인 사례",
      type: "table",
      data: analysis.fdaApprovals,
    },
    {
      title: "핵심 작용기전 관련 논문 (PubMed)",
      type: "reference_list",
      data: analysis.pubmedArticles,
    },
    {
      title: "경쟁 파이프라인 매트릭스",
      type: "table",
      data: analysis.competingTrials.slice(0, 15),
    },
  ];
}
