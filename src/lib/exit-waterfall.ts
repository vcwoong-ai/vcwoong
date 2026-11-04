/**
 * 회수(엑싯) 시뮬레이션 엔진 — 투자 라운드별 캡테이블과 매각 대금 분배.
 *
 * CLAUDE.md 경쟁 분석의 "VCNote가 앞서는 것: 회수 시뮬레이션"을 메우는
 * 계산 모듈이다. `fund-analytics.ts`의 워터폴은 **펀드** 레벨(LP/GP 성과보수)
 * 분배이고, 이건 **피투자회사** 레벨(주주 간 매각 대금) 분배라 별개다.
 *
 * 순수 함수만 있다 — DB·AI·네트워크 호출 없음. 같은 입력이면 항상 같은 결과.
 *
 * ## 단위
 * 금액은 **원**, 주식수는 **주**. (억원이 아니라 원인 이유: 주당 가격을
 * 원 단위로 반올림해야 실제 투자계약서·주주명부 숫자와 일치한다.)
 *
 * ## 한국 투자계약 관행 반영
 * - 주당 가격은 원 단위 반올림, 신주는 주 단위 내림 → 실제 납입액 = 주식수 × 주당가격
 * - 우선주(RCPS)는 라운드마다 별도 종류로 발행
 * - SAFE(조건부지분인수계약)는 다음 가격 라운드에서 min(밸류캡 가격, 할인 가격)으로 전환
 * - 옵션풀 확대는 프리머니에 포함(option pool shuffle). SAFE 전환과 서로의 주당가격에
 *   영향을 주므로 고정점 반복으로 푼다.
 * - 리픽싱(희석방지): 가중평균(broad-based)·풀 래칫, 최초 전환가 대비 하한(%)
 * - 청산우선권: 배수, 참가적/비참가적, 참가 상한, 후속 라운드 선순위 또는 전 우선주 동순위.
 *   비참가적·상한 있는 참가적 우선주는 우선권 행사와 보통주 전환 중 유리한 쪽을 택한다.
 *
 * ## 단순화 — 정확도를 과장하지 않기 위해 명시
 * - 스톡옵션은 행사가 차감 전 금액으로 분배한다(행사가 입력 없음).
 * - 리픽싱은 해당 라운드 신규 투자자도 함께 희석되는 것으로 계산한다.
 * - SAFE 밸류캡은 라운드 프리머니와 같은 기준(완전희석, 확대된 옵션풀 포함)으로 적용한다.
 * - 상환권, 동반매도권, 누적 배당은 계산하지 않는다.
 */

const EPS = 1e-9;

export type HolderKind = "common" | "option" | "pool";
export type AntiDilution = "none" | "broad" | "full";
export type Seniority = "stacked" | "pari";

export interface InitialHolder {
  name: string;
  kind: HolderKind;
  shares: number;
}

export interface RoundInvestor {
  name: string;
  /** 원 */
  amount: number;
}

export interface PreferredTerms {
  /** 청산우선권 배수 (기본 1) */
  multiple?: number;
  participating?: boolean;
  /** 참가적일 때 총 회수 상한 배수. 0이면 상한 없음 */
  capMultiple?: number;
  antiDilution?: AntiDilution;
  /** 리픽싱 하한, 최초 전환가 대비 % (기본 70) */
  refixFloorPct?: number;
}

export interface PricedRoundInput {
  type: "priced";
  name: string;
  /** 원 */
  preMoney: number;
  investors: RoundInvestor[];
  /** 투자 후 옵션풀 목표 %. 0이면 확대 없음, 최대 50 */
  poolTargetPct?: number;
  pref?: PreferredTerms;
}

export interface SafeRoundInput {
  type: "safe";
  name: string;
  investors: RoundInvestor[];
  /** 원. 0이면 캡 없음 */
  cap?: number;
  discountPct?: number;
}

export type RoundInput = PricedRoundInput | SafeRoundInput;

export interface CapTableScenario {
  holders: InitialHolder[];
  rounds: RoundInput[];
}

export type PositionKind = HolderKind | "preferred";

export interface Position {
  holder: string;
  classId: string;
  kind: PositionKind;
  shares: number;
  /** 원. 청산우선권 계산 기준 금액 */
  invested: number;
  /** 보통주 환산 주식수 (리픽싱 반영) */
  asConverted: number;
  fromSafe?: boolean;
}

