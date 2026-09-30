import { HelpCircle, type LucideIcon } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { VC_EVIDENCE_STATE_LABEL, type VCEvidenceState, type VCDecisionImpact, type VCPriority } from "@/lib/vc-decision-types";

/**
 * VC 근거 상태 → 표시 톤. 판정은 canonical 엔진이 이미 끝냈고, 여기서는 그
 * 결과를 색·아이콘·텍스트로 옮기기만 한다(새 판정 로직 없음).
 */
export const VC_EVIDENCE_TONE: Record<VCEvidenceState, StatusTone> = {
  VERIFIED: "positive",
  PARTIALLY_VERIFIED: "info",
  UNVERIFIED: "caution",
  MISSING: "neutral",
  CONTRADICTED: "critical",
};

const VC_EVIDENCE_ICON: Partial<Record<VCEvidenceState, LucideIcon>> = {
  UNVERIFIED: HelpCircle,
};

export function EvidenceStateBadge({ state, className }: { state: VCEvidenceState; className?: string }) {
  return (
    <StatusBadge tone={VC_EVIDENCE_TONE[state]} icon={VC_EVIDENCE_ICON[state]} className={className}>
      {VC_EVIDENCE_STATE_LABEL[state]}
    </StatusBadge>
  );
}

export const VC_PRIORITY_TONE: Record<VCPriority, StatusTone> = {
  P0: "critical",
  P1: "caution",
  P2: "neutral",
};

export const VC_IMPACT_TONE: Record<VCDecisionImpact, StatusTone> = {
  CRITICAL: "critical",
  HIGH: "caution",
  MEDIUM: "info",
  LOW: "neutral",
};

export const VC_IMPACT_LABEL: Record<VCDecisionImpact, string> = {
  CRITICAL: "결정 좌우",
  HIGH: "영향 큼",
  MEDIUM: "영향 보통",
  LOW: "영향 작음",
};
