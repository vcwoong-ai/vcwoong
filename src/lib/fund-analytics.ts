/**
 * 펀드 운용 심화 지표 — XIRR·워터폴·회수 시뮬레이션·민감도·자본잠식.
 *
 * `lp-report.ts`의 MOIC/TVPI/DPI/RVPI는 현금흐름의 "시점"을 고려하지 않는
 * 배수 지표다. XIRR은 투자·회수가 언제 일어났는지까지 반영한 연환산
 * 수익률이라 별도로 계산해야 한다.
 *
 * ## 데이터 한계 (정확도를 과장하지 않기 위해 명시)
 * - 펀드는 파이프라인 방식(capital call)으로 납입되는 게 보통인데, 이
 *   모델은 `Fund.paidIn` 총액만 있고 납입 시점별 이력이 없다. 워터폴
 *   계산의 "납입 자본"은 총액을 그대로 쓴다.
 * - `PortfolioCompany.exitedAt`이 없는 회수 건은 `updatedAt`으로 근사한다.
 * - 미실현 포지션은 "오늘 시점에 현재가치로 청산했다"고 가정해 XIRR에
 *   포함한다 (VC/PE 업계의 표준 관행이지 실제 회수를 뜻하지 않는다).
 */
import { PortfolioStatus } from "@prisma/client";
import { holdingValue, type PortfolioCompanyLike } from "@/lib/portfolio";

export interface CashFlow {
  date: Date;
  amount: number; // 유출은 음수, 유입은 양수
}

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

/**
 * XIRR — 날짜가 불규칙한 현금흐름의 연환산 내부수익률.
 * Newton-Raphson으로 풀고, 발산하면 이분법(bisection)으로 넘어간다.
 * 둘 다 실패하면 null (예: 전부 같은 부호인 현금흐름 — 수익률 정의 불가).
 */
