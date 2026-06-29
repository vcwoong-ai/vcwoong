/**
 * 콘텐츠/엔터테인먼트 핵심 지표 분석 모듈
 * IP 가치, 크리에이터 경제, OTT/미디어 비즈니스 지표
 */

export interface ContentMetrics {
  // 구독/트래픽
  mau?: number;               // 월간 활성 사용자 (만명)
  dau?: number;               // 일간 활성 사용자 (만명)
  dauMauRatio?: number;       // DAU/MAU 비율 (스티키니스)
  paidSubscribers?: number;   // 유료 구독자 수 (만명)
  arpu?: number;              // 사용자당 평균 매출 (원/월)

  // 콘텐츠
  titleCount?: number;        // 보유 IP/콘텐츠 수
  monthlyNewTitles?: number;  // 월 신규 콘텐츠 수
  hitRatio?: number;          // 히트작 비율 (전체 중 %)

  // 수익화
  subscriptionRevenue?: number;   // 구독 매출 (억원/년)
  advertisingRevenue?: number;    // 광고 매출 (억원/년)
  licensingRevenue?: number;      // 라이선싱/IP 수익 (억원/년)
  merchandisingRevenue?: number;  // 머천다이징 수익 (억원/년)

  // 크리에이터 (플랫폼형)
  creatorCount?: number;      // 크리에이터 수
  topCreatorConcentration?: number; // 상위 10% 크리에이터 매출 비중 (%)

  // 글로벌
  overseasRevenueRatio?: number;  // 해외 매출 비중 (%)
  localizationCount?: number;     // 현지화 언어 수
}

export type ContentBusinessModel = "subscription" | "advertising" | "ip_licensing" | "platform" | "hybrid";

export interface ContentBusinessAnalysis {
  primaryModel: ContentBusinessModel;
  revenueConcentration: string;  // 수익 다각화 평가
  ipPortfolioStrength: string;
  creatorRiskLevel: "low" | "medium" | "high";  // 크리에이터 의존도 리스크
  globalPotential: string;
  viralityScore: "low" | "medium" | "high";     // 바이럴 가능성
  keyMetrics: Record<string, string>;
  strengths: string[];
  concerns: string[];
}

// 한국 콘텐츠 시장 주요 플레이어 비교
export const KOREAN_CONTENT_BENCHMARKS = {
  webtoon: {
    name: "웹툰 플랫폼",
    avgArpu: 5000,          // 원/월
    avgDauMau: 0.25,
    hitRatio: 0.05,         // 5%가 매출 80% 견인
    overseasRatio: 0.3,
  },
  short_drama: {
    name: "숏드라마",
    avgArpu: 3000,
    avgDauMau: 0.3,
    hitRatio: 0.1,
    overseasRatio: 0.5,
  },
  gaming: {
    name: "모바일 게임",
    avgArpu: 15000,
    avgDauMau: 0.35,
    hitRatio: 0.02,
    overseasRatio: 0.4,
  },
  creator_platform: {
    name: "크리에이터 플랫폼",
    avgArpu: 2000,
    avgDauMau: 0.2,
    hitRatio: 0.08,
    overseasRatio: 0.2,
  },
};

