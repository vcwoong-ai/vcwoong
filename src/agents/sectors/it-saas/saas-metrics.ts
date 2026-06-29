/**
 * SaaS 핵심 지표 계산 엔진
 * Bessemer Venture Partners Cloud Index 기반 벤치마크 포함
 */

export interface SaaSMetrics {
  arr?: number;           // Annual Recurring Revenue (억원)
  mrr?: number;           // Monthly Recurring Revenue (억원)
  arrGrowthYoY?: number;  // ARR 성장률 (%)
  nrr?: number;           // Net Revenue Retention (%)
  grossChurn?: number;    // Gross Churn Rate (%/연)
  cac?: number;           // Customer Acquisition Cost (만원)
  ltv?: number;           // Lifetime Value (만원)
  ltvCacRatio?: number;   // LTV/CAC 비율
  magicNumber?: number;   // Magic Number (영업효율)
  paybackPeriod?: number; // CAC 회수 기간 (월)
  grossMargin?: number;   // 매출총이익률 (%)
  ruleOf40?: number;      // Rule of 40 (성장률 + 영업이익률)
  burnMultiple?: number;  // Burn Multiple (소각 vs ARR 증가)
}

export interface SaaSBenchmark {
  stage: "seed" | "series_a" | "series_b" | "growth" | "ipo_ready";
  arrRange: [number, number]; // 억원
  benchmarks: {
    arrGrowthYoY: { p25: number; p50: number; p75: number };
    nrr: { p25: number; p50: number; p75: number };
    grossMargin: { p25: number; p50: number; p75: number };
    ltvCacRatio: { p25: number; p50: number; p75: number };
    magicNumber: { p25: number; p50: number; p75: number };
    ruleOf40: { p25: number; p50: number; p75: number };
  };
  arrMultiple: { p25: number; p50: number; p75: number }; // EV/ARR
}

// Bessemer Cloud Index 2024 기반 벤치마크 (SaaS 스테이지별)
export const BESSEMER_BENCHMARKS: SaaSBenchmark[] = [
  {
    stage: "seed",
    arrRange: [0, 10],
    benchmarks: {
      arrGrowthYoY: { p25: 80, p50: 150, p75: 300 },
      nrr: { p25: 90, p50: 100, p75: 110 },
      grossMargin: { p25: 55, p50: 65, p75: 75 },
      ltvCacRatio: { p25: 2, p50: 3, p75: 5 },
      magicNumber: { p25: 0.5, p50: 0.75, p75: 1.2 },
      ruleOf40: { p25: 20, p50: 40, p75: 70 },
    },
    arrMultiple: { p25: 5, p50: 10, p75: 20 },
  },
  {
    stage: "series_a",
    arrRange: [10, 50],
    benchmarks: {
      arrGrowthYoY: { p25: 60, p50: 100, p75: 180 },
      nrr: { p25: 95, p50: 105, p75: 120 },
      grossMargin: { p25: 60, p50: 70, p75: 80 },
      ltvCacRatio: { p25: 3, p50: 4, p75: 7 },
      magicNumber: { p25: 0.6, p50: 1.0, p75: 1.5 },
      ruleOf40: { p25: 25, p50: 45, p75: 75 },
    },
    arrMultiple: { p25: 8, p50: 15, p75: 25 },
  },
  {
    stage: "series_b",
    arrRange: [50, 200],
    benchmarks: {
      arrGrowthYoY: { p25: 40, p50: 70, p75: 120 },
      nrr: { p25: 100, p50: 110, p75: 125 },
      grossMargin: { p25: 65, p50: 72, p75: 82 },
      ltvCacRatio: { p25: 4, p50: 6, p75: 10 },
      magicNumber: { p25: 0.7, p50: 1.1, p75: 1.8 },
      ruleOf40: { p25: 30, p50: 50, p75: 80 },
    },
    arrMultiple: { p25: 10, p50: 18, p75: 30 },
  },
  {
    stage: "growth",
    arrRange: [200, 1000],
    benchmarks: {
      arrGrowthYoY: { p25: 30, p50: 50, p75: 80 },
      nrr: { p25: 105, p50: 115, p75: 130 },
      grossMargin: { p25: 68, p50: 75, p75: 85 },
      ltvCacRatio: { p25: 5, p50: 8, p75: 15 },
      magicNumber: { p25: 0.8, p50: 1.3, p75: 2.0 },
      ruleOf40: { p25: 35, p50: 55, p75: 85 },
    },
    arrMultiple: { p25: 8, p50: 14, p75: 22 },
  },
  {
    stage: "ipo_ready",
    arrRange: [1000, Infinity],
    benchmarks: {
      arrGrowthYoY: { p25: 20, p50: 35, p75: 55 },
      nrr: { p25: 110, p50: 118, p75: 130 },
      grossMargin: { p25: 70, p50: 77, p75: 87 },
      ltvCacRatio: { p25: 6, p50: 10, p75: 18 },
      magicNumber: { p25: 0.9, p50: 1.5, p75: 2.2 },
      ruleOf40: { p25: 40, p50: 60, p75: 90 },
    },
    arrMultiple: { p25: 6, p50: 10, p75: 18 },
  },
];

