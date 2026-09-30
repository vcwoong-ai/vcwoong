import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { PE_DD_CATEGORY_LABEL, PE_DD_SEVERITY_LABEL, PE_DD_FINDING_STATUS_LABEL } from "@/lib/pe/ma-deal-labels";
import type { PEDDFinding, PEDDSeverity } from "@/lib/pe/dd-types";

const SEVERITY_VARIANT: Record<PEDDSeverity, StatusTone> = {
  CRITICAL: "critical",
  HIGH: "critical",
  MEDIUM: "info",
  LOW: "neutral",
  INFO: "neutral",
};

/**
 * DD/Key Findings(PR #107) — PR #105가 영속화한 PEDDFinding을 그대로
 * 나열한다. lifecycle을 여기서 바꾸지 않는다(자동 확정/완화/종결 없음) —
 * status/severity는 저장된 값을 라벨만 붙여 보여준다.
 */
export function MaDealDdFindings({ findings }: { findings: PEDDFinding[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">DD 주요 findings</CardTitle>
      </CardHeader>
      <CardContent>
        {findings.length === 0 ? (
          <p className="text-sm text-gray-400">기록된 DD finding이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {findings.map((f) => (
              <li key={f.id} className="border rounded-md px-3 py-2 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-medium">{f.title}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {PE_DD_CATEGORY_LABEL[f.category]}
                    </Badge>
                    <StatusBadge tone={SEVERITY_VARIANT[f.severity]}>
                      {PE_DD_SEVERITY_LABEL[f.severity]}
                    </StatusBadge>
                    <Badge variant="secondary" className="text-xs">
                      {PE_DD_FINDING_STATUS_LABEL[f.status]}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-gray-500">{f.description}</p>
                <p className="text-xs text-gray-400">
                  연결된 근거 {f.evidenceIds.length}건
                  {f.claimIds.length > 0 && ` · claim ${f.claimIds.length}건`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
