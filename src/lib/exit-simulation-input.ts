import type {
  AntiDilution,
  CapTableScenario,
  PreferredTerms,
  RoundInput,
  Seniority,
} from "./exit-waterfall";

export const EOK = 1e8;
export const OUR_FUND = "우리 펀드";
export type TermsInput = {
  multiple: string;
  participation: string;
  cap: string;
  antiDilution: string;
  floor: string;
};
export type ExitInputs = {
  common: string;
  options: string;
  pool: string;
  pre: string;
  investment: string;
  poolTarget: string;
  coInvestors: Array<{ name: string; amount: string }>;
  terms: TermsInput;
  safeEnabled: boolean;
  safeAmount: string;
  safeCap: string;
  safeDiscount: string;
  followEnabled: boolean;
  followPre: string;
  followInvestment: string;
  followTerms: TermsInput;
  exit: string;
  years: string;
  seniority: string;
};
export const emptyTerms = (): TermsInput => ({
  multiple: "",
  participation: "",
  cap: "",
  antiDilution: "",
  floor: "",
});
export function initialExitInputs(
  investAmount: number | null,
  valuation: number | null,
): ExitInputs {
  const known = (n: number | null) => n !== null && Number.isFinite(n);
  return {
    common: "",
    options: "",
    pool: "",
    pre:
      known(valuation) && known(investAmount)
        ? String(valuation! - investAmount!)
        : "",
    investment: known(investAmount) ? String(investAmount) : "",
    poolTarget: "",
    coInvestors: [],
    terms: emptyTerms(),
    safeEnabled: false,
    safeAmount: "",
    safeCap: "",
    safeDiscount: "",
    followEnabled: false,
    followPre: "",
    followInvestment: "",
    followTerms: emptyTerms(),
    exit: "",
    years: "",
    seniority: "",
  };
}

/** Validation and unit conversion only. All cap-table and payout calculations stay in the existing engine. */
export function parseExitInputs(input: ExitInputs): {
  scenario: CapTableScenario;
  exit: number;
  years: number | null;
  seniority: Seniority;
} {
  function number(
    raw: string,
    label: string,
    { optional = false, positive = false, max = 1e7, integer = false } = {},
  ) {
    if (!raw.trim()) {
      if (optional) return 0;
      throw new Error(`${label}을(를) 입력해주세요.`);
    }
    const n = Number(raw);
    if (
      !Number.isFinite(n) ||
      n < 0 ||
      (positive && n === 0) ||
      n > max ||
      (integer && !Number.isInteger(n))
    ) {
      throw new Error(
        `${label}: ${positive ? "0보다 큰" : "0 이상의"} ${integer ? "정수" : "숫자"}를 ${max.toLocaleString("ko-KR")} 이하로 입력해주세요.`,
      );
    }
    return n;
  }
  function terms(t: TermsInput, label: string): PreferredTerms {
    const multiple = number(t.multiple, `${label} 우선권 배수`, { max: 100 });
    if (!["non", "participating"].includes(t.participation))
      throw new Error(`${label} 참가 여부를 선택해주세요.`);
    if (!["none", "broad", "full"].includes(t.antiDilution))
      throw new Error(`${label} 리픽싱 방식을 선택해주세요.`);
    return {
      multiple,
      participating: t.participation === "participating",
      capMultiple:
        t.participation === "participating"
          ? number(t.cap, `${label} 참가 상한`, { optional: true, max: 100 })
          : 0,
      antiDilution: t.antiDilution as AntiDilution,
      refixFloorPct:
        t.antiDilution === "none"
          ? 0
          : number(t.floor, `${label} 리픽싱 하한`, { max: 100 }),
    };
  }
  const holders: CapTableScenario["holders"] = [
    {
      name: "창업자 등 (보통주)",
      kind: "common",
      shares: number(input.common, "보통주 주식수", {
        max: 1e12,
        integer: true,
      }),
    },
    {
      name: "스톡옵션 (부여)",
      kind: "option",
      shares: number(input.options, "스톡옵션 주식수", {
        optional: true,
        max: 1e12,
        integer: true,
      }),
    },
    {
      name: "옵션풀(미부여)",
      kind: "pool",
      shares: number(input.pool, "미부여 옵션풀 주식수", {
        optional: true,
        max: 1e12,
        integer: true,
      }),
    },
  ];
  if (!holders.some((h) => h.shares > 0))
    throw new Error("기존 주식수를 1주 이상 입력해주세요.");
  const names = new Set([
    OUR_FUND,
    ...holders.map((h) => h.name),
    "이전 SAFE 투자자",
    "후속 투자자",
  ]);
  const coInvestors = input.coInvestors.map((i) => {
    const name = i.name.trim();
    if (!name || names.has(name))
      throw new Error(
        "공동투자자 이름은 비어 있거나 다른 주주 이름과 같을 수 없습니다.",
      );
    names.add(name);
    return {
      name,
      amount: number(i.amount, `${name} 투자금`, { positive: true }) * EOK,
    };
  });
  const rounds: RoundInput[] = [];
  if (input.safeEnabled)
    rounds.push({
      type: "safe",
      name: "이전 SAFE",
      investors: [
        {
          name: "이전 SAFE 투자자",
          amount:
            number(input.safeAmount, "SAFE 투자금", { positive: true }) * EOK,
        },
      ],
      cap: number(input.safeCap, "SAFE 밸류캡", { optional: true }) * EOK,
      discountPct: number(input.safeDiscount, "SAFE 할인율", {
        optional: true,
        max: 95,
      }),
    });
  rounds.push({
    type: "priced",
    name: "이번 라운드",
    preMoney: number(input.pre, "프리머니", { positive: true }) * EOK,
    investors: [
      {
        name: OUR_FUND,
        amount:
          number(input.investment, "우리 펀드 투자금", { positive: true }) *
          EOK,
      },
      ...coInvestors,
    ],
    poolTargetPct: number(input.poolTarget, "옵션풀 목표", {
      optional: true,
      max: 50,
    }),
    pref: terms(input.terms, "이번 라운드"),
  });
  if (input.followEnabled)
    rounds.push({
      type: "priced",
      name: "후속 라운드",
      preMoney:
        number(input.followPre, "후속 프리머니", { positive: true }) * EOK,
      investors: [
        {
          name: "후속 투자자",
          amount:
            number(input.followInvestment, "후속 투자금", { positive: true }) *
            EOK,
        },
      ],
      pref: terms(input.followTerms, "후속 라운드"),
    });
  if (!["stacked", "pari"].includes(input.seniority))
    throw new Error("청산 순위를 선택해주세요.");
  return {
    scenario: { holders, rounds },
    exit: number(input.exit, "엑싯 금액") * EOK,
    years: input.years.trim()
      ? number(input.years, "회수 시점", { positive: true, max: 100 })
      : null,
    seniority: input.seniority as Seniority,
  };
}
