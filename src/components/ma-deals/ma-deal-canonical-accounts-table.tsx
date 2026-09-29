import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MA_FINANCIAL_SOURCE_LABEL } from "@/lib/pe/ma-deal-labels";
import {
  CANONICAL_ACCOUNT_ROWS,
  lookupCanonicalAccount,
  type FinancialsPeriodLike,
} from "@/lib/pe/pe-financials-view-model";
import type { MaFinancialSourceType } from "@prisma/client";

function formatWon(value: number): string {
  return `${(value / 100_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}억원`;
}

const PERIOD_TYPE_LABEL: Record<string, string> = {
  ANNUAL: "연간",
  QUARTERLY: "분기",
  TTM: "TTM",
};

/**
 * DART가 실제로 매핑하는 6개 핵심 계정(REVENUE/EBIT/NET_INCOME/TOTAL_ASSETS/
 * TOTAL_LIABILITIES/EQUITY)을 기간별로, 출처와 함께 보여준다(PR #106).
 * lookupCanonicalAccount()는 raw line item을 그대로 조회할 뿐 새 계산을
 * 하지 않는다 — 같은 계정에 값이 다른 line item이 여러 개면 값을 고르지
 * 않고 "모순"으로 표시한다(위 MaDealFinancialDataQuality의 conflict
 * 배너와 같은 원칙).
 */
export function MaDealCanonicalAccountsTable({
  periods,
}: {
  periods: Array<FinancialsPeriodLike & { periodType: string; currency: string }>;
}) {
  if (periods.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">핵심 계정 · 출처</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-400">
                <th className="px-4 py-2 font-medium">계정</th>
                {periods.map((p) => (
                  <th key={p.id} className="px-4 py-2 font-medium whitespace-nowrap">
                    FY{p.fiscalYear} · {PERIOD_TYPE_LABEL[p.periodType] ?? p.periodType}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CANONICAL_ACCOUNT_ROWS.map((row) => (
                <tr key={row.key} className="border-b last:border-0">
                  <td className="px-4 py-2.5 text-gray-500">{row.label}</td>
                  {periods.map((p) => {
                    const lookup = lookupCanonicalAccount(p, row.key);
                    return (
                      <td key={p.id} className="px-4 py-2.5">
                        {lookup.status === "missing" && <span className="text-gray-300">—</span>}
                        {lookup.status === "conflict" && (
                          <div className="space-y-0.5">
                            {lookup.values.map((v, i) => (
                              <p key={i} className="text-xs text-red-600">
                                <span className="font-medium">{v.currency} {formatWon(v.value)}</span>
                                {" — "}
                                {MA_FINANCIAL_SOURCE_LABEL[v.source] ?? "출처 불명"}
                                {v.sourceName ? ` · ${v.sourceName}` : ""}
                              </p>
                            ))}
                            <p className="text-[10px] text-red-500 font-medium">⚠ 모순 — 값을 임의로 선택하지 않았습니다</p>
                          </div>
                        )}
                        {lookup.status === "ok" && (
                          <div>
                            <p className="font-medium">{formatWon(lookup.value)}</p>
                            <p className="text-xs text-gray-400">
                              {MA_FINANCIAL_SOURCE_LABEL[lookup.source as MaFinancialSourceType] ?? "출처 불명"}
                              {lookup.sourceName ? ` · ${lookup.sourceName}` : ""}
                            </p>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
