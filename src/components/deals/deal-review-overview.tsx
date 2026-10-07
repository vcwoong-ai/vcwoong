"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ReportBrief } from "@/components/reports/report-brief";
import { ReportContext } from "@/components/reports/report-context";
import { Markdown } from "@/components/ui/markdown";
import type { DecisionApiData } from "@/components/vc/decision-types";
import type { ReportPresentation } from "@/lib/report-presentation";

type ReviewData = DecisionApiData & { presentation: ReportPresentation };

/** A read-only view of the existing, access-scoped decision endpoint. */
export function DealReviewOverview({ dealId, report, documentCount, warningCount, meetingEnabled, generating,
  onNavigate }: {
  dealId: string;
  report: { id: string; title: string; createdAt: string } | null;
  documentCount: number;
  warningCount: number;
  meetingEnabled: boolean;
  generating: boolean;
  onNavigate: (tab: string) => void;
}) {
  const [result, setResult] = useState<{ reportId: string; data: ReviewData } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const reportId = report?.id ?? null;
  const data = result?.reportId === reportId ? result.data : null;

  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setError(false);
    if (reportId) {
      (async () => {
        try {
          const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/decision`, {
            signal: controller.signal, cache: "no-store",
          });
          if (!response.ok) throw new Error("unavailable");
          const json = await response.json();
          if (json.data?.deal?.id !== dealId || !json.data?.presentation) throw new Error("invalid review");
          if (!controller.signal.aborted) setResult({ reportId, data: json.data });
        } catch { if (!controller.signal.aborted) setError(true); }
      })();
    }
    return () => controller.abort();
  }, [dealId, reportId, retry]);

  return <div className="space-y-6" data-testid="deal-review-overview">
    <section className="space-y-4 rounded-xl border bg-white p-5 sm:p-6" aria-label="검토 자료와 다음 작업">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">회사 통합 검토</h2>
          <p className="mt-1 text-sm text-slate-600">자료와 판단 근거를 확인하고, 남은 쟁점부터 검토하세요.</p>
        </div>
        {report && <Button variant="outline" size="sm" disabled={!data && !error} onClick={() => setRetry(value => value + 1)}>근거 새로고침</Button>}
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div className="flex gap-2"><dt className="text-slate-600">접수 자료</dt><dd className="font-medium tabular-nums">{documentCount}건</dd></div>
        <div className="flex gap-2"><dt className="text-slate-600">추출 재확인</dt><dd className="font-medium tabular-nums">{warningCount}건</dd></div>
        <div className="flex gap-2"><dt className="text-slate-600">미팅 기록</dt><dd>{meetingEnabled ? "사용 가능" : "활성화 준비 중"}</dd></div>
      </dl>
      {warningCount > 0 && <p className="text-sm text-amber-800">내용 추출에 경고가 있는 자료입니다. 원문과 추출 결과를 먼저 대조해주세요.</p>}
      {generating && <p role="status" className="text-sm text-slate-600">보고서 생성이 진행 중입니다. 아래 근거는 기존 보고서 기준이며 새 결과가 아닙니다.</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => onNavigate("documents")}>{documentCount ? "접수 자료 확인" : "자료 업로드 화면"}</Button>
        <Button variant="outline" size="sm" onClick={() => onNavigate("dart")}>공시 조회</Button>
        {meetingEnabled && <Button variant="outline" size="sm" asChild><Link href={`/meetings/vc/${encodeURIComponent(dealId)}`}>미팅 기록 열기</Link></Button>}
        {report ? <Button variant="outline" size="sm" asChild><Link href={`/reports/${encodeURIComponent(report.id)}`}>보고서 · 리서치 · 검토 질문</Link></Button>
          : <Button variant="outline" size="sm" onClick={() => onNavigate("reports")}>보고서 목록</Button>}
      </div>
    </section>

    {!report ? <section className="space-y-2 p-1" aria-label="검토 시작">
      <h3 className="font-semibold text-slate-900">{documentCount ? "접수 자료로 검토를 시작하세요" : "회사 자료를 먼저 접수하세요"}</h3>
      <p className="text-sm text-slate-600">{documentCount ? "읽을 수 있는 보고서가 아직 없습니다. 자료를 확인한 뒤 보고서를 생성하면 투자 근거와 미확인 사항이 여기에 연결됩니다."
        : "IR과 재무 자료를 업로드하면 회사별 자료와 보고서를 함께 검토할 수 있습니다."}</p>
    </section> : <>
      <div className="flex flex-wrap gap-x-3 gap-y-1 break-words text-sm text-slate-600">
        <span>검토 기준: {report.title}</span><span>생성일 {report.createdAt.slice(0, 10)}</span>
      </div>
      {error ? <div role="alert" className="space-y-3">
        <p className="text-sm text-slate-700">검토 근거를 불러오지 못했습니다. 다시 조회하거나 보고서에서 확인해주세요.</p>
        <Button variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>다시 조회</Button>
      </div> : !data ? <p role="status" className="text-sm text-slate-600">회사 검토 근거를 불러오는 중입니다…</p> : <div className="space-y-7 rounded-xl border bg-white p-5 sm:p-6">
        <ReportBrief presentation={data.presentation} />
        {data.presentation.context && <ReportContext context={data.presentation.context} dealId={dealId} />}
        <details className="border-t border-slate-200 pt-5">
          <summary className="cursor-pointer font-semibold text-slate-900">전체 판단 근거 · 리서치와 미팅 대조</summary>
          <div className="mt-5 space-y-6">{data.presentation.sections.map((section, index) => <section key={`${section.title}-${index}`}>
            <h3 className="mb-2 font-semibold text-slate-900">{section.title}</h3><Markdown content={section.content} />
          </section>)}</div>
        </details>
      </div>}
    </>}
  </div>;
}
