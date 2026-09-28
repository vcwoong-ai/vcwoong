import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalcValue, formatWon } from "./financial-value";
import type { QoESummaryView } from "@/lib/pe/ma-deal-dashboard";

export function MaDealQoeSummary({
  qoe,
  onOpenFinancials,
}: {
  qoe: QoESummaryView | null;
  onOpenFinancials: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">QoE(수익의 질)</CardTitle>
        <Button variant="ghost" size="sm" onClick={onOpenFinancials}>
          재무 · QoE 탭 열기
        </Button>
      </CardHeader>
      <CardContent>
        {!qoe ? (
          <p className="text-sm text-gray-400">등록된 재무 데이터가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400">Reported EBITDA</p>
                <CalcValue result={qoe.reportedEbitda} />
              </div>
              <div>
                <p className="text-xs text-gray-400">Adjusted EBITDA(승인된 조정만 반영)</p>
                <CalcValue result={qoe.adjustedEbitda} />
              </div>
              <div>
                <p className="text-xs text-gray-400">승인된 조정 합계</p>
                <span className={qoe.approvedAdjustmentTotal >= 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                  {qoe.approvedAdjustmentTotal >= 0 ? "+" : ""}
                  {formatWon(qoe.approvedAdjustmentTotal)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-gray-400">조정 {qoe.counts.total}건</span>
              {qoe.counts.approved > 0 && <Badge variant="outline">승인 {qoe.counts.approved}</Badge>}
              {qoe.counts.proposed > 0 && <Badge variant="outline">제안 {qoe.counts.proposed}</Badge>}
              {qoe.counts.draft > 0 && <Badge variant="outline">초안 {qoe.counts.draft}</Badge>}
              {qoe.counts.rejected > 0 && <Badge variant="outline">반려 {qoe.counts.rejected}</Badge>}
              {qoe.counts.total === 0 && <span className="text-amber-600">아직 QoE 조정 검토가 이뤄지지 않았습니다</span>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
