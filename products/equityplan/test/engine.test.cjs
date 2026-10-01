// 실행: node --test products/equityplan/test/
const test = require('node:test');
const assert = require('node:assert/strict');
const { simulate, waterfall } = require('../src/engine.js');

const 억 = 1e8;
const founders = [
  { name: '대표', kind: 'common', shares: 6000000 },
  { name: 'CTO', kind: 'common', shares: 4000000 }
];
const holder = (stage, name) => stage.holders.find((h) => h.holder === name);
const pay = (res, name) => res.holders.find((h) => h.holder === name).payout;

function seed(pref = {}, extra = {}) {
  return {
    type: 'priced', name: 'Seed', preMoney: 40 * 억,
    investors: [{ name: 'VC', amount: 10 * 억 }], pref, ...extra
  };
}

test('기본 가격 라운드: 주당가격·지분율', () => {
  const { stages } = simulate({ holders: founders, rounds: [seed()] });
  const s = stages[1];
  assert.equal(s.round.price, 400);
  assert.equal(s.round.newShares, 2500000);
  assert.equal(s.fd, 12500000);
  assert.ok(Math.abs(holder(s, 'VC').pct - 0.2) < 1e-12);
  assert.equal(s.round.postMoney, 50 * 억);
});

test('옵션풀 10% 프리머니 확대(option pool shuffle)', () => {
  const { stages } = simulate({ holders: founders, rounds: [seed({}, { poolTargetPct: 10 })] });
  const r = stages[1].round;
  assert.equal(r.poolAdd, 1428572);
  assert.equal(r.price, 350);
  assert.equal(r.newShares, 2857142);
  assert.ok(Math.abs(r.poolPct - 0.1) < 1e-4);
});

test('SAFE: 밸류캡이 할인보다 유리하면 캡 가격으로 전환', () => {
  const { stages } = simulate({
    holders: founders,
    rounds: [
      { type: 'safe', name: 'SAFE', investors: [{ name: 'AC', amount: 2 * 억 }], cap: 20 * 억, discountPct: 20 },
      seed()
    ]
  });
  const r = stages[2].round;
  assert.equal(r.price, 360);
  assert.equal(r.safeConversions[0].price, 180);
  assert.equal(r.safeConversions[0].shares, 1111111);
  assert.equal(holder(stages[2], 'VC').shares, 2777777);
  assert.equal(stages[1].pendingSafeAmount, 2 * 억);
});

test('미전환 SAFE 경고', () => {
  const { warnings, pendingSafes } = simulate({
    holders: founders,
    rounds: [{ type: 'safe', name: 'SAFE', investors: [{ name: 'AC', amount: 1 * 억 }], cap: 30 * 억, discountPct: 0 }]
  });
  assert.equal(pendingSafes.length, 1);
  assert.ok(warnings.some((w) => w.includes('미전환 SAFE')));
});

test('비참가적 1x: 낮은 엑싯은 우선권, 높은 엑싯은 전환', () => {
  const st = simulate({ holders: founders, rounds: [seed({ multiple: 1 })] }).stages[1];
  const low = waterfall(st, 30 * 억, 'stacked');
  assert.equal(Math.round(pay(low, 'VC')), 10 * 억);
  assert.equal(low.classes[0].converted, false);
  const high = waterfall(st, 100 * 억, 'stacked');
  assert.equal(Math.round(pay(high, 'VC')), 20 * 억);
  assert.equal(high.classes[0].converted, true);
  assert.equal(Math.round(pay(high, '대표')), 48 * 억);
});

test('참가적 1x(상한 없음)', () => {
  const st = simulate({ holders: founders, rounds: [seed({ multiple: 1, participating: true })] }).stages[1];
  const r = waterfall(st, 30 * 억, 'stacked');
  assert.equal(Math.round(pay(r, 'VC')), 14 * 억);
  assert.equal(Math.round(pay(r, '대표') + pay(r, 'CTO')), 16 * 억);
});