export function detectStage(arr: number): SaaSBenchmark["stage"] {
  if (arr < 10) return "seed";
  if (arr < 50) return "series_a";
  if (arr < 200) return "series_b";
  if (arr < 1000) return "growth";
  return "ipo_ready";
}

export function getBenchmark(arr: number): SaaSBenchmark {
  const stage = detectStage(arr);
  return BESSEMER_BENCHMARKS.find((b) => b.stage === stage)!;
}

export type PercentileRating = "top_quartile" | "median" | "bottom_quartile" | "below_benchmark";

function rateMetric(
  value: number,
  benchmark: { p25: number; p50: number; p75: number },
  higherIsBetter = true
): PercentileRating {
  if (higherIsBetter) {
    if (value >= benchmark.p75) return "top_quartile";
    if (value >= benchmark.p50) return "median";
    if (value >= benchmark.p25) return "bottom_quartile";
    return "below_benchmark";
  } else {
    if (value <= benchmark.p25) return "top_quartile";
    if (value <= benchmark.p50) return "median";
    if (value <= benchmark.p75) return "bottom_quartile";
    return "below_benchmark";
  }
}

export interface SaaSMetricsAnalysis {
  stage: SaaSBenchmark["stage"];
  benchmark: SaaSBenchmark;
  ratings: Partial<Record<keyof SaaSMetrics, PercentileRating>>;
  impliedValuation: { low: number; mid: number; high: number }; // 억원
  strengths: string[];
  concerns: string[];
  summary: string;
}

