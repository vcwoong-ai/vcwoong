"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Gauge } from "lucide-react";
import { SCORE_DIMENSIONS, scoreLabel, type ScoreDimensionKey } from "@/lib/deal-scoring";

interface DealScore {
  overall: number;
  marketSize: number;
  team: number;
  product: number;
  businessModel: number;
  financials: number;
  moat: number;
  rationale: Partial<Record<ScoreDimensionKey, string>>;
  modelUsed: string;
  computedAt: string;
}

const COLOR = "#2563EB";

function toRadarData(score: DealScore) {
  return SCORE_DIMENSIONS.map((d) => ({
    dimension: d.label,
    value: score[d.key],
    rationale: score.rationale?.[d.key] ?? "",
  }));
}

export function DealScoreRadar({
  dealId,
  canEdit,
}: {
  dealId: string;
  canEdit: boolean;
}) {
  const [score, setScore] = useState<DealScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/score`);
      if (res.ok) {
        const { data } = await res.json();
        setScore(data);
      }
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    load();
  }, [load]);

  const compute = async () => {
    setComputing(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/score`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "점수 계산 실패");
      setScore(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "점수 계산 실패");
    } finally {
      setComputing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        점수 불러오는 중...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 font-medium text-gray-900">
          <Gauge className="w-4 h-4" />
          투자 매력도 점수
        </div>
        {score && (
          <Badge variant="outline" className={scoreLabel(score.overall).tone}>
            {score.overall}점 · {scoreLabel(score.overall).label}
          </Badge>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-2">
        보고서 작성 품질이 아니라 투자 판단 점수입니다. AI 참고용이며 최종 판단은 심사역의 몫입니다.
      </p>

      {error && (
        <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {error}
        </p>
      )}

      {score ? (
        <>
          <div className="mt-3" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={toRadarData(score)} outerRadius="75%">
                <PolarGrid />
                <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Radar
                  name="점수"
                  dataKey="value"
                  stroke={COLOR}
                  fill={COLOR}
                  fillOpacity={0.35}
                />
                <Tooltip
                  formatter={(value, _name, props) => [
                    `${value}점 — ${props.payload?.rationale || "근거 없음"}`,
                    props.payload?.dimension,
                  ]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
            {SCORE_DIMENSIONS.map((d) => (
              <li key={d.key} className="truncate">
                <span className="text-gray-700 font-medium">{d.label}</span>{" "}
                {score[d.key]}점
                {score.rationale?.[d.key] && ` — ${score.rationale[d.key]}`}
              </li>
            ))}
          </ul>

          <p className="mt-2 text-[11px] text-gray-400">
            {new Date(score.computedAt).toLocaleString("ko-KR")} 계산 · {score.modelUsed}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-gray-400">아직 계산된 점수가 없습니다.</p>
      )}

      {canEdit && (
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={compute}
          disabled={computing}
        >
          {computing ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          )}
          {score ? "다시 계산" : "점수 계산하기"}
        </Button>
      )}
    </div>
  );
}
