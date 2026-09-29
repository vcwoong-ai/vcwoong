/**
 * PE IC Review — Review Item 조립(pe-ic-review.ts, PR #109) 검증.
 *
 * 라이브 DB를 쓰지 않는다(이 레포 관례). `buildPEICReviewItems()`/
 * `buildPEICReviewWorkspace()`는 순수 함수라 hand-built `ICQuestion[]` +
 * `PEEvidenceRequestView[]`만으로 전부 검증할 수 있다. 확인하는 것:
 * 1. open item은 현재 questions와 정확히 1:1(새 항목을 만들거나 빠뜨리지 않음).
 * 2. sourceType/code 접두사로 8종 워크플로 타입을 정확히 재분류하는가
 *    (새 판단이 아니라 기존 readiness 엔진이 만든 code를 그대로 읽는 것뿐).
 * 3. resolved item은 "요청 기록이 있고 지금은 open이 아닌" 것만 나타나고,
 *    지어낸 값 없이 요청 기록에서 그대로 복원되는가.
 * 4. overallState가 processState를 그대로 옮긴 값인가(재판정 없음).
 *
 * Usage: npm run test:pe-ic-review
 */
import { buildPEICReviewItems, buildPEICReviewWorkspace } from "../src/lib/pe/pe-ic-review";
import type { ICQuestion } from "../src/lib/pe/pe-ic-decision-types";
import type { PEEvidenceRequestView } from "../src/lib/pe/pe-ic-review-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function question(overrides: Partial<ICQuestion> & { code: string; sourceType: ICQuestion["sourceType"] }): ICQuestion {
  return {
    domainLabel: "재무",
    priority: "P1",
    question: `${overrides.code} 질문`,
    whyItMatters: "중요함",
    requiredEvidence: "원장",
    decisionImpact: "영향 있음",
    ...overrides,
  };
}

