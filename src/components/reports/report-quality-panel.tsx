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
  improvingSectionKey = null,
}: {
  reportId: string;
  /** 섹션 재생성 후 증가시켜 품질 점수를 다시 불러온다 */
  refreshKey?: number;
  /** 낮은 점수 섹션 클릭 시 품질 이슈를 넣어 재생성 */
  onImproveSection?: (sectionKey: string, qualityIssues: string[]) => void;
  /** 약한 섹션 일괄 개선 */
  onBatchImprove?: () => void;
  batchImproving?: boolean;
  /** 현재 재생성 중인 섹션 키 (타일 로딩 표시용) */
  improvingSectionKey?: string | null;
}) {
  const [data, setData] = useState<QualitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/reports/${reportId}/quality`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`품질 점수를 불러오지 못했습니다 (${r.status})`);
        return r.json();
      })
      .then((res) => {
        if (!cancelled) setData(res.data ?? null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setData(null);
        setError(e instanceof Error ? e.message : "품질 점수 조회 실패");
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

  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const scoreColor =
    data.overallScore >= 75 ? "#16a34a" : data.overallScore >= 55 ? "#d97706" : "#dc2626";
  const tone =
    data.overallScore >= 75
      ? "bg-green-50 text-green-800 border-green-200"
      : data.overallScore >= 55
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-red-50 text-red-800 border-red-200";
  const scoreLabel =
    data.overallScore >= 75 ? "우수" : data.overallScore >= 55 ? "보통" : "미흡";

  // 원형 게이지 — 점수를 숫자만이 아니라 한눈에 채워진 정도로도 보여준다
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - data.overallScore / 100);

  return (
    <div className={`rounded-xl border p-5 ${tone}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 flex-shrink-0">
            <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
              <circle cx="40" cy="40" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="7" />
              <circle
                cx="40"
                cy="40"
                r={radius}
                fill="none"
                stroke={scoreColor}
                strokeWidth="7"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.5s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold" style={{ color: scoreColor }}>
                {data.overallScore}
              </span>
              <span className="text-[10px] opacity-60">/100</span>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="w-4 h-4" />
              자동 품질 점수
              <Badge variant="secondary">{scoreLabel}</Badge>
            </div>
            {data.suggestions[0] && (
              <p className="text-sm mt-1.5 opacity-90 max-w-md">{data.suggestions[0]}</p>
            )}
          </div>
        </div>
        {onBatchImprove && (
          <button
            type="button"
            onClick={onBatchImprove}
            disabled={batchImproving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-current/20 bg-white/60 px-3 py-1.5 text-xs font-medium hover:bg-white disabled:opacity-50 flex-shrink-0"
          >
            {batchImproving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            약한 섹션 일괄 개선
          </button>
        )}
      </div>

      {data.factConsistency && data.factConsistency.checked > 0 && (
        <p className="text-xs mt-3 opacity-80">
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

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
        {data.sections.map((s) => {
          const issues = [...s.issues, ...s.warnings];
          const weak = s.score < 70;
          const improving = improvingSectionKey === s.sectionKey;
          const clickable =
            Boolean(onImproveSection) && weak && !improvingSectionKey;
          const cellColor = s.score >= 75 ? "#16a34a" : s.score >= 55 ? "#d97706" : "#dc2626";
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
              className={`rounded-lg px-2.5 py-2 text-center transition border-l-2 ${
                clickable
                  ? "bg-white/85 hover:bg-white cursor-pointer ring-1 ring-black/5"
                  : "bg-white/70 cursor-default"
              }`}
              style={{ borderLeftColor: cellColor }}
              title={
                clickable
                  ? `클릭하여 개선 재생성: ${issues.join(" · ") || "품질 개선"}`
                  : issues.join(" · ") || "OK"
              }
            >
              <div className="truncate opacity-70 flex items-center justify-center gap-1 text-[11px]">
                {improving ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  clickable && <RefreshCw className="w-2.5 h-2.5" />
                )}
                {s.sectionKey}
              </div>
              <div className="font-semibold text-sm" style={{ color: cellColor }}>
                {improving ? "재생성 중" : s.score}
              </div>
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
