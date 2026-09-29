/**
 * PE IC Review Workflow — 구조적 격리/주입 방지 검증(PR #109, 순수 함수 레벨).
 *
 * `buildPEICReviewItems()`/`buildPEICReviewWorkspace()`/`evaluatePEICReviewItemStatus()`/
 * `collectEvidenceRequestLinkIssues()`는 전부 순수 함수라 전역 상태가 없다.
 * 이 테스트는 "Deal A용으로 조립한 워크스페이스에 Deal B의 review item/
 * evidence request가 절대 섞이지 않는다"는 구조적 보장을 회귀 테스트로
 * 고정한다.
 *
 * 실제 인가 경계(다른 딜의 requestId로 PATCH 시도, 다른 딜 문서 연결
 * 시도, 인증 없는 접근 등)는 이 파일이 아니라 라이브 DB 어드버서리얼
 * 스크립트로 검증한다 — evidence-requests route.ts의 IDOR 방지 패턴은
 * pe-dd-repository.ts/PR #105와 동일한 검증된 패턴을 재사용했다(§Step16).
 *
 * Usage: npm run test:pe-ic-review-security
 */
import { buildPEICReviewItems, buildPEICReviewWorkspace } from "../src/lib/pe/pe-ic-review";
import { collectEvidenceRequestLinkIssues } from "../src/lib/pe/pe-ic-resolution";
import type { ICQuestion } from "../src/lib/pe/pe-ic-decision-types";
import type { PEEvidenceRequestView } from "../src/lib/pe/pe-ic-review-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function questionsFor(dealLabel: string): ICQuestion[] {
  return [
    {
      code: `${dealLabel}-MISSING-1`,
      sourceType: "MISSING_INFO",
      domainLabel: "재무",
      priority: "P0",
      question: `${dealLabel}만의 질문`,
      whyItMatters: "중요함",
      requiredEvidence: "원장",
      decisionImpact: "영향 있음",
    },
  ];
}

