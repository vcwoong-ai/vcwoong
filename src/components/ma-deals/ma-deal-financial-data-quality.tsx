import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import type { FinancialDataQuality } from "@/lib/pe/pe-financials-view-model";
import type { PEFinancialFactConflict } from "@/lib/pe/pe-decision-readiness";

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
            <p className="text-xs text-gray-400">등록된 기간</p>
            <p className="font-medium">{quality.periodsCount}개</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">핵심 계정(최근 기간)</p>
            <p className="font-medium">
              {quality.accountsPresent}/{quality.accountsTotal}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">DART 출처</p>
            <p className="font-medium">{quality.dartSourcedCount}건</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">수기 입력</p>
            <p className="font-medium">{quality.manualSourcedCount}건</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">누락된 핵심 계정</p>
            <p className={quality.missingCount > 0 ? "font-medium text-amber-600" : "font-medium"}>
              {quality.missingCount}개
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">모순(Conflict)</p>
            <p className={quality.conflictsCount > 0 ? "font-medium text-red-600" : "font-medium"}>
              {quality.conflictsCount}건
            </p>
          </div>
        </CardContent>
      </Card>

      {conflicts.length > 0 && (
        <div className="border border-red-200 bg-red-50 rounded-md p-3 space-y-2">
          <p className="text-xs font-medium text-red-700 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Financial conflict detected — 값을 임의로 선택하지 않았습니다
          </p>
          <ul className="space-y-1.5">
            {conflicts.map((c) => (
              <li key={`${c.financialPeriodId}-${c.metric}`} className="text-xs text-red-700">
                <span className="font-medium">{c.metric}</span> ({c.currency}):{" "}
                {c.conflictingValues.map((v) => v.value.toLocaleString()).join(" vs ")} — 확인 필요
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
