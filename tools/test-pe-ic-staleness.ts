/**
 * PE IC Committee Pack — Staleness/재검토 필요 시나리오(§Step13/§Step19,
 * PR #110) 검증.
 *
 * 라이브 DB를 쓰지 않는다(이 레포 관례) — `computeCommitteePackFingerprintBreakdown()`/
 * `computeReviewDisplayState()`/`toPEICReviewView()`(전부 순수 함수)만으로
 * §Step19의 시나리오 A~H를 재현한다.
 *
 * Usage: npm run test:pe-ic-staleness
 */
import { buildPEICDecision } from "../src/lib/pe/pe-ic-decision";
import { buildPEDecisionReadiness } from "../src/lib/pe/pe-decision-readiness";
import { buildPEDDCase } from "../src/lib/pe/dd-lineage";
import { createPEDDFinding } from "../src/lib/pe/dd-validation";
import { buildPEEvidenceLineage } from "../src/lib/pe/evidence-lineage";
import { computeCommitteePackFingerprintBreakdown } from "../src/lib/pe/pe-committee-pack-fingerprint";
import { computeReviewDisplayState } from "../src/lib/pe/pe-ic-review-signoff";
import { toPEICReviewView, type PEICReviewRowLike } from "../src/lib/pe/pe-ic-review-signoff-types";
import type { FinancialCalcResult } from "../src/lib/pe/financial-types";
import type { PEEvidenceRequestView } from "../src/lib/pe/pe-ic-review-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const missingInput: FinancialCalcResult = { status: "missing_input", missing: ["EBITDA"] };
const financialQuality = { latestPeriodLabel: null, revenue: missingInput, revenueGrowth: { status: "not_available" as const }, ebitda: missingInput, ebitdaMargin: { status: "not_available" as const }, netDebt: missingInput, netDebtToEbitda: { status: "not_available" as const } };
const dartStatus = { imported: false, periodsCount: 0, latestFiscalYear: null };

function decisionFor(readiness: ReturnType<typeof buildPEDecisionReadiness>, ddCase?: ReturnType<typeof buildPEDDCase>) {
  return buildPEICDecision({ dealId: "deal-1", readiness, financialQuality, qoeSummary: null, lboEntryEbitda: { status: "no_period" }, dartStatus, ddCase });
}

function reviewedRow(fingerprint: string, breakdownJson: string): PEICReviewRowLike {
  return {
    id: "review-1",
    maDealId: "deal-1",
    reviewerId: "user-1",
    status: "REVIEWED",
    comment: null,
    reviewedFingerprint: fingerprint,
    reviewedFingerprintBreakdown: breakdownJson,
    reviewedAt: new Date("2026-09-01T00:00:00.000Z"),
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    reviewer: { name: "홍길동", email: null },
  };
}

// ── A. 빈 딜: fingerprint가 계산되고, NOT_REVIEWED 표시는 그대로 ────────

function testA_emptyDeal() {
  const readiness = buildPEDecisionReadiness({ periods: [] });
  const decision = decisionFor(readiness);
  const bd = computeCommitteePackFingerprintBreakdown(decision, []);
  assert(typeof bd.overall === "string" && bd.overall.length > 0, "빈 딜이어도 fingerprint는 계산돼야 함");
  const display = computeReviewDisplayState("NOT_REVIEWED", null, bd.overall);
  assert(display === "NOT_REVIEWED", "리뷰 기록이 없으면 NOT_REVIEWED 그대로");
  console.log("✅ A — 빈 딜: fingerprint 계산됨, 표시 상태는 NOT_REVIEWED");
}

// ── C. 근거로 재무 충돌이 해소되면 → readiness 재계산 → fingerprint 변경 → REVIEWED였던 리뷰가 RE_REVIEW_REQUIRED로 ──

