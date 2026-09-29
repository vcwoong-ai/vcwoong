/**
 * PE IC Review Audit Trail(PR #111) — 순수 로직 검증.
 *
 * 라이브 DB를 쓰지 않는다(이 레포 관례) — `extractOpenQuestionSummary()`/
 * `toPEICReviewSnapshotView()`/`toPEICAuditEventView()`(전부 순수 함수)만으로
 * §33/§34의 결정성/민감도/false-staleness/diff 시나리오를 재현한다.
 * DB 트랜잭션/버전 단조증가/동시성/권한(§35)은 라이브 SQLite 테스트가 따로 맡는다.
 *
 * Usage: npm run test:pe-ic-review-audit
 */
import { extractOpenQuestionSummary, toPEICReviewSnapshotView, toPEICAuditEventView, type PEICReviewSnapshotRowLike, type PEICAuditEventRowLike } from "../src/lib/pe/pe-ic-review-audit";
import type { PECommitteePackFingerprintBreakdown } from "../src/lib/pe/pe-committee-pack-fingerprint";
import type { ICQuestion } from "../src/lib/pe/pe-ic-decision-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function question(code: string, priority: ICQuestion["priority"]): ICQuestion {
  return { code, sourceType: "BLOCKER", domainLabel: "재무", priority, question: `${code} 질문`, whyItMatters: "d", requiredEvidence: "d", decisionImpact: "d" };
}

function breakdown(overall: string, overrides: Partial<PECommitteePackFingerprintBreakdown> = {}): PECommitteePackFingerprintBreakdown {
  return { overall, financial: "f1", qoe: "q1", lbo: "l1", dd: "d1", evidence: "e1", questions: "qu1", ...overrides };
}

function snapshotRow(overrides: Partial<PEICReviewSnapshotRowLike> = {}): PEICReviewSnapshotRowLike {
  return {
    id: "snap-1",
    maDealId: "deal-1",
    version: 1,
    reviewerId: "user-1",
    fingerprint: "fp-1",
    fingerprintBreakdown: JSON.stringify(breakdown("fp-1")),
    openQuestionCodes: JSON.stringify(["Q1", "Q2"]),
    openQuestionCount: 2,
    openP0Count: 1,
    comment: null,
    reviewedAt: new Date("2026-09-01T00:00:00.000Z"),
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    reviewer: { name: "홍길동", email: null },
    ...overrides,
  };
}

// ── extractOpenQuestionSummary: 결정성 + P0 카운트 ────────────────────

function testExtractOpenQuestionSummary_determinism() {
  const questions = [question("Q1", "P0"), question("Q2", "P1"), question("Q3", "P0"), question("Q4", "P2")];
  const a = extractOpenQuestionSummary(questions);
  const b = extractOpenQuestionSummary(questions);
  assert(JSON.stringify(a) === JSON.stringify(b), "같은 입력이면 항상 같은 요약이 나와야 함(결정성)");
  assert(a.count === 4, `count는 4여야 함, 실제: ${a.count}`);
  assert(a.p0Count === 2, `P0 개수는 2여야 함, 실제: ${a.p0Count}`);
  assert(JSON.stringify(a.codes) === JSON.stringify(["Q1", "Q2", "Q3", "Q4"]), "codes는 입력 순서를 그대로 유지해야 함(우선순위 재판정 없음)");
  console.log("✅ extractOpenQuestionSummary — 결정성 + P0 카운트 + 코드 순서 보존");
}

function testExtractOpenQuestionSummary_empty() {
  const summary = extractOpenQuestionSummary([]);
  assert(summary.count === 0 && summary.p0Count === 0 && summary.codes.length === 0, "빈 질문 목록이면 전부 0/빈 배열이어야 함");
  console.log("✅ extractOpenQuestionSummary — 빈 목록");
}

function testExtractOpenQuestionSummary_neverStoresFullText() {
  const questions = [question("Q1", "P0")];
  const summary = extractOpenQuestionSummary(questions);
  assert(!("question" in summary) && !("whyItMatters" in summary), "요약은 질문 원문을 담지 않아야 함(§45, 코드만 저장)");
  console.log("✅ extractOpenQuestionSummary — 질문 원문을 저장하지 않음(코드만)");
}

// ── toPEICReviewSnapshotView: isCurrent 파생값 ─────────────────────────

function testSnapshotView_isCurrentTrueWhenFingerprintMatches() {
  const row = snapshotRow({ fingerprint: "fp-now" });
  const view = toPEICReviewSnapshotView(row, "fp-now", null);
  assert(view.isCurrent === true, "저장된 fingerprint가 지금 fingerprint와 같으면 isCurrent는 true여야 함");
  console.log("✅ toPEICReviewSnapshotView — fingerprint 일치 시 isCurrent=true");
}

