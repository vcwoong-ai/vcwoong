"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ReadinessBadge } from "./readiness-badge";
import { PE_DECISION_DOMAIN_LABEL } from "@/lib/pe/ma-deal-labels";
import { presentBlockerDetail, presentBlockerLabel } from "@/lib/pe/blocker-display";
import { pickPeNextAction, readinessToNextActionInput, tabForDomain } from "@/lib/pe/ma-deal-queue";
import type { PEDecisionReadiness } from "@/lib/pe/pe-decision-readiness";

const TAB_LABEL: Record<string, string> = {
  financials: "재무 · QoE 탭",
  lbo: "LBO 탭",
  "data-room": "데이터룸 탭",
  dart: "DART 탭",
  "ic-review": "IC 검토 탭",
  overview: "개요",
};

/**
 * PE 딜 개요의 첫 블록 — "이 딜에서 지금 무엇이 막혀 있고, 어디를 열어야 하는가".
 * 값은 전부 canonical readiness(buildPEDecisionReadiness, 수정 없음)에서 온다. 차단 요인의 문구는
 * 엔진 원문을 그대로 두고 표시용으로만 다듬으며(내부 id 제거·억원 표기), 어느 탭에서 풀리는지는
 * 표시 규칙(ma-deal-queue.ts)이 고른다. 이 패널은 어떤 재무 수치도 계산하지 않는다.
 */
export function MaDealStatusPanel({
  readiness,
  meta,
  onNavigateTab,
}: {
  readiness: PEDecisionReadiness;
  /** 딜 유형·상태·재무기간 같은 한 줄 정보 */
  meta: string[];
  onNavigateTab: (tab: string) => void;
}) {
  const next = pickPeNextAction(readinessToNextActionInput(readiness));
  return (
    <Card className="p-5" data-testid="pe-status-panel" data-overall={readiness.overall}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">검토 상황</p>
          <p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-foreground" data-testid="pe-status-summary">
            {readiness.summary}
          </p>
        </div>
        <ReadinessBadge state={readiness.overall} />
      </div>

      {readiness.blockers.length > 0 && (
        <div className="mt-4 border-t border-border pt-4" data-testid="pe-status-blockers">
          <p className="text-sm font-semibold text-state-critical">
            차단 요인 {readiness.blockers.length}건 — 값을 임의로 선택하지 않았습니다
          </p>
          <ul className="mt-2 divide-y divide-border">
            {readiness.blockers.map((b) => (
              <li key={b.code} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    <span className="mr-1.5 text-xs font-normal text-muted-foreground">
                      {PE_DECISION_DOMAIN_LABEL[b.domain]}
                    </span>
                    {presentBlockerLabel(b.label)}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{presentBlockerDetail(b.detail)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 px-2 text-primary"
                  onClick={() => onNavigateTab(tabForDomain(b.domain))}
                >
                  {TAB_LABEL[tabForDomain(b.domain)] ?? "열기"}에서 확인
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-4">
        <StatusBadge tone="info" icon={false}>
          다음 행동
        </StatusBadge>
        <p className="text-sm text-foreground" data-testid="pe-status-next">
          {presentBlockerLabel(next.label)}
        </p>
        <Button variant="outline" size="sm" onClick={() => onNavigateTab(next.tab)} data-testid="pe-status-next-open">
          {TAB_LABEL[next.tab] ?? "열기"} 열기
        </Button>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">{meta.join(" · ")}</p>
    </Card>
  );
}
