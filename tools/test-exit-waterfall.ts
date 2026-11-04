/**
 * 회수 시뮬레이션(캡테이블 + 엑싯 분배) 검증.
 * 손으로 계산한 기대값과 비교한다 — 숫자가 틀리면 투심 자료 신뢰를 잃는다.
 *
 * Usage: npx tsx tools/test-exit-waterfall.ts
 */
import { exitWaterfall, simulateCapTable, type CapTableScenario, type PricedRoundInput, type Stage, type WaterfallResult } from "../src/lib/exit-waterfall";

const 억 = 1e8;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
function assertEq(actual: number, expected: number, msg: string) {
  assert(actual === expected, `${msg}: 실제=${actual}, 기대=${expected}`);
}

const founders: CapTableScenario["holders"] = [
  { name: "대표", kind: "common", shares: 6_000_000 },
  { name: "CTO", kind: "common", shares: 4_000_000 },
];
const holder = (s: Stage, name: string) => s.holders.find((h) => h.holder === name)!;
const pay = (r: WaterfallResult, name: string) => Math.round(r.holders.find((h) => h.holder === name)!.payout);
const seed = (pref: PricedRoundInput["pref"] = {}, extra: Partial<PricedRoundInput> = {}): PricedRoundInput => ({
  type: "priced",
  name: "Seed",
  preMoney: 40 * 억,
  investors: [{ name: "VC", amount: 10 * 억 }],
  pref,
  ...extra,
});
function pricedRound(s: Stage) {
  assert(s.round !== null && s.round.type === "priced", `${s.name}: 가격 라운드가 아님`);
  return s.round as Extract<NonNullable<Stage["round"]>, { type: "priced" }>;
}

function testBasicRound() {
  const s = simulateCapTable({ holders: founders, rounds: [seed()] }).stages[1];
  const r = pricedRound(s);
  assertEq(r.price, 400, "주당가격");
  assertEq(r.newShares, 2_500_000, "신주");
  assertEq(r.postMoney, 50 * 억, "포스트머니");
  assert(Math.abs(holder(s, "VC").pct - 0.2) < 1e-12, "투자자 지분 20%");
  console.log("✅ 기본 라운드: 프리 40억 + 10억 → 주당 400원, 20%");
}

function testPoolShuffle() {
  const r = pricedRound(simulateCapTable({ holders: founders, rounds: [seed({}, { poolTargetPct: 10 })] }).stages[1]);
  assertEq(r.poolAdd, 1_428_572, "옵션풀 확대 주식수");
  assertEq(r.price, 350, "풀 확대 후 주당가격");
  assertEq(r.newShares, 2_857_142, "신주");
  assert(Math.abs(r.poolPct - 0.1) < 1e-4, `투자 후 풀 비율 ${r.poolPct}`);
  console.log("✅ 옵션풀 10% 프리머니 확대 → 주당 350원");
}

function testSafeConversion() {
  const { stages } = simulateCapTable({
    holders: founders,
    rounds: [{ type: "safe", name: "SAFE", investors: [{ name: "AC", amount: 2 * 억 }], cap: 20 * 억, discountPct: 20 }, seed()],
  });
  const r = pricedRound(stages[2]);
  assertEq(r.price, 360, "SAFE 반영 후 라운드 가격");
  assertEq(r.safeConversions[0].price, 180, "SAFE 전환가(캡)");
  assertEq(r.safeConversions[0].shares, 1_111_111, "SAFE 전환 주식수");
  assertEq(holder(stages[2], "VC").shares, 2_777_777, "라운드 투자자 주식수");
  assertEq(stages[1].pendingSafeAmount, 2 * 억, "미전환 SAFE 금액");
  console.log("✅ SAFE: 캡 20억·할인 20% → 캡 가격 180원으로 전환");
}

function testPendingSafeWarning() {
  const { warnings, pendingSafes } = simulateCapTable({
    holders: founders,
    rounds: [{ type: "safe", name: "SAFE", investors: [{ name: "AC", amount: 1 * 억 }], cap: 30 * 억 }],
  });
  assertEq(pendingSafes.length, 1, "미전환 SAFE 수");
  assert(warnings.some((w) => w.includes("미전환 SAFE")), "미전환 SAFE 경고 누락");
  console.log("✅ 다음 라운드 없는 SAFE는 경고");
}

function testNonParticipating() {
  const st = simulateCapTable({ holders: founders, rounds: [seed({ multiple: 1 })] }).stages[1];
  const low = exitWaterfall(st, 30 * 억);
  assertEq(pay(low, "VC"), 10 * 억, "30억 엑싯: 우선권 10억");
  assert(!low.classes[0].converted, "30억 엑싯은 전환하지 않아야 함");
  const high = exitWaterfall(st, 100 * 억);
  assertEq(pay(high, "VC"), 20 * 억, "100억 엑싯: 전환 20억");
  assertEq(pay(high, "대표"), 48 * 억, "100억 엑싯: 대표 48억");
  assert(high.classes[0].converted, "100억 엑싯은 전환해야 함");
  console.log("✅ 비참가적 1x: 낮은 엑싯 우선권, 높은 엑싯 전환");
}

function testParticipating() {
  const st = simulateCapTable({ holders: founders, rounds: [seed({ multiple: 1, participating: true })] }).stages[1];
  const r = exitWaterfall(st, 30 * 억);
  assertEq(pay(r, "VC"), 14 * 억, "참가적 30억 엑싯: 10억 + 20억×20%");
  assertEq(pay(r, "대표") + pay(r, "CTO"), 16 * 억, "보통주 몫");
  console.log("✅ 참가적 1x (상한 없음)");
}