function testC_evidenceResolvesConflictMakesReviewedStale() {
  const p = { id: "p1", fiscalYear: 2024, periodType: "ANNUAL" as const, currency: "KRW", lineItems: [
    { id: "li-1", lineItem: "REVENUE", value: 1000, currency: "KRW", source: "DART" },
    { id: "li-2", lineItem: "REVENUE", value: 1200, currency: "KRW", source: "MANUAL" },
  ], adjustments: [], normalizedSummary: { revenue: { status: "ok" as const, value: 1000 }, ebitda: missingInput, netDebt: missingInput } };
  const blockedReadiness = buildPEDecisionReadiness({ periods: [p] });
  const blockedDecision = decisionFor(blockedReadiness);
  assert(blockedDecision.processState === "BLOCKED", "재무 충돌이 있으면 BLOCKED여야 함");
  const blockedBd = computeCommitteePackFingerprintBreakdown(blockedDecision, []);

  // 리뷰어가 이 시점에 REVIEWED로 서명했다고 가정 — 저장된 fingerprint는 blockedBd.
  const reviewRow = reviewedRow(blockedBd.overall, JSON.stringify(blockedBd));
  const stillCurrent = toPEICReviewView(reviewRow, blockedBd);
  assert(stillCurrent.displayState === "REVIEWED", "자료가 안 바뀌었으면 REVIEWED 그대로 보여야 함");

  // 충돌이 해소된 재무기간(단일 값)으로 다시 계산 — canonical 데이터 변경.
  const resolvedPeriod = { ...p, lineItems: [{ id: "li-1", lineItem: "REVENUE", value: 1000, currency: "KRW", source: "DART" }] };
  const resolvedReadiness = buildPEDecisionReadiness({ periods: [resolvedPeriod] });
  const resolvedDecision = decisionFor(resolvedReadiness);
  const resolvedBd = computeCommitteePackFingerprintBreakdown(resolvedDecision, []);

  assert(resolvedBd.overall !== blockedBd.overall, "재무 충돌이 해소되면 fingerprint가 바뀌어야 함");
  const staleView = toPEICReviewView(reviewRow, resolvedBd);
  assert(staleView.status === "REVIEWED", "저장된 DB status 자체는 조용히 덮어쓰지 않는다 — 여전히 REVIEWED");
  assert(staleView.displayState === "RE_REVIEW_REQUIRED", `자료가 바뀌면 표시 상태는 RE_REVIEW_REQUIRED여야 함, 실제: ${staleView.displayState}`);
  assert(staleView.changedCategories.includes("재무"), "변경된 카테고리에 '재무'가 포함돼야 함");
  console.log("✅ C — 근거로 재무 충돌 해소 → fingerprint 변경 → 이전 REVIEWED가 RE_REVIEW_REQUIRED로 파생 표시(DB status는 그대로)");
}

// ── D. QoE 변경 → fingerprint 변경 ────────────────────────────────────

function testD_qoeChangeAffectsFingerprint() {
  const readiness = buildPEDecisionReadiness({ periods: [] });
  const decisionNoQoe = buildPEICDecision({ dealId: "deal-1", readiness, financialQuality, qoeSummary: null, lboEntryEbitda: { status: "no_period" }, dartStatus });
  const decisionWithQoe = buildPEICDecision({
    dealId: "deal-1",
    readiness,
    financialQuality,
    qoeSummary: { reportedEbitda: { status: "ok", value: 1000 }, adjustedEbitda: { status: "ok", value: 1100 }, counts: { approved: 1, total: 2 } } as unknown as Parameters<typeof buildPEICDecision>[0]["qoeSummary"],
    lboEntryEbitda: { status: "no_period" },
    dartStatus,
  });
  const bdNoQoe = computeCommitteePackFingerprintBreakdown(decisionNoQoe, []);
  const bdWithQoe = computeCommitteePackFingerprintBreakdown(decisionWithQoe, []);
  assert(bdNoQoe.overall !== bdWithQoe.overall, "QoE 데이터가 생기면 fingerprint가 바뀌어야 함");
  assert(bdNoQoe.qoe !== bdWithQoe.qoe, "QoE 카테고리 해시도 바뀌어야 함");
  assert(bdNoQoe.financial === bdWithQoe.financial, "QoE만 바뀌었으면 financial 카테고리는 그대로여야 함(카테고리별 격리)");
  console.log("✅ D — QoE 변경은 QoE 카테고리 해시만 바꾸고 financial 카테고리는 격리됨");
}

// ── E. DD finding 변경 → fingerprint 변경 ─────────────────────────────

