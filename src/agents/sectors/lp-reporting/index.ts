import { callClaudeJSON } from "@/lib/claude";

export interface PortfolioCompany {
  name: string;
  sector: string;
  investmentDate: string;        // YYYY-MM-DD
  investmentAmountKRW: number;   // 억원
  currentValuation?: number;     // 현재 기업가치 (억원)
  entryValuation: number;        // 투자 당시 기업가치 (억원)
  ownershipPercent: number;      // 지분율 (%)
  stage: string;                 // 현재 단계
  revenueLatest?: number;        // 최근 매출 (억원/년)
  revenueGrowthYoY?: number;     // YoY 성장률 (%)
  headcount?: number;            // 임직원 수
  runwayMonths?: number;         // 남은 런웨이 (개월)
  highlights: string[];          // 분기 주요 성과
  risks: string[];               // 현재 주요 리스크
  nextMilestones: string[];      // 다음 분기 주요 이정표
  status: "healthy" | "watch" | "concern" | "exited";
}

export interface FundInfo {
  fundName: string;
  vintageYear: number;
  totalCommitment: number;       // 결성 총액 (억원)
  investedCapital: number;       // 투입 자본 (억원)
  remainingCapital: number;      // 잔여 투자 가능 자본 (억원)
  managementFeeRate: number;     // 운용보수율 (%)
  carryRate: number;             // 성과보수율 (%)
  investmentPeriodEnd: string;   // 투자 기간 종료 (YYYY-MM-DD)
  fundTermEnd: string;           // 펀드 만기 (YYYY-MM-DD)
}

export interface LPReportInput {
  fund: FundInfo;
  portfolio: PortfolioCompany[];
  reportingPeriod: string;       // e.g. "2024 Q4"
  currency: "KRW" | "USD";
  additionalNarrative?: string;
}

export interface LPReportOutput {
  executiveSummary: string;
  fundPerformanceMetrics: {
    moic: number;                // Multiple on Invested Capital
    tvpi: number;                // Total Value to Paid-In
    dpi: number;                 // Distributions to Paid-In
    rvpi: number;                // Residual Value to Paid-In
    irr?: number;                // IRR (추정)
    nav: number;                 // Net Asset Value (억원)
  };
  portfolioSummary: string;
  sectorAllocation: Record<string, { count: number; invested: number; currentValue: number }>;
  quarterlyHighlights: string;
  watchListCommentary: string;
  marketOutlook: string;
  nextQuarterFocus: string;
  esgNote?: string;
}

function calculateFundMetrics(
  fund: FundInfo,
  portfolio: PortfolioCompany[]
): LPReportOutput["fundPerformanceMetrics"] {
  const totalCurrentFMV = portfolio.reduce((sum, c) => {
    const fmv = c.currentValuation
      ? c.currentValuation * (c.ownershipPercent / 100)
      : c.entryValuation * (c.ownershipPercent / 100); // 변동 없으면 cost로
    return sum + fmv;
  }, 0);

  const distributions = 0; // 실제에서는 실현 수익 합산
  const nav = totalCurrentFMV;
  const paid = fund.investedCapital;

  return {
    moic: paid > 0 ? (nav + distributions) / paid : 1,
    tvpi: paid > 0 ? (nav + distributions) / paid : 1,
    dpi: paid > 0 ? distributions / paid : 0,
    rvpi: paid > 0 ? nav / paid : 1,
    nav,
  };
}

function buildSectorAllocation(
  portfolio: PortfolioCompany[]
): Record<string, { count: number; invested: number; currentValue: number }> {
  const alloc: Record<string, { count: number; invested: number; currentValue: number }> = {};
  for (const company of portfolio) {
    if (!alloc[company.sector]) {
      alloc[company.sector] = { count: 0, invested: 0, currentValue: 0 };
    }
    alloc[company.sector].count += 1;
    alloc[company.sector].invested += company.investmentAmountKRW;
    alloc[company.sector].currentValue +=
      (company.currentValuation ?? company.entryValuation) * (company.ownershipPercent / 100);
  }
  return alloc;
}

export async function generateLPReport(input: LPReportInput): Promise<LPReportOutput> {
  const metrics = calculateFundMetrics(input.fund, input.portfolio);
  const sectorAllocation = buildSectorAllocation(input.portfolio);

  const watchList = input.portfolio.filter((c) => c.status === "watch" || c.status === "concern");
  const healthyCount = input.portfolio.filter((c) => c.status === "healthy").length;

  const { data } = await callClaudeJSON<Omit<LPReportOutput, "fundPerformanceMetrics" | "sectorAllocation">>({
    system: `당신은 한국 VC의 IR 담당자입니다. LP에게 발송하는 분기 보고서를 전문적이고 투명하게 작성합니다.
작성 원칙:
- 성과는 데이터 기반으로 객관적으로 서술
- 리스크/우려 사항도 솔직하게 공유 (LP 신뢰 유지)
- 한국 VC 업계 표준 용어 사용 (MOIC, TVPI, DPI, IRR 등)
- 투자자 친화적이고 명확한 문체
- 분량은 각 섹션 200~400자`,

    messages: [
      {
        role: "user",
        content: `다음 정보를 기반으로 ${input.reportingPeriod} LP 분기 보고서를 작성하세요.

펀드 정보: ${JSON.stringify(input.fund)}
포트폴리오 현황: ${JSON.stringify(input.portfolio)}
성과 지표: MOIC ${metrics.moic.toFixed(2)}x, TVPI ${metrics.tvpi.toFixed(2)}x, NAV ${metrics.nav.toFixed(0)}억원
섹터 배분: ${JSON.stringify(sectorAllocation)}
정상 운영: ${healthyCount}개사, 모니터링 필요: ${watchList.length}개사
${input.additionalNarrative ? `추가 내용: ${input.additionalNarrative}` : ""}

JSON 응답:
{
  "executiveSummary": "이사요약 — 분기 핵심 성과, 펀드 현황, 주요 이슈 (400자)",
  "portfolioSummary": "포트폴리오 종합 현황 — 업체별 성과 요약, 성장 하이라이트 (600자)",
  "quarterlyHighlights": "분기 주요 성과 — 신규 투자, 매출 성장, 파트너십, Exit 등 (500자)",
  "watchListCommentary": "모니터링 대상 기업 — 현황, 지원 계획, 회복 전망 (400자)",
  "marketOutlook": "시장 전망 — 주요 섹터별 투자 환경, 거시경제 영향 (400자)",
  "nextQuarterFocus": "다음 분기 집중 사항 — 후속 투자, 신규 딜, 사후관리 계획 (300자)",
  "esgNote": "ESG 현황 — 포트폴리오 기업 ESG 이니셔티브 (200자, 없으면 null)"
}`,
      },
    ],
    maxTokens: 4096,
  });

  return {
    ...data,
    fundPerformanceMetrics: metrics,
    sectorAllocation,
  };
}
