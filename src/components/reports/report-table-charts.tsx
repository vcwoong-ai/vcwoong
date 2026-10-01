"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { reportTableSeries } from "@/lib/report-table-series";

export function ReportTableCharts({ content }: { content: string }) {
  const series = reportTableSeries(content);
  if (!series.length) return null;
  return <div className="my-4 grid min-w-0 gap-4 sm:grid-cols-2">
    {series.map((item, index) => <figure key={`${item.label}-${index}`} className="min-w-0 rounded-xl border bg-slate-50 p-3">
      <figcaption className="text-xs font-semibold">{item.label}</figcaption>
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
  </div>;
}
