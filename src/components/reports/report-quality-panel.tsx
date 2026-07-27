"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, AlertTriangle, RefreshCw } from "lucide-react";

interface QualitySummary {
  overallScore: number;
  sections: Array<{
    sectionKey: string;
    score: number;
    issues: string[];
    warnings: string[];
  }>;
  criticalIssues: string[];
  suggestions: string[];
  factConsistency?: {
    checked: number;
    matched: number;
    missing: string[];
  };
}

export function ReportQualityPanel({
  reportId,
  refreshKey = 0,
  onImproveSection,
  onBatchImprove,
  batchImproving = false,
}: {
  reportId: string;
  /** 섹션 재생성 후 증가시켜 품질 점수를 다시 불러온다 */
  refreshKey?: number;
  /** 낮은 점수 섹션 클릭 시 품질 이슈를 넣어 재생성 */
  onImproveSection?: (sectionKey: string, qualityIssues: string[]) => void;
  /** 약한 섹션 일괄 개선 */
  onBatchImprove?: () => void;
  batchImproving?: boolean;
}) {
  const [data, setData] = useState<QualitySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/reports/${reportId}/quality`)
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        품질 점수 계산 중...
      </div>
    );
  }

  if (!data) return null;

  const tone =
    data.overallScore >= 75
      ? "bg-green-50 text-green-800 border-green-200"
      : data.overallScore >= 55
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-red-50 text-red-800 border-red-200";

  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-medium">
          <ShieldCheck className="w-4 h-4" />
          자동 품질 점수
        </div>
        <div className="flex items-center gap-2">
          {onBatchImprove && (
            <button
              type="button"
              onClick={onBatchImprove}
              disabled={batchImproving}
              className="inline-flex items-center gap-1 rounded border border-current/20 bg-white/50 px-2 py-1 text-[11px] font-medium hover:bg-white/80 disabled:opacity-50"
            >
              {batchImproving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              약한 섹션 일괄 개선
            </button>
          )}
          <Badge variant="secondary">{data.overallScore}/100</Badge>
        </div>
      </div>

      {data.suggestions[0] && (
        <p className="text-sm mt-2 opacity-90">{data.suggestions[0]}</p>
      )}

      {data.factConsistency && data.factConsistency.checked > 0 && (
        <p className="text-xs mt-2 opacity-80">
          공유 팩트 일치: {data.factConsistency.matched}/
          {data.factConsistency.checked}
          {data.factConsistency.missing[0]
            ? ` · 누락 예: ${data.factConsistency.missing[0]}`
            : ""}
        </p>
      )}

      {data.criticalIssues.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {data.criticalIssues.slice(0, 4).map((issue) => (
            <li key={issue} className="flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {issue}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-1.5">
        {data.sections.map((s) => {
          const issues = [...s.issues, ...s.warnings];
          const weak = s.score < 70;
          const clickable = Boolean(onImproveSection) && weak;
          return (
            <button
              key={s.sectionKey}
              type="button"
              disabled={!clickable}
              onClick={() => {
                if (!clickable) return;
                onImproveSection?.(
                  s.sectionKey,
                  issues.length
                    ? issues
                    : ["본문 품질을 높이고 출처·수치를 보강하세요"]
                );
              }}
              className={`rounded px-2 py-1 text-[11px] text-center transition ${
                clickable
                  ? "bg-white/80 hover:bg-white cursor-pointer ring-1 ring-black/5"
                  : "bg-white/60 cursor-default"
              }`}
              title={
                clickable
                  ? `클릭하여 개선 재생성: ${issues.join(" · ") || "품질 개선"}`
                  : issues.join(" · ") || "OK"
              }
            >
              <div className="truncate opacity-70 flex items-center justify-center gap-0.5">
                {clickable && <RefreshCw className="w-2.5 h-2.5" />}
                {s.sectionKey}
              </div>
              <div className="font-semibold">{s.score}</div>
            </button>
          );
        })}
      </div>
      {onImproveSection && (
        <p className="text-[11px] mt-2 opacity-70">
          점수 70 미만 섹션을 클릭하면 해당 이슈를 반영해 재생성합니다.
        </p>
      )}
    </div>
  );
}