export interface ShareClass {
  id: string;
  name: string;
  kind: PositionKind;
  roundIndex?: number;
  origPrice?: number;
  convPrice?: number;
  multiple?: number;
  participating?: boolean;
  capMultiple?: number;
  antiDilution?: AntiDilution;
  refixFloorPct?: number;
}

export interface HolderSummary {
  holder: string;
  shares: number;
  asConverted: number;
  invested: number;
  /** 완전희석 지분율 (0~1) */
  pct: number;
  kinds: PositionKind[];
}

export interface SafeConversion {
  holder: string;
  round: string;
  amount: number;
  price: number;
  shares: number;
  /** 라운드 가격 대비 할인율 (0~1) */
  discountVsRound: number;
}

export interface Refix {
  className: string;
  from: number;
  to: number;
  extraShares: number;
  floorHit: boolean;
}

export type StageRound =
  | null
  | { type: "skipped" }
  | { type: "safe"; amount: number; cap: number; discountPct: number }
  | {
      type: "priced";
      preMoney: number;
      price: number;
      postMoney: number;
      committed: number;
      invested: number;
      investors: { holder: string; committed: number; invested: number; shares: number }[];
      newShares: number;
      poolAdd: number;
      poolPct: number;
      safeConversions: SafeConversion[];
      refixes: Refix[];
    };

export interface Stage {
  name: string;
  round: StageRound;
  positions: Position[];
  classes: ShareClass[];
  /** 완전희석 주식수 */
  fd: number;
  holders: HolderSummary[];
  pendingSafeAmount: number;
}

interface PendingSafe {
  round: string;
  holder: string;
  amount: number;
  cap: number;
  discount: number;
}

export interface SimulationResult {
  stages: Stage[];
  warnings: string[];
  pendingSafes: PendingSafe[];
}

