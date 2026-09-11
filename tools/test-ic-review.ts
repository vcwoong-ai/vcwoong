/**
 * IC Review Workspace(Phase 6) 계산 로직 검증.
 *
 * ic-review.ts는 새 AI 호출도, 새 채점/근거 엔진도 만들지 않는다 —
 * DealScore.evidenceAssessment(Phase 4)·근거 추적 claim(Phase 3)·IC 질문
 * (Phase 5)을 그대로 읽어 결정적으로 재배열만 한다. 여기서는 합성 데이터로
 * Investment Signal 계산, Key Strength/Risk 선정·순위, Unresolved Evidence
 * 연결, 데이터 없음/호환성 처리를 전부 네트워크·DB 없이 검증한다.
 *
 * Usage: npm run test:ic-review
 */
import {
  computeInvestmentSignal,
  computeRecommendation,
  selectKeyStrengths,
  selectKeyRisks,
  selectMustAnswerQuestions,
  selectUnresolvedEvidence,
  type InvestmentSignal,
} from "../src/lib/ic-review";
import type {
  ScoreEvidenceAssessment,
  DimensionEvidenceAssessment,
  ScoreConfidence,
  RiskFlag,
} from "../src/lib/deal-scoring-evidence";
import type { ScoreDimensionKey } from "../src/lib/deal-scoring-shared";
import type { NumericClaim, ClaimConfidence } from "../src/lib/evidence";
import type { IcQuestion } from "../src/lib/ic-questions";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function dim(
  dimension: ScoreDimensionKey,
  score: number,
  confidence: ScoreConfidence,
  overrides: Partial<DimensionEvidenceAssessment> = {}
): DimensionEvidenceAssessment {
  return {
    dimension,
    score,
    confidence,
    evidenceCoverage: confidence === "NO_EVIDENCE" ? null : 80,
    claimsTotal: confidence === "NO_EVIDENCE" ? 0 : 2,
    claimsSupported: confidence === "UNSUPPORTED" ? 0 : 2,
    keyEvidence: [],
    unsupportedClaims: [],
    ...overrides,
  };
}

function assessment(
  dimensions: Partial<Record<ScoreDimensionKey, DimensionEvidenceAssessment>>,
  riskFlags: RiskFlag[] = [],
  overrides: Partial<ScoreEvidenceAssessment> = {}
): ScoreEvidenceAssessment {
  const full = {
    marketSize: dim("marketSize", 50, "MEDIUM"),
    team: dim("team", 50, "MEDIUM"),
    product: dim("product", 50, "MEDIUM"),
    businessModel: dim("businessModel", 50, "MEDIUM"),
    financials: dim("financials", 50, "MEDIUM"),
    moat: dim("moat", 50, "MEDIUM"),
    ...dimensions,
  } as Record<ScoreDimensionKey, DimensionEvidenceAssessment>;

  return {
    overallConfidence: "MEDIUM",
    overallCoverage: 70,
    dimensions: full,
    riskFlags,
    icSummary: { strengths: [], risks: [], unresolved: [] },
    basis: "report_evidence",
    ...overrides,
  };
}

function claim(
  overrides: Partial<NumericClaim> & { raw: string; sectionKey: string }
): NumericClaim {
  return {
    label: "",
    value: "",
    unit: "",
    status: "unverified",
    claimType: "numeric",
    confidence: "UNSUPPORTED" as ClaimConfidence,
    matchMethod: "none",
    claimKey: overrides.raw,
    ...overrides,
  };
}

function question(overrides: Partial<IcQuestion> & { id: string }): IcQuestion {
  return {
    category: "Market",
    question: "",
    whyItMatters: "",
    trigger: "UNSUPPORTED_CLAIM",
    priority: "HIGH",
    suggestedAnswerType: "EXPLANATION",
    source: "deterministic",
    ...overrides,
  };
}

/** 1. 높은 Score + HIGH confidence → STRONG */
function testHighScoreHighConfidenceIsStrong() {
  const signal = computeInvestmentSignal(82, "HIGH");
  assert(signal === "STRONG", `82점+HIGH가 STRONG이 아님: ${signal}`);
  console.log("✅ 높은 Score(82) + HIGH confidence → STRONG");
}

