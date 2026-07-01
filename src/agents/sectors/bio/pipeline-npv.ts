// BIO Industry Analysis 2024 (Biotechnology Innovation Organization)
export const CLINICAL_SUCCESS_RATES = {
  oncology:       { P1_to_P2: 0.524, P2_to_P3: 0.246, P3_to_NDA: 0.401, NDA_to_Approval: 0.821 },
  cardiovascular: { P1_to_P2: 0.659, P2_to_P3: 0.301, P3_to_NDA: 0.515, NDA_to_Approval: 0.876 },
  cns:            { P1_to_P2: 0.732, P2_to_P3: 0.299, P3_to_NDA: 0.516, NDA_to_Approval: 0.842 },
  infectious:     { P1_to_P2: 0.701, P2_to_P3: 0.434, P3_to_NDA: 0.660, NDA_to_Approval: 0.910 },
  metabolic:      { P1_to_P2: 0.643, P2_to_P3: 0.336, P3_to_NDA: 0.585, NDA_to_Approval: 0.847 },
  autoimmune:     { P1_to_P2: 0.667, P2_to_P3: 0.330, P3_to_NDA: 0.626, NDA_to_Approval: 0.842 },
  rare_disease:   { P1_to_P2: 0.760, P2_to_P3: 0.502, P3_to_NDA: 0.741, NDA_to_Approval: 0.890 },
  ophthalmology:  { P1_to_P2: 0.847, P2_to_P3: 0.453, P3_to_NDA: 0.582, NDA_to_Approval: 0.890 },
  respiratory:    { P1_to_P2: 0.625, P2_to_P3: 0.378, P3_to_NDA: 0.555, NDA_to_Approval: 0.840 },
  hematology:     { P1_to_P2: 0.711, P2_to_P3: 0.527, P3_to_NDA: 0.752, NDA_to_Approval: 0.866 },
  others:         { P1_to_P2: 0.632, P2_to_P3: 0.307, P3_to_NDA: 0.581, NDA_to_Approval: 0.860 },
} as const;

export type PipelineIndication = keyof typeof CLINICAL_SUCCESS_RATES;

export type Pipeline = {
  name: string;
  indication: PipelineIndication;
  currentStage: "preclinical" | "P1" | "P2" | "P3" | "NDA" | "approved";
  estimatedLaunchYear: number;
  peakSalesEstimate: number; // 백만달러
  patentExpiryYear?: number;
};

export type PipelineNPVResult = {
  cumulativeProbability: number;
  stageProbabilities: { stage: string; probability: number }[];
  expectedPeakSales: number;
  riskAdjustedNPV: number;
  yearsToMarket: number;
  benchmarkVsIndustry: { metric: string; company: number; industry: number }[];
};

export function calculatePipelineNPV(
  pipeline: Pipeline,
  options: {
    discountRate?: number;
    salesDuration?: number;
  } = {}
): PipelineNPVResult {
  const { discountRate = 0.12, salesDuration = 10 } = options;
  const rates = CLINICAL_SUCCESS_RATES[pipeline.indication];

  const transitions = ["P1_to_P2", "P2_to_P3", "P3_to_NDA", "NDA_to_Approval"] as const;
  const stageOrder = ["P1", "P2", "P3", "NDA"] as const;

  let cumulativeProbability = pipeline.currentStage === "approved" ? 1.0 : 0.0;
  const stageProbabilities: { stage: string; probability: number }[] = [];

  if (pipeline.currentStage !== "approved") {
    cumulativeProbability = 1.0;
    const startIdx =
      pipeline.currentStage === "preclinical"
        ? 0
        : stageOrder.indexOf(pipeline.currentStage as (typeof stageOrder)[number]);

    if (pipeline.currentStage === "preclinical") {
      cumulativeProbability *= 0.5;
    }

    for (let i = Math.max(startIdx, 0); i < transitions.length; i++) {
      const prob = rates[transitions[i]];
      cumulativeProbability *= prob;
      stageProbabilities.push({ stage: transitions[i], probability: prob });
    }
  }

  const expectedPeakSales = pipeline.peakSalesEstimate * cumulativeProbability;
  const yearsToMarket = Math.max(0, pipeline.estimatedLaunchYear - new Date().getFullYear());

  let npv = 0;
  for (let year = 1; year <= salesDuration; year++) {
    npv += expectedPeakSales / Math.pow(1 + discountRate, yearsToMarket + year);
  }

  return {
    cumulativeProbability,
    stageProbabilities,
    expectedPeakSales,
    riskAdjustedNPV: npv,
    yearsToMarket,
    benchmarkVsIndustry: [
      { metric: "누적 성공확률", company: cumulativeProbability, industry: 0.1 },
    ],
  };
}

export function calculatePortfolioNPV(
  pipelines: Pipeline[],
  options?: { discountRate?: number; salesDuration?: number }
) {
  const individual = pipelines.map((p) => ({
    pipeline: p,
    npv: calculatePipelineNPV(p, options),
  }));
  const totalNPV = individual.reduce((sum, r) => sum + r.npv.riskAdjustedNPV, 0);
  return { totalNPV, individual };
}
