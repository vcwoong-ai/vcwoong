import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import { PE_DECISION_DOMAIN_LABEL } from "@/lib/pe/ma-deal-labels";
import type { PEDecisionReadiness } from "@/lib/pe/pe-decision-readiness";

/**
 * pe-decision-readiness.ts의 missingInformation(PR #103, 수정 없음)을 그대로
 * 나열한다 — 여기서 새로운 "확인 필요" 항목을 만들지 않는다. engine이 넘긴
 * label/reason만 표시하고, severity로 시각적 우선순위만 나눈다(판단 자체는
 * 이미 engine이 끝냈음).
 */
export function MaDealMissingInfo({ readiness }: { readiness: PEDecisionReadiness }) {
  if (readiness.missingInformation.length === 0) return null;

  const material = readiness.missingInformation.filter((i) => i.severity === "MATERIAL");
  const informational = readiness.missingInformation.filter((i) => i.severity === "INFORMATIONAL");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">확인 필요 정보</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {material.length > 0 && (
          <ul className="space-y-2">
            {material.map((item) => (
              <li key={item.code} className="flex items-start gap-2 text-sm text-gray-700">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  <Badge variant="outline" className="text-[10px] mr-1.5 align-middle">
                    {PE_DECISION_DOMAIN_LABEL[item.domain]}
                  </Badge>
                  {item.reason}
                </span>
              </li>
            ))}
          </ul>
        )}
        {informational.length > 0 && (
          <ul className="space-y-1.5 border-t pt-3">
            {informational.map((item) => (
              <li key={item.code} className="flex items-start gap-2 text-xs text-gray-500">
                <AlertCircle className="w-3.5 h-3.5 text-gray-300 shrink-0 mt-0.5" />
                <span>
                  <span className="text-gray-400">[{PE_DECISION_DOMAIN_LABEL[item.domain]}]</span> {item.reason}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