function testParticipatingCap() {
  const st = simulateCapTable({ holders: founders, rounds: [seed({ multiple: 1, participating: true, capMultiple: 3 })] }).stages[1];
  const mid = exitWaterfall(st, 120 * 억);
  assertEq(pay(mid, "VC"), 30 * 억, "120억: 3x 상한 30억");
  assertEq(pay(mid, "대표") + pay(mid, "CTO"), 90 * 억, "120억: 보통주 90억");
  const high = exitWaterfall(st, 200 * 억);
  assertEq(pay(high, "VC"), 40 * 억, "200억: 전환이 상한보다 유리 → 40억");
  assert(high.classes[0].converted, "200억은 전환해야 함");
  console.log("✅ 참가적 1x + 3x 상한: 상한 도달 후 전환 판단");
}

function testSeniority() {
  const st = simulateCapTable({
    holders: founders,
    rounds: [seed(), { type: "priced", name: "A", preMoney: 150 * 억, investors: [{ name: "A-VC", amount: 30 * 억 }] }],
  }).stages[2];
  const stacked = exitWaterfall(st, 35 * 억, "stacked");
  assertEq(pay(stacked, "A-VC"), 30 * 억, "선순위 A 먼저 30억");
  assertEq(pay(stacked, "VC"), 5 * 억, "후순위 Seed 나머지 5억");
  assertEq(pay(stacked, "대표"), 0, "보통주 0");
  const pari = exitWaterfall(st, 35 * 억, "pari");
  assertEq(pay(pari, "A-VC"), Math.round((35 * 억 * 30) / 40), "동순위 A 비례");
  assertEq(pay(pari, "VC"), Math.round((35 * 억 * 10) / 40), "동순위 Seed 비례");
  console.log("✅ 후속 라운드 선순위 vs 동순위");
}

function testConservation() {
  const st = simulateCapTable({
    holders: [...founders, { name: "직원", kind: "option", shares: 500_000 }, { name: "풀", kind: "pool", shares: 500_000 }],
    rounds: [
      { type: "safe", name: "SAFE", investors: [{ name: "AC", amount: 3 * 억 }], cap: 30 * 억, discountPct: 20 },
      seed({ multiple: 1.5, participating: true, capMultiple: 3 }, { poolTargetPct: 10 }),
      { type: "priced", name: "A", preMoney: 120 * 억, investors: [{ name: "A-VC", amount: 40 * 억 }], pref: { multiple: 1 } },
    ],
  }).stages[3];
  for (const exit of [0, 5, 20, 47, 90, 160, 400, 1500]) {
    const r = exitWaterfall(st, exit * 억);
    const total = r.holders.reduce((s, h) => s + h.payout, 0) + r.leftover;
    assert(Math.abs(total - exit * 억) < 1, `${exit}억 엑싯 분배 합계 불일치: ${total}`);
  }
  console.log("✅ 분배 합계 = 엑싯 금액 (8개 구간)");
}

function testFullRatchetFloor() {
  const st = simulateCapTable({
    holders: founders,
    rounds: [
      seed({ antiDilution: "full", refixFloorPct: 70 }),
      { type: "priced", name: "A", preMoney: 25 * 억, investors: [{ name: "A-VC", amount: 10 * 억 }] },
    ],
  }).stages[2];
  const r = pricedRound(st);
  assertEq(r.price, 200, "다운라운드 가격");
  assertEq(r.refixes[0].to, 280, "풀 래칫 하한 70% → 280원");
  assert(r.refixes[0].floorHit, "하한 적용 표시");
  assertEq(holder(st, "VC").asConverted, Math.floor((2_500_000 * 400) / 280), "리픽싱 후 보통주 환산");
  console.log("✅ 리픽싱 풀 래칫 + 하한 70%");
}

function testBroadBased() {
  const st = simulateCapTable({
    holders: founders,
    rounds: [
      seed({ antiDilution: "broad", refixFloorPct: 0 }),
      { type: "priced", name: "A", preMoney: 25 * 억, investors: [{ name: "A-VC", amount: 10 * 억 }] },
    ],
  }).stages[2];
  // A=12.5M, B=10억/400=2.5M, C=10억/200=5M → 400×15/17.5 = 342.86 → 343
  assertEq(pricedRound(st).refixes[0].to, 343, "가중평균 리픽싱");
  console.log("✅ 리픽싱 가중평균(broad-based)");
}

function testNoRefixOnUpRound() {
  const st = simulateCapTable({
    holders: founders,
    rounds: [seed({ antiDilution: "full" }), { type: "priced", name: "A", preMoney: 100 * 억, investors: [{ name: "A-VC", amount: 20 * 억 }] }],
  }).stages[2];
  assertEq(pricedRound(st).refixes.length, 0, "업라운드 리픽싱 없음");
  console.log("✅ 업라운드에서는 리픽싱 없음");
}

testBasicRound();
testPoolShuffle();
testSafeConversion();
testPendingSafeWarning();
testNonParticipating();
testParticipating();
testParticipatingCap();
testSeniority();
testConservation();
testFullRatchetFloor();
testBroadBased();
testNoRefixOnUpRound();
console.log("\n회수 시뮬레이션 테스트 12건 통과");
