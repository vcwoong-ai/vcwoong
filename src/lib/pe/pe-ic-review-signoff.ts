/**
 * PE IC Review Sign-off — 순수 판정 로직(PR #110).
 *
 * DB를 건드리지 않는다 — 저장은 `pe-ic-review-signoff-repository.ts`가
 * 담당한다. 이 파일은 "지금 보여줄 상태가 무엇인가"와 "이 입력이
 * 구조적으로 유효한가"만 판정한다.
 */

import type { PEICReviewSignoffStatus, PEICReviewDisplayState, PEICReviewCommentTargetType } from "./pe-ic-review-signoff-types";

/**
 * §Step13 핵심 계약 — 저장된 상태가 REVIEWED인데 저장 당시의 fingerprint가
 * 지금 fingerprint와 다르면, 화면/API는 REVIEWED를 그대로 보여주지 않고
 * RE_REVIEW_REQUIRED를 보여준다. DB의 status 컬럼 자체는 건드리지
 * 않는다(리뷰어가 실제로 다시 검토해서 새 fingerprint를 저장해야만 값이
 * 바뀐다) — 이 함수는 순수 표시 판정이다.
 */
export function computeReviewDisplayState(
  status: PEICReviewSignoffStatus,
  reviewedFingerprint: string | null,
  currentFingerprint: string
): PEICReviewDisplayState {
  if (status === "REVIEWED" && reviewedFingerprint !== currentFingerprint) {
    return "RE_REVIEW_REQUIRED";
  }
  return status;
}

/**
 * 상태 전이 자체의 구조적 유효성(§Step11/§Step12). CHANGES_REQUESTED로
 * 전환하려면 반드시 코멘트가 있어야 한다 — 근거 없는 "변경 요청"으로
 * review item을 만들 수 없다(evidence-request 생성과 같은 원칙: 이유
 * 없는 액션 금지).
 */
export function collectSignoffTransitionIssues(input: { status: PEICReviewSignoffStatus; comment?: string | null }): string[] {
  const issues: string[] = [];
  if (input.status === "CHANGES_REQUESTED" && !(input.comment ?? "").trim()) {
    issues.push("comment_required_for_changes_requested");
  }
  return issues;
}

/**
 * 코멘트 대상 구조 검증(§Step10). COMMITTEE_PACK 전체 코멘트만 targetId가
 * 없어도 된다 — 나머지 셋(IC_QUESTION/REVIEW_ITEM/EVIDENCE_REQUEST)은
 * 반드시 구체적인 대상(코드/id)을 가리켜야 한다.
 */
export function collectReviewCommentIssues(input: {
  text: string;
  targetType: PEICReviewCommentTargetType;
  targetId?: string | null;
}): string[] {
  const issues: string[] = [];
  if (!input.text.trim()) issues.push("text_required");
  if (input.targetType !== "COMMITTEE_PACK" && !(input.targetId ?? "").trim()) {
    issues.push("target_id_required");
  }
  return issues;
}
