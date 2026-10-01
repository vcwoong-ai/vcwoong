/**
 * PE 딜 목록(검토 대기열)용 표시 규칙 — canonical readiness 요약에서 "다음에 어디를 열어야 하는가"만 고른다.
 *
 * `MaDealListReadinessSummary`(buildPEDecisionReadiness()의 결과를 배치로 모은 것)를 읽기만 한다.
 * 새 상태나 점수를 만들지 않고, VC 점수와 합치지도 않는다. 우선순위 규칙은
 * "차단(BLOCKED) → 필수 영역(재무·QoE·LBO)의 미비 → DD → 검토 진행" 순서이며,
 * 각 규칙은 요약에 이미 들어 있는 도메인 상태 하나만 본다.
 */
import type { MaDealListReadinessSummary } from "./ma-deal-list-readiness";
import type { PEDecisionReadiness, ReadinessState } from "./pe-decision-readiness";

/** ma-deals/[id] 상세 화면의 탭 값(ma-deal-detail-client.tsx의 TabsTrigger value와 같아야 한다) */
export const MA_DEAL_TAB_VALUES = [
  "overview",
  "ic-review",
  "ic-decision",
  "ic-review-workflow",
  "committee-pack",
  "data-room",
  "financials",
  "dart",
  "lbo",
] as const;
export type MaDealTab = (typeof MA_DEAL_TAB_VALUES)[number];

export function isMaDealTab(value: string | null | undefined): value is MaDealTab {
  return !!value && (MA_DEAL_TAB_VALUES as readonly string[]).includes(value);
}

export interface PeNextAction {
  label: string;
  tab: MaDealTab;
}

const NEEDS_INPUT: ReadinessState[] = ["NOT_STARTED", "MISSING", "PARTIAL"];

/** 다음 행동을 고르는 데 필요한 최소 입력 — 목록 요약과 상세 화면의 readiness가 같은 규칙을 쓰도록 공통 모양으로 둔다. */
export type PeNextActionInput = Pick<
  MaDealListReadinessSummary,
  "overall" | "blockerCount" | "topBlockerLabel" | "topBlockerDomain" | "financial" | "qoe" | "lbo" | "dd"
>;

/** 상세 화면의 canonical readiness(buildPEDecisionReadiness 결과)를 위 입력 모양으로 옮긴다 — 값은 그대로, 새 판정 없음. */
export function readinessToNextActionInput(r: PEDecisionReadiness): PeNextActionInput {
  const status = (domain: string): ReadinessState => r.domains.find((d) => d.domain === domain)?.status ?? "NOT_STARTED";
  return {
    overall: r.overall,
    blockerCount: r.blockers.length,
    topBlockerLabel: r.blockers[0]?.label ?? null,
    topBlockerDomain: r.blockers[0]?.domain ?? null,
    financial: status("FINANCIAL"),
    qoe: status("QOE"),
    lbo: status("LBO"),
    dd: status("DD"),
  };
}

/** 차단 요인이 어느 도메인 탭에서 풀리는가 — 재무·QoE는 재무 탭, LBO는 LBO 탭, DD·근거는 데이터룸 */
export function tabForDomain(domain: string): MaDealTab {
  if (domain === "FINANCIAL" || domain === "QOE" || domain === "DART") return domain === "DART" ? "dart" : "financials";
  if (domain === "LBO") return "lbo";
  if (domain === "DD" || domain === "EVIDENCE" || domain === "COMMERCIAL") return "data-room";
  return "overview";
}

export function pickPeNextAction(s: PeNextActionInput): PeNextAction {
  if (s.overall === "BLOCKED" || s.blockerCount > 0) {
    return {
      label: s.topBlockerLabel ? `차단 요인 해소: ${s.topBlockerLabel}` : `차단 요인 ${s.blockerCount}건 해소`,
      tab: s.topBlockerDomain ? tabForDomain(s.topBlockerDomain) : s.financial === "BLOCKED" ? "financials" : "overview",
    };
  }
  if (NEEDS_INPUT.includes(s.financial)) return { label: "재무 기간·계정 입력", tab: "financials" };
  if (NEEDS_INPUT.includes(s.qoe)) return { label: "QoE 조정 검토", tab: "financials" };
  if (NEEDS_INPUT.includes(s.lbo)) return { label: "LBO 진입 가정 입력", tab: "lbo" };
  if (NEEDS_INPUT.includes(s.dd)) return { label: "실사(DD) 이슈 기록", tab: "data-room" };
  return { label: "IC 검토 진행", tab: "ic-review" };
}

const URGENCY_RANK: Record<ReadinessState, number> = {
  BLOCKED: 4,
  MISSING: 3,
  PARTIAL: 3,
  NOT_STARTED: 2,
  READY: 1,
};

/** 큰 값일수록 먼저 봐야 한다 — 차단이 가장 앞, 그 안에서는 차단 요인이 많은 딜. 요약이 없으면 가장 뒤. */
export function peQueueUrgencyScore(s: MaDealListReadinessSummary | undefined): number {
  if (!s) return -1;
  return URGENCY_RANK[s.overall] * 100 + Math.min(s.blockerCount, 99);
}