/** 2. 높은 Score + LOW confidence → CAUTION(점수만으로 긍정 신호 주지 않음) */
function testHighScoreLowConfidenceIsCaution() {
  const signal = computeInvestmentSignal(82, "LOW");
  assert(signal === "CAUTION", `82점+LOW가 CAUTION이 아님: ${signal}`);
  console.log("✅ 높은 Score(82) + LOW confidence → CAUTION(근거 부족이 점수를 못 이김)");
}

/** 3. 낮은 Score → HIGH_RISK */
function testLowScoreIsHighRisk() {
  const signal = computeInvestmentSignal(20, "HIGH");
  assert(signal === "HIGH_RISK", `20점이 confidence와 무관하게 HIGH_RISK여야 하는데: ${signal}`);
  console.log("✅ 낮은 Score(20) → confidence와 무관하게 HIGH_RISK");
}

/** 4. NO_EVIDENCE → 점수가 높아도 긍정 신호(STRONG/PROMISING)를 주지 않음 */
function testNoEvidenceNeverStrongOrPromising() {
  const signal = computeInvestmentSignal(90, "NO_EVIDENCE");
  assert(
    signal !== "STRONG" && signal !== "PROMISING",
    `NO_EVIDENCE인데 긍정 신호가 나옴: ${signal}`
  );
  console.log("✅ 근거 평가 자체가 없음(NO_EVIDENCE) → 점수 90점이어도 STRONG/PROMISING 아님");
}

/** 5. Key Strength ranking — 점수 내림차순 */
function testKeyStrengthRanking() {
  const a = assessment({
    product: dim("product", 95, "HIGH"),
    team: dim("team", 72, "MEDIUM"),
    marketSize: dim("marketSize", 88, "HIGH"),
  });
  const strengths = selectKeyStrengths(a, {}, 10);
  assert(strengths.length === 3, `강점이 3개(70점 이상 3개 차원)여야 하는데 ${strengths.length}개`);
  assert(
    strengths.map((s) => s.dimension).join(",") === "product,marketSize,team",
    `점수 내림차순(95,88,72)이 아님: ${strengths.map((s) => `${s.dimension}:${s.score}`).join(",")}`
  );
  console.log("✅ Key Strength가 점수 내림차순으로 정렬됨");
}

/** 6. Key Risk ranking — 요청된 우선순위(UNSUPPORTED_KEY_CLAIM > HIGH_SCORE_LOW_EVIDENCE > VALUATION > dimension gap > low score) */
function testKeyRiskPriorityOrder() {
  const a = assessment(
    {
      team: dim("team", 40, "LOW", { evidenceCoverage: 30, claimsTotal: 2, claimsSupported: 1 }),
      product: dim("product", 80, "UNSUPPORTED", { unsupportedClaims: [{ raw: "임상 3상 완료" }] }),
      financials: dim("financials", 75, "LOW"),
    },
    ["UNSUPPORTED_KEY_CLAIM", "HIGH_SCORE_LOW_EVIDENCE", "VALUATION_EVIDENCE_GAP", "TEAM_EVIDENCE_GAP"]
  );
  const risks = selectKeyRisks(a, {}, 10);
  const order = risks.map((r) => r.trigger);
  assert(
    order[0] === "UNSUPPORTED_KEY_CLAIM" &&
      order[1] === "HIGH_SCORE_LOW_EVIDENCE" &&
      order[2] === "VALUATION_EVIDENCE_GAP",
    `요청된 우선순위(근거없는핵심주장 > 고득점근거부족 > 밸류에이션) 순서가 아님: ${order.join(",")}`
  );
  console.log("✅ Key Risk가 요청된 우선순위(UNSUPPORTED_KEY_CLAIM > HIGH_SCORE_LOW_EVIDENCE > VALUATION > gap) 순서로 정렬됨");
}

/** 7. Key Strength는 최대 3개 */
function testKeyStrengthCapAt3() {
  const a = assessment({
    marketSize: dim("marketSize", 90, "HIGH"),
    team: dim("team", 88, "HIGH"),
    product: dim("product", 85, "HIGH"),
    businessModel: dim("businessModel", 82, "HIGH"),
    financials: dim("financials", 80, "HIGH"),
    moat: dim("moat", 75, "HIGH"),
  });
  const strengths = selectKeyStrengths(a);
  assert(strengths.length === 3, `6개 차원 전부 70점 이상인데 최대 3개로 잘리지 않음: ${strengths.length}`);
  console.log("✅ Key Strength는 조건을 만족하는 차원이 많아도 최대 3개");
}