test('참가적 1x, 3x 상한: 상한 도달 후 전환 판단', () => {
  const st = simulate({ holders: founders, rounds: [seed({ multiple: 1, participating: true, capMultiple: 3 })] }).stages[1];
  const mid = waterfall(st, 120 * 억, 'stacked');
  assert.equal(Math.round(pay(mid, 'VC')), 30 * 억);
  assert.equal(Math.round(pay(mid, '대표') + pay(mid, 'CTO')), 90 * 억);
  const high = waterfall(st, 200 * 억, 'stacked');
  assert.equal(Math.round(pay(high, 'VC')), 40 * 억);
  assert.equal(high.classes[0].converted, true);
});

test('후순위·선순위 스택 vs 동순위', () => {
  const sc = {
    holders: founders,
    rounds: [
      seed(),
      { type: 'priced', name: 'A', preMoney: 150 * 억, investors: [{ name: 'A-VC', amount: 30 * 억 }], pref: {} }
    ]
  };
  const st = simulate(sc).stages[2];
  const stacked = waterfall(st, 35 * 억, 'stacked');
  assert.equal(Math.round(pay(stacked, 'A-VC')), 30 * 억);
  assert.equal(Math.round(pay(stacked, 'VC')), 5 * 억);
  assert.equal(Math.round(pay(stacked, '대표')), 0);
  const pari = waterfall(st, 35 * 억, 'pari');
  assert.equal(Math.round(pay(pari, 'A-VC')), Math.round(35 * 억 * 30 / 40));
  assert.equal(Math.round(pay(pari, 'VC')), Math.round(35 * 억 * 10 / 40));
});

test('분배 합계는 항상 엑싯 금액과 같다', () => {
  const sc = {
    holders: [...founders, { name: '직원', kind: 'option', shares: 500000 }, { name: '풀', kind: 'pool', shares: 500000 }],
    rounds: [
      { type: 'safe', name: 'SAFE', investors: [{ name: 'AC', amount: 3 * 억 }], cap: 30 * 억, discountPct: 20 },
      seed({ multiple: 1.5, participating: true, capMultiple: 3 }, { poolTargetPct: 10 }),
      { type: 'priced', name: 'A', preMoney: 120 * 억, investors: [{ name: 'A-VC', amount: 40 * 억 }], pref: { multiple: 1 } }
    ]
  };
  const st = simulate(sc).stages[3];
  for (const exit of [0, 5, 20, 47, 90, 160, 400, 1500]) {
    const r = waterfall(st, exit * 억, 'stacked');
    const total = r.holders.reduce((s, h) => s + h.payout, 0) + r.leftover;
    assert.ok(Math.abs(total - exit * 억) < 1, `exit ${exit}억 합계 ${total}`);
  }
});

test('리픽싱 full ratchet, 하한 70%', () => {
  const sc = {
    holders: founders,
    rounds: [
      seed({ antiDilution: 'full', refixFloorPct: 70 }),
      { type: 'priced', name: 'A', preMoney: 25 * 억, investors: [{ name: 'A-VC', amount: 10 * 억 }], pref: {} }
    ]
  };
  const st = simulate(sc).stages[2];
  assert.equal(st.round.price, 200);
  const fix = st.round.refixes[0];
  assert.equal(fix.to, 280);
  assert.equal(fix.floorHit, true);
  assert.equal(holder(st, 'VC').asConverted, Math.floor(2500000 * 400 / 280));
});

test('리픽싱 broad-based 가중평균', () => {
  const sc = {
    holders: founders,
    rounds: [
      seed({ antiDilution: 'broad', refixFloorPct: 0 }),
      { type: 'priced', name: 'A', preMoney: 25 * 억, investors: [{ name: 'A-VC', amount: 10 * 억 }], pref: {} }
    ]
  };
  const st = simulate(sc).stages[2];
  // A=12.5M, B=10억/400=2.5M, C=10억/200=5M → 400×15/17.5 = 342.86 → 343
  assert.equal(st.round.refixes[0].to, 343);
});

test('업 라운드에서는 리픽싱 없음', () => {
  const sc = {
    holders: founders,
    rounds: [
      seed({ antiDilution: 'full' }),
      { type: 'priced', name: 'A', preMoney: 100 * 억, investors: [{ name: 'A-VC', amount: 20 * 억 }], pref: {} }
    ]
  };
  assert.equal(simulate(sc).stages[2].round.refixes.length, 0);
});
