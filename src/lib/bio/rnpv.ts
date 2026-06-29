/**
 * rNPV (risk-adjusted Net Present Value) calculator for biotech pipeline assets.
 * Used by Dr. Cell agent to augment valuation sections with real arithmetic.
 */

export interface PipelineAsset {
  name: string;
  indication: string;
  phase: "PRECLINICAL" | "PHASE1" | "PHASE2" | "PHASE3" | "NDA" | "APPROVED";
  peakRevenueBillionKRW: number;   // 억원 단위의 피크 매출 추정
  marketPenetration: number;        // 0~1, e.g. 0.05 = 5%
  royaltyRate?: number;             // 기술이전 시 로열티율 (0~1), default 0.1
  yearsToLaunch?: number;           // 허가까지 남은 연수, default based on phase
  discountRate?: number;            // 할인율, default 0.12
}

export interface PipelineRNPV {
  name: string;
  indication: string;
  phase: string;
  pos: number;          // Probability of Success (%)
  peakRevenue: number;  // 억원
  npv: number;          // 억원 (undiscounted)
  rnpv: number;         // 억원 (risk-adjusted)
}

export interface RNPVResult {
  assets: PipelineRNPV[];
  totalRNPV: number;     // 억원
  totalNPV: number;      // 억원
  blendedPoS: number;    // weighted average PoS
}

/** Phase별 누적 성공 확률 (industry average, clinical stage → approval) */
const PHASE_POS: Record<PipelineAsset["phase"], number> = {
  PRECLINICAL: 0.06,   // ~6%
  PHASE1:      0.15,   // ~15%
  PHASE2:      0.38,   // ~38% (Phase I 성공 후 Phase II → Approval)
  PHASE3:      0.59,   // ~59%
  NDA:         0.90,   // ~90%
  APPROVED:    1.00,
};

const PHASE_LABEL: Record<PipelineAsset["phase"], string> = {
  PRECLINICAL: "전임상",
  PHASE1:      "Phase I",
  PHASE2:      "Phase II",
  PHASE3:      "Phase III",
  NDA:         "NDA/BLA",
  APPROVED:    "허가 완료",
};

/** Phase별 허가까지 예상 잔여 기간 (년) */
const DEFAULT_YEARS_TO_LAUNCH: Record<PipelineAsset["phase"], number> = {
  PRECLINICAL: 10,
  PHASE1:      8,
  PHASE2:      5,
  PHASE3:      3,
  NDA:         1,
  APPROVED:    0,
};

/**
 * NPV of a royalty stream: PeakRevenue × Royalty × simplified 10-year annuity factor
 * Annuity factor = (1 - (1+r)^-n) / r, assuming 10-year revenue ramp-peak-tail
 */
function computeNPV(asset: PipelineAsset): number {
  const r = asset.discountRate ?? 0.12;
  const royalty = asset.royaltyRate ?? 0.10;
  const peakRev = asset.peakRevenueBillionKRW * asset.marketPenetration;
  const yearsToLaunch = asset.yearsToLaunch ?? DEFAULT_YEARS_TO_LAUNCH[asset.phase];
  const revenueYears = 10;

  // PV of peak revenue royalty stream, discounted back from launch
  const annuityFactor = (1 - Math.pow(1 + r, -revenueYears)) / r;
  const pvAtLaunch = peakRev * royalty * annuityFactor;
  const pvNow = pvAtLaunch / Math.pow(1 + r, yearsToLaunch);

  return Math.round(pvNow);
}

export function calculateRNPV(assets: PipelineAsset[]): RNPVResult {
  const results: PipelineRNPV[] = assets.map((asset) => {
    const pos = PHASE_POS[asset.phase];
    const npv = computeNPV(asset);
    const rnpv = Math.round(npv * pos);

    return {
      name: asset.name,
      indication: asset.indication,
      phase: PHASE_LABEL[asset.phase],
      pos: Math.round(pos * 100),
      peakRevenue: Math.round(
        asset.peakRevenueBillionKRW * asset.marketPenetration
      ),
      npv,
      rnpv,
    };
  });

  const totalRNPV = results.reduce((sum, a) => sum + a.rnpv, 0);
  const totalNPV = results.reduce((sum, a) => sum + a.npv, 0);
  const blendedPoS =
    results.length > 0
      ? Math.round(results.reduce((sum, a) => sum + a.pos, 0) / results.length)
      : 0;

  return { assets: results, totalRNPV, totalNPV, blendedPoS };
}

/** Format rNPV result into a Korean IC report table string */
export function formatRNPVTable(result: RNPVResult): string {
  if (result.assets.length === 0) return "";

  const rows = result.assets
    .map(
      (a) =>
        `| ${a.name} | ${a.indication} | ${a.phase} | ${a.pos}% | ${a.peakRevenue.toLocaleString()}억원 | ${a.rnpv.toLocaleString()}억원 |`
    )
    .join("\n");

  return `
| 파이프라인 | 적응증 | 임상단계 | 성공확률(PoS) | 피크매출 | rNPV |
|-----------|--------|---------|-------------|---------|------|
${rows}
| **합계** | | | **${result.blendedPoS}%** (평균) | | **${result.totalRNPV.toLocaleString()}억원** |

> PoS 기준: 전임상 6% / Phase I 15% / Phase II 38% / Phase III 59% / NDA 90%  
> 할인율 12% 적용, 피크매출 기준 로열티 10년 수익 기준 NPV 산정
`.trim();
}
