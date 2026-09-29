import type { FinancialCalcResult } from "@/lib/pe/financial-types";

/** value는 원천 단위 원본 금액(원) — 화면 표시용으로만 억원 환산한다(financial-types.ts 주석 참고) */
export function formatWon(value: number): string {
  return `${(value / 100_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}억원`;
}

export const PERIOD_TYPE_LABEL: Record<string, string> = {
  ANNUAL: "연간",
  QUARTERLY: "분기",
  TTM: "TTM",
};

/** FinancialCalcResult를 렌더링한다 — missing_input/currency_mismatch를 0으로 숨기지 않는다 */
export function CalcValue({ result }: { result: FinancialCalcResult | undefined | null }) {
  if (!result) return <span className="text-slate-400">—</span>;
  if (result.status === "ok") return <span className="font-medium">{formatWon(result.value)}</span>;
  if (result.status === "currency_mismatch")
    return (
      <span className="text-amber-600 text-xs" title={result.detail}>
        통화 불일치
      </span>
    );
  return <span className="text-slate-500 text-xs">계산 불가</span>;
}

/** DerivedRatio(ma-deal-dashboard.ts) — 비율(%)을 렌더링한다 */
export function CalcPercent({
  result,
}: {
  result: { status: "ok"; value: number } | { status: "not_available" } | undefined | null;
}) {
  if (!result || result.status !== "ok") return <span className="text-slate-500 text-xs">계산 불가</span>;
  return <span className="font-medium">{(result.value * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%</span>;
}

/** DerivedRatio를 배수(x)로 렌더링한다(Net Debt/EBITDA 등) */
export function CalcMultiple({
  result,
}: {
  result: { status: "ok"; value: number } | { status: "not_available" } | undefined | null;
}) {
  if (!result || result.status !== "ok") return <span className="text-slate-500 text-xs">계산 불가</span>;
  return <span className="font-medium">{result.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}x</span>;
}
