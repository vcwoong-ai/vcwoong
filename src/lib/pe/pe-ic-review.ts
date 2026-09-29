/**
 * PE IC Review Workflow — 순수 조립 함수(PR #109).
 *
 * 새 readiness/질문 판정 로직이 아니다. `buildICQuestions()`(pe-ic-questions.ts,
 * PR #107/#108, 수정 없음)가 이미 만든 질문 목록을 8개 워크플로 카테고리로
 * 재분류하고, `PEEvidenceRequest`(영속, 사람의 실제 행동)와 결합해
 * `evaluatePEICReviewItemStatus()`(pe-ic-resolution.ts)로 각 항목의 상태를
 * 계산할 뿐이다.
 */

import type { ICQuestion, ICQuestionSourceType, PEICProcessState } from "./pe-ic-decision-types";
import type {
  PEICReviewItem,
  PEICReviewItemType,
  PEICReviewWorkspace,
  PEICReviewState,
  PEEvidenceRequestView,
} from "./pe-ic-review-types";
import { evaluatePEICReviewItemStatus } from "./pe-ic-resolution";

/**
 * ICQuestion의 sourceType/code에서 워크플로 카테고리(8종)를 유도한다 — 새
 * 판단이 아니라 이미 readiness 엔진이 결정론적으로 만든 code 접두사를
 * 보고 재분류만 한다(§Step2). code 포맷은 pe-decision-readiness.ts/
 * pe-ic-questions.ts가 실제로 쓰는 그대로다.
 */
function classifyReviewItemType(sourceType: ICQuestionSourceType, code: string): PEICReviewItemType {
  if (sourceType === "DD_FINDING") return "DD_FOLLOWUP";
  if (sourceType === "FACT_CONFLICT") return "FINANCIAL_RECONCILIATION";
  if (sourceType === "UNSUPPORTED_THESIS") return "EVIDENCE_GAP";

  if (code.startsWith("LBO_ASSUMPTION_MISSING") || code.startsWith("LBO_BLOCKED_BY") || code.startsWith("LBO_BRIDGE") || code.startsWith("LBO_ENTRY_EBITDA")) {
    return "LBO_ASSUMPTION";
  }
  if (code.startsWith("QOE_")) return "QOE_FOLLOWUP";
  if (code.startsWith("FINANCIAL_")) return "FINANCIAL_RECONCILIATION";
  if (code.startsWith("EVIDENCE_")) return "EVIDENCE_GAP";
  if (code.startsWith("DD_")) return "DD_FOLLOWUP";

  if (sourceType === "BLOCKER") return "BLOCKER";
  if (sourceType === "MISSING_INFO") return "MISSING_INFORMATION";
  return "IC_QUESTION";
}

function requestsFor(evidenceRequests: PEEvidenceRequestView[], reviewItemSourceId: string): PEEvidenceRequestView[] {
  return evidenceRequests.filter((r) => r.reviewItemSourceId === reviewItemSourceId);
}

function toOpenReviewItem(dealId: string, question: ICQuestion, evidenceRequests: PEEvidenceRequestView[]): PEICReviewItem {
  const requests = requestsFor(evidenceRequests, question.code);
  return {
    id: question.code,
    dealId,
    type: classifyReviewItemType(question.sourceType, question.code),
    priority: question.priority,
    title: question.question,
    question: question.question,
    reason: question.whyItMatters,
    sourceQuestion: question,
    requiredEvidence: question.requiredEvidence,
    status: evaluatePEICReviewItemStatus(true, requests),
    evidenceRequests: requests,
  };
}

/**
 * 요청 기록이 있는데 지금은 더 이상 open questions에 없는 review item을
 * "한때 있었지만 지금은 해소됨"으로 복원한다. evidence request 생성 시점에
 * 저장해둔 title/reason/requestedDocument/requestedFact만 쓴다 — 지금
 * 재계산으로는 만들 수 없는 정보를 지어내지 않는다. **요청 기록이 아예
 * 없는 채로 저절로 해소된 항목은 이 목록에 나타나지 않는다** — 추적할
 * 근거가 없기 때문이다(정직한 한계, §Step13과 동일 원칙).
 */
function toResolvedReviewItem(dealId: string, reviewItemSourceId: string, requests: PEEvidenceRequestView[]): PEICReviewItem {
  const latest = [...requests].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  return {
    id: reviewItemSourceId,
    dealId,
    type: classifyReviewItemType(latest.reviewItemSourceType as ICQuestionSourceType, reviewItemSourceId),
    priority: latest.priority,
    title: latest.title,
    question: latest.title,
    reason: latest.reason,
    sourceQuestion: undefined,
    requiredEvidence: latest.requestedDocument ?? latest.requestedFact ?? latest.reason,
    status: "RESOLVED",
    evidenceRequests: requests,
  };
}

const PROCESS_STATE_TO_REVIEW_STATE: Record<PEICProcessState, PEICReviewState> = {
  READY_FOR_IC: "READY_FOR_IC",
  PARTIALLY_READY: "PARTIALLY_READY",
  NOT_READY: "NOT_READY",
  BLOCKED: "BLOCKED",
};

export function buildPEICReviewItems(
  dealId: string,
  currentQuestions: ICQuestion[],
  evidenceRequests: PEEvidenceRequestView[]
): { open: PEICReviewItem[]; resolved: PEICReviewItem[] } {
  const openCodes = new Set(currentQuestions.map((q) => q.code));
  const open = currentQuestions.map((q) => toOpenReviewItem(dealId, q, evidenceRequests));

  const requestsBySourceId = new Map<string, PEEvidenceRequestView[]>();
  for (const r of evidenceRequests) {
    if (openCodes.has(r.reviewItemSourceId)) continue; // 여전히 open이면 resolved 후보가 아니다
    const list = requestsBySourceId.get(r.reviewItemSourceId) ?? [];
    list.push(r);
    requestsBySourceId.set(r.reviewItemSourceId, list);
  }
  const resolved = Array.from(requestsBySourceId.entries()).map(([sourceId, requests]) =>
    toResolvedReviewItem(dealId, sourceId, requests)
  );

  return { open, resolved };
}

export function buildPEICReviewWorkspace(
  dealId: string,
  processState: PEICProcessState,
  currentQuestions: ICQuestion[],
  evidenceRequests: PEEvidenceRequestView[]
): PEICReviewWorkspace {
  const { open, resolved } = buildPEICReviewItems(dealId, currentQuestions, evidenceRequests);
  return {
    dealId,
    overallState: PROCESS_STATE_TO_REVIEW_STATE[processState],
    openItems: open,
    resolvedItems: resolved,
    evidenceRequests,
  };
}
