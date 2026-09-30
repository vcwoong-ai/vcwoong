import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { READINESS_STATE_LABEL } from "@/lib/pe/ma-deal-labels";
import type { ReadinessState } from "@/lib/pe/pe-decision-readiness";

/**
 * PE 준비 상태 → 표시 톤. 판정은 buildPEDecisionReadiness()가 이미 끝냈고 여기서는
 * VC 근거 상태와 같은 시각 언어(색+아이콘+텍스트)로 옮기기만 한다. READY가 파란
 * 채움 버튼처럼 보이던 문제(상태가 아니라 액션처럼 읽힘)를 없앤다.
 */
export const READINESS_TONE: Record<ReadinessState, StatusTone> = {
  READY: "positive",
  PARTIAL: "info",
  MISSING: "caution",
  NOT_STARTED: "neutral",
  BLOCKED: "critical",
};

/** 좁은 칸(딜 카드의 4분할 등)용 짧은 라벨 — 전체 라벨은 상세 화면에서 그대로 쓴다. */
const READINESS_SHORT_LABEL: Record<ReadinessState, string> = {
  READY: "준비됨",
  PARTIAL: "부분 준비",
  MISSING: "정보 없음",
  NOT_STARTED: "시작 전",
  BLOCKED: "차단됨",
};

export function ReadinessBadge({ state, compact = false, className }: { state: ReadinessState; compact?: boolean; className?: string }) {
  return (
    <StatusBadge tone={READINESS_TONE[state]} className={className} data-readiness={state}>
      {compact ? READINESS_SHORT_LABEL[state] : READINESS_STATE_LABEL[state]}
    </StatusBadge>
  );
}
