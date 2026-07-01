/**
 * 핀테크/금융 핵심 지표 분석 모듈
 * TPV, Take Rate, NPA, 규제 자본 요건 분석
 */

export interface FintechMetrics {
  // 결제/송금
  tpv?: number;               // Total Payment Volume (억원/년)
  takeRate?: number;          // Take Rate (%)
  transactionsPerMonth?: number; // 월 거래 건수
  averageTicketSize?: number; // 평균 거래 금액 (만원)

  // 대출/여신
  totalLoanBook?: number;     // 총 대출 잔액 (억원)
  npl?: number;               // 부실채권 비율 NPL (%)
  nim?: number;               // 순이자마진 NIM (%)
  loanOriginationMonthly?: number; // 월 신규 실행액 (억원)
  averageLoanSize?: number;   // 평균 대출 금액 (만원)

  // 보험
  gwp?: number;               // Gross Written Premium (억원/년)
  lossRatio?: number;         // 손해율 (%)
  expenseRatio?: number;      // 사업비율 (%)
  combinedRatio?: number;     // 합산비율 (%)

  // 자산관리
  aum?: number;               // AUM (억원)
  managementFee?: number;     // 운용보수 (%)
  performanceFee?: number;    // 성과보수 (%)

  // 공통
  mau?: number;               // MAU (만명)
  arpu?: number;              // ARPU (원/월)
  regulatoryCapital?: number; // 규제 자본 (억원)
  licenseTypes?: string[];    // 보유 라이선스
}

export type FintechSubsector = "payment" | "lending" | "insurance" | "wealthtech" | "crypto" | "b2b_fintech";

// 한국 금융 규제 요건 (2024)
export const KOREAN_FINTECH_REGULATION: Record<string, {
  license: string;
  minCapital: number; // 억원
  regulator: string;
  keyRequirements: string[];
}> = {
  pg: {
    license: "전자금융업자 (PG)",
    minCapital: 10,
    regulator: "금융위원회",
    keyRequirements: ["전자금융거래법", "정보보호 인증 (ISMS-P)", "에스크로 계좌"],
  },
  p2p_lending: {
    license: "온라인투자연계금융업 (P2P)",
    minCapital: 50,
    regulator: "금융위원회",
    keyRequirements: ["온투법", "투자자 보호 의무", "연간 대출 한도"],
  },
  savings_bank: {
    license: "저축은행",
    minCapital: 300,
    regulator: "금융감독원",
    keyRequirements: ["상호저축은행법", "BIS 비율 유지", "여신 집중 규제"],
  },
  securities: {
    license: "투자매매/중개업",
    minCapital: 500,
    regulator: "금융위원회/금감원",
    keyRequirements: ["자본시장법", "투자자 보호", "내부통제 기준"],
  },
  insurance: {
    license: "손해보험/생명보험업",
    minCapital: 3000,
    regulator: "금융위원회/금감원",
    keyRequirements: ["보험업법", "지급여력비율 (RBC)", "책임준비금"],
  },
  mydata: {
    license: "본인신용정보관리업 (마이데이터)",
    minCapital: 50,
    regulator: "금융위원회",
    keyRequirements: ["신용정보법", "API 개방 의무", "개인정보보호"],
  },
};

export interface FintechRegulatoryAnalysis {
  identifiedLicenses: string[];
  missingLicenses: string[];
  capitalAdequacy: string;
  regulatoryRiskLevel: "low" | "medium" | "high" | "critical";
  complianceCosts: string;
  keyRegulatoryRisks: string[];
}

export interface FintechMetricsAnalysis {
  subsector: FintechSubsector;
  unitEconomics: string;
  riskMetrics: string;
  scalabilityAssessment: string;
  regulatoryAnalysis: FintechRegulatoryAnalysis;
  impliedValuation?: { low: number; mid: number; high: number; method: string };
  keyMetrics: Record<string, string>;
  strengths: string[];
  concerns: string[];
}

function detectSubsector(metrics: FintechMetrics): FintechSubsector {
  if (metrics.tpv !== undefined) return "payment";
  if (metrics.totalLoanBook !== undefined || metrics.npl !== undefined) return "lending";
  if (metrics.gwp !== undefined || metrics.lossRatio !== undefined) return "insurance";
  if (metrics.aum !== undefined) return "wealthtech";
  return "b2b_fintech";
}

