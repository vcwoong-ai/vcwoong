import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { CalcValue, CalcPercent, CalcMultiple } from "./financial-value";
import type { FinancialQualityView } from "@/lib/pe/ma-deal-dashboard";

/**
 * PR #112 — `conflictCount`는 새 계산이 아니다: 호출자가 이미 계산해 둔
 * `readiness.factConflicts.length`(buildPEDecisionReadiness(), 수정 없음)를
 * 그대로 옮겨 받을 뿐이다. 이 카드가 지금까지 이 값을 몰랐다는 게 문제였다
 * — 재무 데이터에 모순이 있어 Decision Readiness가 BLOCKED여도, 이 카드는
 * findLineItem()이 조용히 골라온 값을 아무 경고 없이 보여주고 있었다
 * (재무 · QoE 탭의 MaDealFinancialDataQuality는 이미 이 경고를 보여주고
 * 있었지만, 위원회 자료 탭의 이 카드만 빠져 있었다).
 */
export function MaDealFinancialSummary({ quality, conflictCount = 0 }: { quality: FinancialQualityView; conflictCount?: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">핵심 재무 지표</CardTitle>
        {quality.latestPeriodLabel && (
          <p className="text-xs text-gray-400">{quality.latestPeriodLabel} 기준</p>
        )}
        {conflictCount > 0 && (
          <Callout tone="critical" className="mt-2" data-testid="pe-financial-conflict-callout">
            아래 수치는 서로 다른 출처 간 모순 {conflictCount}건이 있는 상태에서 계산된 값입니다 — 데이터룸에서 확인 필요
          </Callout>
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
