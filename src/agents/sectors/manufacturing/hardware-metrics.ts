/**
 * 제조/하드웨어 핵심 지표 분석 모듈
 * BOM 비용 구조, 생산 스케일링, 양산 수율 평가
 */

export interface HardwareMetrics {
  bomCostPerUnit?: number;        // BOM 단가 (만원)
  sellingPricePerUnit?: number;   // 판매 단가 (만원)
  grossMarginPercent?: number;    // 매출총이익률 (%)
  monthlyProduction?: number;     // 월 생산량 (개)
  yieldRate?: number;             // 양산 수율 (%)
  moq?: number;                   // MOQ (최소주문수량)
  leadTimeDays?: number;          // 리드타임 (일)
  inventoryTurnover?: number;     // 재고회전율 (회/년)
  capex?: number;                 // 설비투자 (억원)
  depreciationYears?: number;     // 감가상각 연수
  defectRate?: number;            // 불량률 (%)
  certifications?: string[];      // 인증 현황 (CE, KC, FCC, UL 등)
}

// 제조업 단계별 벤치마크
export interface ManufacturingBenchmark {
  stage: "prototype" | "pilot" | "small_batch" | "mass_production";
  monthlyVolumeRange: [number, number];
  benchmarks: {
    grossMargin: { p25: number; p50: number; p75: number };
    yieldRate: { p25: number; p50: number; p75: number };
    inventoryTurnover: { p25: number; p50: number; p75: number };
    defectRate: { p25: number; p50: number; p75: number }; // 낮을수록 좋음
  };
}

export const MANUFACTURING_BENCHMARKS: ManufacturingBenchmark[] = [
  {
    stage: "prototype",
    monthlyVolumeRange: [0, 100],
    benchmarks: {
      grossMargin: { p25: 20, p50: 35, p75: 50 },
      yieldRate: { p25: 70, p50: 80, p75: 90 },
      inventoryTurnover: { p25: 3, p50: 5, p75: 8 },
      defectRate: { p25: 5, p50: 10, p75: 20 },
    },
  },
  {
    stage: "pilot",
    monthlyVolumeRange: [100, 1000],
    benchmarks: {
      grossMargin: { p25: 25, p50: 40, p75: 55 },
      yieldRate: { p25: 80, p50: 88, p75: 95 },
      inventoryTurnover: { p25: 5, p50: 8, p75: 12 },
      defectRate: { p25: 2, p50: 5, p75: 10 },
    },
  },
  {
    stage: "small_batch",
    monthlyVolumeRange: [1000, 10000],
    benchmarks: {
      grossMargin: { p25: 30, p50: 45, p75: 60 },
      yieldRate: { p25: 85, p50: 92, p75: 97 },
      inventoryTurnover: { p25: 8, p50: 12, p75: 18 },
      defectRate: { p25: 1, p50: 3, p75: 7 },
    },
  },
  {
    stage: "mass_production",
    monthlyVolumeRange: [10000, Infinity],
    benchmarks: {
      grossMargin: { p25: 35, p50: 50, p75: 65 },
      yieldRate: { p25: 90, p50: 95, p75: 99 },
      inventoryTurnover: { p25: 10, p50: 16, p75: 24 },
      defectRate: { p25: 0.5, p50: 1.5, p75: 4 },
    },
  },
];

export function detectManufacturingStage(
  monthlyVolume?: number
): ManufacturingBenchmark["stage"] {
  if (!monthlyVolume || monthlyVolume < 100) return "prototype";
  if (monthlyVolume < 1000) return "pilot";
  if (monthlyVolume < 10000) return "small_batch";
  return "mass_production";
}

export interface ManufacturingAnalysis {
  stage: ManufacturingBenchmark["stage"];
  bomToSellRatio?: number;          // BOM/판매가 비율
  grossMarginRating?: string;
  scalingRisks: string[];
  supplyChainRisks: string[];
  certificationGaps: string[];
  unitEconomicsSummary: string;
  keyMetrics: Record<string, string>;
}

const REQUIRED_CERTS: Record<string, string[]> = {
  korea: ["KC", "KS"],
  us: ["FCC", "UL"],
  eu: ["CE"],
  medical: ["MFDS", "FDA 510k", "CE MDR"],
  food: ["HACCP", "ISO 22000"],
};

