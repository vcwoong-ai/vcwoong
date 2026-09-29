import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PE_THESIS_STATUS_LABEL } from "@/lib/pe/ma-deal-labels";
import type { PEThesisItem, PEThesisStatus } from "@/lib/pe/pe-ic-decision-types";

const STATUS_VARIANT: Record<PEThesisStatus, "default" | "secondary" | "destructive" | "outline"> = {
  SUPPORTED: "default",
  PARTIALLY_SUPPORTED: "secondary",
  UNSUPPORTED: "outline",
  CONTRADICTED: "destructive",
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
        <CardTitle className="text-base">Investment Thesis</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-gray-400">아직 등록된 investment thesis claim이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((t) => (
              <li key={t.id} className="border rounded-md px-3 py-2 text-sm space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant={STATUS_VARIANT[t.status]} className="text-[10px]">
                    {PE_THESIS_STATUS_LABEL[t.status]}
                  </Badge>
                  {t.materiality === "MATERIAL" && (
                    <Badge variant="outline" className="text-[10px]">
                      Material
                    </Badge>
                  )}
                </div>
                <p>{t.statement}</p>
                <p className="text-[11px] text-gray-400">근거 {t.supportingEvidenceIds.length}건</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