/** 8. Key Risk는 최대 5개 */
function testKeyRiskCapAt5() {
  const a = assessment(
    {
      marketSize: dim("marketSize", 30, "LOW"),
      team: dim("team", 30, "LOW"),
      product: dim("product", 30, "LOW"),
      businessModel: dim("businessModel", 30, "LOW"),
      financials: dim("financials", 30, "LOW"),
      moat: dim("moat", 30, "LOW"),
    },
    []
  );
  const risks = selectKeyRisks(a);
  assert(risks.length === 5, `6개 차원 전부 낮은 점수인데 최대 5개로 잘리지 않음: ${risks.length}`);
  console.log("✅ Key Risk는 낮은 점수 차원이 많아도 최대 5개");
}

/** 9. Must-Answer IC Questions — 이미 정렬된 순서를 그대로 보존하며 최대 N개로 자름 */
function testMustAnswerQuestionsPreservesOrderAndCap() {
  const questions = [
    question({ id: "q1", priority: "HIGH" }),
    question({ id: "q2", priority: "HIGH" }),
    question({ id: "q3", priority: "MEDIUM" }),
    question({ id: "q4", priority: "MEDIUM" }),
    question({ id: "q5", priority: "LOW" }),
    question({ id: "q6", priority: "LOW" }),
  ];
  const top = selectMustAnswerQuestions(questions, 5);
  assert(top.length === 5, `5개로 잘리지 않음: ${top.length}`);
  assert(
    top.map((q) => q.id).join(",") === "q1,q2,q3,q4,q5",
    `기존 순서를 보존하지 않고 재정렬함: ${top.map((q) => q.id).join(",")}`
  );
  console.log("✅ Must-Answer IC Questions는 기존 정렬(priority 내림차순)을 보존하며 Top 5로 자름");
}

/** 10. Unresolved Evidence — 근거 없는 claim만, IC Question 연결 여부 정확히 표시 */
function testUnresolvedEvidenceLinksIcQuestion() {
  const claims: NumericClaim[] = [
    claim({ raw: "월 매출 3억원", sectionKey: "FINANCIAL_STATUS", status: "unverified" }),
    claim({ raw: "고객사 50곳", sectionKey: "MARKET_ANALYSIS", status: "unverified" }),
    claim({ raw: "ARR 12억원", sectionKey: "FINANCIAL_STATUS", status: "document" }), // 근거 있음 — 제외돼야 함
  ];
  const questions = [question({ id: "q1", relatedClaim: "월 매출 3억원" })];

  const unresolved = selectUnresolvedEvidence(claims, questions, 10);
  assert(unresolved.length === 2, `근거 있는 claim이 섞여 들어감: ${unresolved.length}개`);
  const withQuestion = unresolved.find((u) => u.claim === "월 매출 3억원");
  const withoutQuestion = unresolved.find((u) => u.claim === "고객사 50곳");
  assert(withQuestion?.hasIcQuestion === true, "IC Question과 연결된 claim이 표시되지 않음");
  assert(withoutQuestion?.hasIcQuestion === false, "IC Question이 없는 claim이 잘못 연결 표시됨");
  console.log("✅ Unresolved Evidence는 근거 없는 claim만, IC Question 연결 여부를 정확히 표시");
}

/** 11. Investment Signal은 결정적 — 같은 입력이면 항상 같은 결과 */
function testInvestmentSignalIsDeterministic() {
  const results = new Set<InvestmentSignal>();
  for (let i = 0; i < 5; i++) results.add(computeInvestmentSignal(68, "MEDIUM"));
  assert(results.size === 1, `같은 입력(68점, MEDIUM)인데 결과가 여러 개: ${[...results].join(",")}`);
  console.log("✅ Investment Signal은 같은 입력에 항상 같은 결과(결정적 계산)");
}

/** 12. 데이터 없음 처리 — assessment/claims/questions가 null이어도 죽지 않고 빈 배열 */
function testMissingDataHandledSafely() {
  assert(selectKeyStrengths(null).length === 0, "assessment=null인데 강점이 나옴");
  assert(selectKeyRisks(undefined).length === 0, "assessment=undefined인데 리스크가 나옴");
  assert(selectMustAnswerQuestions(null).length === 0, "questions=null인데 질문이 나옴");
  assert(selectUnresolvedEvidence(null, null).length === 0, "claims=null인데 unresolved가 나옴");
  assert(selectUnresolvedEvidence([], null).length === 0, "claims=[]인데 unresolved가 나옴");
  console.log("✅ assessment/claims/questions가 없어도(null/undefined) 예외 없이 빈 배열 반환");
}