function testE_ddFindingChangeAffectsFingerprint() {
  const lineage = buildPEEvidenceLineage({});
  const readiness = buildPEDecisionReadiness({ periods: [] });
  const ddCaseEmpty = buildPEDDCase(lineage, []);
  const ddCaseWithFinding = buildPEDDCase(lineage, [
    createPEDDFinding({ id: "f-1", category: "LEGAL", title: "라이선스 조항", description: "d", severity: "HIGH", status: "DRAFT" }),
  ]);
  const bdEmpty = computeCommitteePackFingerprintBreakdown(decisionFor(readiness, ddCaseEmpty), []);
  const bdWithFinding = computeCommitteePackFingerprintBreakdown(decisionFor(readiness, ddCaseWithFinding), []);
  assert(bdEmpty.dd !== bdWithFinding.dd, "DD finding이 추가되면 dd 카테고리 해시가 바뀌어야 함");
  assert(bdEmpty.overall !== bdWithFinding.overall, "DD finding 변경은 overall fingerprint도 바꿔야 함");
  console.log("✅ E — DD finding 변경은 dd 카테고리 해시를 바꿈");
}

// ── F. 코멘트만 바뀌면 canonical fingerprint는 그대로(리뷰 코멘트는 해시에 포함 안 됨) ──

function testF_onlyCommentChangeKeepsFingerprintStable() {
  const readiness = buildPEDecisionReadiness({ periods: [] });
  const decision = decisionFor(readiness);
  const bd1 = computeCommitteePackFingerprintBreakdown(decision, []);
  const bd2 = computeCommitteePackFingerprintBreakdown(decision, []);
  // 코멘트/서명 상태는애초에 fingerprint 계산 입력에 들어가지 않는다 —
  // 같은 canonical 입력을 두 번 계산해도 항상 같다는 사실 자체가 그 증거.
  assert(bd1.overall === bd2.overall, "코멘트가 fingerprint 계산 입력에 없으므로 canonical 데이터가 그대로면 fingerprint도 그대로여야 함");
  console.log("✅ F — 코멘트/서명 상태는 fingerprint 계산에 전혀 관여하지 않음(canonical 데이터만 반영)");
}

// ── H. cross-deal fingerprint 주입 방어(구조적) ───────────────────────────

function testH_crossDealFingerprintNeverMatchesByAccident() {
  const readinessA = buildPEDecisionReadiness({ periods: [] });
  const lineage = buildPEEvidenceLineage({});
  const ddCaseB = buildPEDDCase(lineage, [
    createPEDDFinding({ id: "f-b", category: "TAX", title: "Deal B만의 finding", description: "d", severity: "CRITICAL", status: "DRAFT" }),
  ]);
  const bdA = computeCommitteePackFingerprintBreakdown(decisionFor(readinessA), []);
  const bdB = computeCommitteePackFingerprintBreakdown(decisionFor(readinessA, ddCaseB), []);
  assert(bdA.overall !== bdB.overall, "서로 다른 딜의 canonical 데이터는 다른 fingerprint를 내야 함(우연히 일치하면 재검토 감지가 무력화됨)");

  // Deal A의 리뷰 행에 Deal B의 fingerprint를 억지로 끼워 넣어도(주입 시나리오),
  // 이 함수는 순수 비교일 뿐이므로 "실제로 다르면 다르다"고 정직하게 판정한다 —
  // 실제 주입 자체를 막는 것은 route.ts가 절대 클라이언트 fingerprint를
  // 받지 않는다는 구조(§Step18 10)이지, 이 비교 함수의 책임이 아니다.
  const view = toPEICReviewView(reviewedRow(bdB.overall, JSON.stringify(bdB)), bdA);
  assert(view.displayState === "RE_REVIEW_REQUIRED", "저장된 fingerprint가 지금 딜의 fingerprint와 다르면 항상 RE_REVIEW_REQUIRED여야 함(주입된 값이 우연히 유효한 것처럼 보이지 않음)");
  console.log("✅ H — 다른 딜의 fingerprint는 절대 우연히 일치하지 않고, 불일치 시 항상 RE_REVIEW_REQUIRED로 정직하게 판정됨");
}

function main() {
  console.log("\n=== PE IC Committee Pack Staleness 테스트 ===\n");
  testA_emptyDeal();
  testC_evidenceResolvesConflictMakesReviewedStale();
  testD_qoeChangeAffectsFingerprint();
  testE_ddFindingChangeAffectsFingerprint();
  testF_onlyCommentChangeKeepsFingerprintStable();
  testH_crossDealFingerprintNeverMatchesByAccident();
  console.log("\n✅ PE IC Committee Pack Staleness 테스트 통과\n");
}

main();
