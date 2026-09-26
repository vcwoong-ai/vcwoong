"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyCostPoint } from "@/lib/usage-cost-report";

// deal-score-radar.tsx와 동일한 브랜드 블루(shadcn --primary와 대응) —
// 새 팔레트를 만들지 않고 기존 차트와 통일한다.
const COLOR = "#2563EB";

function formatUsd(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function CostTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-white px-3 py-2 text-xs shadow-sm dark:bg-gray-900">
      <p className="font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="font-semibold text-gray-900 dark:text-gray-100">
        {formatUsd(payload[0].value)}
      </p>
    </div>
  );
}

export function DailyCostChart({ data }: { data: DailyCostPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-8 text-center">
        선택한 기간에 비용 정보가 있는 호출이 없습니다.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="currentColor" className="text-gray-100 dark:text-gray-800" />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => d.slice(5)}
          tick={{ fontSize: 11, fill: "currentColor" }}
          className="text-gray-400"
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatUsd}
          tick={{ fontSize: 11, fill: "currentColor" }}
          className="text-gray-400"
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip content={<CostTooltip />} cursor={{ fill: "rgba(37,99,235,0.06)" }} />
        <Bar dataKey="cost" fill={COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