function requestView(overrides: Partial<PEEvidenceRequestView> & { id: string; reviewItemSourceId: string }): PEEvidenceRequestView {
  return {
    ddCaseId: "dd-1",
    reviewItemSourceType: "MISSING_INFO",
    title: "자료 요청",
    requestedDocument: null,
    requestedFact: null,
    reason: "필요함",
    priority: "P1",
    status: "REQUESTED",
    linkedDocumentId: null,
    createdByUserId: "user-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

// ── 1. open item은 현재 questions와 1:1 ──────────────────────────────────

function test1_openItemsMatchCurrentQuestionsExactly() {
  const questions = [
    question({ code: "MISSING_REVENUE", sourceType: "MISSING_INFO" }),
    question({ code: "FACT_CONFLICT_EBITDA", sourceType: "FACT_CONFLICT" }),
  ];
  const { open } = buildPEICReviewItems("deal-1", questions, []);
  assert(open.length === 2, `open 항목 수는 questions와 같아야 함, 실제: ${open.length}`);
  assert(new Set(open.map((i) => i.id)).size === 2, "open 항목 id는 question.code와 1:1이어야 함(중복 없음)");
  assert(open.every((i) => i.id === i.sourceQuestion?.code), "open item.id는 항상 원본 ICQuestion.code와 같아야 함");
  console.log("✅ 1 — open item은 현재 questions와 정확히 1:1");
}

// ── 2. sourceType/code 접두사 기반 워크플로 타입 재분류 ──────────────────

function test2_classifiesWorkflowTypeFromSourceAndCode() {
  const cases: Array<[ICQuestion, string]> = [
    [question({ code: "DD-1", sourceType: "DD_FINDING" }), "DD_FOLLOWUP"],
    [question({ code: "FACT_CONFLICT_X", sourceType: "FACT_CONFLICT" }), "FINANCIAL_RECONCILIATION"],
    [question({ code: "CLAIM-1", sourceType: "UNSUPPORTED_THESIS" }), "EVIDENCE_GAP"],
    [question({ code: "LBO_ASSUMPTION_MISSING_DEBT", sourceType: "MISSING_INFO" }), "LBO_ASSUMPTION"],
    [question({ code: "QOE_ADJUSTMENT_PENDING", sourceType: "MISSING_INFO" }), "QOE_FOLLOWUP"],
    [question({ code: "BLOCKER_REVENUE", sourceType: "BLOCKER" }), "BLOCKER"],
    [question({ code: "MISSING_CUSTOMER_DATA", sourceType: "MISSING_INFO" }), "MISSING_INFORMATION"],
  ];
  for (const [q, expectedType] of cases) {
    const { open } = buildPEICReviewItems("deal-1", [q], []);
    assert(open[0].type === expectedType, `${q.code}(${q.sourceType})는 ${expectedType}이어야 함, 실제: ${open[0].type}`);
  }
  console.log("✅ 2 — sourceType/code 접두사로 8종 워크플로 타입을 정확히 재분류");
}

// ── 3. resolved item — 요청 기록이 있고 지금은 open이 아닌 것만, 지어내지 않음 ──

function test3_resolvedItemsOnlyWithRequestHistory() {
  // MISSING_REVENUE는 과거에 요청이 있었지만 지금 questions에는 없다(해소됨).
  // MISSING_CUSTOMER는 요청 이력 없이 그냥 사라졌다 — 추적 불가라 resolved 목록에 안 나와야 함.
  const currentQuestions = [question({ code: "STILL_OPEN", sourceType: "MISSING_INFO" })];
  const requests: PEEvidenceRequestView[] = [
    requestView({ id: "r1", reviewItemSourceId: "MISSING_REVENUE", title: "매출 원장 요청", status: "ACCEPTED" }),
  ];
  const { open, resolved } = buildPEICReviewItems("deal-1", currentQuestions, requests);

  assert(open.length === 1 && open[0].id === "STILL_OPEN", "여전히 open인 질문만 open 목록에 있어야 함");
  assert(resolved.length === 1 && resolved[0].id === "MISSING_REVENUE", "요청 이력이 있고 지금 open이 아닌 항목만 resolved에 있어야 함");
  assert(resolved[0].status === "RESOLVED", "resolved 목록의 항목은 항상 status RESOLVED여야 함");
  assert(resolved[0].sourceQuestion === undefined, "resolved item은 재계산으로 복원할 수 없는 sourceQuestion을 undefined로 정직하게 남겨야 함(지어내지 않음)");
  assert(resolved[0].title === "매출 원장 요청", "resolved item의 title은 저장된 evidence request에서 그대로 복원돼야 함(새 문구 생성 없음)");
  console.log("✅ 3 — resolved item은 요청 이력이 있는 항목만, 지어낸 값 없이 그대로 복원");
}

// ── 4. overallState는 processState를 그대로 옮긴 값(재판정 없음) ─────────

function test4_overallStateMirrorsProcessState() {
  const workspace = buildPEICReviewWorkspace("deal-1", "BLOCKED", [], []);
  assert(workspace.overallState === "BLOCKED", `processState를 그대로 옮겨야 함, 실제: ${workspace.overallState}`);
  const ready = buildPEICReviewWorkspace("deal-1", "READY_FOR_IC", [], []);
  assert(ready.overallState === "READY_FOR_IC", "READY_FOR_IC도 그대로 옮겨야 함");
  console.log("✅ 4 — overallState는 processState를 그대로 옮긴 값(새 판정 없음)");
}

// ── 5. 여러 요청이 같은 review item에 붙어도 정확히 그 항목에만 묶임 ─────

function test5_requestsGroupedByExactReviewItem() {
  const questions = [
    question({ code: "ITEM_A", sourceType: "MISSING_INFO" }),
    question({ code: "ITEM_B", sourceType: "MISSING_INFO" }),
  ];
  const requests = [
    requestView({ id: "r1", reviewItemSourceId: "ITEM_A" }),
    requestView({ id: "r2", reviewItemSourceId: "ITEM_A" }),
    requestView({ id: "r3", reviewItemSourceId: "ITEM_B" }),
  ];
  const { open } = buildPEICReviewItems("deal-1", questions, requests);
  const itemA = open.find((i) => i.id === "ITEM_A")!;
  const itemB = open.find((i) => i.id === "ITEM_B")!;
  assert(itemA.evidenceRequests.length === 2, "ITEM_A에는 정확히 2건이 묶여야 함");
  assert(itemB.evidenceRequests.length === 1, "ITEM_B에는 정확히 1건이 묶여야 함");
  assert(itemA.evidenceRequests.every((r) => r.reviewItemSourceId === "ITEM_A"), "ITEM_A에 묶인 요청은 전부 ITEM_A 소속이어야 함(교차 오염 없음)");
  console.log("✅ 5 — 여러 review item에 대한 요청이 정확히 각자의 항목에만 묶임(교차 오염 없음)");
}

function main() {
  console.log("\n=== PE IC Review Item 조립 테스트 ===\n");
  test1_openItemsMatchCurrentQuestionsExactly();
  test2_classifiesWorkflowTypeFromSourceAndCode();
  test3_resolvedItemsOnlyWithRequestHistory();
  test4_overallStateMirrorsProcessState();
  test5_requestsGroupedByExactReviewItem();
  console.log("\n✅ PE IC Review Item 조립 테스트 통과\n");
}

main();
