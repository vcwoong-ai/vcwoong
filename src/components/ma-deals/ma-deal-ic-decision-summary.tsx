import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { PE_IC_PROCESS_STATE_LABEL } from "@/lib/pe/ma-deal-labels";
import type { PEICProcessState } from "@/lib/pe/pe-ic-decision-types";

const STATE_VARIANT: Record<PEICProcessState, StatusTone> = {
  READY_FOR_IC: "positive",
  PARTIALLY_READY: "info",
  NOT_READY: "neutral",
  BLOCKED: "critical",
};

/**
 * IC Decision 결론(PR #108) — 오직 프로세스 언어만 쓴다. BUY/PASS/투자
 * 점수/추천 등급은 절대 만들지 않는다(§0/§Step8 "process language only").
 * `processState`는 buildPEDecisionReadiness()의 overall을 그대로 옮긴
 * 값이고(pe-ic-decision.ts 참고), `processStateReasons`도 엔진이 이미
 * 계산한 blockers/missingInformation/domain reason을 템플릿으로 조합한
 * 것뿐이다 — 새 판단이 아니다.
 */
export function MaDealIcDecisionSummary({
  processState,
  reasons,
}: {
  processState: PEICProcessState;
  reasons: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">IC 의사결정 요약</CardTitle>
          <StatusBadge tone={STATE_VARIANT[processState]}>{PE_IC_PROCESS_STATE_LABEL[processState]}</StatusBadge>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {reasons.map((r, i) => (
            <li key={i} className="text-sm text-gray-600">
              {r}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
