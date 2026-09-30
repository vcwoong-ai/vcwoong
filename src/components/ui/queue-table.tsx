import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * 검토 대기열 — VC 딜 목록 · PE 딜 목록 · 대시보드가 같이 쓰는 표형 목록.
 *
 * 카드 그리드는 딜이 늘수록 "어느 딜부터 봐야 하는가"를 읽기 어렵다. 이 표는
 * 한 줄이 한 딜이고, 열은 "무엇이 막혀 있는가 → 다음에 무엇을 하는가"를 따라간다.
 * 넓은 화면에서는 열 정렬 표, 좁은 화면에서는 항목이 세로로 쌓이는 카드로
 * 바뀐다(가로 스크롤로 정보를 숨기지 않는다). 숫자는 tabular-nums.
 *
 * 열 너비는 호출자가 `columns`(CSS grid-template-columns)로 정한다 — 이 파일은
 * 도메인 의미(VC 판단·PE 준비 상태)를 전혀 모른다.
 */

interface QueueTableProps extends React.HTMLAttributes<HTMLDivElement> {
  /** lg 이상에서 쓰는 grid-template-columns 값. 예: "minmax(0,2fr) minmax(0,1.4fr) auto" */
  columns: string;
  /** 접근성 이름 */
  label: string;
}

const QueueContext = React.createContext<string>("");

export function QueueTable({ columns, label, className, children, ...props }: QueueTableProps) {
  return (
    <QueueContext.Provider value={columns}>
      <div
        role="table"
        aria-label={label}
        className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}
        {...props}
      >
        {children}
      </div>
    </QueueContext.Provider>
  );
}

export function QueueHeader({ children }: { children: React.ReactNode }) {
  const columns = React.useContext(QueueContext);
  return (
    <div
      role="row"
      className="hidden border-b border-border bg-muted/60 px-4 py-2.5 text-xs font-medium text-muted-foreground lg:grid lg:items-center lg:gap-x-6"
      style={{ gridTemplateColumns: columns }}
    >
      {children}
    </div>
  );
}

export function QueueHeaderCell({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div role="columnheader" className={className}>
      {children}
    </div>
  );
}

interface QueueRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 행 전체가 이동하는 링크가 아니라, 행 안의 명시적 링크/버튼으로만 이동한다(키보드 초점 순서를 단순하게). */
  highlight?: boolean;
}

export function QueueRow({ highlight, className, children, ...props }: QueueRowProps) {
  const columns = React.useContext(QueueContext);
  return (
    <div
      role="row"
      className={cn(
        "grid gap-x-6 gap-y-3 border-b border-border px-4 py-4 last:border-b-0 lg:items-start",
        highlight && "bg-state-caution-bg/40",
        className
      )}
      style={{ ["--queue-columns" as string]: columns } as React.CSSProperties}
      {...props}
    >
      <div className="contents lg:grid lg:items-start lg:gap-x-6 lg:[grid-column:1/-1] lg:[grid-template-columns:var(--queue-columns)]">
        {children}
      </div>
    </div>
  );
}

interface QueueCellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 좁은 화면에서만 보이는 항목명(넓은 화면은 열 머리글이 대신한다) */
  mobileLabel?: string;
}

export function QueueCell({ mobileLabel, className, children, ...props }: QueueCellProps) {
  return (
    <div role="cell" className={cn("min-w-0", className)} {...props}>
      {mobileLabel && (
        <p className="mb-1 text-xs font-medium text-muted-foreground lg:hidden">{mobileLabel}</p>
      )}
      {children}
    </div>
  );
}
