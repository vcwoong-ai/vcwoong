import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { PE_THESIS_STATUS_LABEL } from "@/lib/pe/ma-deal-labels";
import type { PEThesisItem, PEThesisStatus } from "@/lib/pe/pe-ic-decision-types";

const STATUS_VARIANT: Record<PEThesisStatus, StatusTone> = {
  SUPPORTED: "positive",
  PARTIALLY_SUPPORTED: "info",
  UNSUPPORTED: "neutral",
  CONTRADICTED: "critical",
};

/**
 * Investment Thesis(PR #108) — `ddCase.lineage.claims`(PR-F, 수정 없음)를
 * `pe-ic-thesis.ts`가 status/materiality만 결정론적으로 붙여 그대로 나열한
 * 것이다. 근거 없는 주장을 SUPPORTED로 승격하지 않는다 — UNSUPPORTED/
 * CONTRADICTED도 숨기지 않고 그대로 보여준다(§4).
 */
export function MaDealThesis({ items }: { items: PEThesisItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">투자 논지</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 등록된 투자 논지 근거(claim)가 없습니다. 실사 자료에서 근거를 등록하면 상태(뒷받침됨·상충 등)와 함께 여기에 나타납니다.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((t) => (
              <li key={t.id} className="border rounded-md px-3 py-2 text-sm space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <StatusBadge tone={STATUS_VARIANT[t.status]}>
                    {PE_THESIS_STATUS_LABEL[t.status]}
                  </StatusBadge>
                  {t.materiality === "MATERIAL" && (
                    <Badge variant="outline" className="text-xs">
                      Material
                    </Badge>
                  )}
                </div>
                <p>{t.statement}</p>
                <p className="text-xs text-gray-400">근거 {t.supportingEvidenceIds.length}건</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