export function analyzeManufacturing(
  metrics: HardwareMetrics,
  targetMarket: string[] = ["korea"]
): ManufacturingAnalysis {
  const stage = detectManufacturingStage(metrics.monthlyProduction);
  const benchmark = MANUFACTURING_BENCHMARKS.find((b) => b.stage === stage)!;

  const bomToSellRatio =
    metrics.bomCostPerUnit && metrics.sellingPricePerUnit
      ? metrics.bomCostPerUnit / metrics.sellingPricePerUnit
      : undefined;

  let grossMarginRating: string | undefined;
  if (metrics.grossMarginPercent !== undefined) {
    const b = benchmark.benchmarks.grossMargin;
    if (metrics.grossMarginPercent >= b.p75) grossMarginRating = "상위 25% — 우수한 마진 구조";
    else if (metrics.grossMarginPercent >= b.p50) grossMarginRating = "중위권 — 업계 평균 수준";
    else if (metrics.grossMarginPercent >= b.p25) grossMarginRating = "하위 25% — 원가 구조 개선 필요";
    else grossMarginRating = "벤치마크 하회 — BOM 재설계 또는 가격 전략 재검토 요";
  }

  const scalingRisks: string[] = [];
  if (metrics.yieldRate !== undefined && metrics.yieldRate < 90)
    scalingRisks.push(`양산 수율 ${metrics.yieldRate}% — 스케일업 시 불량 비용 증가 위험`);
  if (metrics.leadTimeDays !== undefined && metrics.leadTimeDays > 90)
    scalingRisks.push(`리드타임 ${metrics.leadTimeDays}일 — 수요 급증 시 공급 대응 지연 위험`);
  if (metrics.moq !== undefined && metrics.moq > 10000)
    scalingRisks.push(`MOQ ${metrics.moq.toLocaleString()}개 — 초기 재고 부담 과다`);
  if (!metrics.capex || metrics.capex === 0)
    scalingRisks.push("CAPEX 계획 미확인 — 양산라인 구축 투자 규모 검토 필요");

  const supplyChainRisks: string[] = [];
  supplyChainRisks.push("핵심 부품 단일 공급사 의존 여부 확인 필요");
  supplyChainRisks.push("중국 제조 의존 시 지정학적 리스크 (관세, 공급망 교란) 헤지 전략 확인");

  // 인증 갭 분석
  const existingCerts = (metrics.certifications ?? []).map((c) => c.toUpperCase());
  const certificationGaps: string[] = [];
  for (const market of targetMarket) {
    const required = REQUIRED_CERTS[market] ?? [];
    for (const cert of required) {
      if (!existingCerts.some((c) => c.includes(cert.toUpperCase()))) {
        certificationGaps.push(`${cert} 인증 미취득 — ${market.toUpperCase()} 시장 진입 필수`);
      }
    }
  }

  const keyMetrics: Record<string, string> = {};
  if (metrics.grossMarginPercent !== undefined)
    keyMetrics["매출총이익률"] = `${metrics.grossMarginPercent}%`;
  if (metrics.yieldRate !== undefined) keyMetrics["양산수율"] = `${metrics.yieldRate}%`;
  if (metrics.defectRate !== undefined) keyMetrics["불량률"] = `${metrics.defectRate}%`;
  if (bomToSellRatio !== undefined)
    keyMetrics["BOM/판매가"] = `${(bomToSellRatio * 100).toFixed(0)}%`;
  if (metrics.leadTimeDays !== undefined)
    keyMetrics["리드타임"] = `${metrics.leadTimeDays}일`;

  const unitEconomicsSummary =
    metrics.bomCostPerUnit && metrics.sellingPricePerUnit
      ? `BOM ${metrics.bomCostPerUnit.toLocaleString()}만원 / 판가 ${metrics.sellingPricePerUnit.toLocaleString()}만원 → 마진 ${metrics.sellingPricePerUnit - metrics.bomCostPerUnit > 0 ? "+" : ""}${(metrics.sellingPricePerUnit - metrics.bomCostPerUnit).toLocaleString()}만원 (${((1 - metrics.bomCostPerUnit / metrics.sellingPricePerUnit) * 100).toFixed(0)}%)`
      : "BOM/판가 데이터 부족 — 추가 확인 필요";

  return {
    stage,
    bomToSellRatio,
    grossMarginRating,
    scalingRisks,
    supplyChainRisks,
    certificationGaps,
    unitEconomicsSummary,
    keyMetrics,
  };
}