function sum<T>(arr: T[], fn: (x: T, i: number) => number): number {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += fn(arr[i], i);
  return s;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fdShares(positions: Position[]): number {
  return sum(positions, (p) => p.asConverted);
}

function roundPrice(p: number): number {
  return Math.max(1, Math.round(p));
}

export function aggregateHolders(positions: Position[]): HolderSummary[] {
  const fd = fdShares(positions);
  const map = new Map<string, HolderSummary & { kindSet: Set<PositionKind> }>();
  for (const p of positions) {
    let h = map.get(p.holder);
    if (!h) {
      h = { holder: p.holder, shares: 0, asConverted: 0, invested: 0, pct: 0, kinds: [], kindSet: new Set() };
      map.set(p.holder, h);
    }
    h.shares += p.shares;
    h.asConverted += p.asConverted;
    h.invested += p.invested;
    h.kindSet.add(p.kind);
  }
  return Array.from(map.values()).map(({ kindSet, ...h }) => ({
    ...h,
    pct: fd > 0 ? h.asConverted / fd : 0,
    kinds: Array.from(kindSet),
  }));
}

/** 시나리오를 라운드 순서대로 계산해 단계별 캡테이블을 돌려준다. */
export function simulateCapTable(sc: CapTableScenario): SimulationResult {
  const warnings: string[] = [];
  const classes: ShareClass[] = [
    { id: "common", name: "보통주", kind: "common" },
    { id: "option", name: "스톡옵션(부여)", kind: "option" },
    { id: "pool", name: "옵션풀(미부여)", kind: "pool" },
  ];
  let positions: Position[] = (sc.holders || [])
    .filter((h) => num(h.shares) > 0)
    .map((h) => {
      const kind: HolderKind = h.kind === "option" || h.kind === "pool" ? h.kind : "common";
      const s = Math.floor(num(h.shares));
      return { holder: (h.name || "").trim() || "(이름 없음)", classId: kind, kind, shares: s, invested: 0, asConverted: s };
    });

  const stages: Stage[] = [];
  let pendingSafes: PendingSafe[] = [];
  const snapshot = (name: string, round: StageRound) => {
    stages.push({
      name,
      round,
      positions: structuredClone(positions),
      classes: structuredClone(classes),
      fd: fdShares(positions),
      holders: aggregateHolders(positions),
      pendingSafeAmount: sum(pendingSafes, (s) => s.amount),
    });
  };

  snapshot("설립", null);

  (sc.rounds || []).forEach((r, idx) => {
    const label = (r.name || "").trim() || `라운드 ${idx + 1}`;
    const investors = (r.investors || []).filter((i) => num(i.amount) > 0);

    if (r.type === "safe") {
      for (const i of investors) {
        pendingSafes.push({
          round: label,
          holder: (i.name || "").trim() || `${label} 투자자`,
          amount: num(i.amount),
          cap: num(r.cap),
          discount: Math.min(0.95, Math.max(0, num(r.discountPct) / 100)),
        });
      }
      if (!investors.length) warnings.push(`${label}: 투자 금액이 없어 계산에서 제외했습니다.`);
      if (num(r.cap) <= 0 && num(r.discountPct) <= 0) {
        warnings.push(`${label}: 밸류캡과 할인율이 모두 없으면 다음 라운드 가격으로 그대로 전환됩니다.`);
      }
      snapshot(label, { type: "safe", amount: sum(investors, (i) => num(i.amount)), cap: num(r.cap), discountPct: num(r.discountPct) });
      return;
    }

    const pre = num(r.preMoney);
    const I = sum(investors, (i) => num(i.amount));
    const S0 = fdShares(positions);
    if (pre <= 0 || I <= 0 || S0 <= 0) {
      warnings.push(`${label}: ${S0 <= 0 ? "기존 주식이 없어" : "프리머니와 투자금을 입력해야"} 계산할 수 있습니다. 이 라운드는 건너뜁니다.`);
      snapshot(label, { type: "skipped" });
      return;
    }
    const U0 = sum(positions.filter((p) => p.kind === "pool"), (p) => p.asConverted);
    const t = Math.min(0.5, Math.max(0, num(r.poolTargetPct) / 100));

    const safePrice = (s: PendingSafe, price: number, base: number) =>
      Math.min(s.cap > 0 ? s.cap / base : Infinity, price * (1 - s.discount));

    let poolAdd = 0;
    let safeSh = pendingSafes.map(() => 0);
    let P = pre / S0;
    for (let k = 0; k < 1000; k++) {
      const base = S0 + poolAdd + sum(safeSh, (v) => v);
      P = pre / base;
      const nextSafe = pendingSafes.map((s) => s.amount / safePrice(s, P, base));
      let nextPool = poolAdd;
      if (t > 0) {
        const post = S0 + poolAdd + sum(nextSafe, (v) => v) + I / P;
        nextPool = Math.max(0, t * post - U0);
      }
      const delta = Math.abs(nextPool - poolAdd) + sum(nextSafe, (v, i) => Math.abs(v - safeSh[i]));
      safeSh = nextSafe;
      poolAdd = nextPool;
      if (delta < 1e-7) break;
    }
    const baseFinal = S0 + poolAdd + sum(safeSh, (v) => v);
    P = roundPrice(pre / baseFinal);
    poolAdd = Math.ceil(poolAdd - 1e-6);

    const classId = `r${idx}`;
    const pref = r.pref || {};
    const cls: ShareClass = {
      id: classId,
      name: `${label} 우선주`,
      kind: "preferred",
      roundIndex: idx,
      origPrice: P,
      convPrice: P,
      multiple: Math.max(0, num(pref.multiple ?? 1)),
      participating: !!pref.participating,
      capMultiple: Math.max(0, num(pref.capMultiple)),
      antiDilution: pref.antiDilution || "none",
      refixFloorPct: Math.min(100, Math.max(0, num(pref.refixFloorPct ?? 70))),
    };

    const newPositions: Position[] = [];
    const safeConversions: SafeConversion[] = pendingSafes.map((s) => {
      const price = roundPrice(safePrice(s, P, baseFinal));
      const shares = Math.floor(s.amount / price);
      newPositions.push({ holder: s.holder, classId, kind: "preferred", shares, invested: s.amount, asConverted: shares, fromSafe: true });
      return { holder: s.holder, round: s.round, amount: s.amount, price, shares, discountVsRound: 1 - price / P };
    });
    const investorRows = investors.map((i) => {
      const amount = num(i.amount);
      const shares = Math.floor(amount / P);
      const name = (i.name || "").trim() || `${label} 투자자`;
      newPositions.push({ holder: name, classId, kind: "preferred", shares, invested: shares * P, asConverted: shares });
      return { holder: name, committed: amount, invested: shares * P, shares };
    });
    const newShares = sum(newPositions, (p) => p.shares);

    // 기존 우선주 리픽싱 — 이번 라운드 가격이 전환가격보다 낮을 때만
    const refixes: Refix[] = [];
    const newMoney = I + sum(pendingSafes, (s) => s.amount);
    for (const c of classes) {
      if (c.kind !== "preferred" || c.antiDilution === "none" || P >= c.convPrice!) continue;
      const floorPrice = (c.origPrice! * c.refixFloorPct!) / 100;
      const target = c.antiDilution === "full" ? P : (c.convPrice! * (S0 + newMoney / c.convPrice!)) / (S0 + newShares);
      const nextCP = roundPrice(Math.max(target, floorPrice));
      if (nextCP >= c.convPrice!) continue;
      const own = () => positions.filter((p) => p.classId === c.id);
      const before = sum(own(), (p) => p.asConverted);
      const from = c.convPrice!;
      c.convPrice = nextCP;
      for (const p of own()) p.asConverted = Math.floor((p.shares * c.origPrice!) / c.convPrice + EPS);
      refixes.push({
        className: c.name,
        from,
        to: nextCP,
        extraShares: sum(own(), (p) => p.asConverted) - before,
        floorHit: nextCP === roundPrice(floorPrice) && target < floorPrice,
      });
    }

    if (poolAdd > 0) {
      const pool = positions.find((p) => p.kind === "pool");
      if (pool) {
        pool.shares += poolAdd;
        pool.asConverted += poolAdd;
      } else {
        positions.push({ holder: "옵션풀(미부여)", classId: "pool", kind: "pool", shares: poolAdd, invested: 0, asConverted: poolAdd });
      }
    }
    classes.push(cls);
    positions = positions.concat(newPositions);
    pendingSafes = [];

    const fdAfter = fdShares(positions);
    snapshot(label, {
      type: "priced",
      preMoney: pre,
      price: P,
      postMoney: P * fdAfter,
      committed: I,
      invested: sum(investorRows, (x) => x.invested),
      investors: investorRows,
      newShares,
      poolAdd,
      poolPct: fdAfter > 0 ? sum(positions.filter((p) => p.kind === "pool"), (p) => p.asConverted) / fdAfter : 0,
      safeConversions,
      refixes,
    });
  });

  if (pendingSafes.length) {
    const total = Math.round(sum(pendingSafes, (s) => s.amount)).toLocaleString("ko-KR");
    warnings.push(`미전환 SAFE ${pendingSafes.length}건(${total}원)은 다음 가격 라운드가 없어 캡테이블에 반영되지 않았습니다.`);
  }
  return { stages, warnings, pendingSafes };
}

interface ResidualPart {
  i: number;
  shares: number;
  room: number;
}

/** 잔여 분배 단가 p 를 찾는다: Σ min(s_i·p, room_i) = R */
function solveResidualPrice(parts: ResidualPart[], R: number): { p: number; leftover: number } {
  if (R <= EPS || !parts.length) return { p: 0, leftover: Math.max(0, R) };
  const f = (p: number) => sum(parts, (x) => Math.min(x.shares * p, x.room));
  const uncapped = sum(parts.filter((x) => x.room === Infinity), (x) => x.shares);
  let hi: number;
  if (uncapped > 0) {
    hi = R / uncapped;
  } else {
    hi = Math.max(...parts.map((x) => (x.shares > 0 ? x.room / x.shares : 0)));
    if (f(hi) < R) return { p: hi, leftover: R - f(hi) };
  }
  let lo = 0;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < R) lo = mid;
    else hi = mid;
  }
  return { p: hi, leftover: 0 };
}

