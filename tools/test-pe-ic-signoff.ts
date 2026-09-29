/**
 * PE IC Review Sign-off(pe-ic-review-signoff.ts, pe-ic-review-signoff-types.ts,
 * PR #110) 검증.
 *
 * 라이브 DB를 쓰지 않는다(이 레포 관례). 확인하는 것:
 * 1. "검토 완료"는 어디에도 투자 승인을 뜻하는 상태 이름이 없다(§7).
 * 2. CHANGES_REQUESTED는 코멘트 없이 전환 불가.
 * 3. 코멘트 대상 구조 검증 — COMMITTEE_PACK만 targetId 없이 허용.
 * 4. computeReviewDisplayState() — REVIEWED + fingerprint 불일치 →
 *    RE_REVIEW_REQUIRED(저장된 status는 그대로, 표시만 파생).
 * 5. toPEICReviewView()가 changedCategories를 breakdown 비교로 정확히 계산.
 *
 * Usage: npm run test:pe-ic-signoff
 */
import {
  collectSignoffTransitionIssues,
  collectReviewCommentIssues,
  computeReviewDisplayState,
} from "../src/lib/pe/pe-ic-review-signoff";
import {
  PE_IC_REVIEW_SIGNOFF_STATUSES,
  toPEICReviewView,
  type PEICReviewRowLike,
} from "../src/lib/pe/pe-ic-review-signoff-types";
import type { PECommitteePackFingerprintBreakdown } from "../src/lib/pe/pe-committee-pack-fingerprint";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// ── 1. 상태 이름에 APPROVED 계열 문구가 전혀 없음 ─────────────────────────

function test1_noApprovalLanguageInStatuses() {
  for (const status of PE_IC_REVIEW_SIGNOFF_STATUSES) {
    assert(!/APPROV/i.test(status), `${status}에 APPROVED 계열 문구가 있으면 안 됨(§7 — 검토 완료 ≠ 투자 승인)`);
  }
  console.log("✅ 1 — 모든 sign-off 상태 이름에 APPROVED 계열 문구 없음");
}

// ── 2. CHANGES_REQUESTED는 코멘트 필수 ────────────────────────────────────

function test2_changesRequestedNeedsComment() {
  const withoutComment = collectSignoffTransitionIssues({ status: "CHANGES_REQUESTED", comment: "" });
  assert(withoutComment.includes("comment_required_for_changes_requested"), "빈 코멘트로 CHANGES_REQUESTED 전환 시도는 거부돼야 함");

  const whitespaceOnly = collectSignoffTransitionIssues({ status: "CHANGES_REQUESTED", comment: "   " });
  assert(whitespaceOnly.length === 1, "공백만 있는 코멘트도 빈 것으로 취급해야 함");

  const withComment = collectSignoffTransitionIssues({ status: "CHANGES_REQUESTED", comment: "FY2025 매출 재무제표 대사 필요" });
  assert(withComment.length === 0, "코멘트가 있으면 CHANGES_REQUESTED 전환이 허용돼야 함");

  const otherStatuses = collectSignoffTransitionIssues({ status: "IN_REVIEW" });
  assert(otherStatuses.length === 0, "CHANGES_REQUESTED가 아닌 상태는 코멘트가 없어도 허용돼야 함");
  console.log("✅ 2 — CHANGES_REQUESTED는 코멘트 없이 전환 불가, 나머지 상태는 자유");
}

// ── 3. 코멘트 대상 구조 검증 ───────────────────────────────────────────

function test3_commentTargetValidation() {
  const packLevel = collectReviewCommentIssues({ text: "전반적으로 검토했습니다", targetType: "COMMITTEE_PACK" });
  assert(packLevel.length === 0, "COMMITTEE_PACK 코멘트는 targetId 없이 허용돼야 함");

  const questionWithoutTarget = collectReviewCommentIssues({ text: "이 질문 확인 필요", targetType: "IC_QUESTION" });
  assert(questionWithoutTarget.includes("target_id_required"), "IC_QUESTION 코멘트는 targetId가 필수여야 함");

  const questionWithTarget = collectReviewCommentIssues({ text: "이 질문 확인 필요", targetType: "IC_QUESTION", targetId: "MISSING_REVENUE" });
  assert(questionWithTarget.length === 0, "targetId가 있으면 허용돼야 함");

  const emptyText = collectReviewCommentIssues({ text: "  ", targetType: "COMMITTEE_PACK" });
  assert(emptyText.includes("text_required"), "빈 텍스트는 거부돼야 함");
  console.log("✅ 3 — 코멘트 대상 구조 검증(COMMITTEE_PACK만 targetId 생략 가능)");
}

