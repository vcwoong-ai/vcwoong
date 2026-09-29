/**
 * PE IC Review — Resolution 판정(pe-ic-resolution.ts, PR #109) 검증.
 *
 * 이 스크립트는 라이브 DB를 쓰지 않는다(이 레포의 기존 관례 — test-qoe-
 * persistence.ts/test-pe-dd-persistence.ts와 동일). `evaluatePEICReviewItemStatus()`가
 * §4/§Step17이 요구하는 유일한 규칙 — "RESOLVED는 canonical 조건이 실제로
 * 사라졌을 때만 나온다, evidence request 상태 자체는 RESOLVED를 만들지
 * 않는다" — 를 정확히 지키는지 시나리오별로 고정한다.
 *
 * Usage: npm run test:pe-ic-resolution
 */
import { evaluatePEICReviewItemStatus, collectEvidenceRequestLinkIssues } from "../src/lib/pe/pe-ic-resolution";
import type { PEEvidenceRequestView } from "../src/lib/pe/pe-ic-review-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function requestView(overrides: Partial<PEEvidenceRequestView> & { id: string; status: PEEvidenceRequestView["status"] }): PEEvidenceRequestView {
  return {
    ddCaseId: "dd-1",
    reviewItemSourceType: "MISSING_INFO",
    reviewItemSourceId: "MISSING_REVENUE",
    title: "매출 원장 요청",
    requestedDocument: null,
    requestedFact: null,
    reason: "매출 확인 필요",
    priority: "P0",
    linkedDocumentId: null,
    createdByUserId: "user-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

// ── A. 요청이 전혀 없는 open 항목 → OPEN ─────────────────────────────────

function testA_noRequestsIsOpen() {
  const status = evaluatePEICReviewItemStatus(true, []);
  assert(status === "OPEN", `요청이 없으면 OPEN이어야 함, 실제: ${status}`);
  console.log("✅ A — 요청이 없는 open 항목은 OPEN");
}

// ── B. 요청은 있지만 아직 REQUESTED(문서 미접수) → WAITING_FOR_EVIDENCE ──

function testB_requestedNoDocument() {
  const status = evaluatePEICReviewItemStatus(true, [requestView({ id: "r1", status: "REQUESTED" })]);
  assert(status === "WAITING_FOR_EVIDENCE", `실제: ${status}`);
  console.log("✅ B — REQUESTED 상태의 요청만 있으면 WAITING_FOR_EVIDENCE");
}

// ── C. 문서 접수(RECEIVED)/검토 중(UNDER_REVIEW) → EVIDENCE_RECEIVED ──────

function testC_receivedOrUnderReview() {
  const received = evaluatePEICReviewItemStatus(true, [requestView({ id: "r1", status: "RECEIVED" })]);
  const underReview = evaluatePEICReviewItemStatus(true, [requestView({ id: "r1", status: "UNDER_REVIEW" })]);
  assert(received === "EVIDENCE_RECEIVED" && underReview === "EVIDENCE_RECEIVED", "RECEIVED/UNDER_REVIEW는 EVIDENCE_RECEIVED여야 함");
  console.log("✅ C — RECEIVED/UNDER_REVIEW는 EVIDENCE_RECEIVED");
}

// ── D. 관련 있지만 아직 승인 안 된 evidence → RESOLVED 아님(최대 EVIDENCE_RECEIVED) ──

function testD_relevantButUnacceptedNeverResolves() {
  const status = evaluatePEICReviewItemStatus(true, [requestView({ id: "r1", status: "UNDER_REVIEW" })]);
  assert(status !== "RESOLVED", "승인되지 않은 근거만으로는 절대 RESOLVED가 될 수 없음");
  console.log("✅ D — 관련 있지만 미승인 근거는 RESOLVED로 이어지지 않음");
}

// ── E. 승인(ACCEPTED)됐지만 canonical 조건이 여전히 열려있음 → IN_REVIEW(RESOLVED 아님) ──

function testE_acceptedButCanonicalConflictRemains() {
  const status = evaluatePEICReviewItemStatus(true, [requestView({ id: "r1", status: "ACCEPTED" })]);
  assert(status === "IN_REVIEW", `ACCEPTED인데 isCurrentlyOpen=true면 IN_REVIEW여야 함, 실제: ${status}`);
  console.log("✅ E — ACCEPTED 요청이 있어도 canonical 조건이 안 풀리면 RESOLVED가 아니라 IN_REVIEW");
}

// ── F. 승인 + canonical 조건 실제 해소(isCurrentlyOpen=false) → RESOLVED, 클릭 없이 자동 ──

function testF_acceptedAndCanonicalResolves() {
  const status = evaluatePEICReviewItemStatus(false, [requestView({ id: "r1", status: "ACCEPTED" })]);
  assert(status === "RESOLVED", `실제: ${status}`);
  console.log("✅ F — canonical 조건이 실제로 사라지면(isCurrentlyOpen=false) 자동으로 RESOLVED");
}

// ── G. 요청 기록이 전혀 없어도 canonical 조건이 사라지면 정직하게 RESOLVED ──

function testG_resolvedWithoutAnyRequestHistory() {
  const status = evaluatePEICReviewItemStatus(false, []);
  assert(status === "RESOLVED", "요청 이력이 없어도 canonical 조건이 사라졌으면 RESOLVED여야 함(정직한 기본값)");
  console.log("✅ G — 요청 이력 없이 저절로 해소돼도 RESOLVED로 정직하게 보고");
}

// ── H. REJECTED 요청은 없는 것과 같이 취급(다시 OPEN) ─────────────────────

function testH_rejectedRequestReopens() {
  const status = evaluatePEICReviewItemStatus(true, [requestView({ id: "r1", status: "REJECTED" })]);
  assert(status === "OPEN", `거부된 요청뿐이면 OPEN이어야 함, 실제: ${status}`);
  console.log("✅ H — REJECTED 요청만 있으면 OPEN으로 취급(거부된 근거는 근거가 아님)");
}

// ── I. 여러 요청 중 가장 최근(updatedAt) 것을 기준으로 판정 ──────────────

function testI_latestRequestWins() {
  const old = requestView({ id: "r1", status: "REJECTED", updatedAt: "2026-01-01T00:00:00.000Z" });
  const recent = requestView({ id: "r2", status: "ACCEPTED", updatedAt: "2026-09-01T00:00:00.000Z" });
  const status = evaluatePEICReviewItemStatus(true, [old, recent]);
  assert(status === "IN_REVIEW", `가장 최근 요청(ACCEPTED) 기준이어야 함, 실제: ${status}`);

  const reversedOrderInput = evaluatePEICReviewItemStatus(true, [recent, old]);
  assert(reversedOrderInput === "IN_REVIEW", "배열 순서와 무관하게 updatedAt 기준으로 최신 요청을 골라야 함");
  console.log("✅ I — 오래된 REJECTED 요청이 최근 ACCEPTED 요청을 가리지 않음(updatedAt 기준 정렬)");
}

// ── J. cross-deal/cross-item evidence request 연결 구조 검증(순수) ────────

function testJ_crossDealLinkRejected() {
  const issues = collectEvidenceRequestLinkIssues({
    request: { ddCaseId: "dd-B", reviewItemSourceId: "MISSING_REVENUE" },
    expectedDdCaseId: "dd-A",
    expectedReviewItemSourceId: "MISSING_REVENUE",
  });
  assert(issues.includes("evidence_request_cross_deal"), "다른 ddCase 소속 요청은 cross_deal 이슈로 잡혀야 함");
  console.log("✅ J — ddCaseId가 다른 evidence request는 구조적으로 거부됨");
}

function testJ2_wrongReviewItemRejected() {
  const issues = collectEvidenceRequestLinkIssues({
    request: { ddCaseId: "dd-A", reviewItemSourceId: "OTHER_ITEM" },
    expectedDdCaseId: "dd-A",
    expectedReviewItemSourceId: "MISSING_REVENUE",
  });
  assert(issues.includes("evidence_request_wrong_review_item"), "다른 review item 소속 요청은 wrong_review_item 이슈로 잡혀야 함");
  console.log("✅ J2 — reviewItemSourceId가 다른 evidence request는 구조적으로 거부됨");
}

function testJ3_matchingLinkHasNoIssues() {
  const issues = collectEvidenceRequestLinkIssues({
    request: { ddCaseId: "dd-A", reviewItemSourceId: "MISSING_REVENUE" },
    expectedDdCaseId: "dd-A",
    expectedReviewItemSourceId: "MISSING_REVENUE",
  });
  assert(issues.length === 0, "같은 딜/같은 review item이면 이슈가 없어야 함");
  console.log("✅ J3 — 정상적으로 일치하는 연결은 이슈 없음");
}

function main() {
  console.log("\n=== PE IC Resolution 판정 테스트 ===\n");
  testA_noRequestsIsOpen();
  testB_requestedNoDocument();
  testC_receivedOrUnderReview();
  testD_relevantButUnacceptedNeverResolves();
  testE_acceptedButCanonicalConflictRemains();
  testF_acceptedAndCanonicalResolves();
  testG_resolvedWithoutAnyRequestHistory();
  testH_rejectedRequestReopens();
  testI_latestRequestWins();
  testJ_crossDealLinkRejected();
  testJ2_wrongReviewItemRejected();
  testJ3_matchingLinkHasNoIssues();
  console.log("\n✅ PE IC Resolution 판정 테스트 통과\n");
}

main();
