import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { AlertTriangle } from "lucide-react";
import { PE_THESIS_BREAKER_STATE_LABEL } from "@/lib/pe/ma-deal-labels";
import type { PEThesisBreaker, PEThesisBreakerState } from "@/lib/pe/pe-ic-decision-types";

const STATE_VARIANT: Record<PEThesisBreakerState, StatusTone> = {
  OPEN: "critical",
  MITIGATED: "info",
  ACCEPTED: "neutral",
  CANNOT_BE_ESTABLISHED: "neutral",
};

/**
 * Thesis Breakers / Key Risks(PR #108) — 일반 리스크 목록이 아니다. 전부
 * 실제 DD finding, 상충하는 thesis, 또는 "지금은 확인할 방법이 없다"는
 * 정직한 상태(CANNOT_BE_ESTABLISHED)에서만 온다(pe-ic-breakers.ts 참고).
 * 숫자를 추정해서 보여주지 않는다.
 */
export function MaDealThesisBreakers({ breakers }: { breakers: PEThesisBreaker[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">논지 훼손 요인 · 주요 리스크</CardTitle>
      </CardHeader>
      <CardContent>
        {breakers.length === 0 ? (
          <p className="text-sm text-muted-foreground">현재 등록된 논지 훼손 요인이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {breakers.map((b) => (
              <li key={b.id} className="border rounded-md px-3 py-2 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-medium flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    {b.condition}
                  </p>
                  <StatusBadge tone={STATE_VARIANT[b.currentState]} className="shrink-0">
                    {PE_THESIS_BREAKER_STATE_LABEL[b.currentState]}
                  </StatusBadge>
                </div>
                <p className="text-xs text-gray-500">{b.whyItMatters}</p>
                <p className="text-xs text-gray-400">검증 필요: {b.verificationRequired}</p>
                <p className="text-xs text-gray-400">영향: {b.decisionImpact}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