// ── 4. computeReviewDisplayState — RE_REVIEW_REQUIRED는 DB에 없는 파생 상태 ──

function test4_displayStateDerivesReReviewRequired() {
  const upToDate = computeReviewDisplayState("REVIEWED", "fp-abc", "fp-abc");
  assert(upToDate === "REVIEWED", "fingerprint가 일치하면 REVIEWED 그대로 보여야 함");

  const stale = computeReviewDisplayState("REVIEWED", "fp-abc", "fp-xyz");
  assert(stale === "RE_REVIEW_REQUIRED", "fingerprint가 어긋나면 RE_REVIEW_REQUIRED로 표시돼야 함(DB 값은 그대로 REVIEWED)");

  const neverReviewed = computeReviewDisplayState("NOT_REVIEWED", null, "fp-xyz");
  assert(neverReviewed === "NOT_REVIEWED", "REVIEWED가 아닌 상태는 fingerprint 비교와 무관하게 그대로 보여야 함");

  const inReview = computeReviewDisplayState("IN_REVIEW", null, "fp-xyz");
  assert(inReview === "IN_REVIEW", "IN_REVIEW도 fingerprint와 무관");
  console.log("✅ 4 — REVIEWED + fingerprint 불일치일 때만 RE_REVIEW_REQUIRED로 파생 표시");
}

// ── 5. toPEICReviewView() — changedCategories가 breakdown 비교로 정확히 계산됨 ──

function breakdown(overrides: Partial<PECommitteePackFingerprintBreakdown> = {}): PECommitteePackFingerprintBreakdown {
  return { overall: "o1", financial: "f1", qoe: "q1", lbo: "l1", dd: "d1", evidence: "e1", questions: "qu1", ...overrides };
}

function baseRow(overrides: Partial<PEICReviewRowLike> = {}): PEICReviewRowLike {
  return {
    id: "review-1",
    maDealId: "deal-1",
    reviewerId: "user-1",
    status: "REVIEWED",
    comment: null,
    reviewedFingerprint: "o1",
    reviewedFingerprintBreakdown: JSON.stringify(breakdown()),
    reviewedAt: new Date("2026-09-01T00:00:00.000Z"),
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    reviewer: { name: "홍길동", email: "hong@example.com" },
    ...overrides,
  };
}

function test5_changedCategoriesComputedFromBreakdownDiff() {
  const upToDateView = toPEICReviewView(baseRow(), breakdown());
  assert(upToDateView.displayState === "REVIEWED", "일치하면 REVIEWED");
  assert(upToDateView.changedCategories.length === 0, "변화가 없으면 changedCategories는 비어있어야 함");

  const financialChangedView = toPEICReviewView(baseRow(), breakdown({ overall: "o2", financial: "f2" }));
  assert(financialChangedView.displayState === "RE_REVIEW_REQUIRED", "overall이 바뀌면 RE_REVIEW_REQUIRED");
  assert(financialChangedView.changedCategories.includes("재무"), "financial 카테고리만 바뀌었으면 '재무'가 changedCategories에 있어야 함");
  assert(!financialChangedView.changedCategories.includes("QoE"), "QoE는 안 바뀌었으면 changedCategories에 없어야 함");

  const noHistoryRow = baseRow({ reviewedFingerprintBreakdown: null, status: "NOT_REVIEWED", reviewedFingerprint: null });
  const noHistoryView = toPEICReviewView(noHistoryRow, breakdown());
  assert(noHistoryView.changedCategories.length === 0, "이전 breakdown이 없으면(첫 검토 전) changedCategories는 비어있어야 함(지어내지 않음)");
  console.log("✅ 5 — changedCategories는 저장된 breakdown과 지금 breakdown을 필드별로 비교해 정확히 계산됨");
}

function main() {
  console.log("\n=== PE IC Review Sign-off 테스트 ===\n");
  test1_noApprovalLanguageInStatuses();
  test2_changesRequestedNeedsComment();
  test3_commentTargetValidation();
  test4_displayStateDerivesReReviewRequired();
  test5_changedCategoriesComputedFromBreakdownDiff();
  console.log("\n✅ PE IC Review Sign-off 테스트 통과\n");
}

main();