function requestsFor(dealLabel: string, ddCaseId: string): PEEvidenceRequestView[] {
  return [
    {
      id: `${dealLabel}-req-1`,
      ddCaseId,
      reviewItemSourceType: "MISSING_INFO",
      reviewItemSourceId: `${dealLabel}-MISSING-1`,
      title: `${dealLabel} 요청`,
      requestedDocument: null,
      requestedFact: null,
      reason: `${dealLabel} 사유`,
      priority: "P0",
      status: "ACCEPTED",
      linkedDocumentId: null,
      createdByUserId: "user-1",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ];
}

// ── 1. Deal A/B를 각각 조립해도 review item/evidence request가 절대 섞이지 않음 ──

function test1_crossDealReviewItemsNeverMix() {
  const questionsA = questionsFor("dealA");
  const questionsB = questionsFor("dealB");
  const requestsA = requestsFor("dealA", "dd-A");
  const requestsB = requestsFor("dealB", "dd-B");

  const workspaceA = buildPEICReviewWorkspace("dealA", "PARTIALLY_READY", questionsA, requestsA);
  const workspaceB = buildPEICReviewWorkspace("dealB", "PARTIALLY_READY", questionsB, requestsB);

  assert(workspaceA.dealId === "dealA" && workspaceB.dealId === "dealB", "dealId는 각자 입력받은 값 그대로여야 함");
  assert(
    workspaceA.openItems.every((i) => i.id.startsWith("dealA-")) && workspaceA.evidenceRequests.every((r) => r.id.startsWith("dealA-")),
    "Deal A 워크스페이스는 Deal A의 review item/요청만 포함해야 함"
  );
  assert(
    workspaceB.openItems.every((i) => i.id.startsWith("dealB-")) && workspaceB.evidenceRequests.every((r) => r.id.startsWith("dealB-")),
    "Deal B 워크스페이스는 Deal B의 review item/요청만 포함해야 함"
  );
  assert(
    !JSON.stringify(workspaceA).includes("dealB") && !JSON.stringify(workspaceB).includes("dealA"),
    "직렬화된 결과 어디에도 다른 딜의 id/문구가 섞이면 안 됨(open/resolved/evidenceRequests 전부 포함)"
  );
  console.log("✅ Test 1 — Deal A/B 워크스페이스를 각각 조립해도 review item/evidence request가 절대 섞이지 않음");
}

// ── 2. Deal B의 evidence request를 Deal A의 questions와 잘못 조립해도 ────
//      최소한 구조적으로 "Deal A의 review item"으로 잘못 표시되지 않는다 ──

function test2_wrongDealRequestNeverAttachesToUnrelatedItem() {
  // 방어적 시나리오: 만약 호출자가 실수로 dealB의 요청을 dealA의 questions와
  // 함께 넘기면(DB 레이어가 막아야 하는 상황이지만, 순수 함수 자체도 최소
  // 방어선을 갖는지 확인) — reviewItemSourceId가 dealA의 어떤 코드와도
  // 일치하지 않으므로 dealA의 open item에는 절대 붙지 않는다.
  const questionsA = questionsFor("dealA");
  const requestsB = requestsFor("dealB", "dd-B");

  const { open } = buildPEICReviewItems("dealA", questionsA, requestsB);
  assert(open.length === 1, "open 항목 수는 questions 수와 같아야 함");
  assert(open[0].evidenceRequests.length === 0, "reviewItemSourceId가 일치하지 않는 다른 딜의 요청은 절대 붙지 않아야 함");
  console.log("✅ Test 2 — 코드가 일치하지 않는 다른 딜의 evidence request는 review item에 절대 연결되지 않음(구조적 방어선)");
}

// ── 3. collectEvidenceRequestLinkIssues — cross-deal 주입은 항상 구조적으로 거부됨 ──

function test3_crossDealInjectionAlwaysStructurallyRejected() {
  const attempts = [
    { ddCaseId: "dd-B", reviewItemSourceId: "dealA-MISSING-1" }, // 다른 딜의 ddCase
    { ddCaseId: "dd-A", reviewItemSourceId: "dealB-MISSING-1" }, // 다른 딜의 review item code
    { ddCaseId: "dd-B", reviewItemSourceId: "dealB-MISSING-1" }, // 둘 다 다름
  ];
  for (const attempt of attempts) {
    const issues = collectEvidenceRequestLinkIssues({
      request: attempt,
      expectedDdCaseId: "dd-A",
      expectedReviewItemSourceId: "dealA-MISSING-1",
    });
    assert(issues.length > 0, `${JSON.stringify(attempt)}은 최소 1개 이상의 구조적 이슈로 거부돼야 함`);
  }
  console.log("✅ Test 3 — ddCaseId/reviewItemSourceId 중 하나라도 어긋나면 항상 구조적으로 거부됨(cross-deal 주입 방지)");
}

// ── 4. 같은 프로세스에서 연속 호출해도 전역 상태로 오염되지 않음 ─────────

function test4_noSharedMutableStateAcrossCalls() {
  const questionsA = questionsFor("dealA");
  const first = buildPEICReviewWorkspace("dealA", "NOT_READY", questionsA, requestsFor("dealA", "dd-A"));

  for (let i = 0; i < 5; i++) {
    buildPEICReviewWorkspace(`empty-${i}`, "NOT_READY", [], []);
  }

  const second = buildPEICReviewWorkspace("dealA", "NOT_READY", questionsA, requestsFor("dealA", "dd-A"));
  assert(JSON.stringify(first) === JSON.stringify(second), "같은 입력을 반복 호출하면 중간 호출과 무관하게 항상 같은 결과여야 함(전역 mutable state 없음)");
  console.log("✅ Test 4 — 다른 딜을 여러 번 조립해도 이전 딜 재조립 결과가 오염되지 않음(전역 상태 없음)");
}

function main() {
  console.log("\n=== PE IC Review Workflow 구조적 격리(cross-deal) 테스트 ===\n");
  test1_crossDealReviewItemsNeverMix();
  test2_wrongDealRequestNeverAttachesToUnrelatedItem();
  test3_crossDealInjectionAlwaysStructurallyRejected();
  test4_noSharedMutableStateAcrossCalls();
  console.log("\n✅ PE IC Review Workflow 구조적 격리 테스트 통과\n");
}

main();