export function analyzeFintechMetrics(metrics: FintechMetrics): FintechMetricsAnalysis {
  const subsector = detectSubsector(metrics);

  const keyMetrics: Record<string, string> = {};
  const strengths: string[] = [];
  const concerns: string[] = [];

  // 결제업 지표
  let unitEconomics = "Unit Economics 데이터 부족";
  if (subsector === "payment" && metrics.tpv && metrics.takeRate) {
    const netRevenue = metrics.tpv * (metrics.takeRate / 100);
    unitEconomics = `TPV ${metrics.tpv.toLocaleString()}억원 × Take Rate ${metrics.takeRate}% = 순수익 ${netRevenue.toFixed(0)}억원`;
    keyMetrics["TPV"] = `${metrics.tpv.toLocaleString()}억원`;
    keyMetrics["Take Rate"] = `${metrics.takeRate}%`;
    if (metrics.takeRate > 1.5) strengths.push(`Take Rate ${metrics.takeRate}% — 업계 평균(0.5~1.0%) 상회`);
    if (metrics.tpv > 10000) strengths.push("TPV 1조원+ — 유의미한 결제 네트워크 구축");
  }

  // 대출업 지표
  let riskMetrics = "리스크 지표 데이터 부족";
  if (subsector === "lending") {
    if (metrics.npl !== undefined) {
      keyMetrics["NPL 비율"] = `${metrics.npl}%`;
      if (metrics.npl < 2) strengths.push(`NPL ${metrics.npl}% — 우수한 여신 건전성`);
      else if (metrics.npl > 5) concerns.push(`NPL ${metrics.npl}% — 부실채권 비율 경계 수준`);
    }
    if (metrics.nim !== undefined) keyMetrics["NIM"] = `${metrics.nim}%`;
    riskMetrics = `NPL ${metrics.npl ?? "N/A"}%, NIM ${metrics.nim ?? "N/A"}%`;
  }

  // 보험업 지표
  if (subsector === "insurance") {
    if (metrics.combinedRatio !== undefined) {
      keyMetrics["합산비율"] = `${metrics.combinedRatio}%`;
      if (metrics.combinedRatio < 95) strengths.push(`합산비율 ${metrics.combinedRatio}% — 언더라이팅 흑자`);
      else if (metrics.combinedRatio > 110) concerns.push(`합산비율 ${metrics.combinedRatio}% — 언더라이팅 손실`);
      riskMetrics = `합산비율 ${metrics.combinedRatio}% (손해율 ${metrics.lossRatio ?? "N/A"}% + 사업비율 ${metrics.expenseRatio ?? "N/A"}%)`;
    }
  }

  // 자산관리 지표
  if (subsector === "wealthtech" && metrics.aum) {
    keyMetrics["AUM"] = `${metrics.aum.toLocaleString()}억원`;
    const mgmtFeeRevenue = metrics.aum * ((metrics.managementFee ?? 0.5) / 100);
    unitEconomics = `AUM ${metrics.aum.toLocaleString()}억원 × 운용보수 ${metrics.managementFee ?? 0.5}% = 연 ${mgmtFeeRevenue.toFixed(0)}억원`;
    if (metrics.aum > 10000) strengths.push("AUM 1조원+ — 자산관리 플랫폼 규모 도달");
  }

  // 규제 분석
  const existingLicenses = (metrics.licenseTypes ?? []).map((l) => l.toLowerCase());
  const regulatoryRiskLevel: FintechRegulatoryAnalysis["regulatoryRiskLevel"] =
    existingLicenses.length === 0 ? "high" : existingLicenses.length > 2 ? "low" : "medium";

  const regulatoryAnalysis: FintechRegulatoryAnalysis = {
    identifiedLicenses: metrics.licenseTypes ?? [],
    missingLicenses: [],
    capitalAdequacy:
      metrics.regulatoryCapital
        ? `규제 자본 ${metrics.regulatoryCapital.toLocaleString()}억원 보유`
        : "규제 자본 현황 확인 필요",
    regulatoryRiskLevel,
    complianceCosts: "컴플라이언스 비용 연간 추정 필요",
    keyRegulatoryRisks: [
      "금융 라이선스 취득/유지 비용 및 일정",
      "금감원 검사 대응 내부통제 체계",
      "신용정보법/개인정보보호법 준수",
    ],
  };

  // 임플라이드 밸류에이션
  let impliedValuation: FintechMetricsAnalysis["impliedValuation"] | undefined;
  if (subsector === "payment" && metrics.tpv) {
    impliedValuation = {
      low: metrics.tpv * 0.005,
      mid: metrics.tpv * 0.01,
      high: metrics.tpv * 0.02,
      method: "EV/TPV 배수 (0.5~2.0%)",
    };
  } else if (subsector === "wealthtech" && metrics.aum) {
    impliedValuation = {
      low: metrics.aum * 0.01,
      mid: metrics.aum * 0.02,
      high: metrics.aum * 0.04,
      method: "EV/AUM 배수 (1~4%)",
    };
  }

  const scalabilityAssessment =
    subsector === "payment"
      ? "결제 네트워크 효과 — 가맹점/사용자 동반 성장 시 한계비용 감소 구조"
      : subsector === "lending"
      ? "대출 포트폴리오 성장 시 NIM 개선 기대, 단 자본 제약 존재"
      : subsector === "wealthtech"
      ? "AUM 증가 시 고정비 레버리지 — 규모의 경제 도달 후 마진 급개선"
      : "핀테크 B2B 솔루션 — API 기반 확장으로 한계비용 낮음";

  return {
    subsector,
    unitEconomics,
    riskMetrics,
    scalabilityAssessment,
    regulatoryAnalysis,
    impliedValuation,
    keyMetrics,
    strengths,
    concerns,
  };
}
