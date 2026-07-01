/**
 * GPU 인프라 비용 분석 모듈
 * AI/딥테크 스타트업의 모델 서빙 비용 및 Unit Economics 계산
 */

export interface GPUSpec {
  type: "A100" | "H100" | "H200" | "A10G" | "L40S" | "V100" | "T4" | "RTX4090";
  count: number;
  provider: "aws" | "gcp" | "azure" | "lambda" | "coreweave" | "runpod" | "self_hosted";
}

// 2024 기준 GPU 시간당 온디맨드 요금 (USD)
const GPU_HOURLY_RATES: Record<GPUSpec["type"], Record<GPUSpec["provider"], number>> = {
  H200: { aws: 0, gcp: 0, azure: 0, lambda: 4.98, coreweave: 4.76, runpod: 3.49, self_hosted: 1.2 },
  H100: { aws: 12.3, gcp: 10.08, azure: 11.5, lambda: 2.99, coreweave: 2.79, runpod: 2.49, self_hosted: 1.0 },
  A100: { aws: 9.83, gcp: 8.05, azure: 9.1, lambda: 1.69, coreweave: 1.89, runpod: 1.49, self_hosted: 0.8 },
  L40S: { aws: 4.5, gcp: 3.8, azure: 4.1, lambda: 1.10, coreweave: 0.95, runpod: 0.79, self_hosted: 0.5 },
  A10G: { aws: 3.92, gcp: 3.1, azure: 3.5, lambda: 0.75, coreweave: 0.65, runpod: 0.55, self_hosted: 0.35 },
  V100: { aws: 3.06, gcp: 2.55, azure: 2.8, lambda: 0.55, coreweave: 0.45, runpod: 0.39, self_hosted: 0.3 },
  T4: { aws: 0.53, gcp: 0.35, azure: 0.45, lambda: 0.0, coreweave: 0.0, runpod: 0.14, self_hosted: 0.15 },
  RTX4090: { aws: 0, gcp: 0, azure: 0, lambda: 0.0, coreweave: 0.0, runpod: 0.74, self_hosted: 0.25 },
};

export interface ModelServingCost {
  gpuSpec: GPUSpec;
  hourlyRateUSD: number;
  monthlyRateUSD: number;
  annualRateUSD: number;
  utilizationRate: number;         // 예상 GPU 활용률
  effectiveMonthlyCostUSD: number; // 활용률 반영 실효 비용

  // 토큰당 비용 (LLM 서빙 시)
  tokensPerSecond?: number;
  costPer1MTokensUSD?: number;
  costPer1MTokensKRW?: number;

  // 마진 구조
  suggestedPricePer1MTokensUSD?: number; // 목표 마진 70% 기준
  grossMarginPercent?: number;
}

const USD_TO_KRW = 1350;

export function calculateServingCost(
  gpu: GPUSpec,
  options: {
    utilizationRate?: number;
    tokensPerSecond?: number;
    targetMargin?: number;
  } = {}
): ModelServingCost {
  const { utilizationRate = 0.7, tokensPerSecond, targetMargin = 0.7 } = options;

  const hourlyRate = GPU_HOURLY_RATES[gpu.type][gpu.provider] * gpu.count;
  const effectiveHourlyRate = hourlyRate * utilizationRate;

  const result: ModelServingCost = {
    gpuSpec: gpu,
    hourlyRateUSD: hourlyRate,
    monthlyRateUSD: hourlyRate * 24 * 30,
    annualRateUSD: hourlyRate * 24 * 365,
    utilizationRate,
    effectiveMonthlyCostUSD: effectiveHourlyRate * 24 * 30,
  };

  if (tokensPerSecond !== undefined && tokensPerSecond > 0) {
    const tokensPerHour = tokensPerSecond * 3600;
    const cost1MTokens = (effectiveHourlyRate / tokensPerHour) * 1_000_000;
    result.tokensPerSecond = tokensPerSecond;
    result.costPer1MTokensUSD = cost1MTokens;
    result.costPer1MTokensKRW = cost1MTokens * USD_TO_KRW;

    // 목표 마진을 위한 최소 판매가
    result.suggestedPricePer1MTokensUSD = cost1MTokens / (1 - targetMargin);
    result.grossMarginPercent = targetMargin * 100;
  }

  return result;
}

