/**
 * 무료 IRR 계산기 검증.
 * VCNote 랜딩 페이지에 실제로 표시된 예시(10억→50억, 5년 = 38.0%, 5.0배)로
 * 우리 계산이 같은 결과를 내는지 확인한다 — 같은 공개 도구끼리 결과가
 * 다르면 신뢰를 잃는다.
 *
 * Usage: npm run test:irr-calculator
 */
import { calculateSimpleIrr } from "../src/lib/irr-calculator";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertClose(actual: number, expected: number, tolerance: number, msg: string) {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${msg}: 실제=${actual}, 기대=${expected}`
  );
}

function testVCNoteReferenceExample() {
  // VCNote 자체 랜딩 페이지에 표시된 예시값
  const { irr, multiple } = calculateSimpleIrr({
    investAmount: 10,
    exitAmount: 50,
    years: 5,
  });
  assert(multiple === 5, `배수 계산 오류: ${multiple}`);
  assert(irr !== null, "IRR이 null");
  assertClose(irr! * 100, 38.0, 0.1, "VCNote 예시(10→50, 5년) 재현 실패");
  console.log("✅ VCNote 랜딩 예시(10억→50억, 5년) 재현: 38.0%, 5.0x");
}

function testOneYearRoundTrip() {
  // 1년짜리는 복리 환산이 곧 단순 수익률과 같아야 한다
  const { irr } = calculateSimpleIrr({ investAmount: 100, exitAmount: 120, years: 1 });
  assertClose(irr! * 100, 20, 0.01, "1년 케이스는 단순 수익률과 같아야 함");
  console.log("✅ 1년 투자: 20% 수익 = IRR 20%");
}

function testTotalLossReturnsNegativeOneHundred() {
  const { irr, multiple } = calculateSimpleIrr({ investAmount: 10, exitAmount: 0, years: 3 });
  assert(irr === -1, `전손인데 -100%가 아님: ${irr}`);
  assert(multiple === 0, "전손인데 배수가 0이 아님");
  console.log("✅ 회수금 0(전손): IRR -100%");
}

function testInvalidInputsReturnNull() {
  assert(calculateSimpleIrr({ investAmount: 0, exitAmount: 50, years: 5 }).irr === null, "투자금 0인데 계산됨");
  assert(calculateSimpleIrr({ investAmount: -10, exitAmount: 50, years: 5 }).irr === null, "음수 투자금인데 계산됨");
  assert(calculateSimpleIrr({ investAmount: 10, exitAmount: 50, years: 0 }).irr === null, "기간 0인데 계산됨");
  assert(calculateSimpleIrr({ investAmount: 10, exitAmount: 50, years: -2 }).irr === null, "음수 기간인데 계산됨");
  console.log("✅ 잘못된 입력(투자금·기간 0 이하): null 반환, 예외 없음");
}

function testHigherExitMeansHigherIrr() {
  const low = calculateSimpleIrr({ investAmount: 10, exitAmount: 20, years: 3 });
  const high = calculateSimpleIrr({ investAmount: 10, exitAmount: 40, years: 3 });
  assert(high.irr! > low.irr!, "회수금이 큰데 IRR이 더 낮음 (단조성 위반)");
  console.log("✅ 회수금이 클수록 IRR도 커짐 (단조성)");
}

function main() {
  console.log("\n=== DealMind IRR 계산기 테스트 ===\n");
  testVCNoteReferenceExample();
  testOneYearRoundTrip();
  testTotalLossReturnsNegativeOneHundred();
  testInvalidInputsReturnNull();
  testHigherExitMeansHigherIrr();
  console.log("\n✅ IRR 계산기 테스트 통과\n");
}

main();
