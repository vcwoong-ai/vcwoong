import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { READINESS_STATE_LABEL } from "@/lib/pe/ma-deal-labels";
import type { ReadinessRow, ReadinessState } from "@/lib/pe/ma-deal-dashboard";

const STATE_VARIANT: Record<ReadinessState, "default" | "secondary" | "destructive" | "outline"> = {
  READY: "default",
  PARTIAL: "secondary",
  MISSING: "destructive",
  NOT_STARTED: "outline",
};

const DD_ROW_KEYS = new Set([
  "commercial-dd", "operational-dd", "legal-dd", "tax-dd", "hr-dd",
  "technology-dd", "it-security-dd", "regulatory-dd", "esg-dd", "management-dd",
]);

export function MaDealReadiness({ rows }: { rows: ReadinessRow[] }) {
  const coreRows = rows.filter((r) => !DD_ROW_KEYS.has(r.key));
  const ddRows = rows.filter((r) => DD_ROW_KEYS.has(r.key));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">의사결정 준비도</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {coreRows.map((row) => (
            <div key={row.key} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
              <span>{row.label}</span>
              <Badge variant={STATE_VARIANT[row.state]} className="text-xs">
                {READINESS_STATE_LABEL[row.state]}
              </Badge>
            </div>
          ))}
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-2">
            실사(DD) — 아직 문서 업로드·적재 파이프라인이 연결되지 않아 전부 시작 전입니다.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {ddRows.map((row) => (
              <div key={row.key} className="flex items-center justify-between border rounded-md px-2 py-1.5 text-xs">
                <span className="text-gray-500">{row.label}</span>
                <Badge variant={STATE_VARIANT[row.state]} className="text-xs">
                  {READINESS_STATE_LABEL[row.state]}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
