"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SECTION_META } from "@/types";
import { Loader2, Globe, RefreshCw, CheckCircle2, XCircle, HelpCircle } from "lucide-react";

type Verdict = "지지" | "불일치" | "불명확";

interface VerifiedClaim {
  sectionKey: string;
  claim: string;
  verdict: Verdict;
  rationale: string;
  sources: Array<{ title: string; url: string; source: "news" | "web" }>;
}

interface DeepDiveData {
  claims: VerifiedClaim[];
  modelUsed: string;
  computedAt: string;
}

const VERDICT_META: Record<
  Verdict,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  지지: {
    label: "지지",
    className: "bg-green-50 text-green-700 border-green-200",
    icon: CheckCircle2,
  },
  불일치: {
    label: "불일치",
    className: "bg-red-50 text-red-700 border-red-200",
    icon: XCircle,
  },
  불명확: {
    label: "불명확",
    className: "bg-gray-50 text-gray-600 border-gray-200",
    icon: HelpCircle,
  },
};

const sectionTitle = (key: string) =>
  SECTION_META.find((s) => s.key === key)?.title ?? key;

export function ReportDeepDivePanel({
  reportId,
  canEdit,
}: {
  reportId: string;
  canEdit: boolean;
}) {
  const [data, setData] = useState<DeepDiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/deep-dive`);
      if (res.ok) {
        const { data } = await res.json();
        setData(data);
      }
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/deep-dive`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "딥다이브 검증 실패");
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "딥다이브 검증 실패");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        딥다이브 결과 불러오는 중...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 font-medium text-gray-900">
          <Globe className="w-4 h-4" />
          딥다이브 검증
        </div>
        {data && (
          <Badge variant="secondary">{data.claims.length}건 검증</Badge>
        )}
      </div>

      <p className="text-xs text-gray-500 mt-2 leading-relaxed">
        evidence.ts(근거 추적)와 방향이 반대입니다 — 그건 보고서 숫자가 업로드
        자료 &ldquo;안&rdquo;에 있는지 대조하고, 이건 시장 규모·성장률·시장 지위 같은
        핵심 주장을 뉴스·웹 자료로 &ldquo;밖&rdquo;에서 교차 검증합니다.
      </p>

      {error && (
        <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {error}
        </p>
      )}

      {data && data.claims.length > 0 ? (
        <>
          <ul className="mt-3 space-y-2">
            {data.claims.map((c, i) => {
              const meta = VERDICT_META[c.verdict];
              const Icon = meta.icon;
              return (
                <li
                  key={`${c.sectionKey}-${i}`}
                  className="rounded border border-gray-100 bg-gray-50/60 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <span className="text-sm text-gray-900">{c.claim}</span>
                      <span className="ml-2 text-[11px] text-gray-400">
                        {sectionTitle(c.sectionKey)}
                      </span>
                    </div>
                    <span
                      className={`flex items-center gap-1 text-[11px] rounded border px-1.5 py-0.5 shrink-0 ${meta.className}`}
                    >
                      <Icon className="w-3 h-3" />
                      {meta.label}
                    </span>
                  </div>
                  {c.rationale && (
                    <p className="mt-1 text-[11px] text-gray-500">{c.rationale}</p>
                  )}
                  {c.sources.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                      {c.sources.map((s, si) => (
                        <li key={si}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-blue-600 hover:underline truncate max-w-[220px] inline-block align-bottom"
                          >
                            {s.source === "news" ? "📰" : "🔗"} {s.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-gray-400">
            {new Date(data.computedAt).toLocaleString("ko-KR")} 검증 · {data.modelUsed}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-gray-400">
          {data ? "검증할 만한 핵심 주장을 찾지 못했습니다." : "아직 실행하지 않았습니다."}
        </p>
      )}

      {canEdit && (
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={run}
          disabled={running}
        >
          {running ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          )}
          {data ? "다시 검증" : "딥다이브 검증 실행"}
        </Button>
      )}
    </div>
  );
}
