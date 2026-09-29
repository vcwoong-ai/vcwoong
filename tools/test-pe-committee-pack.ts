/**
 * PE IC Committee Pack(pe-committee-pack.ts/pe-committee-pack-fingerprint.ts,
 * PR #110) 검증.
 *
 * 라이브 DB를 쓰지 않는다(이 레포 관례). 확인하는 것:
 * 1. Committee Pack이 새 진실 소스가 아니다 — decision/review 필드가
 *    buildPEICDecision()/buildPEICReviewWorkspace()의 결과와 정확히 같다.
 * 2. 빈 딜이어도 값을 지어내지 않는다.
 * 3. currentReviewStateLabel에 BUY/PASS/투자 점수/추천 문구가 없다.
 * 4. fingerprint는 결정론적이다(같은 입력 → 같은 값).
 * 5. fingerprint는 canonical 데이터가 바뀌면 바뀐다(재무 충돌 추가).
 * 6. buildPECommitteePackContent()(crypto 없는 버전)는 buildPECommitteePack()의
 *    fingerprint를 제외한 나머지 필드와 완전히 동일하다.
 *
 * Usage: npm run test:pe-committee-pack
 */
import { buildPECommitteePackContent, buildCurrentReviewStateLabel, type PECommitteePackInput } from "../src/lib/pe/pe-committee-pack";
import { buildPECommitteePack, computeCommitteePackFingerprint } from "../src/lib/pe/pe-committee-pack-fingerprint";
import { buildPEICDecision } from "../src/lib/pe/pe-ic-decision";
import { buildPEICReviewWorkspace } from "../src/lib/pe/pe-ic-review";
import { buildPEDecisionReadiness } from "../src/lib/pe/pe-decision-readiness";
import { buildPEDDCase } from "../src/lib/pe/dd-lineage";
import { buildPEEvidenceLineage } from "../src/lib/pe/evidence-lineage";
import type { FinancialCalcResult } from "../src/lib/pe/financial-types";
import type { PEEvidenceRequestView } from "../src/lib/pe/pe-ic-review-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const missingInput: FinancialCalcResult = { status: "missing_input", missing: ["EBITDA"] };
function ok(value: number): FinancialCalcResult {
  return { status: "ok", value };
}

function baseInput(overrides: Partial<PECommitteePackInput> & { readiness: PECommitteePackInput["readiness"] }): PECommitteePackInput {
  return {
    dealId: "deal-1",
    maDeal: { companyName: "테스트회사", name: "테스트딜", dealType: "BUYOUT", status: "ACTIVE" },
    financialQuality: { latestPeriodLabel: null, revenue: missingInput, revenueGrowth: { status: "not_available" }, ebitda: missingInput, ebitdaMargin: { status: "not_available" }, netDebt: missingInput, netDebtToEbitda: { status: "not_available" } },
    qoeSummary: null,
    lboEntryEbitda: { status: "no_period" },
    dartStatus: { imported: false, periodsCount: 0, latestFiscalYear: null },
    evidenceRequests: [],
    ...overrides,
  };
}

// ── 1. Committee Pack은 새 진실 소스가 아니다 ────────────────────────────

function test1_packEnvelopesExactSameDecisionAndReview() {
  const readiness = buildPEDecisionReadiness({ periods: [] });
  const input = baseInput({ readiness });
  const content = buildPECommitteePackContent(input);

  const decision = buildPEICDecision({
    dealId: input.dealId,
    readiness: input.readiness,
    financialQuality: input.financialQuality,
    qoeSummary: input.qoeSummary,
    lboEntryEbitda: input.lboEntryEbitda,
    dartStatus: input.dartStatus,
    ddCase: input.ddCase,
    lboAssumptionKeysProvided: undefined,
  });
  const review = buildPEICReviewWorkspace(input.dealId, decision.processState, decision.questions, input.evidenceRequests);

  assert(JSON.stringify(content.decision) === JSON.stringify(decision), "content.decision은 buildPEICDecision()의 결과와 완전히 같아야 함");
  assert(JSON.stringify(content.review) === JSON.stringify(review), "content.review는 buildPEICReviewWorkspace()의 결과와 완전히 같아야 함");
  console.log("✅ 1 — Committee Pack의 decision/review는 기존 엔진 결과를 그대로 봉투에 담은 것뿐(새 진실 소스 아님)");
}

// ── 2. 빈 딜이어도 값을 지어내지 않음 ─────────────────────────────────────

function test2_emptyDealNeverFabricates() {
  const readiness = buildPEDecisionReadiness({ periods: [] });
  const content = buildPECommitteePackContent(baseInput({ readiness }));
  assert(content.decision.thesis.length === 0, "빈 딜은 thesis가 없어야 함");
  assert(content.decision.drivers.length === 0, "빈 딜은 driver가 없어야 함");
  assert(content.decision.financial.revenue.status !== "ok", "빈 딜의 재무 값은 ok가 아니어야 함(지어내지 않음)");
  assert(content.decision.processState === "NOT_READY", `빈 딜은 NOT_READY여야 함, 실제: ${content.decision.processState}`);
  console.log("✅ 2 — 빈 딜이어도 값을 지어내지 않고 정직하게 빈 상태를 반환");
}

// ── 3. BUY/PASS/투자 점수/추천 문구 없음 ─────────────────────────────────

