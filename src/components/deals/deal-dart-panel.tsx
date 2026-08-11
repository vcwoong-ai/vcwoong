"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Landmark, ExternalLink } from "lucide-react";

interface DartFinancials {
  year: string;
  revenue: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
}

interface DartDisclosure {
  title: string;
  date: string;
  url: string;
}

interface DartData {
  found: boolean;
  corpName?: string;
  stockCode?: string;
  financials: DartFinancials[];
  disclosures: DartDisclosure[];
}

function formatWon(n: number | null): string {
  if (n === null) return "확인 필요";
  return `${(n / 100_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}억원`;
}

function formatDate(d: string): string {
  if (d.length !== 8) return d;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

export function DealDartPanel({ dealId }: { dealId: string }) {
  const [data, setData] = useState<DartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/deals/${dealId}/dart`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "조회 실패");
        return r.json();
      })
      .then((json) => {
        if (!cancelled) setData(json.data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "조회 실패");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        DART 전자공시 조회 중...
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
        {error}
      </p>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="w-4 h-4" />
          DART 전자공시
        </CardTitle>
        <p className="text-xs text-gray-400">
          금융감독원 전자공시시스템(DART) 조회 결과. 비상장 기업은 공시 의무가
          없어 조회돼도 데이터가 없는 게 정상입니다 — 없음이 오류를 뜻하지
          않습니다.
        </p>
      </CardHeader>
      <CardContent>
        {!data.found ? (
          <p className="text-sm text-gray-400">
            DART에 등록된 법인을 찾지 못했습니다 (비상장이거나 공시 대상이
            아닐 가능성이 높습니다).
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              매칭된 법인: <span className="font-medium">{data.corpName}</span>
              {data.stockCode && (
                <span className="text-gray-400 ml-1">(종목코드 {data.stockCode})</span>
              )}
            </p>

            {data.financials.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-gray-500 text-xs">
                      <th className="text-left py-2">사업연도</th>
                      <th className="text-right py-2">매출액</th>
                      <th className="text-right py-2">영업이익</th>
                      <th className="text-right py-2">순이익</th>
                      <th className="text-right py-2">자산총계</th>
                      <th className="text-right py-2">자본총계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.financials.map((f) => (
                      <tr key={f.year} className="border-b border-gray-50">
                        <td className="py-2">{f.year}</td>
                        <td className="py-2 text-right">{formatWon(f.revenue)}</td>
                        <td className="py-2 text-right">{formatWon(f.operatingProfit)}</td>
                        <td className="py-2 text-right">{formatWon(f.netIncome)}</td>
                        <td className="py-2 text-right">{formatWon(f.totalAssets)}</td>
                        <td className="py-2 text-right">{formatWon(f.totalEquity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400">공시된 재무제표를 찾지 못했습니다.</p>
            )}

            {data.disclosures.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1.5">최근 공시</p>
                <ul className="space-y-1">
                  {data.disclosures.map((d) => (
                    <li key={d.url} className="text-sm">
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline inline-flex items-center gap-1"
                      >
                        {d.title}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <span className="text-gray-400 ml-2">{formatDate(d.date)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
