import { PortfolioStatus } from "@prisma/client";

export interface PortfolioCompanyLike {
  investAmount: number;
  currentValuation: number | null;
  entryValuation: number;
  ownershipPercent: number;
  realizedAmount: number;
  status: PortfolioStatus;
}

export interface PortfolioMetrics {
  /// 투자 원금 합계 (억원)
  totalInvested: number;
  /// 미실현 잔여가치 (억원)
  unrealizedValue: number;
  /// 실현 회수액 (억원)
  realizedValue: number;
  /// 총 가치 = 실현 + 미실현
  totalValue: number;
  /// Multiple on Invested Capital
  moic: number;
  /// Distributions to Paid-In
  dpi: number;
  /// Residual Value to Paid-In
  rvpi: number;
  /// Total Value to Paid-In
  tvpi: number;
  companyCount: number;
  activeCount: number;
  exitedCount: number;
  riskCount: number;
}

const ZERO_SAFE = (n: number, d: number) => (d > 0 ? n / d : 0);

/**
 * 보유 지분 기준 현재 평가액 (억원).
 * currentValuation이 없으면 entryValuation을 사용해 보수적으로 원금 수준으로 본다.
 */
export function holdingValue(c: PortfolioCompanyLike): number {
  if (c.status === PortfolioStatus.WRITTEN_OFF) return 0;
  if (c.status === PortfolioStatus.EXITED) return 0;
  const valuation = c.currentValuation ?? c.entryValuation;
  return (valuation * c.ownershipPercent) / 100;
}

export function calculatePortfolioMetrics(
  companies: PortfolioCompanyLike[]
): PortfolioMetrics {
  const totalInvested = companies.reduce((s, c) => s + c.investAmount, 0);
  const unrealizedValue = companies.reduce((s, c) => s + holdingValue(c), 0);
  const realizedValue = companies.reduce((s, c) => s + c.realizedAmount, 0);
  const totalValue = unrealizedValue + realizedValue;

  return {
    totalInvested: round(totalInvested),
    unrealizedValue: round(unrealizedValue),
    realizedValue: round(realizedValue),
    totalValue: round(totalValue),
    moic: round(ZERO_SAFE(totalValue, totalInvested), 2),
    dpi: round(ZERO_SAFE(realizedValue, totalInvested), 2),
    rvpi: round(ZERO_SAFE(unrealizedValue, totalInvested), 2),
    tvpi: round(ZERO_SAFE(totalValue, totalInvested), 2),
    companyCount: companies.length,
    activeCount: companies.filter((c) => c.status === PortfolioStatus.ACTIVE)
      .length,
    exitedCount: companies.filter((c) => c.status === PortfolioStatus.EXITED)
      .length,
    riskCount: companies.filter(
      (c) =>
        c.status === PortfolioStatus.RISK ||
        c.status === PortfolioStatus.WATCH
    ).length,
  };
}

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export const PORTFOLIO_STATUS_LABEL: Record<PortfolioStatus, string> = {
  ACTIVE: "정상",
  WATCH: "관찰",
  RISK: "위험",
  EXITED: "회수 완료",
  WRITTEN_OFF: "손상차손",
};

export const PORTFOLIO_STATUS_TONE: Record<PortfolioStatus, string> = {
  ACTIVE: "bg-green-50 text-green-700 border-green-200",
  WATCH: "bg-amber-50 text-amber-700 border-amber-200",
  RISK: "bg-red-50 text-red-700 border-red-200",
  EXITED: "bg-blue-50 text-blue-700 border-blue-200",
  WRITTEN_OFF: "bg-gray-100 text-gray-500 border-gray-200",
};

export type ManagementGrade = "A" | "B" | "C" | "D" | "F";

export const GRADE_LABEL: Record<ManagementGrade, string> = {
  A: "우수",
  B: "양호",
  C: "관찰",
  D: "위험",
  F: "손상",
};

export const GRADE_TONE: Record<ManagementGrade, string> = {
  A: "bg-emerald-50 text-emerald-700 border-emerald-200",
  B: "bg-blue-50 text-blue-700 border-blue-200",
  C: "bg-amber-50 text-amber-700 border-amber-200",
  D: "bg-orange-50 text-orange-700 border-orange-200",
  F: "bg-red-50 text-red-700 border-red-200",
};