/** 13. 중복 Risk 제거 — 같은 dimension이 Key Risk 목록에 두 번 나오지 않음 */
function testNoDuplicateDimensionInRisks() {
  const a = assessment(
    {
      // team은 고득점+근거부족(flag)이면서 동시에 evidenceCoverage가 낮아 gap도 성립할 수 있는 조합
      team: dim("team", 75, "LOW", { evidenceCoverage: 20, claimsTotal: 3, claimsSupported: 1 }),
    },
    ["HIGH_SCORE_LOW_EVIDENCE", "TEAM_EVIDENCE_GAP"]
  );
  const risks = selectKeyRisks(a, {}, 10);
  const dimensions = risks.map((r) => r.dimension).filter(Boolean);
  assert(
    new Set(dimensions).size === dimensions.length,
    `같은 dimension이 Key Risk에 중복 등장함: ${dimensions.join(",")}`
  );
  console.log("✅ 같은 dimension이 여러 risk flag에 해당해도 Key Risk에 중복 등장하지 않음");
}

/** 14. Recommendation은 signal/riskFlags 조합에 대해 결정적으로 매핑됨 */
function testRecommendationMapping() {
  assert(
    computeRecommendation("HIGH_RISK", []) === "MATERIAL_GAPS_IDENTIFIED",
    "HIGH_RISK가 MATERIAL_GAPS_IDENTIFIED로 매핑되지 않음"
  );
  assert(
    computeRecommendation("PROMISING", ["UNSUPPORTED_KEY_CLAIM"]) === "EVIDENCE_REQUIRES_VERIFICATION",
    "핵심 근거 공백 flag가 있는데 EVIDENCE_REQUIRES_VERIFICATION이 아님"
  );
  assert(
    computeRecommendation("STRONG", []) === "READY_FOR_IC_REVIEW",
    "STRONG + 위험 flag 없음이 READY_FOR_IC_REVIEW가 아님"
  );
  assert(
    computeRecommendation("CAUTION", []) === "FURTHER_REVIEW_RECOMMENDED",
    "CAUTION 기본값이 FURTHER_REVIEW_RECOMMENDED가 아님"
  );
  console.log("✅ Recommendation이 signal/riskFlags 조합에 대해 결정적으로 매핑됨(BUY/PASS 아님)");
}

/** 15. 기존 데이터 호환성 — DealScore는 있지만 evidenceAssessment가 없는(구버전) 레코드 */
function testCompatibilityWithMissingEvidenceAssessment() {
  // score 계산은 됐지만 evidence 연결 전(구버전 DealScore) 또는 no_report 상태
  const strengths = selectKeyStrengths(undefined, { team: "구버전 rationale" });
  const risks = selectKeyRisks(null, { team: "구버전 rationale" });
  assert(strengths.length === 0 && risks.length === 0, "구버전(evidenceAssessment 없음) 데이터에서 죽지 않고 빈 배열이어야 함");
  console.log("✅ evidenceAssessment가 없는 기존 DealScore 레코드도 안전하게(빈 배열로) 처리");
}

async function main() {
  console.log("\n=== DealMind IC Review Workspace 계산 로직 테스트 ===\n");
  testHighScoreHighConfidenceIsStrong();
  testHighScoreLowConfidenceIsCaution();
  testLowScoreIsHighRisk();
  testNoEvidenceNeverStrongOrPromising();
  testKeyStrengthRanking();
  testKeyRiskPriorityOrder();
  testKeyStrengthCapAt3();
  testKeyRiskCapAt5();
  testMustAnswerQuestionsPreservesOrderAndCap();
  testUnresolvedEvidenceLinksIcQuestion();
  testInvestmentSignalIsDeterministic();
  testMissingDataHandledSafely();
  testNoDuplicateDimensionInRisks();
  testRecommendationMapping();
  testCompatibilityWithMissingEvidenceAssessment();
  console.log("\n✅ IC Review Workspace 계산 로직 테스트 통과\n");
}

main().catch((err) => {
  console.error("❌ 테스트 실패:", err);
  process.exit(1);
});