function testSnapshotView_isCurrentFalseWhenFingerprintDiffers() {
  const row = snapshotRow({ fingerprint: "fp-old" });
  const view = toPEICReviewSnapshotView(row, "fp-now", null);
  assert(view.isCurrent === false, "저장된 fingerprint가 지금 fingerprint와 다르면 isCurrent는 false여야 함(재검토 필요 신호)");
  console.log("✅ toPEICReviewSnapshotView — fingerprint 불일치 시 isCurrent=false(false-staleness 방지: 같으면 반드시 true)");
}

// ── toPEICReviewSnapshotView: changedCategoriesFromPrevious ────────────

function testSnapshotView_noPreviousMeansNoChangedCategories() {
  const row = snapshotRow();
  const view = toPEICReviewSnapshotView(row, "fp-1", null);
  assert(view.changedCategoriesFromPrevious.length === 0, "첫 검토(이전 스냅샷 없음)는 변경 카테고리가 없어야 함");
  console.log("✅ toPEICReviewSnapshotView — 첫 리뷰(이전 스냅샷 없음)는 changedCategoriesFromPrevious=[]");
}

function testSnapshotView_detectsChangedCategory() {
  const previous = breakdown("fp-prev", { financial: "f1" });
  const row = snapshotRow({ fingerprint: "fp-2", fingerprintBreakdown: JSON.stringify(breakdown("fp-2", { financial: "f2" })) });
  const view = toPEICReviewSnapshotView(row, "fp-2", previous);
  assert(view.changedCategoriesFromPrevious.includes("재무"), "재무 카테고리 해시가 바뀌었으면 '재무'가 포함돼야 함");
  assert(view.changedCategoriesFromPrevious.length === 1, `financial만 바뀌었으므로 정확히 1개 카테고리만 감지돼야 함, 실제: ${JSON.stringify(view.changedCategoriesFromPrevious)}`);
  console.log("✅ toPEICReviewSnapshotView — 카테고리별 민감도(financial만 변경 시 다른 카테고리는 감지 안 됨)");
}

function testSnapshotView_noChangeWhenBreakdownIdentical() {
  const previous = breakdown("fp-1");
  const row = snapshotRow({ fingerprint: "fp-1", fingerprintBreakdown: JSON.stringify(breakdown("fp-1")) });
  const view = toPEICReviewSnapshotView(row, "fp-1", previous);
  assert(view.changedCategoriesFromPrevious.length === 0, "breakdown이 완전히 동일하면 변경 카테고리가 없어야 함");
  console.log("✅ toPEICReviewSnapshotView — breakdown 동일 시 changedCategoriesFromPrevious=[]");
}

// ── toPEICReviewSnapshotView: 손상된 JSON에도 죽지 않는다(방어적 파싱) ──

function testSnapshotView_malformedBreakdownFallsBackSafely() {
  const row = snapshotRow({ fingerprint: "fp-broken", fingerprintBreakdown: "{not valid json" });
  const view = toPEICReviewSnapshotView(row, "fp-broken", null);
  assert(view.fingerprintBreakdown.overall === "fp-broken", "breakdown JSON이 손상돼도 최소한 overall fingerprint는 유지돼야 함(row.fingerprint로 폴백)");
  assert(view.isCurrent === true, "손상된 breakdown이어도 overall fingerprint 비교(isCurrent)는 정상 동작해야 함");
  console.log("✅ toPEICReviewSnapshotView — 손상된 breakdown JSON도 예외 없이 안전한 폴백으로 처리됨");
}

function testSnapshotView_malformedCodesFallsBackToEmpty() {
  const row = snapshotRow({ openQuestionCodes: "not an array" });
  const view = toPEICReviewSnapshotView(row, "fp-1", null);
  assert(Array.isArray(view.openQuestionCodes) && view.openQuestionCodes.length === 0, "손상된 openQuestionCodes JSON은 빈 배열로 폴백해야 함(예외 발생 금지)");
  console.log("✅ toPEICReviewSnapshotView — 손상된 openQuestionCodes JSON도 빈 배열로 안전 폴백");
}

function testSnapshotView_nonArrayCodesJsonFallsBackToEmpty() {
  const row = snapshotRow({ openQuestionCodes: JSON.stringify({ not: "an array" }) });
  const view = toPEICReviewSnapshotView(row, "fp-1", null);
  assert(view.openQuestionCodes.length === 0, "유효한 JSON이지만 배열이 아니면 빈 배열로 폴백해야 함");
  console.log("✅ toPEICReviewSnapshotView — 배열이 아닌 유효 JSON도 빈 배열로 폴백");
}

