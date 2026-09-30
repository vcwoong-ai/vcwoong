import * as React from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  MinusCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * VC 근거 상태와 PE 준비 상태가 함께 쓰는 상태 표시.
 *
 * 색만으로 의미를 전달하지 않는다 — 아이콘과 텍스트를 항상 같이 그려서
 * 색각 이상 사용자, 흑백 인쇄, 저대비 화면에서도 상태가 구분된다.
 * 도메인별 의미(예: VC의 VERIFIED, PE의 READY)를 tone으로 옮기는 일은 각
 * 도메인 코드가 하고, 이 컴포넌트는 표시만 담당한다(새 판정 로직 없음).
 */
export type StatusTone = "positive" | "info" | "caution" | "neutral" | "critical";

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  positive: "border-state-positive-line bg-state-positive-bg text-state-positive",
  info: "border-state-info-line bg-state-info-bg text-state-info",
  caution: "border-state-caution-line bg-state-caution-bg text-state-caution",
  neutral: "border-state-neutral-line bg-state-neutral-bg text-state-neutral",
  critical: "border-state-critical-line bg-state-critical-bg text-state-critical",
};

const TONE_ICON: Record<StatusTone, LucideIcon> = {
  positive: CheckCircle2,
  info: CircleDot,
  caution: AlertTriangle,
  neutral: MinusCircle,
  critical: AlertOctagon,
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone;
  /** 기본 아이콘 대신 쓸 아이콘. false면 아이콘 없음(텍스트만) */
  icon?: LucideIcon | false;
}

export function StatusBadge({ tone, icon, className, children, ...props }: StatusBadgeProps) {
  const Icon = icon === false ? null : icon ?? TONE_ICON[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium leading-4 whitespace-nowrap",
        STATUS_TONE_CLASS[tone],
        className
      )}
      data-tone={tone}
      {...props}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {children}
    </span>
  );
}