export function calculateXIRR(cashflows: CashFlow[]): number | null {
  const flows = cashflows.filter((c) => c.amount !== 0);
  if (flows.length < 2) return null;

  const hasPositive = flows.some((c) => c.amount > 0);
  const hasNegative = flows.some((c) => c.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  const t0 = flows[0].date.getTime();
  const years = flows.map((c) => (c.date.getTime() - t0) / MS_PER_YEAR);

  const npv = (rate: number) =>
    flows.reduce((sum, c, i) => sum + c.amount / (1 + rate) ** years[i], 0);
  const dnpv = (rate: number) =>
    flows.reduce(
      (sum, c, i) =>
        sum - (years[i] * c.amount) / (1 + rate) ** (years[i] + 1),
      0
    );

  let rate = 0.15; // 초기값 — VC 펀드 평균 근방에서 시작해야 수렴이 잘 된다
  for (let i = 0; i < 60; i++) {
    const f = npv(rate);
    const df = dnpv(rate);
    if (Math.abs(df) < 1e-9) break;
    const next = rate - f / df;
    if (!Number.isFinite(next) || next <= -0.999) break;
    if (Math.abs(next - rate) < 1e-7) return round(next, 4);
    rate = next;
  }

  // Newton이 발산했으면 이분법으로 재시도 — 더 느리지만 항상 수렴한다
  let lo = -0.99;
  let hi = 10;
  let fLo = npv(lo);
  const fHi = npv(hi);
  if (Number.isNaN(fLo) || Number.isNaN(fHi) || fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-6) return round(mid, 4);
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return round((lo + hi) / 2, 4);
}

export interface CompanyForCashFlow extends PortfolioCompanyLike {
  investedAt: Date;
  exitedAt: Date | null;
  updatedAt: Date;
}

/**
 * 포트폴리오사 1곳의 현금흐름 시리즈.
 * 투자(유출) → [회수(유입)] → [미실현 잔여가치(유입, 오늘 시점 청산 가정)]
 */
export function companyCashFlows(
  c: CompanyForCashFlow,
  asOf: Date = new Date()
): CashFlow[] {
  const flows: CashFlow[] = [{ date: c.investedAt, amount: -c.investAmount }];

  if (c.realizedAmount > 0) {
    const exitDate = c.exitedAt ?? c.updatedAt;
    flows.push({ date: exitDate, amount: c.realizedAmount });
  }

  const remaining = holdingValue(c);
  if (remaining > 0) {
    flows.push({ date: asOf, amount: remaining });
  }

  return flows;
}

/** 펀드 전체 XIRR — 회사별 IRR의 평균이 아니라, 전 회사의 현금흐름을 합쳐 한 번에 푼다 */
export function fundXIRR(
  companies: CompanyForCashFlow[],
  asOf: Date = new Date()
): number | null {
  const flows = companies.flatMap((c) => companyCashFlows(c, asOf));
  return calculateXIRR(flows);
}

// ────────────────────────────────────────────────────────────
// 워터폴 분배 시뮬레이션 (유럽식 전체 펀드 워터폴 — 단순화 모델)
// ────────────────────────────────────────────────────────────

export interface WaterfallInput {
  /** 분배 가능 총액 (억원) */
  distributable: number;
  /** 납입 자본 (억원) */
  paidIn: number;
  /** 우선 수익률(하들, 연 %) */
  hurdleRate: number;
  /** 캐리(성과보수, %) */
  carryPercent: number;
  /** 결성일로부터 경과 연수 (하들 누적 계산용) */
  years: number;
}

export interface WaterfallTier {
  label: string;
  lpAmount: number;
  gpAmount: number;
}

export interface WaterfallResult {
  tiers: WaterfallTier[];
  totalLp: number;
  totalGp: number;
  /** 실효 캐리율 = GP 배분 / (LP 순수익 + GP 배분). 목표 carryPercent와 비교용 */
  effectiveCarryPercent: number;
}

/**
 * 표준 4단계 유럽식 워터폴:
 * 1) 자본 반환 → LP 100%
 * 2) 우선수익(하들) → LP 100%
 * 3) GP 캐치업 → GP 100% (LP가 받은 우선수익의 carry/(1-carry)만큼, 잔액 한도 내)
 * 4) 잔여 배분 → LP (1-carry) / GP carry
 */
export function simulateWaterfall(input: WaterfallInput): WaterfallResult {
  const { distributable, paidIn, hurdleRate, carryPercent, years } = input;
  const carry = Math.max(0, Math.min(1, carryPercent / 100));
  let remaining = Math.max(0, distributable);
  const tiers: WaterfallTier[] = [];

  // 1) 자본 반환
  const returnOfCapital = Math.min(remaining, Math.max(0, paidIn));
  remaining -= returnOfCapital;
  tiers.push({ label: "자본 반환", lpAmount: round(returnOfCapital), gpAmount: 0 });

  // 2) 우선수익 (복리)
  const hurdleTarget = Math.max(
    0,
    paidIn * ((1 + hurdleRate / 100) ** Math.max(0, years) - 1)
  );
  const preferredReturn = Math.min(remaining, hurdleTarget);
  remaining -= preferredReturn;
  tiers.push({ label: "우선수익(하들)", lpAmount: round(preferredReturn), gpAmount: 0 });

  // 3) GP 캐치업 — LP가 받은 우선수익만큼의 비율로 GP도 같은 비율의 캐리를 갖도록
  const catchUpTarget = carry > 0 ? (preferredReturn * carry) / (1 - carry) : 0;
  const catchUp = Math.min(remaining, catchUpTarget);
  remaining -= catchUp;
  tiers.push({ label: "GP 캐치업", lpAmount: 0, gpAmount: round(catchUp) });

  // 4) 잔여 배분
  const residualGp = remaining * carry;
  const residualLp = remaining - residualGp;
  tiers.push({
    label: "잔여 배분",
    lpAmount: round(residualLp),
    gpAmount: round(residualGp),
  });

  const totalLp = round(tiers.reduce((s, t) => s + t.lpAmount, 0));
  const totalGp = round(tiers.reduce((s, t) => s + t.gpAmount, 0));
  const lpProfit = Math.max(0, totalLp - Math.min(paidIn, distributable));
  const denom = lpProfit + totalGp;

  return {
    tiers,
    totalLp,
    totalGp,
    effectiveCarryPercent: denom > 0 ? round((totalGp / denom) * 100, 1) : 0,
  };
}

// ────────────────────────────────────────────────────────────
// 회수 시뮬레이션 · 민감도 분석
// ────────────────────────────────────────────────────────────

export interface ExitScenarioInput {
  /** 미실현 포지션에 적용할 배수 (현재 평가가치 기준) */
  exitMultiple: number;
  /** 지금부터 몇 년 뒤 회수한다고 가정할지 */
  yearsFromNow: number;
}

export interface ExitScenarioResult extends ExitScenarioInput {
  moic: number;
  xirr: number | null;
  totalValue: number;
}

/**
 * 이미 회수된(EXITED/WRITTEN_OFF) 포지션은 실제 현금흐름 그대로 두고,
 * 아직 보유 중인(ACTIVE/WATCH/RISK) 포지션만 시나리오 배수·시점을 적용한다.
 */
export function simulateExit(
  companies: CompanyForCashFlow[],
  scenario: ExitScenarioInput,
  now: Date = new Date()
): ExitScenarioResult {
  const exitDate = new Date(now.getTime() + scenario.yearsFromNow * MS_PER_YEAR);

  const flows = companies.flatMap((c) => {
    const isSettled =
      c.status === PortfolioStatus.EXITED ||
      c.status === PortfolioStatus.WRITTEN_OFF;
    if (isSettled) return companyCashFlows(c, now);

    const flows: CashFlow[] = [{ date: c.investedAt, amount: -c.investAmount }];
    const current = holdingValue(c);
    const simulatedValue = current * scenario.exitMultiple;
    if (simulatedValue > 0) {
      flows.push({ date: exitDate, amount: simulatedValue });
    }
    return flows;
  });

  const totalInvested = companies.reduce((s, c) => s + c.investAmount, 0);
  const totalValue = flows.reduce(
    (s, f) => s + (f.amount > 0 ? f.amount : 0),
    0
  );

  return {
    ...scenario,
    moic: totalInvested > 0 ? round(totalValue / totalInvested, 2) : 0,
    xirr: calculateXIRR(flows),
    totalValue: round(totalValue),
  };
}

/** 배수 × 시점 격자에 대해 회수 시뮬레이션을 반복해 민감도 표를 만든다 */
export function sensitivityGrid(
  companies: CompanyForCashFlow[],
  exitMultiples: number[] = [0.5, 1, 1.5, 2, 3],
  yearsOptions: number[] = [1, 2, 3],
  now: Date = new Date()
): ExitScenarioResult[] {
  const results: ExitScenarioResult[] = [];
  for (const yearsFromNow of yearsOptions) {
    for (const exitMultiple of exitMultiples) {
      results.push(
        simulateExit(companies, { exitMultiple, yearsFromNow }, now)
      );
    }
  }
  return results;
}

// ────────────────────────────────────────────────────────────
// 자본잠식 위험 (임의 손상 위험도)
// ────────────────────────────────────────────────────────────

export interface ImpairmentRow {
  companyName: string;
  investAmount: number;
  impairmentRatio: number; // 0~100, 투자원금 대비 손상 비율
}

export interface ImpairmentSummary {
  rows: ImpairmentRow[];
  /** 펀드 전체 투자원금 대비 손상 비율(가중평균) */
  fundImpairmentRatio: number;
  /** 손상 위험(WATCH/RISK/WRITTEN_OFF) 상태 회사 수 */
  atRiskCount: number;
}

export interface ImpairmentCompanyLike extends PortfolioCompanyLike {
  companyName: string;
}

/**
 * 회사별 "자본잠식률" = 투자원금 대비 가치 하락 비율.
 * WRITTEN_OFF는 100%(전손), 그 외는 max(0, 1 - 현재가치/투자원금).
 * 회계상의 자본잠식(자본금 대비 결손금) 개념이 아니라, VC 관점에서
 * "투자 원금이 얼마나 훼손됐는지"를 뜻하는 근사 지표임을 UI에도 명시할 것.
 */
export function calculateImpairment(
  companies: ImpairmentCompanyLike[]
): ImpairmentSummary {
  const rows = companies.map((c) => {
    if (c.status === PortfolioStatus.WRITTEN_OFF) {
      return { companyName: c.companyName, investAmount: c.investAmount, impairmentRatio: 100 };
    }
    const current = holdingValue(c) + c.realizedAmount;
    const ratio =
      c.investAmount > 0
        ? Math.max(0, round((1 - current / c.investAmount) * 100, 1))
        : 0;
    return { companyName: c.companyName, investAmount: c.investAmount, impairmentRatio: ratio };
  });

  const totalInvested = companies.reduce((s, c) => s + c.investAmount, 0);
  const weightedImpairment = rows.reduce(
    (s, r) => s + (r.impairmentRatio / 100) * r.investAmount,
    0
  );

  return {
    rows: rows.sort((a, b) => b.impairmentRatio - a.impairmentRatio),
    fundImpairmentRatio:
      totalInvested > 0 ? round((weightedImpairment / totalInvested) * 100, 1) : 0,
    atRiskCount: companies.filter(
      (c) =>
        c.status === PortfolioStatus.WATCH ||
        c.status === PortfolioStatus.RISK ||
        c.status === PortfolioStatus.WRITTEN_OFF
    ).length,
  };
}

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
