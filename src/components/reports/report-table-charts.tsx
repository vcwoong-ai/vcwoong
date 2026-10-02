"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { analyzeReportTables } from "@/lib/report-table-series";

export function ReportTableCharts({ content }: { content: string }) {
  const { series, skipped } = analyzeReportTables(content);
  if (!series.length && !skipped) return null;
  return <div className="my-4 min-w-0 space-y-3">
    {skipped > 0 && <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
      <summary className="cursor-pointer font-medium">일부 표는 원본으로 확인하세요 · 그래프 표시 기준</summary>
      <p className="mt-2 leading-relaxed">그래프에는 연도 또는 FY 상대기간 열, 각 지표의 단위(예: 매출 (억원)), 숫자 값 2개 이상이 필요합니다. 추정 연도(E)·단위 미기재·텍스트 비교표는 원본을 유지합니다. 아래 본문에서 확인하고, 수정이 필요하면 해당 섹션의 편집을 이용하세요. 보고서를 다시 생성할 필요는 없습니다.</p>
    </details>}
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
    {series.map((item, index) => <figure key={`${item.label}-${index}`} className="min-w-0 rounded-xl border bg-slate-50 p-3">
      <figcaption className="text-xs font-semibold">{item.label}</figcaption>
      {item.relativePeriods && <p className="mt-1 text-[11px] text-muted-foreground">원문 상대기간 · FY의 기준연도를 추정하지 않았습니다.</p>}
      <div className="mt-2 h-44 w-full min-w-0" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={item.points} margin={{ top: 12, right: 15, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="period" tick={{ fontSize: 10 }} />
            <YAxis width={48} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(value) => [typeof value === "number" ? `${value.toLocaleString("ko-KR")} ${item.unit}` : "미확인", item.label]} />
            <Line type="linear" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">본문 표의 기재값 · 추정·미확인 표기는 공백으로 유지합니다. 원문과 근거 패널을 함께 확인하세요.</p>
      <dl className="sr-only">{item.points.map(point => <div key={point.period}><dt>{point.period}</dt><dd>{point.value === null ? "미확인" : `${point.value} ${item.unit}`}</dd></div>)}</dl>
    </figure>)}
    </div>
  </div>;
}
