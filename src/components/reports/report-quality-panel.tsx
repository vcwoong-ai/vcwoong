"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";

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
}

export function ReportQualityPanel({
  reportId,
  refreshKey = 0,
}: {
  reportId: string;
  /** 섹션 재생성 후 증가시켜 품질 점수를 다시 불러온다 */
  refreshKey?: number;
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
        <Badge variant="secondary">{data.overallScore}/100</Badge>
      </div>

      {data.suggestions[0] && (
        <p className="text-sm mt-2 opacity-90">{data.suggestions[0]}</p>
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
        {data.sections.map((s) => (
          <div
            key={s.sectionKey}
            className="rounded bg-white/60 px-2 py-1 text-[11px] text-center"
            title={[...s.issues, ...s.warnings].join(" · ") || "OK"}
          >
            <div className="truncate opacity-70">{s.sectionKey}</div>
            <div className="font-semibold">{s.score}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