// ── toPEICReviewSnapshotView: 저장된 값(버전/리뷰어/코멘트 등)은 그대로 통과 ──

function testSnapshotView_passesThroughStoredFields() {
  const row = snapshotRow({ version: 7, reviewerId: "user-9", comment: "재무 데이터 재확인 완료", openQuestionCount: 3, openP0Count: 1 });
  const view = toPEICReviewSnapshotView(row, "fp-1", null);
  assert(view.version === 7, "version은 저장된 값 그대로 노출돼야 함(재계산 없음)");
  assert(view.reviewerId === "user-9", "reviewerId는 저장된 값 그대로여야 함");
  assert(view.comment === "재무 데이터 재확인 완료", "comment는 저장된 값 그대로여야 함");
  assert(view.openQuestionCount === 3 && view.openP0Count === 1, "미해결 카운트는 저장된 값 그대로여야 함(스냅샷 시점 값, 재계산 없음)");
  console.log("✅ toPEICReviewSnapshotView — 저장된 필드(version/reviewer/comment/카운트)는 재계산 없이 그대로 노출");
}

// ── toPEICAuditEventView ────────────────────────────────────────────

function auditEventRow(overrides: Partial<PEICAuditEventRowLike> = {}): PEICAuditEventRowLike {
  return {
    id: "evt-1",
    maDealId: "deal-1",
    reviewSnapshotId: null,
    actorId: "user-1",
    eventType: "COMMENT_ADDED",
    targetType: null,
    targetId: null,
    metadata: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    actor: { name: "홍길동", email: null },
    reviewSnapshot: null,
    ...overrides,
  };
}

function testAuditEventView_nullSnapshotVersionWhenNoSnapshot() {
  const view = toPEICAuditEventView(auditEventRow());
  assert(view.reviewSnapshotVersion === null, "연결된 스냅샷이 없으면 reviewSnapshotVersion은 null이어야 함(코멘트/근거요청 이벤트)");
  console.log("✅ toPEICAuditEventView — 스냅샷 없는 이벤트는 reviewSnapshotVersion=null");
}

function testAuditEventView_exposesSnapshotVersionWhenLinked() {
  const view = toPEICAuditEventView(auditEventRow({ eventType: "REVIEW_COMPLETED", reviewSnapshotId: "snap-1", reviewSnapshot: { version: 3 } }));
  assert(view.reviewSnapshotVersion === 3, `연결된 스냅샷 버전이 그대로 노출돼야 함, 실제: ${view.reviewSnapshotVersion}`);
  console.log("✅ toPEICAuditEventView — REVIEW_COMPLETED 이벤트는 연결된 스냅샷 버전을 노출");
}

function testAuditEventView_metadataNullHandledSafely() {
  const view = toPEICAuditEventView(auditEventRow({ metadata: null }));
  assert(view.metadata === null, "metadata가 없으면 null이어야 함(예외 없이)");
  const viewWithMeta = toPEICAuditEventView(auditEventRow({ metadata: { requestId: "req-1" } }));
  assert(viewWithMeta.metadata !== null && (viewWithMeta.metadata as Record<string, unknown>).requestId === "req-1", "metadata가 있으면 구조 그대로 통과해야 함");
  console.log("✅ toPEICAuditEventView — metadata null/존재 모두 안전하게 처리");
}

function main() {
  console.log("\n=== PE IC Review Audit Trail(PR #111) 순수 로직 테스트 ===\n");
  testExtractOpenQuestionSummary_determinism();
  testExtractOpenQuestionSummary_empty();
  testExtractOpenQuestionSummary_neverStoresFullText();
  testSnapshotView_isCurrentTrueWhenFingerprintMatches();
  testSnapshotView_isCurrentFalseWhenFingerprintDiffers();
  testSnapshotView_noPreviousMeansNoChangedCategories();
  testSnapshotView_detectsChangedCategory();
  testSnapshotView_noChangeWhenBreakdownIdentical();
  testSnapshotView_malformedBreakdownFallsBackSafely();
  testSnapshotView_malformedCodesFallsBackToEmpty();
  testSnapshotView_nonArrayCodesJsonFallsBackToEmpty();
  testSnapshotView_passesThroughStoredFields();
  testAuditEventView_nullSnapshotVersionWhenNoSnapshot();
  testAuditEventView_exposesSnapshotVersionWhenLinked();
  testAuditEventView_metadataNullHandledSafely();
  console.log("\n✅ PE IC Review Audit Trail 순수 로직 테스트 통과\n");
}

main();
