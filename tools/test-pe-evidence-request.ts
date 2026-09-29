/**
 * PE Evidence Request — 순수 검증/상태 전이(pe-evidence-request-repository.ts,
 * pe-ic-review-types.ts, PR #109) 검증.
 *
 * 이 레포 관례대로 라이브 DB를 쓰지 않는다(test-pe-dd-persistence.ts와
 * 동일 — prisma를 import하는 repository 파일에서 DB를 건드리지 않는 순수
 * 함수만 가져다 쓴다. `new PrismaClient()`는 지연 연결이라 오프라인에서도
 * 안전하다). 실제 Prisma 쓰기 경로(where절 권한 필터링, cross-deal 문서
 * FK 검증)는 라이브 DB 어드버서리얼 스크립트로 별도 검증했다.
 *
 * Usage: npm run test:pe-evidence-request
 */
import {
  collectCreateEvidenceRequestIssues,
  isValidEvidenceRequestTransition,
} from "../src/lib/pe/pe-evidence-request-repository";
import { PE_EVIDENCE_REQUEST_STATUS_TRANSITIONS, PE_EVIDENCE_REQUEST_STATUSES } from "../src/lib/pe/pe-ic-review-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// ── 1. 구조 검증 — 필수 필드 누락은 전부 issue로 잡힘 ─────────────────────

function test1_requiredFieldsValidated() {
  const missingAll = collectCreateEvidenceRequestIssues({ title: "", reason: "", reviewItemSourceId: "" });
  assert(
    missingAll.includes("title_required") && missingAll.includes("reason_required") && missingAll.includes("review_item_source_id_required"),
    "빈 title/reason/reviewItemSourceId는 전부 issue로 잡혀야 함"
  );

  const whitespaceOnly = collectCreateEvidenceRequestIssues({ title: "   ", reason: "  ", reviewItemSourceId: "  " });
  assert(whitespaceOnly.length === 3, "공백만 있는 값도 비어있는 것으로 취급해야 함(trim 검증)");

  const valid = collectCreateEvidenceRequestIssues({ title: "제목", reason: "사유", reviewItemSourceId: "CODE-1" });
  assert(valid.length === 0, "유효한 입력은 issue가 없어야 함");
  console.log("✅ 1 — 필수 필드(title/reason/reviewItemSourceId) 구조 검증");
}

// ── 2. 상태 전이 — 정의된 lifecycle만 허용 ────────────────────────────────

function test2_transitionsFollowDefinedLifecycle() {
  assert(isValidEvidenceRequestTransition("REQUESTED", "RECEIVED"), "REQUESTED → RECEIVED는 허용돼야 함");
  assert(isValidEvidenceRequestTransition("RECEIVED", "UNDER_REVIEW"), "RECEIVED → UNDER_REVIEW는 허용돼야 함");
  assert(isValidEvidenceRequestTransition("UNDER_REVIEW", "ACCEPTED"), "UNDER_REVIEW → ACCEPTED는 허용돼야 함");
  assert(isValidEvidenceRequestTransition("UNDER_REVIEW", "REJECTED"), "UNDER_REVIEW → REJECTED는 허용돼야 함");
  assert(isValidEvidenceRequestTransition("REJECTED", "REQUESTED"), "REJECTED → REQUESTED(재요청)는 예외적으로 허용돼야 함");
  console.log("✅ 2 — 정의된 정상 전이는 전부 허용됨");
}

function test3_invalidTransitionsRejected() {
  assert(!isValidEvidenceRequestTransition("REQUESTED", "ACCEPTED"), "단계를 건너뛰는 전이(REQUESTED→ACCEPTED)는 거부돼야 함 — 문서 없이 승인 불가");
  assert(!isValidEvidenceRequestTransition("REQUESTED", "UNDER_REVIEW"), "REQUESTED → UNDER_REVIEW(RECEIVED를 건너뜀)는 거부돼야 함");
  assert(!isValidEvidenceRequestTransition("ACCEPTED", "REJECTED"), "ACCEPTED는 종결 상태 — 다시 REJECTED로 되돌릴 수 없어야 함");
  assert(!isValidEvidenceRequestTransition("ACCEPTED", "REQUESTED"), "ACCEPTED에서 되돌아가는 어떤 전이도 없어야 함");
  console.log("✅ 3 — 정의되지 않은 전이(단계 건너뛰기, 종결 상태에서 되돌리기)는 전부 거부됨");
}

function test4_sameStateNoOpAlwaysAllowed() {
  for (const status of PE_EVIDENCE_REQUEST_STATUSES) {
    assert(isValidEvidenceRequestTransition(status, status), `${status} → ${status}(no-op)는 항상 허용돼야 함`);
  }
  console.log("✅ 4 — 모든 상태에서 같은 상태로의 전이(no-op)는 허용됨");
}

// ── 5. ACCEPTED는 진짜 종결 상태 — 나가는 전이가 전혀 없음 ────────────────

function test5_acceptedIsTerminal() {
  assert(PE_EVIDENCE_REQUEST_STATUS_TRANSITIONS.ACCEPTED.length === 0, "ACCEPTED에서 나가는 전이는 하나도 없어야 함(종결 상태)");
  console.log("✅ 5 — ACCEPTED는 나가는 전이가 없는 진짜 종결 상태");
}

// ── 6. 모든 상태가 전이 맵에 정의돼 있음(누락된 상태 없음) ────────────────

function test6_allStatusesHaveTransitionEntries() {
  for (const status of PE_EVIDENCE_REQUEST_STATUSES) {
    assert(status in PE_EVIDENCE_REQUEST_STATUS_TRANSITIONS, `${status}는 전이 맵에 정의돼 있어야 함`);
  }
  console.log("✅ 6 — 모든 PEEvidenceRequestStatus가 전이 맵에 정의됨(누락 없음)");
}

function main() {
  console.log("\n=== PE Evidence Request 순수 검증/전이 테스트 ===\n");
  test1_requiredFieldsValidated();
  test2_transitionsFollowDefinedLifecycle();
  test3_invalidTransitionsRejected();
  test4_sameStateNoOpAlwaysAllowed();
  test5_acceptedIsTerminal();
  test6_allStatusesHaveTransitionEntries();
  console.log("\n✅ PE Evidence Request 순수 검증/전이 테스트 통과\n");
}

main();
