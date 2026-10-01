import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReadinessBadge } from "./readiness-badge";
import { AlertTriangle } from "lucide-react";
import { PE_DECISION_DOMAIN_LABEL } from "@/lib/pe/ma-deal-labels";
import { MANDATORY_DOMAINS, type PEDecisionReadiness } from "@/lib/pe/pe-decision-readiness";
import { presentBlockerDetail, presentBlockerLabel } from "@/lib/pe/blocker-display";

/**
 * pe-decision-readiness.ts의 buildPEDecisionReadiness() 결과(PR #103, 수정
 * 없음)를 그대로 렌더링한다 — 이 컴포넌트는 상태를 재판정하지 않는다.
 * "좋은/나쁜 투자"가 아니라 "데이터 검증 준비 상태"만 보여준다(투자 추천
 * 문구 없음).
 */
export function MaDealReadiness({
  readiness,
  variant = "full",
}: {
  readiness: PEDecisionReadiness;
  /** compact: 영역별 상태만(차단 요인은 개요 상단 패널이 이미 보여준다 — 같은 내용을 반복하지 않는다) */
  variant?: "full" | "compact";
}) {
  if (variant === "compact") {
    return (
      <Card data-testid="pe-readiness-compact">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">영역별 준비 상태</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {readiness.domains.map((domain) => (
              <li key={domain.domain} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {PE_DECISION_DOMAIN_LABEL[domain.domain]}
                    {!MANDATORY_DOMAINS.includes(domain.domain) && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">(정보성)</span>
                    )}
                  </span>
                  <ReadinessBadge state={domain.status} className="shrink-0" />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{domain.reason}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Decision Readiness(검증 준비 상태)</CardTitle>
          <ReadinessBadge state={readiness.overall} />
        </div>
        <p className="text-xs text-gray-500">{readiness.summary}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {readiness.domains.map((domain) => (
            <div key={domain.domain} className="border rounded-md px-3 py-2 text-sm space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1">
                  {PE_DECISION_DOMAIN_LABEL[domain.domain]}
                  {!MANDATORY_DOMAINS.includes(domain.domain) && (
                    <span className="text-xs text-gray-400">(정보성)</span>
                  )}
                </span>
                <ReadinessBadge state={domain.status} className="shrink-0" />
              </div>
              <p className="text-xs text-gray-500">{domain.reason}</p>
            </div>
          ))}
        </div>

        {readiness.blockers.length > 0 && (
          <div className="border border-red-200 bg-red-50 rounded-md p-3 space-y-2">
            <p className="text-xs font-medium text-red-700 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              차단 요인(모순 확인 필요 — 값을 임의로 선택하지 않았습니다)
            </p>
            <ul className="space-y-1.5">
              {readiness.blockers.map((b) => (
                <li key={b.code} className="text-xs text-red-700">
                  <span className="font-medium">[{PE_DECISION_DOMAIN_LABEL[b.domain]}] {presentBlockerLabel(b.label)}</span>
                  <span className="text-red-600"> — {presentBlockerDetail(b.detail)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
