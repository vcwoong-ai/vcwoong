import * as React from "react";
import { cn } from "@/lib/utils";

/** 분석 화면의 구획 제목 — eyebrow(분류) / 제목 / 설명 / 우측 액션. */
export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  as: Heading = "h2",
  className,
  id,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  as?: "h2" | "h3" | "h4";
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3 flex-wrap", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{eyebrow}</p>
        )}
        <Heading id={id} className="text-base font-semibold text-slate-900">
          {title}
        </Heading>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
