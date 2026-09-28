/**
 * LBO(차입매수) 모델 — PE 트랙의 계산 엔진.
 *
 * 요청받은 워터폴 그대로 구현한다:
 * Entry EV → Debt/Equity → Sources & Uses → EBITDA → Cash Flow →
 * Debt Paydown → Exit EV → Exit Equity → MOIC → IRR
 *
 * `fund-analytics.ts`의 XIRR(뉴턴법, 날짜 기반)을 그대로 재사용한다 —
 * IRR 계산 자체는 펀드 레벨이든 딜 레벨이든 같은 수학이라 별도로 다시
 * 구현하지 않는다.
 *
 * ## 단순화 모델 — 정확도를 과장하지 않기 위해 명시
 * 실제 LBO 모델은 3-statement(손익/재무상태/현금흐름)를 전부 연결해
 * 세금·감가상각·운전자본 변동까지 반영하지만, 여기서는:
 * - EBITDA → FCF 전환을 `fcfConversionRate` 하나로 단순화한다(capex·세금·
 *   운전자본 변동을 한꺼번에 반영한 비율). 실제 딜은 이 비율 자체가
 *   사업마다 달라 실사로 정해야 한다.
 * - 부채는 단일 트랜치(이자율 하나)로 가정한다 — 실제로는 시니어/서브/
 *   메자닌처럼 트랜치별 이자율·상환순위가 다르다.
 * - Sources & Uses에 인수 관련 수수료(자문·금융 수수료)를 넣지 않는다.
 * 이 모델은 "이 가정이면 대략 어느 정도 수익률이 나오는가"를 빠르게
 * 가늠하는 용도다 — 실사 후 정밀 모델을 대체하지 않는다.
 */

import { calculateXIRR } from "./fund-analytics";

export interface LboAssumptions {
  /** 인수 시점 연간 EBITDA (억원) */
  entryEbitda: number;
  /** 인수 배수 (Entry EV / EBITDA) */
  entryMultiple: number;
  /** 레버리지 (Debt / EBITDA) */
  debtToEbitda: number;
  /** 부채 연 이자율 (%) */
  interestRate: number;
  /** 연간 EBITDA 성장률 (%) */
  ebitdaGrowthRate: number;
  /** EBITDA 대비 FCF 전환율 (%) — capex·세금·운전자본 변동을 한 비율로 단순화 */
  fcfConversionRate: number;
  /** FCF 중 부채 상환(캐시 스윕)에 쓰는 비율 (%), 나머지는 유보 */
  cashSweepRate: number;
  /** Exit 배수 (Exit EV / Exit 시점 EBITDA) */
  exitMultiple: number;
  /** 보유 기간 (년) */
  holdPeriodYears: number;
}

export interface LboYearSnapshot {
  year: number;
  ebitda: number;
  beginningDebt: number;
  interestExpense: number;
  freeCashFlow: number;
  debtPaydown: number;
  endingDebt: number;
}

export interface LboResult {
  entryEv: number;
  entryDebt: number;
  entryEquity: number;
  sourcesUses: {
    sources: { debt: number; equity: number; total: number };
    uses: { enterpriseValue: number; total: number };
  };
  yearlySchedule: LboYearSnapshot[];
  exitEbitda: number;
  exitEv: number;
  exitDebt: number;
  exitEquity: number;
  /** null이면 계산 불가(입력값이 유효하지 않음) */
  moic: number | null;
  irr: number | null;
}

function round(n: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

const INVALID_RESULT: LboResult = {
  entryEv: 0,
  entryDebt: 0,
  entryEquity: 0,
  sourcesUses: {
    sources: { debt: 0, equity: 0, total: 0 },
    uses: { enterpriseValue: 0, total: 0 },
  },
  yearlySchedule: [],
  exitEbitda: 0,
  exitEv: 0,
  exitDebt: 0,
  exitEquity: 0,
  moic: null,
  irr: null,
};

export function calculateLboModel(input: LboAssumptions): LboResult {
  const {
    entryEbitda,
    entryMultiple,
    debtToEbitda,
    interestRate,
    ebitdaGrowthRate,
    fcfConversionRate,
    cashSweepRate,
    exitMultiple,
    holdPeriodYears,
  } = input;

  if (
    entryEbitda <= 0 ||
    entryMultiple <= 0 ||
    exitMultiple <= 0 ||
    holdPeriodYears <= 0 ||
    debtToEbitda < 0
  ) {
    return INVALID_RESULT;
  }

  // Entry EV → Debt/Equity → Sources & Uses
  const entryEv = entryEbitda * entryMultiple;
  const entryDebt = Math.min(entryEbitda * debtToEbitda, entryEv);
  const entryEquity = entryEv - entryDebt;

  // EBITDA → Cash Flow → Debt Paydown (연도별)
  const yearlySchedule: LboYearSnapshot[] = [];
  let beginningDebt = entryDebt;
  let ebitda = entryEbitda;

  for (let year = 1; year <= holdPeriodYears; year++) {
    ebitda = entryEbitda * (1 + ebitdaGrowthRate / 100) ** year;
    const interestExpense = beginningDebt * (interestRate / 100);
    const freeCashFlow = Math.max(
      0,
      ebitda * (fcfConversionRate / 100) - interestExpense
    );
    const debtPaydown = Math.min(
      beginningDebt,
      freeCashFlow * (cashSweepRate / 100)
    );
    const endingDebt = beginningDebt - debtPaydown;

    yearlySchedule.push({
      year,
      ebitda: round(ebitda),
      beginningDebt: round(beginningDebt),
      interestExpense: round(interestExpense),
      freeCashFlow: round(freeCashFlow),
      debtPaydown: round(debtPaydown),
      endingDebt: round(endingDebt),
    });

    beginningDebt = endingDebt;
  }

  // Exit EV → Exit Equity → MOIC → IRR
  const exitEbitda = ebitda;
  const exitDebt = beginningDebt;
  const exitEv = exitEbitda * exitMultiple;
  const exitEquity = Math.max(0, exitEv - exitDebt);

  const moic = entryEquity > 0 ? round(exitEquity / entryEquity) : null;
  const irr =
    entryEquity > 0
      ? calculateXIRR([
          { date: new Date(0), amount: -entryEquity },
          {
            date: new Date(holdPeriodYears * 365 * 24 * 60 * 60 * 1000),
            amount: exitEquity,
          },
        ])
      : null;

  return {
    entryEv: round(entryEv),
    entryDebt: round(entryDebt),
    entryEquity: round(entryEquity),
    sourcesUses: {
      sources: {
        debt: round(entryDebt),
        equity: round(entryEquity),
        total: round(entryDebt + entryEquity),
      },
      uses: {
        enterpriseValue: round(entryEv),
        total: round(entryEv),
      },
    },
    yearlySchedule,
    exitEbitda: round(exitEbitda),
    exitEv: round(exitEv),
    exitDebt: round(exitDebt),
    exitEquity: round(exitEquity),
    moic,
    irr,
  };
}
