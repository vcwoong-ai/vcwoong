/**
 * 펀드 운용 심화 지표(XIRR·워터폴·회수시뮬레이션·자본잠식) 검증.
 * 실제 재무 계산이라 알려진 정답이 있는 케이스로 정확도를 확인한다.
 *
 * Usage: npm run test:fund-analytics
 */
import { PortfolioStatus } from "@prisma/client";
import {
  calculateXIRR,
  companyCashFlows,
  fundXIRR,
  simulateWaterfall,
  simulateExit,
  sensitivityGrid,
  calculateImpairment,
  type CompanyForCashFlow,
} from "../src/lib/fund-analytics";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertClose(actual: number, expected: number, tolerance: number, msg: string) {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${msg}: 실제=${actual}, 기대=${expected} (허용오차 ${tolerance})`
  );
}

function testXIRRSimpleCase() {
  // 100 투자 → 정확히 1년 뒤 110 회수 = 연 10% 수익률
  const xirr = calculateXIRR([
    { date: new Date("2024-01-01"), amount: -100 },
    { date: new Date("2025-01-01"), amount: 110 },
  ]);
  assert(xirr !== null, "XIRR이 null");
  assertClose(xirr!, 0.1, 0.005, "단순 1년 10% 케이스");
  console.log("✅ XIRR: 100 → 110 (1년) = 10%");
}

function testXIRRTwoYearCompounding() {
  // 100 투자 → 2년 뒤 121 회수 = 연 10% 복리
  const xirr = calculateXIRR([
    { date: new Date("2023-01-01"), amount: -100 },
    { date: new Date("2025-01-01"), amount: 121 },
  ]);
  assertClose(xirr!, 0.1, 0.01, "2년 복리 10% 케이스");
  console.log("✅ XIRR: 100 → 121 (2년) = 10% 복리");
}

function testXIRRAllSameSignReturnsNull() {
  const xirr = calculateXIRR([
    { date: new Date("2024-01-01"), amount: -100 },
    { date: new Date("2024-06-01"), amount: -50 },
  ]);
  assert(xirr === null, "부호가 전부 같은데 XIRR이 계산됨 (정의 불가능해야 함)");
  console.log("✅ XIRR: 현금흐름 부호가 전부 같으면 null");
}

function testCompanyCashFlowsUnrealized() {
  const now = new Date("2026-08-11");
  const c: CompanyForCashFlow = {
    investedAt: new Date("2024-01-01"),
    exitedAt: null,
    updatedAt: new Date("2025-01-01"),
    investAmount: 10,
    entryValuation: 100,
    currentValuation: 200,
    ownershipPercent: 10,
    realizedAmount: 0,
    status: PortfolioStatus.ACTIVE,
  };
  const flows = companyCashFlows(c, now);
  assert(flows.length === 2, `보유 중 회사는 투자+미실현 2건이어야 함: ${flows.length}`);
  assert(flows[0].amount === -10, "투자 유출 금액 불일치");
  // holdingValue = 200 * 10% = 20
  assertClose(flows[1].amount, 20, 0.01, "미실현 가치(오늘 시점 청산 가정) 금액");
  assert(flows[1].date.getTime() === now.getTime(), "미실현 현금흐름 날짜가 오늘이 아님");
  console.log("✅ 보유 중 회사 현금흐름: 투자(유출) + 미실현가치(오늘 유입)");
}

function testCompanyCashFlowsExited() {
  const c: CompanyForCashFlow = {
    investedAt: new Date("2022-01-01"),
    exitedAt: new Date("2025-06-01"),
    updatedAt: new Date("2025-06-01"),
    investAmount: 10,
    entryValuation: 100,
    currentValuation: null,
    ownershipPercent: 10,
    realizedAmount: 35,
    status: PortfolioStatus.EXITED,
  };
  const flows = companyCashFlows(c);
  assert(flows.length === 2, `회수 완료 회사는 투자+회수 2건이어야 함: ${flows.length}`);
  assert(flows[1].amount === 35, "회수금액 불일치");
  assert(
    flows[1].date.getTime() === c.exitedAt!.getTime(),
    "회수 현금흐름 날짜가 exitedAt이 아님"
  );
  // EXITED는 holdingValue()가 0을 반환하므로 미실현 현금흐름이 추가로 붙으면 안 됨
  console.log("✅ 회수 완료 회사 현금흐름: 투자(유출) + 회수금(exitedAt 유입), 미실현 없음");
}

function testFundXIRRAggregatesAllCompanies() {
  const now = new Date("2026-01-01");
  const companies: CompanyForCashFlow[] = [
    {
      investedAt: new Date("2024-01-01"),
      exitedAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
      investAmount: 10,
      entryValuation: 100,
      currentValuation: null,
      ownershipPercent: 10,
      realizedAmount: 12, // 1년 만에 20% 회수
      status: PortfolioStatus.EXITED,
    },
    {
      investedAt: new Date("2024-01-01"),
      exitedAt: null,
      updatedAt: new Date("2025-06-01"),
      investAmount: 10,
      entryValuation: 100,
      currentValuation: 50, // 반토막 — 손실 포지션
      ownershipPercent: 10,
      realizedAmount: 0,
      status: PortfolioStatus.WATCH,
    },
  ];
  const xirr = fundXIRR(companies, now);
  assert(xirr !== null, "펀드 XIRR이 null이면 안 됨 (유출+유입 존재)");
  // 총 투자 20, 총 가치(12 + 50*10%=5) = 17 → 손실 상태라 XIRR은 음수여야 함
  assert(xirr! < 0, `전체 손실 포지션인데 XIRR이 양수: ${xirr}`);
  console.log("✅ 펀드 XIRR: 여러 회사 현금흐름을 합쳐 하나로 계산 (개별 IRR 평균 아님)");
}

function testWaterfallCapitalReturnFirst() {
  // 분배액이 납입자본보다 적으면 전부 자본 반환으로만 가고 GP 몫은 0이어야 한다
  const result = simulateWaterfall({
    distributable: 80,
    paidIn: 100,
    hurdleRate: 8,
    carryPercent: 20,
    years: 3,
  });
  assert(result.totalGp === 0, `자본도 못 돌려받았는데 GP가 배분받음: ${result.totalGp}`);
  assert(result.totalLp === 80, `LP가 분배액 전액을 못 받음: ${result.totalLp}`);
  console.log("✅ 워터폴: 자본 반환도 안 된 상태에서는 GP 배분 0");
}

function testWaterfallFullTiers() {
  // 납입 100, 하들 8%/3년(~25.97), 캐리 20% — 배분액을 충분히 크게 잡아 전 단계 통과
  const paidIn = 100;
  const years = 3;
  const hurdleRate = 8;
  const carryPercent = 20;
  const distributable = 400;

  const result = simulateWaterfall({ distributable, paidIn, hurdleRate, carryPercent, years });

  const sum = result.tiers.reduce((s, t) => s + t.lpAmount + t.gpAmount, 0);
  assertClose(sum, distributable, 0.5, "워터폴 tier 합계가 분배 총액과 불일치");
  assertClose(result.totalLp + result.totalGp, distributable, 0.5, "LP+GP 합계가 분배 총액과 불일치");

  // 캐리 목표(20%)에 충분히 도달했는지 — 잔여 배분까지 간 경우 실효 캐리가 목표에 근접해야 함
  assertClose(result.effectiveCarryPercent, 20, 1.5, "실효 캐리율이 목표(20%)에서 크게 벗어남");
  console.log(`✅ 워터폴: 4단계 전부 통과 시 tier 합계=분배총액, 실효캐리≈${result.effectiveCarryPercent}%`);
}

function testWaterfallNeverNegative() {
  const result = simulateWaterfall({
    distributable: 0,
    paidIn: 100,
    hurdleRate: 8,
    carryPercent: 20,
    years: 2,
  });
  for (const t of result.tiers) {
    assert(t.lpAmount >= 0 && t.gpAmount >= 0, `분배액 0인데 음수 tier 발생: ${JSON.stringify(t)}`);
  }
  console.log("✅ 워터폴: 분배액 0이어도 음수 배분 없음");
}

function testSimulateExitPreservesSettledCompanies() {
  const settled: CompanyForCashFlow = {
    investedAt: new Date("2022-01-01"),
    exitedAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    investAmount: 10,
    entryValuation: 100,
    currentValuation: null,
    ownershipPercent: 10,
    realizedAmount: 30,
    status: PortfolioStatus.EXITED,
  };
  const active: CompanyForCashFlow = {
    investedAt: new Date("2024-01-01"),
    exitedAt: null,
    updatedAt: new Date("2024-01-01"),
    investAmount: 10,
    entryValuation: 100,
    currentValuation: 100,
    ownershipPercent: 10,
    realizedAmount: 0,
    status: PortfolioStatus.ACTIVE,
  };
  const now = new Date("2026-01-01");
  const result = simulateExit([settled, active], { exitMultiple: 2, yearsFromNow: 1 }, now);
  // 총 투자 20, 이미 회수 30 + (활성 포지션 10*2=20) = 50 → MOIC 2.5
  assertClose(result.moic, 2.5, 0.05, "시나리오 MOIC 계산 불일치");
  console.log("✅ 회수 시뮬레이션: 이미 회수된 포지션은 그대로, 보유 포지션만 배수 적용");
}

function testSensitivityGridShape() {
  const c: CompanyForCashFlow = {
    investedAt: new Date("2024-01-01"),
    exitedAt: null,
    updatedAt: new Date("2024-01-01"),
    investAmount: 10,
    entryValuation: 100,
    currentValuation: 100,
    ownershipPercent: 10,
    realizedAmount: 0,
    status: PortfolioStatus.ACTIVE,
  };
  const multiples = [1, 2, 3];
  const years = [1, 2];
  const grid = sensitivityGrid([c], multiples, years);
  assert(
    grid.length === multiples.length * years.length,
    `민감도 그리드 크기 불일치: ${grid.length} !== ${multiples.length * years.length}`
  );
  // 배수가 클수록 MOIC도 커야 한다 (단조성)
  const forYear1 = grid.filter((g) => g.yearsFromNow === 1);
  for (let i = 1; i < forYear1.length; i++) {
    assert(
      forYear1[i].moic >= forYear1[i - 1].moic,
      "배수가 커지는데 MOIC이 감소함 (단조성 위반)"
    );
  }
  console.log("✅ 민감도 그리드: 크기 정확 + 배수 증가에 따라 MOIC 단조 증가");
}

function testImpairmentWrittenOffIsFullLoss() {
  const summary = calculateImpairment([
    {
      companyName: "손상기업",
      investAmount: 10,
      entryValuation: 100,
      currentValuation: 0,
      ownershipPercent: 10,
      realizedAmount: 0,
      status: PortfolioStatus.WRITTEN_OFF,
    },
  ]);
  assert(summary.rows[0].impairmentRatio === 100, "WRITTEN_OFF인데 손상률이 100%가 아님");
  assert(summary.fundImpairmentRatio === 100, "펀드 전체 손상률 계산 불일치");
  console.log("✅ 자본잠식: WRITTEN_OFF는 100% 전손 처리");
}

function testImpairmentHealthyCompanyIsZero() {
  const summary = calculateImpairment([
    {
      companyName: "우량기업",
      investAmount: 10,
      entryValuation: 100,
      currentValuation: 300, // 3배 성장
      ownershipPercent: 10,
      realizedAmount: 0,
      status: PortfolioStatus.ACTIVE,
    },
  ]);
  assert(summary.rows[0].impairmentRatio === 0, "가치 상승 기업인데 손상률이 0이 아님");
  console.log("✅ 자본잠식: 가치가 오른 회사는 손상률 0 (음수로 안 내려감)");
}

function testImpairmentWeightedByInvestAmount() {
  const summary = calculateImpairment([
    {
      companyName: "큰손상",
      investAmount: 90,
      entryValuation: 90,
      currentValuation: 0,
      ownershipPercent: 100,
      realizedAmount: 0,
      status: PortfolioStatus.RISK,
    },
    {
      companyName: "무손상",
      investAmount: 10,
      entryValuation: 10,
      currentValuation: 10,
      ownershipPercent: 100,
      realizedAmount: 0,
      status: PortfolioStatus.ACTIVE,
    },
  ]);
  // 90(100% 손상) + 10(0% 손상) → 가중평균 90%
  assertClose(summary.fundImpairmentRatio, 90, 1, "투자금액 가중평균 손상률 불일치");
  console.log("✅ 자본잠식: 펀드 전체 손상률은 투자금액 가중평균");
}

function main() {
  console.log("\n=== DealMind 펀드 운용 심화 지표 테스트 ===\n");
  testXIRRSimpleCase();
  testXIRRTwoYearCompounding();
  testXIRRAllSameSignReturnsNull();
  testCompanyCashFlowsUnrealized();
  testCompanyCashFlowsExited();
  testFundXIRRAggregatesAllCompanies();
  testWaterfallCapitalReturnFirst();
  testWaterfallFullTiers();
  testWaterfallNeverNegative();
  testSimulateExitPreservesSettledCompanies();
  testSensitivityGridShape();
  testImpairmentWrittenOffIsFullLoss();
  testImpairmentHealthyCompanyIsZero();
  testImpairmentWeightedByInvestAmount();
  console.log("\n✅ 펀드 운용 심화 지표 테스트 통과\n");
}

main();
