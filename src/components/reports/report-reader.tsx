"use client";

import { useEffect, useState } from "react";
import type { ReportPresentation } from "@/lib/report-presentation";
import { ReportBrief } from "./report-brief";
import { ReportContext } from "./report-context";
import { Markdown } from "@/components/ui/markdown";
import { Button } from "@/components/ui/button";

export function ReportReader({ reportId, dealId, refreshKey, sections }: { reportId: string; dealId: string; refreshKey: number;
  sections: Array<{ id: string; title: string; content: string; order: number }> }) {
  const [presentation, setPresentation] = useState<ReportPresentation | null>(null);
  const [error, setError] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setPresentation(null); setError(false);
    (async () => {
      try {
        const response = await fetch(`/api/reports/${reportId}/decision`, { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok || !result.data?.presentation) throw new Error("unavailable");
        if (!controller.signal.aborted) setPresentation(result.data.presentation);
      } catch { if (!controller.signal.aborted) setError(true); }
    })();
    return () => controller.abort();
  }, [reportId, refreshKey, retry]);
  return <div className="space-y-8 rounded-xl border border-slate-200 bg-white p-5 sm:p-8">
    <div className="flex justify-end"><Button variant="outline" size="sm" disabled={!presentation && !error} onClick={() => setRetry(value => value + 1)}>근거 새로고침</Button></div>
    {error ? <div role="alert"><p>투자 요약을 불러오지 못했습니다. 상세 본문은 아래에서 읽을 수 있습니다.</p>
      <Button variant="outline" className="mt-3" onClick={() => setRetry(value => value + 1)}>요약 다시 불러오기</Button></div>
      : presentation ? <ReportBrief presentation={presentation} /> : <p role="status" className="text-sm text-slate-600">투자 요약을 준비하고 있습니다…</p>}
    {presentation?.context && <ReportContext context={presentation.context} dealId={dealId} />}
    {presentation && <details className="border-t border-slate-200 pt-5">
      <summary className="cursor-pointer font-semibold text-slate-800 focus-visible:outline-blue-600">전체 판단 근거 · 상충 정보와 미확인 사항</summary>
      <div className="mt-6 space-y-7">{presentation.sections.filter(section => section.title !== "한눈에 보는 투자 요약"
        && !presentation.charts.some(chart => chart.title === section.title)).map(section => <section key={section.title}>
        <h3 className="mb-3 font-semibold">{section.title}</h3><Markdown content={section.content} />
      </section>)}</div>
    </details>}
    <details id="report-detail" className="border-t border-slate-200 pt-5">
      <summary className="cursor-pointer font-semibold text-slate-800 focus-visible:outline-blue-600">상세 분석 부록 · 원문 전체 {sections.length}개 섹션</summary>
      <div className="mt-6 space-y-8">{[...sections].sort((a, b) => a.order - b.order).map(section => <section key={section.id}>
        <h3 className="mb-3 font-semibold">{section.title}</h3><Markdown content={section.content} />
      </section>)}</div>
    </details>
  </div>;
}
