"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft } from "lucide-react";
import { SCORE_DIMENSIONS, scoreLabel } from "@/lib/deal-scoring-shared";

interface DealScore {
  overall: number;
  marketSize: number;
  team: number;
  product: number;
  businessModel: number;
  financials: number;
  moat: number;
}

interface CompareRow {
  id: string;
  companyName: string;
  score: DealScore | null;
}

const COLORS = ["#2563EB", "#DC2626", "#16A34A", "#D97706", "#7C3AED"];

function buildRadarData(rows: CompareRow[]) {
  return SCORE_DIMENSIONS.map((d) => {
    const point: Record<string, string | number> = { dimension: d.label };
    rows.forEach((r) => {
      point[r.companyName] = r.score ? r.score[d.key] : 0;
    });
    return point;
  });
}

function CompareContent() {
  const searchParams = useSearchParams();
  const idsKey = (searchParams.get("ids") ?? "").split(",").filter(Boolean).join(",");
  const [rows, setRows] = useState<CompareRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setError(null);
    setRows(null);
    if (!idsKey) {
      setRows([]);
      return () => { active = false; controller.abort(); };
    }
    const loadComparison = async () => {
      try {
        const response = await fetch(`/api/deals/score/compare?ids=${encodeURIComponent(idsKey)}`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!active || controller.signal.aborted) return;
        if (!response.ok) {
          setError(response.status === 401 ? "로그인이 만료되었습니다. 다시 로그인한 뒤 비교를 확인하세요."
            : response.status === 403 ? "선택한 딜을 비교할 권한이 없습니다."
            : "비교 데이터를 불러오지 못했습니다. 다시 조회해 주세요.");
          return;
        }
        const json = await response.json();
        if (!active || controller.signal.aborted) return;
        if (!Array.isArray(json.data) || !json.data.every((row: CompareRow | null) =>
          row && typeof row.id === "string" && typeof row.companyName === "string" &&
          (row.score === null || (typeof row.score === "object" && row.score &&
            Number.isFinite(row.score.overall) && SCORE_DIMENSIONS.every(dimension =>
              Number.isFinite(row.score![dimension.key])))))) throw new Error("Comparison unavailable");
        setRows(json.data);
      } catch {
        if (active && !controller.signal.aborted) setError("비교 데이터를 불러오지 못했습니다. 다시 조회해 주세요.");
      }
    };
    void loadComparison();
    return () => { active = false; controller.abort(); };
  }, [idsKey, retryVersion]);

  if (error) {
    return <div role="alert" data-testid="deal-compare-error" className="space-y-3 text-sm">
      <p className="text-red-600">{error}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setRetryVersion(value => value + 1)}>비교 다시 조회</Button>
        <Link href="/deals" className="underline">딜 목록으로</Link>
      </div>
    </div>;
  }

  if (!rows) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-8">
        <Loader2 className="w-4 h-4 animate-spin" />
        불러오는 중...
      </div>
    );
  }

  const scored = rows.filter((r) => r.score);
  const unscored = rows.filter((r) => !r.score);

  return (
    <div className="space-y-6">
      <Link
        href="/deals"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="w-3.5 h-3.5" />딜 목록으로
      </Link>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">
          비교할 딜을 선택하지 않았습니다. 딜 목록에서 카드 우측 상단 &lsquo;비교&rsquo;
          체크박스로 2개 이상 선택해주세요.
        </p>
      ) : (
        <>
          {unscored.length > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              {unscored.map((r) => r.companyName).join(", ")}은(는) 아직 점수가 없어
              레이더에서 제외됩니다. 각 딜 상세의 &lsquo;투자 매력도&rsquo; 탭에서 먼저
              계산해주세요.
            </p>
          )}

          {scored.length >= 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">투자 매력도 비교</CardTitle>
                <div className="flex flex-wrap gap-2 pt-1">
                  {scored.map((r, i) => (
                    <Badge
                      key={r.id}
                      variant="outline"
                      style={{ borderColor: COLORS[i], color: COLORS[i] }}
                    >
                      {r.companyName} · {r.score!.overall}점 (
                      {scoreLabel(r.score!.overall).label})
                    </Badge>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <div style={{ height: 380 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={buildRadarData(scored)} outerRadius="70%">
                      <PolarGrid />
                      <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12 }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                      {scored.map((r, i) => (
                        <Radar
                          key={r.id}
                          name={r.companyName}
                          dataKey={r.companyName}
                          stroke={COLORS[i]}
                          fill={COLORS[i]}
                          fillOpacity={0.15}
                        />
                      ))}
                      <Legend />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export function DealsCompareClient() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-sm text-gray-400 py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          불러오는 중...
        </div>
      }
    >
      <CompareContent />
    </Suspense>
  );
}