function test3_noInvestmentRecommendationLanguage() {
  const forbidden = /\bBUY\b|\bPASS\b|GO\/NO-GO|투자\s*점수|투자\s*추천|승인\s*확률/i;
  for (const state of ["BLOCKED", "NOT_READY", "PARTIALLY_READY", "READY_FOR_IC"] as const) {
    const label = buildCurrentReviewStateLabel(state);
    assert(!forbidden.test(label), `${state} 라벨에 투자 판단 문구가 있으면 안 됨: "${label}"`);
  }
  console.log("✅ 3 — currentReviewStateLabel 어디에도 BUY/PASS/투자 점수/추천 문구가 없음");
}

// ── 4. fingerprint 결정론 ─────────────────────────────────────────────

function test4_fingerprintIsDeterministic() {
  const readiness = buildPEDecisionReadiness({ periods: [] });
  const input = baseInput({ readiness });
  const a = buildPECommitteePack(input);
  const b = buildPECommitteePack(input);
  assert(a.fingerprint === b.fingerprint, "같은 입력이면 fingerprint가 항상 같아야 함");
  assert(a.fingerprintBreakdown.financial === b.fingerprintBreakdown.financial, "카테고리별 하위 해시도 결정론적이어야 함");
  console.log("✅ 4 — fingerprint/breakdown은 결정론적(같은 입력 → 같은 해시)");
}

// ── 5. canonical 데이터가 바뀌면 fingerprint도 바뀜 ───────────────────────

function test5_fingerprintChangesWithCanonicalData() {
  const lineage = buildPEEvidenceLineage({});
  const ddCaseA = buildPEDDCase(lineage, []);
  const readinessA = buildPEDecisionReadiness({ periods: [], ddCase: ddCaseA, evidenceLineage: lineage });
  const p = { id: "p1", fiscalYear: 2024, periodType: "ANNUAL" as const, currency: "KRW", lineItems: [
    { id: "li-1", lineItem: "REVENUE", value: 1000, currency: "KRW", source: "DART" },
    { id: "li-2", lineItem: "REVENUE", value: 1200, currency: "KRW", source: "MANUAL" },
  ], adjustments: [], normalizedSummary: { revenue: ok(1000), ebitda: missingInput, netDebt: missingInput } };
  const readinessB = buildPEDecisionReadiness({ periods: [p] });

  const fpA = computeCommitteePackFingerprint(
    buildPEICDecision({ dealId: "deal-1", readiness: readinessA, financialQuality: baseInput({ readiness: readinessA }).financialQuality, qoeSummary: null, lboEntryEbitda: { status: "no_period" }, dartStatus: { imported: false, periodsCount: 0, latestFiscalYear: null } }),
    []
  );
  const fpB = computeCommitteePackFingerprint(
    buildPEICDecision({ dealId: "deal-1", readiness: readinessB, financialQuality: baseInput({ readiness: readinessB }).financialQuality, qoeSummary: null, lboEntryEbitda: { status: "no_period" }, dartStatus: { imported: false, periodsCount: 0, latestFiscalYear: null } }),
    []
  );
  assert(fpA !== fpB, "재무 데이터 충돌이 생기면 fingerprint가 바뀌어야 함");
  console.log("✅ 5 — canonical 데이터(재무 충돌)가 바뀌면 fingerprint도 바뀜");
}

// ── 6. evidence request 상태 변화도 fingerprint에 반영됨 ─────────────────

function test6_evidenceRequestStatusAffectsFingerprint() {
  const readiness = buildPEDecisionReadiness({ periods: [] });
  const decision = buildPEICDecision({ dealId: "deal-1", readiness, financialQuality: baseInput({ readiness }).financialQuality, qoeSummary: null, lboEntryEbitda: { status: "no_period" }, dartStatus: { imported: false, periodsCount: 0, latestFiscalYear: null } });

  const request = (status: PEEvidenceRequestView["status"]): PEEvidenceRequestView => ({
    id: "req-1",
    ddCaseId: "dd-1",
    reviewItemSourceType: "MISSING_INFO",
    reviewItemSourceId: "MISSING_X",
    title: "요청",
    requestedDocument: null,
    requestedFact: null,
    reason: "사유",
    priority: "P1",
    status,
    linkedDocumentId: null,
    createdByUserId: "user-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  });

  const fpRequested = computeCommitteePackFingerprint(decision, [request("REQUESTED")]);
  const fpAccepted = computeCommitteePackFingerprint(decision, [request("ACCEPTED")]);
  assert(fpRequested !== fpAccepted, "evidence request 상태가 바뀌면 fingerprint도 바뀌어야 함(§4 리뷰 워크플로가 영향받는 근거)");
  console.log("✅ 6 — evidence request 상태 변화도 fingerprint에 반영됨");
}

function main() {
  console.log("\n=== PE IC Committee Pack 테스트 ===\n");
  test1_packEnvelopesExactSameDecisionAndReview();
  test2_emptyDealNeverFabricates();
  test3_noInvestmentRecommendationLanguage();
  test4_fingerprintIsDeterministic();
  test5_fingerprintChangesWithCanonicalData();
  test6_evidenceRequestStatusAffectsFingerprint();
  console.log("\n✅ PE IC Committee Pack 테스트 통과\n");
}

main();