export interface AIInfrastructureAnalysis {
  totalMonthlyGPUCostUSD: number;
  totalAnnualGPUCostUSD: number;
  totalAnnualGPUCostKRW: number;
  revenueNeededForBreakevenKRW: number; // 70% 마진 가정
  costPerActiveUser?: number;           // 월 활성 사용자당 비용 (KRW)
  scalingOutlook: "efficient" | "moderate" | "costly";
  recommendations: string[];
}

export function analyzeInfrastructure(
  gpus: GPUSpec[],
  options: { monthlyActiveUsers?: number; targetMarginPercent?: number } = {}
): AIInfrastructureAnalysis {
  const { monthlyActiveUsers, targetMarginPercent = 70 } = options;

  const totalMonthlyCost = gpus.reduce((sum, gpu) => {
    const rate = GPU_HOURLY_RATES[gpu.type][gpu.provider] ?? 0;
    return sum + rate * gpu.count * 24 * 30;
  }, 0);

  const totalAnnualCostUSD = totalMonthlyCost * 12;
  const totalAnnualCostKRW = totalAnnualCostUSD * USD_TO_KRW;
  const revenueNeeded = totalAnnualCostKRW / (targetMarginPercent / 100);

  const costPerUser = monthlyActiveUsers
    ? (totalMonthlyCost * USD_TO_KRW) / monthlyActiveUsers
    : undefined;

  // GPU 효율성 평가
  const avgHourlyPerGPU =
    gpus.reduce((sum, gpu) => {
      const rate = GPU_HOURLY_RATES[gpu.type][gpu.provider] ?? 0;
      return sum + rate;
    }, 0) / Math.max(gpus.length, 1);

  let scalingOutlook: AIInfrastructureAnalysis["scalingOutlook"] = "moderate";
  if (avgHourlyPerGPU < 2) scalingOutlook = "efficient";
  else if (avgHourlyPerGPU > 8) scalingOutlook = "costly";

  const recommendations: string[] = [];
  if (gpus.some((g) => g.provider === "aws" || g.provider === "gcp")) {
    const lambdaOrCoreweave = gpus.map((g) => ({
      ...g,
      provider: "lambda" as GPUSpec["provider"],
    }));
    const altCost = lambdaOrCoreweave.reduce((sum, gpu) => {
      const rate = GPU_HOURLY_RATES[gpu.type]?.lambda ?? 0;
      return sum + rate * gpu.count * 24 * 30;
    }, 0);
    if (altCost > 0 && altCost < totalMonthlyCost * 0.7) {
      const savings = ((totalMonthlyCost - altCost) / totalMonthlyCost * 100).toFixed(0);
      recommendations.push(`Lambda Labs/CoreWeave 전환 시 월 인프라 비용 약 ${savings}% 절감 가능`);
    }
  }
  if (gpus.every((g) => g.provider !== "self_hosted") && totalAnnualCostUSD > 500_000) {
    recommendations.push("연간 GPU 비용 $50만+ 수준 — Self-hosted 또는 Reserved Instance 검토 권장 (40~60% 절감 가능)");
  }
  if (scalingOutlook === "costly") {
    recommendations.push("현재 GPU 스펙 과다 — A10G/L40S 등 추론 최적화 GPU로 전환 및 모델 양자화 적용 검토");
  }

  return {
    totalMonthlyGPUCostUSD: totalMonthlyCost,
    totalAnnualGPUCostUSD: totalAnnualCostUSD,
    totalAnnualGPUCostKRW: totalAnnualCostKRW,
    revenueNeededForBreakevenKRW: revenueNeeded,
    costPerActiveUser: costPerUser,
    scalingOutlook,
    recommendations,
  };
}