export function analyzeSaaSMetrics(metrics: SaaSMetrics): SaaSMetricsAnalysis {
  const arr = metrics.arr ?? (metrics.mrr ? metrics.mrr * 12 : 0);
  const benchmark = getBenchmark(arr);
  const b = benchmark.benchmarks;

  const ratings: Partial<Record<keyof SaaSMetrics, PercentileRating>> = {};

  if (metrics.arrGrowthYoY !== undefined)
    ratings.arrGrowthYoY = rateMetric(metrics.arrGrowthYoY, b.arrGrowthYoY);
  if (metrics.nrr !== undefined)
    ratings.nrr = rateMetric(metrics.nrr, b.nrr);
  if (metrics.grossMargin !== undefined)
    ratings.grossMargin = rateMetric(metrics.grossMargin, b.grossMargin);
  if (metrics.ltvCacRatio !== undefined)
    ratings.ltvCacRatio = rateMetric(metrics.ltvCacRatio, b.ltvCacRatio);
  if (metrics.magicNumber !== undefined)
    ratings.magicNumber = rateMetric(metrics.magicNumber, b.magicNumber);
  if (metrics.ruleOf40 !== undefined)
    ratings.ruleOf40 = rateMetric(metrics.ruleOf40, b.ruleOf40);
  if (metrics.grossChurn !== undefined)
    ratings.grossChurn = rateMetric(metrics.grossChurn, { p25: 5, p50: 10, p75: 20 }, false);

  // 임플라이드 밸류에이션 (ARR 배수 기준)
  const impliedValuation = {
    low: arr * benchmark.arrMultiple.p25,
    mid: arr * benchmark.arrMultiple.p50,
    high: arr * benchmark.arrMultiple.p75,
  };

  // 강점/우려사항 도출
  const strengths: string[] = [];
  const concerns: string[] = [];

  if (ratings.nrr === "top_quartile") strengths.push(`NRR ${metrics.nrr}%로 업계 상위 25% — 강한 제품-시장 적합성`);
  if (ratings.arrGrowthYoY === "top_quartile") strengths.push(`ARR 성장률 ${metrics.arrGrowthYoY}% YoY — 동급 최고 수준`);
  if (ratings.grossMargin === "top_quartile") strengths.push(`매출총이익률 ${metrics.grossMargin}%로 우수한 소프트웨어 마진 구조`);
  if (ratings.magicNumber === "top_quartile") strengths.push(`Magic Number ${metrics.magicNumber}로 높은 영업 효율성`);
  if (ratings.ltvCacRatio === "top_quartile") strengths.push(`LTV/CAC ${metrics.ltvCacRatio}x — 견조한 Unit Economics`);

  if (ratings.nrr === "below_benchmark" || ratings.nrr === "bottom_quartile")
    concerns.push(`NRR ${metrics.nrr}%로 이탈률 개선 필요`);
  if (ratings.grossChurn === "below_benchmark" || ratings.grossChurn === "bottom_quartile")
    concerns.push(`연간 이탈률 ${metrics.grossChurn}%로 고객 유지 전략 점검 요`);
  if (ratings.magicNumber === "below_benchmark" || ratings.magicNumber === "bottom_quartile")
    concerns.push(`Magic Number ${metrics.magicNumber} — 영업 투자 대비 성장 효율 개선 필요`);
  if (metrics.burnMultiple !== undefined && metrics.burnMultiple > 2)
    concerns.push(`Burn Multiple ${metrics.burnMultiple}x — ARR 증분 대비 현금 소각 과다`);

  const topQuartileCount = Object.values(ratings).filter((r) => r === "top_quartile").length;
  const ratingScore = Object.values(ratings).reduce((sum, r) => {
    const scores: Record<PercentileRating, number> = {
      top_quartile: 4, median: 3, bottom_quartile: 2, below_benchmark: 1,
    };
    return sum + scores[r];
  }, 0);
  const avgScore = Object.values(ratings).length > 0 ? ratingScore / Object.values(ratings).length : 2;

  let summary = "";
  if (avgScore >= 3.5) summary = `${benchmark.stage.replace("_", " ")} 단계 기준 상위권 SaaS — 강한 성장 지표와 우수한 Unit Economics`;
  else if (avgScore >= 2.5) summary = `${benchmark.stage.replace("_", " ")} 단계 기준 중간 수준 — 일부 지표 개선 필요`;
  else summary = `핵심 SaaS 지표 전반 개선 필요 — 제품-시장 적합성 및 영업 효율성 재점검 요`;
  if (topQuartileCount >= 3) summary += ". 상위 지표 다수 — 프리미엄 밸류에이션 가능";

  return { stage: benchmark.stage, benchmark, ratings, impliedValuation, strengths, concerns, summary };
}

export function computeDerivedMetrics(metrics: SaaSMetrics): SaaSMetrics {
  const derived = { ...metrics };

  if (!derived.arr && derived.mrr) derived.arr = derived.mrr * 12;
  if (!derived.mrr && derived.arr) derived.mrr = derived.arr / 12;

  if (!derived.ltvCacRatio && derived.ltv && derived.cac && derived.cac > 0) {
    derived.ltvCacRatio = derived.ltv / derived.cac;
  }

  if (!derived.ruleOf40 && derived.arrGrowthYoY !== undefined && derived.grossMargin !== undefined) {
    // Rule of 40 = 성장률 + 영업이익률 (여기서는 grossMargin - 운영비 추정으로 근사)
    derived.ruleOf40 = derived.arrGrowthYoY + (derived.grossMargin - 60);
  }

  return derived;
}
