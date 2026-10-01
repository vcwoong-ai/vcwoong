"use client";

import { useId, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND } from "@/lib/brand";
import {
  simulateCapTable,
  exitWaterfall,
  exitPayoutCurve,
} from "@/lib/exit-waterfall";
import { calculateSimpleIrr } from "@/lib/irr-calculator";
import {
  EOK,
  OUR_FUND,
  initialExitInputs,
  parseExitInputs,
  type ExitInputs,
  type TermsInput,
} from "@/lib/exit-simulation-input";

function NumericField({
  label,
  value,
  onChange,
  optional = false,
  max = 1e7,
  integer = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  max?: number;
  integer?: boolean;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode={integer ? "numeric" : "decimal"}
        min="0"
        max={max}
        step={integer ? "1" : "any"}
        required={!optional}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full"
      />
    </div>
  );
}
function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">선택해주세요</option>
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
function TermsFields({
  value,
  onChange,
}: {
  value: TermsInput;
  onChange: (value: TermsInput) => void;
}) {
  const set = (key: keyof TermsInput, v: string) =>
    onChange({ ...value, [key]: v });
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <NumericField
        label="청산우선권 배수 (배)"
        value={value.multiple}
        onChange={(v) => set("multiple", v)}
        max={100}
      />
      <Choice
        label="참가 여부"
        value={value.participation}
        onChange={(v) => set("participation", v)}
        options={[
          ["non", "비참가적"],
          ["participating", "참가적"],
        ]}
      />
      {value.participation === "participating" && (
        <NumericField
          label="참가 상한 (배, 빈칸·0은 상한 없음)"
          value={value.cap}
          onChange={(v) => set("cap", v)}
          optional
          max={100}
        />
      )}
      <Choice
        label="리픽싱 방식"
        value={value.antiDilution}
        onChange={(v) => set("antiDilution", v)}
        options={[
          ["none", "없음"],
          ["broad", "가중평균 (broad-based)"],
          ["full", "풀 래칫"],
        ]}
      />
      {value.antiDilution && value.antiDilution !== "none" && (
        <NumericField
          label="리픽싱 하한 (최초 전환가 대비 %)"
          value={value.floor}
          onChange={(v) => set("floor", v)}
          max={100}
        />
      )}
    </div>
  );
}
const money = (won: number) =>
  `${(won / EOK).toLocaleString("ko-KR", { maximumFractionDigits: 4 })}억원`;
