/**
 * LBO 모델(src/lib/lbo-model.ts) 검증.
 * 손으로 계산한 3개년 시나리오와 비교해 워터폴 각 단계(Entry EV → Debt/
 * Equity → EBITDA → Debt Paydown → Exit → MOIC/IRR)가 맞는지 확인한다.
 *
 * Usage: npm run test:lbo-model
 */
import { calculateLboModel } from "../src/lib/lbo-model";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertClose(actual: number, expected: number, tolerance: number, msg: string) {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${msg}: 실제=${actual}, 기대=${expected}`
  );
}

// 손으로 계산한 기준 시나리오:
// EntryEBITDA=100, 8x 진입, 5x 레버리지(Debt 500/Equity 300),
// 이자율 8%, EBITDA 성장 10%, FCF전환 50%, 캐시스윕 100%, 8x 회수, 3년 보유
// → Year3 EBITDA=133.1, Year3 말 Debt≈433.81, ExitEV=1064.8,
//   ExitEquity≈630.99, MOIC≈2.10x, IRR≈28.1%
function testHandCalculatedReferenceScenario() {
  const result = calculateLboModel({
    entryEbitda: 100,
    entryMultiple: 8,
    debtToEbitda: 5,
    interestRate: 8,
    ebitdaGrowthRate: 10,
    fcfConversionRate: 50,
    cashSweepRate: 100,
    exitMultiple: 8,
    holdPeriodYears: 3,
  });

  assertClose(result.entryEv, 800, 0.01, "Entry EV");
  assertClose(result.entryDebt, 500, 0.01, "Entry Debt");
  assertClose(result.entryEquity, 300, 0.01, "Entry Equity");
  assert(
    result.sourcesUses.sources.total === result.sourcesUses.uses.total,
    "Sources·Uses 총액 불일치"
  );

  assert(result.yearlySchedule.length === 3, "3개년 스케줄이 아님");
  assertClose(result.yearlySchedule[2].ebitda, 133.1, 0.01, "Year3 EBITDA");
  assertClose(result.yearlySchedule[2].endingDebt, 433.81, 0.05, "Year3 말 잔여 부채");

  assertClose(result.exitEbitda, 133.1, 0.01, "Exit EBITDA");
  assertClose(result.exitEv, 1064.8, 0.01, "Exit EV");
  assertClose(result.exitEquity, 630.99, 0.05, "Exit Equity");
  assertClose(result.moic!, 2.1, 0.01, "MOIC");
  assertClose(result.irr! * 100, 28.1, 0.3, "IRR");

  console.log(
    `✅ 기준 시나리오(8x 진입/5x 레버리지/8% 이자/10% 성장/3년) 재현: MOIC ${result.moic}x, IRR ${(result.irr! * 100).toFixed(1)}%`
  );
}

function testZeroLeverageAllEquityDeal() {
  const result = calculateLboModel({
    entryEbitda: 100,
    entryMultiple: 8,
    debtToEbitda: 0,
    interestRate: 8,
    ebitdaGrowthRate: 5,
    fcfConversionRate: 50,
    cashSweepRate: 100,
    exitMultiple: 8,
    holdPeriodYears: 3,
  });
  assert(result.entryDebt === 0, "레버리지 0인데 부채가 생김");
  assertClose(result.entryEquity, 800, 0.01, "레버리지 0이면 Equity = EV 전액");
  assert(
    result.yearlySchedule.every((y) => y.endingDebt === 0 && y.debtPaydown === 0),
    "레버리지 0인데 상환 스케줄이 생김"
  );
  console.log("✅ 레버리지 0(올에쿼티 딜): 부채 없이 정상 계산");
}

function testInvalidInputsReturnNullSafely() {
  const cases = [
    { entryEbitda: 0 },
    { entryEbitda: -10 },
    { entryMultiple: 0 },
    { exitMultiple: -1 },
    { holdPeriodYears: 0 },
    { debtToEbitda: -1 },
  ];
  const base = {
    entryEbitda: 100,
    entryMultiple: 8,
    debtToEbitda: 5,
    interestRate: 8,
    ebitdaGrowthRate: 10,
    fcfConversionRate: 50,
    cashSweepRate: 100,
    exitMultiple: 8,
    holdPeriodYears: 3,
  };
  for (const override of cases) {
    const result = calculateLboModel({ ...base, ...override });
    assert(result.moic === null && result.irr === null, `잘못된 입력인데 계산됨: ${JSON.stringify(override)}`);
  }
  console.log("✅ 잘못된 입력(0 이하 EBITDA/배수/기간 등): null 반환, 예외 없음");
}

function testHigherExitMultipleMeansHigherMoic() {
  const base = {
    entryEbitda: 100,
    entryMultiple: 8,
    debtToEbitda: 5,
    interestRate: 8,
    ebitdaGrowthRate: 10,
    fcfConversionRate: 50,
    cashSweepRate: 100,
    holdPeriodYears: 3,
  };
  const low = calculateLboModel({ ...base, exitMultiple: 6 });
  const high = calculateLboModel({ ...base, exitMultiple: 10 });
  assert(high.moic! > low.moic!, "회수 배수가 큰데 MOIC이 더 낮음 (단조성 위반)");
  console.log("✅ 회수 배수(멀티플 익스팬션)가 클수록 MOIC도 커짐 (단조성)");
}

function testFullCashSweepPaysDownDebtFasterThanNoSweep() {
  const base = {
    entryEbitda: 100,
    entryMultiple: 8,
    debtToEbitda: 5,
    interestRate: 8,
    ebitdaGrowthRate: 5,
    fcfConversionRate: 50,
    exitMultiple: 8,
    holdPeriodYears: 3,
  };
  const noSweep = calculateLboModel({ ...base, cashSweepRate: 0 });
  const fullSweep = calculateLboModel({ ...base, cashSweepRate: 100 });
  const lastYear = (r: ReturnType<typeof calculateLboModel>) =>
    r.yearlySchedule[r.yearlySchedule.length - 1].endingDebt;
  assert(
    lastYear(fullSweep) < lastYear(noSweep),
    "캐시 스윕 100%인데 부채가 더 안 줄어듦"
  );
  assert(fullSweep.moic! > noSweep.moic!, "부채를 더 갚았는데 MOIC이 더 낮음");
  console.log("✅ 캐시 스윕 100% vs 0%: 스윕할수록 부채 상환 빠르고 MOIC도 높음");
}

function main() {
  console.log("\n=== DealMind LBO 모델 테스트 ===\n");
  testHandCalculatedReferenceScenario();
  testZeroLeverageAllEquityDeal();
  testInvalidInputsReturnNullSafely();
  testHigherExitMultipleMeansHigherMoic();
  testFullCashSweepPaysDownDebtFasterThanNoSweep();
  console.log("\n✅ LBO 모델 테스트 통과\n");
}

main();
