import * as React from "react";
import { cn } from "@/lib/utils";
import { STATUS_TONE_CLASS, type StatusTone } from "./status-badge";

/**
 * 결정에 영향을 주는 경고/안내 블록. 화면마다 amber/red 박스를 따로 만들던
 * 것을 하나로 합친다. critical/caution은 스크린리더에 즉시 알린다(role=alert).
 */
export function Callout({
  tone,
  title,
  className,
  children,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, "title"> & { tone: StatusTone; title?: React.ReactNode }) {
  return (
    <div
      role={tone === "critical" || tone === "caution" ? "alert" : "note"}
      className={cn("rounded-md border border-l-[3px] px-3.5 py-2.5 text-sm leading-relaxed", STATUS_TONE_CLASS[tone], className)}
      {...props}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-0.5")}>{children}</div>}
    </div>
  );
}