const pct = (value: number) =>
  `${(value * 100).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
type Outcome = ReturnType<typeof calculate>;
function calculate(input: ExitInputs) {
  const parsed = parseExitInputs(input);
  const simulation = simulateCapTable(parsed.scenario);
  const last = simulation.stages[simulation.stages.length - 1];
  const waterfall = exitWaterfall(last, parsed.exit, parsed.seniority);
  const ourFund = waterfall.holders.find((h) => h.holder === OUR_FUND);
  const curve = exitPayoutCurve(last, parsed.exit, 40, parsed.seniority).map(
    ({ exit, result }) => ({
      exit: exit / EOK,
      payout:
        (result.holders.find((h) => h.holder === OUR_FUND)?.payout ?? 0) / EOK,
    }),
  );
  if (
    !ourFund ||
    !Number.isFinite(ourFund.payout) ||
    simulation.stages.some((s) => !Number.isFinite(s.fd))
  )
    throw new Error(
      "이 입력으로 유한한 계산 결과를 얻지 못했습니다. 가정을 확인해주세요.",
    );
  const irr =
    parsed.years === null
      ? null
      : calculateSimpleIrr({
          investAmount: ourFund.invested / EOK,
          exitAmount: ourFund.payout / EOK,
          years: parsed.years,
        }).irr;
  if (irr !== null && !Number.isFinite(irr)) {
    throw new Error(
      "회수 시점이 너무 짧아 IRR을 표시할 수 없습니다. 입력한 기간을 확인해주세요.",
    );
  }
  return { simulation, waterfall, ourFund, irr, years: parsed.years, curve };
}

export default function ExitSimulation({
  investAmount,
  valuation,
}: {
  investAmount: number | null;
  valuation: number | null;
}) {
  const [input, setInput] = useState(() =>
    initialExitInputs(investAmount, valuation),
  );
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  function change<K extends keyof ExitInputs>(key: K, value: ExitInputs[K]) {
    setInput((old) => ({ ...old, [key]: value }));
    setDirty(true);
    setError("");
  }
  const field = (
    key: {
      [K in keyof ExitInputs]: ExitInputs[K] extends string ? K : never;
    }[keyof ExitInputs],
    label: string,
    optional = false,
    max = 1e7,
    integer = false,
  ) => (
    <NumericField
      label={label}
      value={input[key]}
      onChange={(v) => change(key, v)}
      optional={optional}
      max={max}
      integer={integer}
    />
  );
  return (
    <section className="min-w-0 space-y-6" aria-label="회수 시뮬레이션">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm leading-relaxed text-slate-700">
        <p className="font-semibold text-slate-950">
          {BRAND.name} 회수 시뮬레이션 · 사용자 입력 가정
        </p>
        <p>
          입력한 가정 기반 계산이며 계약서 조항에 따라 달라질 수 있음. 저장하지
          않으며 새로고침하면 초기화됩니다. 보고서의 MOIC·IRR 판단에는 반영되지
          않습니다.
        </p>
        <p className="mt-2">
          금액은 억원, 주식수는 주 단위입니다. 빈 선택 항목은 이번 가정에서
          제외합니다. 기존 딜의 포스트밸류에서 우리 투자금을 뺀 값만 프리머니
          초기값으로 사용하므로, 공동투자자가 있으면 전체 라운드 기준으로 직접
          확인해주세요.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            setOutcome(calculate(input));
            setError("");
            setDirty(false);
          } catch (err) {
            setOutcome(null);
            setError(
              err instanceof Error ? err.message : "입력을 확인해주세요.",
            );
          }
        }}
        className="min-w-0 space-y-5"
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. 기존 주주</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {field("common", "보통주 주식수 (창업자 등)", false, 1e12, true)}
            {field("options", "스톡옵션 주식수 (선택)", true, 1e12, true)}
            {field("pool", "미부여 옵션풀 주식수 (선택)", true, 1e12, true)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. 이번 라운드</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              {field("pre", "프리머니 (억원)")}
              {field("investment", "우리 펀드 투자금 (억원)")}
              {field("poolTarget", "투자 후 옵션풀 목표 (%, 선택)", true, 50)}
            </div>
            <div className="space-y-3">
              {input.coInvestors.map((investor, index) => (
                <fieldset
                  key={index}
                  className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3"
                >
                  <legend className="px-1 text-sm">
                    공동투자자 {index + 1}
                  </legend>
                  <div className="space-y-2">
                    <Label htmlFor={`exit-co-${index}`}>공동투자자 이름</Label>
                    <Input
                      id={`exit-co-${index}`}
                      required
                      maxLength={80}
                      value={investor.name}
                      onChange={(e) =>
                        change(
                          "coInvestors",
                          input.coInvestors.map((v, i) =>
                            i === index ? { ...v, name: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </div>
                  <NumericField
                    label="공동투자금 (억원)"
                    value={investor.amount}
                    onChange={(amount) =>
                      change(
                        "coInvestors",
                        input.coInvestors.map((v, i) =>
                          i === index ? { ...v, amount } : v,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="self-end"
                    onClick={() =>
                      change(
                        "coInvestors",
                        input.coInvestors.filter((_, i) => i !== index),
                      )
                    }
                  >
                    공동투자자 {index + 1} 삭제
                  </Button>
                </fieldset>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={input.coInvestors.length >= 10}
                onClick={() =>
                  change("coInvestors", [
                    ...input.coInvestors,
                    { name: "", amount: "" },
                  ])
                }
              >
                공동투자자 추가
              </Button>
            </div>
            <fieldset className="space-y-3">
              <legend className="mb-3 font-medium">
                이번 라운드 우선주 조건
              </legend>
              <TermsFields
                value={input.terms}
                onChange={(v) => change("terms", v)}
              />
            </fieldset>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. 추가 가정 (선택)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={input.safeEnabled}
                onChange={(e) => change("safeEnabled", e.target.checked)}
              />
              이전 SAFE 포함
            </label>
            {input.safeEnabled && (
              <div className="grid gap-4 sm:grid-cols-3">
                {field("safeAmount", "SAFE 투자금 (억원)")}
                {field("safeCap", "SAFE 밸류캡 (억원, 빈칸·0은 없음)", true)}
                {field(
                  "safeDiscount",
                  "SAFE 할인율 (%, 빈칸·0은 없음)",
                  true,
                  95,
                )}
              </div>
            )}
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={input.followEnabled}
                onChange={(e) => change("followEnabled", e.target.checked)}
              />
              후속 라운드 포함
            </label>
            {input.followEnabled && (
              <fieldset className="space-y-4">
                <legend className="mb-3 font-medium">
                  후속 라운드 가정 및 우선주 조건
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field("followPre", "후속 프리머니 (억원)")}
                  {field("followInvestment", "후속 투자금 (억원)")}
                </div>
                <TermsFields
                  value={input.followTerms}
                  onChange={(v) => change("followTerms", v)}
                />
              </fieldset>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. 회수 가정</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {field("exit", "엑싯 금액 (억원)")}
            {field("years", "회수 시점 (년, 선택)", true, 100)}
            <Choice
              label="청산 순위"
              value={input.seniority}
              onChange={(v) => change("seniority", v)}
              options={[
                ["stacked", "후속 라운드 선순위"],
                ["pari", "모든 우선주 동순위"],
              ]}
            />
          </CardContent>
        </Card>
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit">시뮬레이션 계산</Button>
          <p className="text-xs text-muted-foreground">
            외부 요청·AI 호출 없이 브라우저에서 계산합니다.
          </p>
        </div>
      </form>
      {outcome && (
        <div
          className="min-w-0 space-y-5"
          aria-label="시뮬레이션 결과"
          aria-live="polite"
        >
          {dirty && (
            <p
              role="status"
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"
            >
              입력이 변경되었습니다. 아래는 마지막 계산 결과입니다. 다시
              계산해주세요.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["우리 펀드 회수액", money(outcome.ourFund.payout)],
              [
                "우리 펀드 MOIC",
                `${outcome.ourFund.multiple?.toFixed(2) ?? "—"}x`,
              ],
              [
                "단순 연복리 IRR",
                outcome.irr === null
                  ? "미계산 · 회수 시점 필요"
                  : pct(outcome.irr),
              ],
            ].map(([label, value]) => (
              <Card key={label} className="bg-slate-950 text-white">
                <CardContent className="p-5">
                  <p className="text-xs text-slate-300">{label}</p>
                  <p
                    className="mt-2 break-words text-xl font-semibold"
                    data-testid={label}
                  >
                    {value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            MOIC와 IRR은 엔진의 주당 가격 반올림·신주 내림 후 실제 납입액{" "}
            {money(outcome.ourFund.invested)}을 기준으로 합니다. IRR은 단일
            투자·회수의 연복리 환산이며 중간 현금흐름·세금·수수료를 반영하지
            않습니다.
          </p>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                라운드별 완전희석 지분율
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {outcome.simulation.stages.map((stage, index) => (
                <div key={index} className="space-y-2">
                  <h4 className="font-medium">{stage.name}</h4>
                  {stage.round?.type === "priced" && (
                    <p className="text-xs text-muted-foreground">
                      주당 가격 {stage.round.price.toLocaleString("ko-KR")}원 ·
                      신주 {stage.round.newShares.toLocaleString("ko-KR")}주
                    </p>
                  )}
                  <table className="w-full table-fixed text-sm">
                    <caption className="sr-only">
                      {stage.name} 주주별 지분
                    </caption>
                    <thead>
                      <tr className="border-b text-left">
                        <th className="w-1/2 py-2">주주</th>
                        <th className="py-2 text-right">환산 주식수</th>
                        <th className="py-2 text-right">지분율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stage.holders.map((holder) => (
                        <tr
                          key={holder.holder}
                          className={
                            holder.holder === OUR_FUND
                              ? "border-b bg-blue-50 font-semibold text-blue-900"
                              : "border-b"
                          }
                        >
                          <th
                            scope="row"
                            className="break-words py-2 text-left font-normal"
                          >
                            {holder.holder}
                          </th>
                          <td className="break-all py-2 text-right">
                            {holder.asConverted.toLocaleString("ko-KR")}
                          </td>
                          <td className="py-2 text-right">{pct(holder.pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {stage.round?.type === "priced" &&
                    stage.round.refixes.map((r) => (
                      <p key={r.className} className="text-xs">
                        {r.className} 리픽싱 {r.from}원 → {r.to}원{" "}
                        {r.floorHit ? "(하한 적용)" : ""}
                      </p>
                    ))}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                주주별 회수액 · 청산우선권
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                미부여 옵션풀은 분배에서 제외합니다. 스톡옵션은 행사가 차감 전
                기준입니다.
              </p>
              <table className="w-full table-fixed text-sm">
                <caption className="sr-only">주주별 분배액</caption>
                <thead>
                  <tr className="border-b">
                    <th className="w-1/2 py-2 text-left">주주</th>
                    <th className="py-2 text-right">분배액</th>
                    <th className="py-2 text-right">MOIC</th>
                  </tr>
                </thead>
                <tbody>
                  {outcome.waterfall.holders.map((h) => (
                    <tr
                      key={h.holder}
                      className={
                        h.holder === OUR_FUND
                          ? "border-b bg-blue-50 font-semibold text-blue-900"
                          : "border-b"
                      }
                    >
                      <th scope="row" className="break-words py-2 text-left">
                        {h.holder}
                      </th>
                      <td className="break-words py-2 text-right">
                        {money(h.payout)}
                      </td>
                      <td className="py-2 text-right">
                        {h.multiple === null
                          ? "—"
                          : `${h.multiple.toFixed(2)}x`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {outcome.waterfall.classes.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"
                >
                  <span>{c.name}</span>
                  <strong>{c.converted ? "보통주 전환" : "우선권 행사"}</strong>
                </div>
              ))}
              {outcome.waterfall.leftover > 0 && (
                <p>미분배 잔액: {money(outcome.waterfall.leftover)}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                엑싯 금액별 우리 펀드 회수액
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-muted-foreground">
                입력한 엑싯 금액까지의 가정 곡선 · 축 단위: 억원
              </p>
              <div
                className="h-64 w-full min-w-0"
                role="img"
                aria-label={`엑싯 0~${outcome.waterfall.exit / EOK}억원에서 우리 펀드 회수액 곡선. 입력한 엑싯에서 ${money(outcome.ourFund.payout)} 회수.`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={outcome.curve}
                    margin={{ top: 10, right: 15, bottom: 10, left: 0 }}
                    accessibilityLayer
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="exit"
                      type="number"
                      domain={[0, "dataMax"]}
                      tickCount={6}
                      minTickGap={32}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis width={45} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v) => [
                        `${Number(v).toFixed(2)}억원`,
                        "우리 펀드 회수액",
                      ]}
                      labelFormatter={(v) => `엑싯 ${Number(v).toFixed(2)}억원`}
                    />
                    <Line
                      dataKey="payout"
                      type="linear"
                      stroke="#2563eb"
                      strokeWidth={3}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          {outcome.simulation.warnings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">엔진 경고</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  {outcome.simulation.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <p className="text-xs text-muted-foreground">
            상환권·동반매도권·누적 배당은 계산하지 않습니다. SAFE와 옵션풀은
            엔진의 완전희석 기준을 따릅니다. 계약서와 주주명부를 대조해주세요.
          </p>
        </div>
      )}
    </section>
  );
}
