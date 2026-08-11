"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";

interface PortfolioMetrics {
  totalInvested: number;
  unrealizedValue: number;
  realizedValue: number;
  totalValue: number;
  moic: number;
  dpi: number;
  rvpi: number;
  tvpi: number;
  companyCount: number;
}

interface WaterfallTier {
  label: string;
  lpAmount: number;
  gpAmount: number;
}

interface ExitScenarioResult {
  exitMultiple: number;
  yearsFromNow: number;
  moic: number;
  xirr: number | null;
  totalValue: number;
}

interface ImpairmentRow {
  companyName: string;
  investAmount: number;
  impairmentRatio: number;
}

interface AnalyticsData {
  metrics: PortfolioMetrics;
  xirr: number | null;
  impairment: {
    rows: ImpairmentRow[];
    fundImpairmentRatio: number;
    atRiskCount: number;
  };
  waterfall: {
    input: { distributable: number; paidIn: number; hurdleRate: number; carryPercent: number; years: number };
    result: { tiers: WaterfallTier[]; totalLp: number; totalGp: number; effectiveCarryPercent: number };
  };
  sensitivity: ExitScenarioResult[];
}

function pct(n: number | null): string {
  if (n === null) return "계산 불가";
  return `${(n * 100).toFixed(1)}%`;
}

export function FundAnalyticsClient({
  fundId,
  fundName,
}: {
  fundId: string;
  fundName: string;
}) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hurdleRate, setHurdleRate] = useState("8");
  const [carryPercent, setCarryPercent] = useState("20");
  const [distributable, setDistributable] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    params.set("hurdleRate", hurdleRate || "8");
    params.set("carryPercent", carryPercent || "20");
    if (distributable) params.set("distributable", distributable);

    setLoading(true);
    fetch(`/api/funds/${fundId}/analytics?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "조회 실패");
        return r.json();
      })
      .then((json) => {
        setData(json.data);
        setError(null);
        if (!distributable) setDistributable(String(json.data.waterfall.input.distributable));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 슬라이더성 입력은 매 타이핑마다 API를 부르면 낭비이므로 살짝 늦춰서 호출한다
  const recompute = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 350);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-12">
        <Loader2 className="w-4 h-4 animate-spin" />
        분석 중...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-4">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { metrics, xirr, impairment, waterfall, sensitivity } = data;
  const years = Array.from(new Set(sensitivity.map((s) => s.yearsFromNow)));
  const multiples = Array.from(new Set(sensitivity.map((s) => s.exitMultiple)));

  return (
    <div className="space-y-6">
      <Link
        href="/lp-report"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        LP 리포팅으로
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">{fundName} — 운용 심화 분석</h1>
        <p className="text-sm text-gray-500 mt-1">
          XIRR·워터폴·회수 시뮬레이션·자본잠식. 미실현 포지션은 오늘 시점에 현재
          평가가치로 청산했다고 가정해 계산합니다(업계 표준 관행이며 실제 회수를
          뜻하지 않습니다).
        </p>
      </div>

      {/* 핵심 지표 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-gray-400">펀드 XIRR</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{pct(xirr)}</p>
            <p className="text-[11px] text-gray-400 mt-1">시점 반영 연환산 수익률</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-gray-400">MOIC</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{metrics.moic.toFixed(2)}x</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-gray-400">TVPI</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{metrics.tvpi.toFixed(2)}x</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-gray-400">자본잠식(가중평균)</p>
            <p
              className={`text-2xl font-bold mt-1 ${
                impairment.fundImpairmentRatio > 30 ? "text-red-600" : "text-gray-900"
              }`}
            >
              {impairment.fundImpairmentRatio}%
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              위험 등급 {impairment.atRiskCount}개사
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 워터폴 시뮬레이터 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">워터폴 분배 시뮬레이터</CardTitle>
          <p className="text-xs text-gray-400">
            유럽식 4단계(자본반환 → 우선수익 → GP캐치업 → 잔여배분) 단순 모델입니다.
            납입 시점별 이력이 없어 총 납입액 기준으로 계산합니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">분배 가능 총액 (억원)</Label>
              <Input
                type="number"
                value={distributable}
                onChange={(e) => {
                  setDistributable(e.target.value);
                  recompute();
                }}
              />
            </div>
            <div>
              <Label className="text-xs">우선수익률(하들, 연 %)</Label>
              <Input
                type="number"
                value={hurdleRate}
                onChange={(e) => {
                  setHurdleRate(e.target.value);
                  recompute();
                }}
              />
            </div>
            <div>
              <Label className="text-xs">캐리(%)</Label>
              <Input
                type="number"
                value={carryPercent}
                onChange={(e) => {
                  setCarryPercent(e.target.value);
                  recompute();
                }}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500 text-xs">
                  <th className="text-left py-2">단계</th>
                  <th className="text-right py-2">LP</th>
                  <th className="text-right py-2">GP</th>
                </tr>
              </thead>
              <tbody>
                {waterfall.result.tiers.map((t) => (
                  <tr key={t.label} className="border-b border-gray-50">
                    <td className="py-2 text-gray-700">{t.label}</td>
                    <td className="py-2 text-right">{t.lpAmount.toLocaleString()}억</td>
                    <td className="py-2 text-right">{t.gpAmount.toLocaleString()}억</td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-2">합계</td>
                  <td className="py-2 text-right">{waterfall.result.totalLp.toLocaleString()}억</td>
                  <td className="py-2 text-right">{waterfall.result.totalGp.toLocaleString()}억</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">
            실효 캐리율: <span className="font-medium">{waterfall.result.effectiveCarryPercent}%</span>
            {" "}(목표 {carryPercent}%) · 하들 누적 기간 {waterfall.input.years}년
          </p>
        </CardContent>
      </Card>

      {/* 민감도 분석 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">회수 시나리오 민감도</CardTitle>
          <p className="text-xs text-gray-400">
            보유 중인 포지션에만 배수를 적용합니다(이미 회수된 포지션은 실제 값 유지).
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500 text-xs">
                  <th className="text-left py-2">회수 배수 \ 시점</th>
                  {years.map((y) => (
                    <th key={y} className="text-right py-2">
                      {y}년 뒤
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {multiples.map((m) => (
                  <tr key={m} className="border-b border-gray-50">
                    <td className="py-2 text-gray-700">{m}x</td>
                    {years.map((y) => {
                      const cell = sensitivity.find(
                        (s) => s.exitMultiple === m && s.yearsFromNow === y
                      );
                      return (
                        <td key={y} className="py-2 text-right">
                          {cell ? (
                            <>
                              <span className="font-medium">{cell.moic.toFixed(2)}x</span>
                              <span className="text-gray-400 text-xs ml-1">
                                ({pct(cell.xirr)})
                              </span>
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 자본잠식 상세 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">회사별 자본잠식 위험</CardTitle>
          <p className="text-xs text-gray-400">
            투자원금 대비 가치 하락 비율(VC 관점 근사 지표 — 회계상 자본잠식률과 다릅니다)
          </p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {impairment.rows.map((r) => (
              <li key={r.companyName} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  {r.impairmentRatio >= 50 && (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  )}
                  {r.companyName}
                </span>
                <Badge
                  variant="outline"
                  className={
                    r.impairmentRatio >= 50
                      ? "bg-red-50 text-red-700 border-red-200"
                      : r.impairmentRatio > 0
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-green-50 text-green-700 border-green-200"
                  }
                >
                  {r.impairmentRatio}%
                </Badge>
              </li>
            ))}
            {impairment.rows.length === 0 && (
              <p className="text-sm text-gray-400">등록된 포트폴리오사가 없습니다</p>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