export interface WaterfallHolder {
  holder: string;
  payout: number;
  invested: number;
  asConverted: number;
  /** 엑싯 금액 대비 비중 (0~1) */
  share: number;
  /** 투자 배수(MOIC). 투자금 없는 주주는 null */
  multiple: number | null;
}

export interface WaterfallResult {
  exit: number;
  holders: WaterfallHolder[];
  classes: { id: string; name: string; converted: boolean; preference: number; payout: number }[];
  commonPricePerShare: number;
  /** 분배되지 않은 잔액 (보통주 주주가 하나도 없을 때만 발생) */
  leftover: number;
}

/**
 * 엑싯(매각) 금액을 청산우선권 순서대로 분배한다.
 * 미부여 옵션풀은 분배 대상에서 제외한다.
 */
export function exitWaterfall(stage: Stage, exitValue: number, seniority: Seniority = "stacked"): WaterfallResult {
  const exit = Math.max(0, num(exitValue));
  const pos = stage.positions.filter((p) => p.kind !== "pool" && p.asConverted > 0);
  const cls = new Map(stage.classes.map((c) => [c.id, c]));
  const prefIds = Array.from(new Set(pos.filter((p) => p.kind === "preferred").map((p) => p.classId)));
  const prefAmount = (p: Position) => p.invested * (cls.get(p.classId)!.multiple ?? 1);

  function distribute(converted: Set<string>) {
    const pay = pos.map(() => 0);
    let remaining = exit;
    const groups = new Map<number, number[]>();
    pos.forEach((p, i) => {
      if (p.kind !== "preferred" || converted.has(p.classId)) return;
      const rank = seniority === "pari" ? 0 : cls.get(p.classId)!.roundIndex ?? 0;
      groups.set(rank, [...(groups.get(rank) || []), i]);
    });
    for (const rank of Array.from(groups.keys()).sort((a, b) => b - a)) {
      const idxs = groups.get(rank)!;
      const need = sum(idxs, (i) => prefAmount(pos[i]));
      if (need <= 0) continue;
      const ratio = Math.min(1, remaining / need);
      for (const i of idxs) pay[i] = prefAmount(pos[i]) * ratio;
      remaining -= need * ratio;
    }
    const parts: ResidualPart[] = [];
    pos.forEach((p, i) => {
      if (p.kind !== "preferred" || converted.has(p.classId)) {
        parts.push({ i, shares: p.asConverted, room: Infinity });
        return;
      }
      const c = cls.get(p.classId)!;
      if (!c.participating) return;
      const room = c.capMultiple! > 0 ? Math.max(0, c.capMultiple! * p.invested - pay[i]) : Infinity;
      parts.push({ i, shares: p.asConverted, room });
    });
    const solved = solveResidualPrice(parts, Math.max(0, remaining));
    for (const x of parts) pay[x.i] += Math.min(x.shares * solved.p, x.room);
    return { pay, pricePerShare: solved.p, leftover: solved.leftover };
  }

  const classPay = (res: { pay: number[] }, id: string) => sum(pos, (p, i) => (p.classId === id ? res.pay[i] : 0));

  // 우선주 종류별로 "전환/미전환"을 바꿔 보며 그 종류에 더 유리한 쪽으로 이동, 더 이상 바뀌지 않을 때까지
  let converted = new Set<string>();
  let res = distribute(converted);
  for (let iter = 0; iter < 60; iter++) {
    let best: { trial: Set<string>; alt: ReturnType<typeof distribute>; rel: number } | null = null;
    for (const id of prefIds) {
      const trial = new Set(converted);
      if (trial.has(id)) trial.delete(id);
      else trial.add(id);
      const alt = distribute(trial);
      const cur = classPay(res, id);
      const gain = classPay(alt, id) - cur;
      if (gain > Math.max(1, cur * 1e-9)) {
        const rel = gain / (cur + 1);
        if (!best || rel > best.rel) best = { trial, alt, rel };
      }
    }
    if (!best) break;
    converted = best.trial;
    res = best.alt;
  }

  const holders = new Map<string, WaterfallHolder>();
  pos.forEach((p, i) => {
    let h = holders.get(p.holder);
    if (!h) {
      h = { holder: p.holder, payout: 0, invested: 0, asConverted: 0, share: 0, multiple: null };
      holders.set(p.holder, h);
    }
    h.payout += res.pay[i];
    h.invested += p.invested;
    h.asConverted += p.asConverted;
  });

  return {
    exit,
    holders: Array.from(holders.values()).map((h) => ({
      ...h,
      share: exit > 0 ? h.payout / exit : 0,
      multiple: h.invested > 0 ? h.payout / h.invested : null,
    })),
    classes: prefIds.map((id) => ({
      id,
      name: cls.get(id)!.name,
      converted: converted.has(id),
      preference: sum(pos, (p) => (p.classId === id ? prefAmount(p) : 0)),
      payout: classPay(res, id),
    })),
    commonPricePerShare: res.pricePerShare,
    leftover: res.leftover,
  };
}

/** 엑싯 금액 0 ~ maxExit 구간을 steps 등분해 분배 곡선을 만든다 (차트용). */
export function exitPayoutCurve(stage: Stage, maxExit: number, steps: number, seniority: Seniority = "stacked") {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const exit = (maxExit * i) / steps;
    return { exit, result: exitWaterfall(stage, exit, seniority) };
  });
}
