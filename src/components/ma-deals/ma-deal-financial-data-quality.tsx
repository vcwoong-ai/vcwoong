import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import type { FinancialDataQuality } from "@/lib/pe/pe-financials-view-model";
import type { PEFinancialFactConflict } from "@/lib/pe/pe-decision-readiness";
import { formatWonAsEok, presentBlockerLabel } from "@/lib/pe/blocker-display";
import { MA_FINANCIAL_SOURCE_LABEL } from "@/lib/pe/ma-deal-labels";
import type { MaFinancialSourceType } from "@prisma/client";

/**
 * Financials 탭 상단 데이터 품질 요약(PR #106). computeFinancialDataQuality()
 * (순수 집계, 새 재무 계산 없음)와 buildPEDecisionReadiness()가 이미 계산한
 * factConflicts(PR #103, 수정 없음)를 그대로 표시할 뿐이다 — 새
 * contradiction engine을 만들지 않는다.
 */
export function MaDealFinancialDataQuality({
  quality,
  conflicts,
}: {
  quality: FinancialDataQuality;
  conflicts: PEFinancialFactConflict[];
}) {
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">재무 데이터 품질</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">등록된 기간</p>
            <p className="font-medium">{quality.periodsCount}개</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">핵심 계정(최근 기간)</p>
            <p className="font-medium">
              {quality.accountsPresent}/{quality.accountsTotal}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">DART 출처</p>
            <p className="font-medium">{quality.dartSourcedCount}건</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">수기 입력</p>
            <p className="font-medium">{quality.manualSourcedCount}건</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">누락된 핵심 계정</p>
            <p className={quality.missingCount > 0 ? "font-medium text-state-caution" : "font-medium"}>
              {quality.missingCount}개
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">모순(Conflict)</p>
            <p className={quality.conflictsCount > 0 ? "font-medium text-state-critical" : "font-medium"}>
              {quality.conflictsCount}건
            </p>
          </div>
        </CardContent>
      </Card>

      {conflicts.length > 0 && (
        <div className="rounded-lg border border-state-critical-line bg-state-critical-bg p-4" data-testid="pe-fact-conflicts">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-state-critical">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            같은 재무기간에 값이 서로 다른 계정이 있습니다 — 값을 임의로 선택하지 않았습니다
          </p>
          <ul className="mt-2 space-y-2">
            {conflicts.map((c) => (
              <li key={`${c.financialPeriodId}-${c.metric}`} className="text-sm text-foreground">
                <span className="font-medium">{presentBlockerLabel(c.metric)}</span>
                <span className="text-muted-foreground"> ({c.currency})</span>
                <ul className="mt-1 space-y-0.5 pl-3">
                  {c.conflictingValues.map((v) => (
                    <li key={v.lineItemId} className="tabular-nums">
                      {c.currency === "KRW" ? formatWonAsEok(v.value) : v.value.toLocaleString("ko-KR")}
                      <span className="text-muted-foreground">
                        {" "}
                        — 출처: {MA_FINANCIAL_SOURCE_LABEL[v.source as MaFinancialSourceType] ?? v.source}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-muted-foreground">
                  원문 대조로 정본 확인 전에는 이 계정을 QoE·LBO의 근거로 쓰지 마십시오.
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