export function analyzeContentBusiness(metrics: ContentMetrics): ContentBusinessAnalysis {
  // 주요 비즈니스 모델 판별
  const revenues = {
    subscription: metrics.subscriptionRevenue ?? 0,
    advertising: metrics.advertisingRevenue ?? 0,
    ip_licensing: metrics.licensingRevenue ?? 0,
    merchandising: metrics.merchandisingRevenue ?? 0,
  };
  const totalRevenue = Object.values(revenues).reduce((a, b) => a + b, 0);
  const dominant = Object.entries(revenues).sort(([, a], [, b]) => b - a)[0];
  const primaryModel: ContentBusinessModel =
    totalRevenue === 0
      ? "hybrid"
      : dominant[0] === "merchandising"
      ? "ip_licensing"
      : (dominant[0] as ContentBusinessModel);

  // 수익 집중도
  let revenueConcentration = "데이터 부족";
  if (totalRevenue > 0) {
    const maxRatio = (dominant[1] / totalRevenue) * 100;
    if (maxRatio > 80) revenueConcentration = `${dominant[0]} 수익 집중도 ${maxRatio.toFixed(0)}% — 다각화 필요`;
    else if (maxRatio > 60) revenueConcentration = `${dominant[0]} 중심 (${maxRatio.toFixed(0)}%), 보조 수익원 존재`;
    else revenueConcentration = "균형 잡힌 멀티 수익 구조";
  }

  // IP 포트폴리오 강도
  let ipPortfolioStrength = "IP 데이터 없음";
  if (metrics.titleCount !== undefined) {
    if (metrics.titleCount > 1000) ipPortfolioStrength = `대규모 IP 보유 (${metrics.titleCount.toLocaleString()}개) — 방어적 해자`;
    else if (metrics.titleCount > 100) ipPortfolioStrength = `중규모 IP 포트폴리오 (${metrics.titleCount}개)`;
    else ipPortfolioStrength = `소규모 IP 보유 (${metrics.titleCount}개) — 히트작 의존 리스크`;
  }

  // 크리에이터 리스크
  let creatorRiskLevel: ContentBusinessAnalysis["creatorRiskLevel"] = "medium";
  if (metrics.topCreatorConcentration !== undefined) {
    if (metrics.topCreatorConcentration > 70) creatorRiskLevel = "high";
    else if (metrics.topCreatorConcentration < 40) creatorRiskLevel = "low";
  }

  // 글로벌 잠재력
  let globalPotential = "글로벌 확장 가능성 평가 필요";
  if (metrics.overseasRevenueRatio !== undefined) {
    if (metrics.overseasRevenueRatio > 30) globalPotential = `해외 매출 ${metrics.overseasRevenueRatio}% — 글로벌 K-콘텐츠 트렌드 수혜`;
    else if (metrics.overseasRevenueRatio > 10) globalPotential = `해외 매출 ${metrics.overseasRevenueRatio}% — 글로벌화 초기 단계`;
    else globalPotential = "국내 중심 — 글로벌 확장 전략 수립 필요";
  }

  // 스티키니스 (바이럴)
  let viralityScore: ContentBusinessAnalysis["viralityScore"] = "medium";
  if (metrics.dauMauRatio !== undefined) {
    if (metrics.dauMauRatio > 0.35) viralityScore = "high";
    else if (metrics.dauMauRatio < 0.15) viralityScore = "low";
  }

  const keyMetrics: Record<string, string> = {};
  if (metrics.mau !== undefined) keyMetrics["MAU"] = `${metrics.mau.toLocaleString()}만명`;
  if (metrics.paidSubscribers !== undefined) keyMetrics["유료 구독자"] = `${metrics.paidSubscribers.toLocaleString()}만명`;
  if (metrics.arpu !== undefined) keyMetrics["ARPU"] = `${metrics.arpu.toLocaleString()}원/월`;
  if (metrics.dauMauRatio !== undefined) keyMetrics["DAU/MAU"] = `${(metrics.dauMauRatio * 100).toFixed(0)}%`;
  if (metrics.overseasRevenueRatio !== undefined) keyMetrics["해외 매출 비중"] = `${metrics.overseasRevenueRatio}%`;

  const strengths: string[] = [];
  const concerns: string[] = [];

  if (metrics.overseasRevenueRatio && metrics.overseasRevenueRatio > 30)
    strengths.push("K-콘텐츠 글로벌 수요 포착 — 해외 매출 비중 높음");
  if (metrics.dauMauRatio && metrics.dauMauRatio > 0.3)
    strengths.push(`높은 스티키니스 (DAU/MAU ${(metrics.dauMauRatio * 100).toFixed(0)}%) — 강한 재방문 습관`);
  if (metrics.hitRatio && metrics.hitRatio > 0.1)
    strengths.push(`히트작 비율 ${(metrics.hitRatio * 100).toFixed(0)}% — 콘텐츠 큐레이션 역량 우수`);
  if (creatorRiskLevel === "high")
    concerns.push("상위 크리에이터 매출 집중 — 이탈 시 매출 급감 위험");
  if (metrics.titleCount && metrics.titleCount < 20)
    concerns.push("IP 포트폴리오 소규모 — 히트작 부재 시 성장 정체 위험");
  if (!metrics.overseasRevenueRatio || metrics.overseasRevenueRatio < 10)
    concerns.push("국내 시장 의존 — 한국 콘텐츠 시장 성장 한계 직면 가능성");

  return {
    primaryModel,
    revenueConcentration,
    ipPortfolioStrength,
    creatorRiskLevel,
    globalPotential,
    viralityScore,
    keyMetrics,
    strengths,
    concerns,
  };
}
