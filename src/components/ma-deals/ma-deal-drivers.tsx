import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PEInvestmentDriver } from "@/lib/pe/pe-ic-decision-types";

/**
 * Key Investment Drivers(PR #108) — `pe-ic-drivers.ts`가 SUPPORTED thesis
 * item만 승격한 결과를 그대로 나열한다. "강한 시장 성장" 같은 일반적인
 * 문구를 이 컴포넌트가 스스로 만들지 않는다 — 데이터가 없으면 빈 상태를
 * 그대로 보여준다(§5).
 */
export function MaDealDrivers({ drivers }: { drivers: PEInvestmentDriver[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Key Investment Drivers</CardTitle>
      </CardHeader>
      <CardContent>
        {drivers.length === 0 ? (
          <p className="text-sm text-gray-400">근거로 뒷받침되는 driver가 아직 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {drivers.map((d) => (
              <li key={d.id} className="border rounded-md px-3 py-2 text-sm space-y-1">
                <p className="font-medium">{d.title}</p>
                <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-gray-400">
                  <span>근거 {d.evidenceIds.length}건</span>
                  {d.financialRelevance && <Badge variant="outline" className="text-[10px]">{d.financialRelevance}</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
