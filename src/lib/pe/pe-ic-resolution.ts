/**
 * PE IC Review — Resolution 판정(PR #109).
 *
 * 이 파일은 새 판단 엔진이 아니다. "이 review item이 지금 RESOLVED인가"를
 * 결정하는 유일한 규칙은 딱 하나다: **그 review item의 근원이 된
 * canonical 조건이 지금 재계산에서도 여전히 열려 있는가**
 * (`isCurrentlyOpen` — `buildICQuestions()`의 현재 출력에 그 코드가 있는지로
 * 판단, pe-ic-review.ts가 넘겨준다). Evidence request의 상태(REQUESTED/
 * RECEIVED/UNDER_REVIEW/ACCEPTED/REJECTED)는 오직 "지금 확인 가능한
 * canonical 조건이 아직 안 풀렸을 때" review item이 어느 단계에 있는지
 * 보여주기 위한 보조 정보일 뿐, 그 자체로 RESOLVED를 만들지 않는다
 * (§4/§Step2 IMPORTANT — "RESOLVED는 클릭이 아니라 canonical 조건 충족").
 *
 * 이 규칙이 §Step17의 모든 시나리오를 만족시킨다:
 * - D(관련 문서지만 evidence 미승인): status는 최대 EVIDENCE_RECEIVED, RESOLVED 아님.
 * - E(승인됐지만 canonical 모순이 남음): isCurrentlyOpen이 여전히 true이므로
 *   RESOLVED가 될 수 없다 — ACCEPTED인데도 여전히 open이면 IN_REVIEW로
 *   내려 "검토는 끝났지만 실제 반영은 아직 안 됨"을 정직하게 드러낸다.
 * - F(승인 + canonical 모순 실제 해소): isCurrentlyOpen이 false가 되는 순간
 *   (다음 readiness 재계산에서) 자동으로 RESOLVED다 — 누가 다시 클릭할
 *   필요가 없다.
 */

import type { PEEvidenceRequestView, PEICReviewItemStatus } from "./pe-ic-review-types";

/** 이 review item에 연결된 요청 중 가장 최근(updatedAt 기준) 요청 하나만 상태
 * 판정에 쓴다 — 여러 요청이 있어도 "지금 이 항목이 어느 단계인가"는 가장
 * 최근 행동을 기준으로 본다(오래된 REJECTED 요청 하나가 최근 ACCEPTED
 * 요청을 가려버리지 않도록). */
function latestRequest(requests: PEEvidenceRequestView[]): PEEvidenceRequestView | undefined {
  if (requests.length === 0) return undefined;
  return [...requests].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
}

export function evaluatePEICReviewItemStatus(
  isCurrentlyOpen: boolean,
  requests: PEEvidenceRequestView[]
): PEICReviewItemStatus {
  if (!isCurrentlyOpen) {
    // canonical 조건이 더 이상 readiness/questions 재계산에 나타나지 않는다
    // — 근원 자체가 해소됐다는 뜻이므로 RESOLVED(요청이 아예 없었어도 정직하게
    // RESOLVED다: canonical 조건이 이미 바뀌었다는 사실 자체가 전부다).
    return "RESOLVED";
  }

  const latest = latestRequest(requests);
  if (!latest) return "OPEN";

  switch (latest.status) {
    case "REQUESTED":
      return "WAITING_FOR_EVIDENCE";
    case "RECEIVED":
    case "UNDER_REVIEW":
      return "EVIDENCE_RECEIVED";
    case "ACCEPTED":
      // 승인됐지만 canonical 조건은 여전히 열려 있다(isCurrentlyOpen === true 분기) —
      // §Step17 E "accepted evidence but canonical conflict remains → still unresolved".
      return "IN_REVIEW";
    case "REJECTED":
      return "OPEN"; // 거부된 근거는 없는 것과 같다 — 다시 열린 상태로 취급.
    default:
      return "OPEN";
  }
}

/**
 * 지금 이 review item에 연결하려는 evidence request가 실제로 이 딜/이
 * review item에 속하는지 구조적으로 확인한다(교차 딜/교차 항목 주입
 * 방지, §Step16). DB 조회 없는 순수 검증 — 실제 조회 기반 검증은
 * pe-evidence-request-repository.ts가 담당한다(이중 방어).
 */
export function collectEvidenceRequestLinkIssues(input: {
  request: { ddCaseId: string; reviewItemSourceId: string };
  expectedDdCaseId: string;
  expectedReviewItemSourceId: string;
}): string[] {
  const issues: string[] = [];
  if (input.request.ddCaseId !== input.expectedDdCaseId) issues.push("evidence_request_cross_deal");
  if (input.request.reviewItemSourceId !== input.expectedReviewItemSourceId) issues.push("evidence_request_wrong_review_item");
  return issues;
}