/**
 * 관리등급 — 상태(WATCH/RISK 등)와 MOIC 성과를 합쳐 A~F 한 글자로 요약한다.
 *
 * 상태(사람이 직접 태그한 위험 신호)가 MOIC(숫자 성과)보다 우선한다 —
 * 예를 들어 MOIC 3배짜리 딜이라도 심사역이 RISK로 태그했다면 그 판단을
 * 존중해야지, 숫자만 보고 A를 주면 안 된다.
 */
export function companyGrade(
  status: PortfolioStatus,
  moic: number
): ManagementGrade {
  if (status === PortfolioStatus.WRITTEN_OFF) return "F";
  if (status === PortfolioStatus.RISK) return "D";
  if (status === PortfolioStatus.WATCH) return "C";
  if (moic >= 3) return "A";
  if (moic >= 1.5) return "B";
  if (moic >= 1) return "C";
  return "D";
}

/** 2025Q1 형식의 현재 분기 */
export function currentPeriod(date = new Date()): string {
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()}Q${q}`;
}

/** 최근 N개 분기를 최신순으로 반환 */
export function recentPeriods(count = 4, from = new Date()): string[] {
  const periods: string[] = [];
  let year = from.getFullYear();
  let q = Math.floor(from.getMonth() / 3) + 1;
  for (let i = 0; i < count; i++) {
    periods.push(`${year}Q${q}`);
    q -= 1;
    if (q === 0) {
      q = 4;
      year -= 1;
    }
  }
  return periods;
}

/**
 * KPI 시계열에서 직전 분기 대비 변화율(%)을 계산한다.
 * 값이 하나뿐이거나 이전 값이 0이면 null.
 */
export function kpiChangePercent(
  series: Array<{ period: string; value: number }>
): number | null {
  if (series.length < 2) return null;
  const sorted = [...series].sort((a, b) => comparePeriod(a.period, b.period));
  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  if (!prev.value) return null;
  return round(((latest.value - prev.value) / Math.abs(prev.value)) * 100);
}

export function comparePeriod(a: string, b: string): number {
  const parse = (p: string) => {
    const m = /^(\d{4})Q([1-4])$/.exec(p);
    return m ? Number(m[1]) * 10 + Number(m[2]) : 0;
  };
  return parse(a) - parse(b);
}

/**
 * 사후관리 알림 — 지연 마일스톤, 런웨이 부족, 업데이트 누락.
 */
export interface PortfolioAlert {
  companyId: string;
  companyName: string;
  severity: "high" | "medium";
  message: string;
}

export function buildAlerts(
  companies: Array<{
    id: string;
    companyName: string;
    status: PortfolioStatus;
    milestones: Array<{ title: string; dueDate: Date | string; status: string }>;
    kpis: Array<{ metric: string; value: number; unit: string; period: string }>;
    updates: Array<{ period: string }>;
  }>,
  now = new Date()
): PortfolioAlert[] {
  const alerts: PortfolioAlert[] = [];
  const thisPeriod = currentPeriod(now);

  for (const c of companies) {
    if (c.status === "EXITED" || c.status === "WRITTEN_OFF") continue;

    for (const m of c.milestones) {
      const due = new Date(m.dueDate);
      const overdue = due < now && m.status !== "DONE";
      if (overdue || m.status === "DELAYED") {
        alerts.push({
          companyId: c.id,
          companyName: c.companyName,
          severity: "high",
          message: `마일스톤 지연: ${m.title} (기한 ${due.toISOString().slice(0, 10)})`,
        });
      }
    }

    const runway = c.kpis
      .filter((k) => k.metric === "런웨이")
      .sort((a, b) => comparePeriod(a.period, b.period))
      .pop();
    if (runway && runway.value <= 6) {
      alerts.push({
        companyId: c.id,
        companyName: c.companyName,
        severity: runway.value <= 3 ? "high" : "medium",
        message: `런웨이 ${runway.value}${runway.unit} — 후속 라운드 점검 필요`,
      });
    }

    if (!c.updates.some((u) => u.period === thisPeriod)) {
      alerts.push({
        companyId: c.id,
        companyName: c.companyName,
        severity: "medium",
        message: `${thisPeriod} 모니터링 노트 미작성`,
      });
    }
  }

  return alerts.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1
  );
}
