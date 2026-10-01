/** UI inputs only: units, absent assumptions, optional rounds and hand-calculated outputs. */
import assert from "node:assert/strict";
import {
  EOK,
  OUR_FUND,
  initialExitInputs,
  parseExitInputs,
  type ExitInputs,
} from "../src/lib/exit-simulation-input";
import {
  simulateCapTable,
  exitWaterfall,
  exitPayoutCurve,
} from "../src/lib/exit-waterfall";
import { calculateSimpleIrr } from "../src/lib/irr-calculator";

const empty = initialExitInputs(null, null);
assert.equal(empty.pre, "");
assert.equal(empty.investment, "");
assert.equal(empty.common, "");
assert.equal(empty.terms.multiple, "");
assert.equal(empty.seniority, "");
assert.equal(initialExitInputs(null, 50).pre, "");
assert.equal(initialExitInputs(10, null).pre, "");
assert.equal(initialExitInputs(10, 50).pre, "40");
assert.throws(() => parseExitInputs(empty), /보통주/);
const input: ExitInputs = {
  ...initialExitInputs(10, 50),
  common: "10000000",
  exit: "30",
  seniority: "stacked",
  terms: {
    multiple: "1",
    participation: "non",
    cap: "",
    antiDilution: "none",
    floor: "",
  },
};
const parsed = parseExitInputs(input);
assert.equal(parsed.exit, 30 * EOK);
assert.equal(parsed.years, null);
assert.equal(parsed.scenario.rounds.length, 1);
const current = parsed.scenario.rounds[0];
assert.equal(current.type, "priced");
if (current.type !== "priced") throw new Error("priced round required");
assert.equal(current.preMoney, 40 * EOK);
assert.equal(current.investors[0].amount, 10 * EOK);
assert.equal(current.pref?.multiple, 1);
assert.equal(current.pref?.participating, false);
const simulation = simulateCapTable(parsed.scenario);
const stage = simulation.stages[1];
assert.equal(stage.round?.type === "priced" && stage.round.price, 400);
assert.equal(stage.holders.find((h) => h.holder === OUR_FUND)?.pct, 0.2);
const low = exitWaterfall(stage, parsed.exit, parsed.seniority);
assert.equal(low.holders.find((h) => h.holder === OUR_FUND)?.payout, 10 * EOK);
assert.equal(low.classes[0].converted, false);
const high = exitWaterfall(stage, 100 * EOK, parsed.seniority);
assert.equal(high.holders.find((h) => h.holder === OUR_FUND)?.payout, 20 * EOK);
assert.equal(high.classes[0].converted, true);
assert.equal(
  calculateSimpleIrr({ investAmount: 10, exitAmount: 10, years: 5 }).irr,
  0,
);
assert.ok(
  Math.abs(
    calculateSimpleIrr({ investAmount: 10, exitAmount: 20, years: 5 }).irr! -
      (2 ** 0.2 - 1),
  ) < 1e-12,
);
const curve = exitPayoutCurve(stage, 100 * EOK, 40, "stacked");
assert.equal(curve.length, 41);
assert.equal(
  curve.at(-1)?.result.holders.find((h) => h.holder === OUR_FUND)?.payout,
  20 * EOK,
);
for (const patch of [
  { common: "0" },
  { common: "1.5" },
  { pre: "Infinity" },
  { investment: "-1" },
  { years: "0" },
  { poolTarget: "51" },
  { seniority: "" },
  { terms: { ...input.terms, multiple: "" } },
  { terms: { ...input.terms, antiDilution: "full", floor: "" } },
]) {
  assert.throws(() => parseExitInputs({ ...input, ...patch }));
}
assert.throws(
  () =>
    parseExitInputs({
      ...input,
      coInvestors: [{ name: OUR_FUND, amount: "1" }],
    }),
  /공동투자자/,
);
assert.throws(
  () =>
    parseExitInputs({
      ...input,
      coInvestors: [
        { name: "동일", amount: "1" },
        { name: " 동일 ", amount: "2" },
      ],
    }),
  /공동투자자/,
);
const co = parseExitInputs({
  ...input,
  coInvestors: [{ name: "공동 펀드", amount: "2.5" }],
});
assert.equal(co.scenario.rounds[0].investors[1].amount, 2.5 * EOK);
const safe = parseExitInputs({
  ...input,
  safeEnabled: true,
  safeAmount: "2",
  safeCap: "20",
  safeDiscount: "20",
});
assert.equal(safe.scenario.rounds[0].type, "safe");
const safeStage = simulateCapTable(safe.scenario).stages[2];
assert.equal(safeStage.round?.type === "priced" && safeStage.round.price, 360);
assert.equal(
  safeStage.round?.type === "priced" &&
    safeStage.round.safeConversions[0].price,
  180,
);
const warn = simulateCapTable(
  parseExitInputs({ ...input, safeEnabled: true, safeAmount: "2" }).scenario,
).warnings;
assert.equal(
  warn[0],
  "이전 SAFE: 밸류캡과 할인율이 모두 없으면 다음 라운드 가격으로 그대로 전환됩니다.",
);
const follow = parseExitInputs({
  ...input,
  followEnabled: true,
  followPre: "150",
  followInvestment: "30",
  followTerms: input.terms,
  years: "5",
  seniority: "pari",
});
assert.equal(follow.scenario.rounds.length, 2);
assert.equal(follow.years, 5);
assert.equal(follow.seniority, "pari");
console.log(
  "PASS: missing assumptions, post→pre, KRW units, input guards, co-investors, SAFE/follow-on, 400 KRW/20%/10·20 eok payouts, IRR and curve endpoints",
);
