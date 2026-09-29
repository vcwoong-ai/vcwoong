import * as React from "react";
import { cn } from "@/lib/utils";

/** 핵심 수치 한 칸 — 라벨은 작게, 값은 크게, 숫자는 자릿수 폭을 고정한다. */
export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold leading-6 text-slate-900 tabular-nums break-keep">{value}</dd>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
