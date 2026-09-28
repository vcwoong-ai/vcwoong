import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalcValue, CalcPercent, CalcMultiple } from "./financial-value";
import type { FinancialQualityView } from "@/lib/pe/ma-deal-dashboard";

export function MaDealFinancialSummary({ quality }: { quality: FinancialQualityView }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">핵심 재무 지표</CardTitle>
        {quality.latestPeriodLabel && (
          <p className="text-xs text-gray-400">{quality.latestPeriodLabel} 기준</p>
        )}
      </CardHeader>
      <CardContent>
        {!quality.latestPeriodLabel ? (
          <p className="text-sm text-gray-400">등록된 재무 데이터가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400">매출액</p>
              <CalcValue result={quality.revenue} />
            </div>
            <div>
              <p className="text-xs text-gray-400">매출 성장률(YoY)</p>
              <CalcPercent result={quality.revenueGrowth} />
            </div>
            <div>
              <p className="text-xs text-gray-400">EBITDA</p>
              <CalcValue result={quality.ebitda} />
            </div>
            <div>
              <p className="text-xs text-gray-400">EBITDA 마진</p>
              <CalcPercent result={quality.ebitdaMargin} />
            </div>
            <div>
              <p className="text-xs text-gray-400">순차입금</p>
              <CalcValue result={quality.netDebt} />
            </div>
            <div>
              <p className="text-xs text-gray-400">순차입금/EBITDA</p>
              <CalcMultiple result={quality.netDebtToEbitda} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
