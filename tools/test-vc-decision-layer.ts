/**
 * VC Investment Decision Intelligence(PR-J) — 결정적 변환 계층 검증.
 *
 * vc-decision.ts는 새 AI 호출도, 새 채점/근거 엔진도 만들지 않는다 —
 * ic-review.ts/deal-scoring-evidence.ts/ic-questions.ts/evidence.ts가 이미
 * 계산해둔 값만 재구성한다. 합성 데이터로 Investment Decision 객체 생성,
 * Driver/Thesis-Breaker/Missing-Information 생성, 우선순위, evidence state
 * 전파, 상충 탐지, valuation NOT_COMPUTABLE 게이팅, 품질 게이트, 기존
 * ic-review.ts와의 하위호환을 네트워크·DB 없이 검증한다.
 *
 * Usage: npm run test:vc-decision-layer
 */
import {
  mapConfidenceToEvidenceState,
  mapDecisionImpactToVC,
  detectContradictions,
  buildDecisionDimensions,
  buildInvestmentDrivers,
  buildThesisBreakers,
  buildMissingInformation,
  buildValuationCase,
  synthesizeInvestmentThesis,
  buildInvestmentDecision,
} from "../src/lib/vc-decision";
import { checkVCDecisionGate } from "../src/lib/vc-decision-gate";
import {
  computeInvestmentSignal,
  selectKeyStrengths,
  selectKeyRisks,
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

// ── 합성 데이터 헬퍼(test-ic-review.ts와 동일한 스타일) ──────────────────

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
    // 실제 assessDimension()(deal-scoring-evidence.ts)은 claimsTotal>0이면
    // 확신도와 무관하게 keyEvidence를 채운다(상위 3개, 지지 여부 무관) —
    // 이 기본값이 비어 있으면 LOW_SCORE Thesis Breaker가 evidence-free로
    // 생성돼(§checkThesisBreakers) 이 파일의 다른 테스트가 의도치 않게
    // 실패한다. NO_EVIDENCE만 실제로도 keyEvidence가 비는 게 맞다.
    keyEvidence:
      confidence === "NO_EVIDENCE" ? [] : [{ raw: "테스트 근거", confidence: confidence as ClaimConfidence }],
    unsupportedClaims: [],
    decisionImpact: "MEDIUM",
    uncertaintyNote: confidence === "HIGH" ? "" : "테스트용 불확실성 설명",
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

// ── 1. Decision object creation ──────────────────────────────────────────

function test1_decisionObjectCreation() {
  const a = assessment({ marketSize: dim("marketSize", 80, "HIGH") });
  const decision = buildInvestmentDecision(70, a, {}, [], [], { investAmount: 10, valuation: 100 });
  assert(decision.signal !== undefined, "signal이 있어야 함");
  assert(decision.recommendation !== undefined, "recommendation이 있어야 함");
  assert(typeof decision.thesis === "string" && decision.thesis.length > 0, "thesis 텍스트가 있어야 함");
  assert(decision.decisionDimensions.length === 6, "6개 차원 전부 있어야 함");
  console.log("✅ Test 1 — Investment Decision 객체 생성");
}

// ── 2. Driver generation (from KeyStrength, 재사용 확인) ─────────────────

function test2_driverGeneration() {
  const a = assessment({
    product: dim("product", 85, "HIGH", {
      keyEvidence: [{ raw: "고객사 12곳 도입 계약서 확인", confidence: "HIGH", documentName: "계약서.pdf" }],
    }),
  });
  const drivers = buildInvestmentDrivers(a, {});
  assert(drivers.length > 0, "driver가 생성돼야 함");
  const productDriver = drivers.find((d) => d.dimension === "product");
  assert(!!productDriver, "product 차원 driver가 있어야 함");
  assert(productDriver!.evidence.length > 0, "driver에 실제 근거 발췌가 있어야 함");
  assert(productDriver!.evidenceState === "VERIFIED", "HIGH confidence는 VERIFIED로 매핑돼야 함");
  console.log("✅ Test 2 — Driver 생성(KeyStrength 재사용, 근거 발췌 포함)");
}

// ── 3. Thesis breaker generation (from KeyRisk) ──────────────────────────

function test3_thesisBreakerGeneration() {
  const a = assessment(
    { team: dim("team", 40, "UNSUPPORTED") },
    ["TEAM_EVIDENCE_GAP"]
  );
  const breakers = buildThesisBreakers(a, {}, []);
  assert(breakers.length > 0, "thesis breaker가 생성돼야 함");
  assert(breakers.every((b) => b.probability === "NOT_ASSESSED"), "확률은 항상 NOT_ASSESSED여야 함(지어내지 않음)");
  console.log("✅ Test 3 — Thesis Breaker 생성(KeyRisk 재사용, probability는 항상 NOT_ASSESSED)");
}

// ── 4. Missing information generation + priority ─────────────────────────

function test4_missingInformationPriority() {
  const a = assessment(
    {
      product: dim("product", 80, "UNSUPPORTED", {
        unsupportedClaims: [{ raw: "고객사 12곳 도입" }],
      }),
    },
    ["HIGH_SCORE_LOW_EVIDENCE", "UNSUPPORTED_KEY_CLAIM", "MARKET_EVIDENCE_GAP"]
  );
  const missing = buildMissingInformation(a, [], []);
  assert(missing.length > 0, "missing information이 생성돼야 함");
  assert(missing[0].priority === "P0", "P0가 가장 먼저 정렬돼야 함");
  const p0Count = missing.filter((m) => m.priority === "P0").length;
  const p1Count = missing.filter((m) => m.priority === "P1").length;
  assert(p0Count > 0 && p1Count > 0, "P0/P1이 모두 생성돼야 함(HIGH_SCORE_LOW_EVIDENCE=P0, MARKET_EVIDENCE_GAP=P1)");
  console.log("✅ Test 4 — Missing Information 생성 + 우선순위(P0 먼저)");
}

// ── 5. IC question generation 연결(기존 ic-questions.ts 재사용 확인) ─────

function test5_icQuestionLinkage() {
  const a = assessment(
    { marketSize: dim("marketSize", 75, "UNSUPPORTED", { unsupportedClaims: [{ raw: "TAM 5조원" }] }) },
    ["HIGH_SCORE_LOW_EVIDENCE"]
  );
  const q = question({ id: "q1", relatedDimension: "marketSize", trigger: "HIGH_SCORE_LOW_EVIDENCE" });
  const breakers = buildThesisBreakers(a, {}, [q]);
  const marketBreaker = breakers.find((b) => b.dimension === "marketSize");
  assert(!!marketBreaker?.icQuestion, "관련 IC 질문이 연결돼야 함");
  console.log("✅ Test 5 — IC Question이 관련 driver/breaker에 연결됨(새 질문 생성 아님, 재사용)");
}

// ── 6. Evidence state propagation ────────────────────────────────────────

function test6_evidenceStatePropagation() {
  assert(mapConfidenceToEvidenceState("HIGH") === "VERIFIED", "HIGH → VERIFIED");
  assert(mapConfidenceToEvidenceState("MEDIUM") === "PARTIALLY_VERIFIED", "MEDIUM → PARTIALLY_VERIFIED");
  assert(mapConfidenceToEvidenceState("LOW") === "UNVERIFIED", "LOW → UNVERIFIED");
  assert(mapConfidenceToEvidenceState("UNSUPPORTED") === "UNVERIFIED", "UNSUPPORTED → UNVERIFIED");
  assert(mapConfidenceToEvidenceState("NO_EVIDENCE") === "MISSING", "NO_EVIDENCE → MISSING(근거 없음, 낮은 점수 아님)");

  // decisionImpact 자체(HIGH/MEDIUM/LOW)는 절대 바꾸지 않되, "고득점+근거전무"만 CRITICAL로 승격한다.
  assert(mapDecisionImpactToVC("HIGH", "NO_EVIDENCE") === "CRITICAL", "HIGH + NO_EVIDENCE → CRITICAL로 승격돼야 함");
  assert(mapDecisionImpactToVC("HIGH", "UNSUPPORTED") === "CRITICAL", "HIGH + UNSUPPORTED → CRITICAL로 승격돼야 함");
  assert(mapDecisionImpactToVC("HIGH", "HIGH") === "HIGH", "근거가 충분하면 HIGH는 그대로 HIGH(CRITICAL로 과장하지 않음)");
  assert(mapDecisionImpactToVC("MEDIUM", "LOW") === "MEDIUM", "MEDIUM은 그대로 보존돼야 함(점수 계약 불변)");
  console.log("✅ Test 6 — Evidence state 전파(confidence → VCEvidenceState) + decisionImpact 승격 규칙");
}

// ── 7. Contradiction propagation ─────────────────────────────────────────

function test7_contradictionPropagation() {
  const claims: NumericClaim[] = [
    claim({ raw: "2025년 매출 10억원", sectionKey: "FINANCIAL_STATUS", label: "매출", value: "10", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "2025년 매출 8.2억원", sectionKey: "INVESTMENT_OVERVIEW", label: "매출", value: "8.2", unit: "억원", confidence: "MEDIUM", status: "document" }),
  ];
  const contradictions = detectContradictions(claims);
  assert(contradictions.length === 1, "서로 다른 값을 가진 같은 라벨은 상충으로 탐지돼야 함");
  assert(contradictions[0].claims.length === 2, "상충 그룹에 두 claim이 모두 있어야 함(하나를 조용히 고르지 않음)");

  const noContradiction = detectContradictions([
    claim({ raw: "2025년 매출 10억원", sectionKey: "FINANCIAL_STATUS", label: "매출", value: "10", unit: "억원", confidence: "HIGH", status: "document" }),
  ]);
  assert(noContradiction.length === 0, "값이 하나뿐이면 상충이 아니어야 함");
  console.log("✅ Test 7 — Contradiction 탐지·전파(서로 다른 출처의 값이 다르면 CONTRADICTED, 둘 다 보존)");
}

function test7b_contradictionSurfacesInDimension() {
  const contradictingClaims: NumericClaim[] = [
    claim({ raw: "매출 10억원", sectionKey: "FINANCIAL_STATUS", label: "매출", value: "10", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "매출 8억원", sectionKey: "FINANCIAL_STATUS", label: "매출", value: "8", unit: "억원", confidence: "HIGH", status: "document" }),
  ];
  const a = assessment({
    financials: dim("financials", 70, "HIGH", { keyEvidence: contradictingClaims.map((c) => ({ raw: c.raw, confidence: c.confidence })) }),
  });
  const dims = buildDecisionDimensions(a, contradictingClaims);
  const financialsDim = dims.find((d) => d.dimension === "financials");
  assert(financialsDim?.state === "CONTRADICTED", `상충하는 근거가 있으면 HIGH confidence여도 CONTRADICTED여야 함(실제: ${financialsDim?.state})`);
  assert(!!financialsDim?.contradiction, "contradiction 상세(두 값)가 노출돼야 함");
  console.log("✅ Test 7b — 상충이 있으면 confidence가 HIGH여도 CONTRADICTED로 덮어씀(조용히 하나를 선택하지 않음)");
}

// ── 8. Unsupported numeric claim rejection(driver가 근거 없이 만들어지지 않음) ─

function test8_unsupportedClaimRejection() {
  const a = assessment({ moat: dim("moat", 60, "MEDIUM") }); // 70점 미만이라 KeyStrength 기준 미달
  const drivers = buildInvestmentDrivers(a, {});
  assert(!drivers.some((d) => d.dimension === "moat"), "70점 미만 차원은 driver로 만들어지지 않아야 함(근거 없는 driver 방지)");
  console.log("✅ Test 8 — 근거 기준 미달 차원은 driver로 승격되지 않음");
}

// ── 9. Missing valuation input handling ──────────────────────────────────

function test9_missingValuationInput() {
  const v = buildValuationCase({}, []);
  assert(v.lineItems.every((i) => i.status === "not_computable"), "투자금액/밸류 없으면 전부 NOT_COMPUTABLE이어야 함");
  const ownership = v.lineItems.find((i) => i.label.includes("지분율"));
  assert(ownership?.status === "not_computable" && "requiredInput" in ownership && ownership.requiredInput.length > 0, "NOT_COMPUTABLE은 requiredInput을 명시해야 함");
  console.log("✅ Test 9 — Valuation input 누락 처리(NOT_COMPUTABLE + 필요 입력 명시)");
}

// ── 10. Deterministic valuation calculations ─────────────────────────────

function test10_deterministicOwnershipCalculation() {
  const v = buildValuationCase({ investAmount: 20, valuation: 100 }, []);
  const ownership = v.lineItems.find((i) => i.label.includes("지분율"));
  assert(ownership?.status === "computed", "투자금액+밸류가 있으면 지분율은 계산돼야 함");
  assert(ownership!.status === "computed" && ownership!.value === "20.00%", `20/100=20%가 계산돼야 함(실제: ${ownership!.status === "computed" ? ownership!.value : "N/A"})`);
  console.log("✅ Test 10 — 결정적 valuation 계산(지분율 = 투자금액/밸류, AI 추정 아님)");
}

// ── 11. MOIC/IRR gating(절대 지어내지 않음) ──────────────────────────────

function test11_moicIrrAlwaysNotComputable() {
  const v = buildValuationCase({ investAmount: 20, valuation: 100 }, []);
  const moic = v.lineItems.find((i) => i.label === "MOIC");
  const irr = v.lineItems.find((i) => i.label === "IRR");
  assert(moic?.status === "not_computable", "MOIC은 exit 가정이 없으면 NOT_COMPUTABLE이어야 함");
  assert(irr?.status === "not_computable", "IRR은 exit 가정이 없으면 NOT_COMPUTABLE이어야 함");
  assert(
    moic!.status === "not_computable" && moic!.requiredInput.includes("Exit"),
    "MOIC의 requiredInput은 정확히 무엇이 필요한지 명시해야 함"
  );
  console.log("✅ Test 11 — MOIC/IRR은 exit 가정 필드가 없는 한 항상 NOT_COMPUTABLE(AI가 채우지 않음)");
}

// ── 12. No fabricated evidence IDs(driver/breaker의 evidence는 항상 실제 keyEvidence에서만 옴) ─

function test12_noFabricatedEvidence() {
  const a = assessment({
    product: dim("product", 80, "HIGH", {
      keyEvidence: [{ raw: "실제 발췌 A", confidence: "HIGH" }],
    }),
  });
  const drivers = buildInvestmentDrivers(a, {});
  const productDriver = drivers.find((d) => d.dimension === "product");
  assert(productDriver!.evidence.length === 1, "evidence 개수는 실제 keyEvidence 개수와 정확히 같아야 함(추가 생성 없음)");
  assert(productDriver!.evidence[0].raw === "실제 발췌 A", "evidence 내용은 원본 그대로여야 함(재구성/재작성 없음)");
  console.log("✅ Test 12 — Driver evidence는 실제 keyEvidence를 그대로 참조(새 근거 생성 없음)");
}

// ── 13. No recommendation bypass(품질 게이트가 확률 조작을 막음) ─────────

function test13_gateRejectsAssessedProbability() {
  // 다른 5개 차원은 기본 필러(50점)가 아니라 60점으로 둔다 — 그렇지 않으면
  // LOW_SCORE 폴백이 그 차원들도 Thesis Breaker로 승격시키는데, 기본
  // dim() 헬퍼는 keyEvidence를 채우지 않아 이 테스트의 목적(확률 조작
  // 방어)과 무관한 evidence-free 위반이 함께 걸려 테스트가 실패한다.
  const a = assessment(
    {
      team: dim("team", 40, "UNSUPPORTED", { unsupportedClaims: [{ raw: "창업팀 경력 10년" }] }),
      marketSize: dim("marketSize", 60, "MEDIUM"),
      product: dim("product", 60, "MEDIUM"),
      businessModel: dim("businessModel", 60, "MEDIUM"),
      financials: dim("financials", 60, "MEDIUM"),
      moat: dim("moat", 60, "MEDIUM"),
    },
    ["TEAM_EVIDENCE_GAP"]
  );
  const decision = buildInvestmentDecision(50, a, {}, [], [], {});
  // 정상 경로는 항상 NOT_ASSESSED이므로 게이트를 통과해야 한다.
  const normalResult = checkVCDecisionGate(decision);
  assert(normalResult.ok, `정상 생성 경로는 게이트를 통과해야 함: ${normalResult.reason}`);

  // 타입을 우회해 확률을 조작한 경우(런타임 방어 확인 — JSON 역직렬화 등 우회 경로 시뮬레이션)
  const tampered = {
    ...decision,
    thesisBreakers: decision.thesisBreakers.map((b) => ({ ...b, probability: "60%" as unknown as "NOT_ASSESSED" })),
  };
  const tamperedResult = checkVCDecisionGate(tampered);
  assert(!tamperedResult.ok && tamperedResult.reason === "THESIS_BREAKER_WITH_ASSESSED_PROBABILITY", "조작된 확률은 게이트가 거부해야 함");
  console.log("✅ Test 13 — 품질 게이트가 확률 조작(타입 우회)을 거부");
}

// ── 14. Generic risk rejection/degradation ───────────────────────────────

function test14_genericLanguageRejection() {
  // 다른 5개 차원은 60점 이상으로 둔다(이유는 test13과 동일 — 기본
  // 필러(50점) dim은 LOW_SCORE Thesis Breaker로 승격되는데 keyEvidence가
  // 없어 이 테스트와 무관한 evidence-free 위반이 함께 걸린다).
  const a = assessment({
    moat: dim("moat", 40, "MEDIUM", { keyEvidence: [{ raw: "테스트 근거", confidence: "MEDIUM" }] }),
    marketSize: dim("marketSize", 60, "MEDIUM"),
    team: dim("team", 60, "MEDIUM"),
    product: dim("product", 60, "MEDIUM"),
    businessModel: dim("businessModel", 60, "MEDIUM"),
    financials: dim("financials", 60, "MEDIUM"),
  });
  const genericDrivers = buildInvestmentDrivers(a, {});
  // 게이트 자체를 직접 저품질 입력으로 테스트한다(생성 함수가 아니라 게이트의 판정 로직 검증).
  const decision = buildInvestmentDecision(50, a, {}, [], [], {});
  const badDecision = {
    ...decision,
    drivers: [
      {
        id: "driver:test",
        dimension: "moat" as ScoreDimensionKey,
        title: "테스트",
        description: "설명",
        whyItMatters: "경쟁이 치열하다",
        evidenceState: "PARTIALLY_VERIFIED" as const,
        evidence: [{ raw: "근거 있음" }],
        whatCouldInvalidate: "",
        verificationRequirement: "",
        decisionImpact: "MEDIUM" as const,
      },
    ],
  };
  const result = checkVCDecisionGate(badDecision);
  assert(!result.ok && result.reason === "GENERIC_LANGUAGE_WITHOUT_SPECIFICS", "구체적 근거/수치 없는 일반론 문구는 게이트가 거부해야 함");

  const goodDecision = {
    ...badDecision,
    drivers: [
      {
        ...badDecision.drivers[0],
        whyItMatters: "경쟁사 A 대비 20% 낮은 unit cost를 고객 계약서로 확인함",
      },
    ],
  };
  const goodResult = checkVCDecisionGate(goodDecision);
  assert(goodResult.ok, "수치·근거가 붙은 구체적 문구는 통과해야 함");
  void genericDrivers;
  console.log("✅ Test 14 — 일반론(수치·근거 없는 필러 문구) 거부, 딜 고유 근거 있으면 통과");
}

// ── 15. Score remains secondary(기존 investment signal 계산과 100% 동일해야 함) ─

function test15_scoreRemainsSecondary() {
  const a = assessment({ product: dim("product", 82, "HIGH") });
  const decision = buildInvestmentDecision(82, a, {}, [], [], {});
  const directSignal = computeInvestmentSignal(82, a.overallConfidence);
  assert(decision.signal === directSignal, "Investment Decision의 signal은 기존 computeInvestmentSignal과 동일해야 함(새 점수 알고리즘 아님)");
  // "종합점수: 63" 식으로 새 단일 스코어를 만들지 않는다 — decision 객체에 숫자 스코어 필드가 없어야 한다.
  assert(!("score" in decision) && !("overallScore" in decision), "Investment Decision은 새 단일 점수 필드를 만들지 않아야 함(점수는 보조 신호로 남음)");
  console.log("✅ Test 15 — Score는 부차적 신호로 남음(기존 신호 계산 재사용, 새 단일 점수 없음)");
}

// ── 16. Backward compatibility with existing ic-review.ts ────────────────

function test16_backwardCompatibility() {
  const a = assessment({ product: dim("product", 80, "HIGH") });
  const strengths = selectKeyStrengths(a, {});
  const risks = selectKeyRisks(a, {});
  assert(Array.isArray(strengths), "기존 selectKeyStrengths는 그대로 동작해야 함");
  assert(Array.isArray(risks), "기존 selectKeyRisks는 그대로 동작해야 함");
  // 새 레이어가 기존 함수의 시그니처/동작을 바꾸지 않았는지 확인 — 같은 입력엔 같은 결과.
  const strengths2 = selectKeyStrengths(a, {});
  assert(JSON.stringify(strengths) === JSON.stringify(strengths2), "결정적이어야 함(같은 입력 → 같은 출력)");
  console.log("✅ Test 16 — 기존 ic-review.ts 함수와 하위호환(시그니처/동작 불변)");
}

// ── 17. Empty/missing document handling ──────────────────────────────────

function test17_emptyInputHandling() {
  const decision = buildInvestmentDecision(0, null, undefined, null, null, {});
  assert(decision.decisionDimensions.length === 0, "assessment가 없으면 차원도 없어야 함(지어내지 않음)");
  assert(decision.drivers.length === 0, "assessment가 없으면 driver도 없어야 함");
  assert(decision.missingInformation.length === 0, "assessment가 없으면 missing info도 없어야 함(단, 크래시 없이 빈 배열)");
  assert(decision.confidence === "MISSING", "assessment가 없으면 confidence는 MISSING이어야 함");
  const gate = checkVCDecisionGate(decision);
  assert(gate.ok, "빈 입력이어도 게이트를 통과해야 함(크래시·거짓 위반 없음)");
  console.log("✅ Test 17 — 빈/누락 입력 안전 처리(크래시 없음, 지어내지 않음)");
}

// ── 18. Multiple source conflict handling(=contradiction, 확장 케이스) ───

function test18_multipleSourceConflict() {
  const claims: NumericClaim[] = [
    claim({ raw: "ARR 10억원", sectionKey: "FINANCIAL_STATUS", label: "ARR", value: "10", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "ARR 10억원", sectionKey: "FINANCIAL_STATUS", label: "ARR", value: "10", unit: "억원", confidence: "HIGH", status: "document" }),
  ];
  const sameValue = detectContradictions(claims);
  assert(sameValue.length === 0, "같은 값이 여러 출처에서 반복되는 건 상충이 아니어야 함(값이 같으면 일치)");
  console.log("✅ Test 18 — 같은 값 반복은 상충 아님(값이 실제로 다를 때만 CONTRADICTED)");
}

// ── 19. Report regeneration(=순수 함수 재호출 시 동일 결과, 캐시/부수효과 없음) ─

function test19_regenerationIdempotent() {
  const a = assessment({ product: dim("product", 80, "HIGH", { keyEvidence: [{ raw: "근거1", confidence: "HIGH" }] }) });
  const d1 = buildInvestmentDecision(80, a, {}, [], [], { investAmount: 10, valuation: 50 });
  const d2 = buildInvestmentDecision(80, a, {}, [], [], { investAmount: 10, valuation: 50 });
  assert(JSON.stringify(d1) === JSON.stringify(d2), "동일 입력 재계산(재생성) 시 완전히 같은 결과여야 함(타임스탬프/랜덤 없음)");
  console.log("✅ Test 19 — 재생성 시 결정적(동일 입력 → byte-equivalent 출력)");
}

// ── 20. Export compatibility(=decision 객체가 JSON 직렬화 가능해야 export/영속화 가능) ─

function test20_exportCompatibility() {
  const a = assessment({ product: dim("product", 80, "HIGH") });
  const decision = buildInvestmentDecision(80, a, {}, [], [], { investAmount: 10, valuation: 50 });
  const serialized = JSON.stringify(decision);
  const parsed = JSON.parse(serialized);
  assert(parsed.thesis === decision.thesis, "JSON 직렬화/역직렬화가 안전해야 함(export/영속화 전제 조건)");
  console.log("✅ Test 20 — Investment Decision은 JSON 직렬화 가능(export/영속화 호환)");
}

// ── 21. PR-L 발견 사항 회귀(§6/§7 — evidence-free Thesis Breaker) ─────────
// LOW_SCORE 트리거는 "점수가 낮다"는 사실 자체가 근거일 수 있는데(즉
// unsupportedClaims가 비어 있어도 그 차원의 keyEvidence는 실재), 예전
// 구현은 unsupportedClaims만 evidence로 옮겨 VERIFIED 상태인데도 근거
// 발췌가 하나도 없는 Thesis Breaker를 만들었다(실제 헬스케어AI 시드
// 데이터로 재현됨 — tools/audit-vc-real-report.ts).

function test21_thesisBreakerEvidenceFallsBackToKeyEvidence() {
  const a = assessment(
    {
      financials: dim("financials", 40, "HIGH", {
        keyEvidence: [
          { raw: "8억원", confidence: "HIGH", documentName: "재무자료.xlsx" },
          { raw: "60억원", confidence: "HIGH", documentName: "재무자료.xlsx" },
        ],
        unsupportedClaims: [],
      }),
    },
    []
  );
  const breakers = buildThesisBreakers(a, {}, null);
  const lowScore = breakers.find((b) => b.trigger === "LOW_SCORE" && b.dimension === "financials");
  assert(!!lowScore, "재무 건전성 LOW_SCORE breaker가 생성되어야 함");
  assert(lowScore!.evidenceState === "VERIFIED", "confidence HIGH인 차원은 VERIFIED 상태여야 함");
  assert(
    lowScore!.evidence.length > 0,
    "VERIFIED 상태의 Thesis Breaker는 근거 발췌가 반드시 있어야 함(evidence-free 금지)"
  );
  assert(
    lowScore!.evidence.some((e) => e.raw === "8억원"),
    "unsupportedClaims가 비어 있으면 dim.keyEvidence(실제 확인된 근거)로 대체해야 함"
  );
  const gate = checkVCDecisionGate(
    buildInvestmentDecision(40, a, {}, [], null, { investAmount: 10, valuation: 100 })
  );
  assert(gate.ok, `VERIFIED + 근거 있음이면 게이트를 통과해야 함: ${JSON.stringify(gate)}`);
  console.log("✅ Test 21 — VERIFIED 상태 Thesis Breaker는 항상 실제 근거 발췌를 포함함(evidence-free 금지)");
}

// ── 22. 차원 없는 리스크(밸류에이션 공백)는 MISSING 상태여야 함 ───────────

function test22_valuationGapBreakerIsMissingNotUnverified() {
  const a = assessment({}, ["VALUATION_EVIDENCE_GAP"]);
  const breakers = buildThesisBreakers(a, {}, null);
  const gap = breakers.find((b) => b.trigger === "VALUATION_EVIDENCE_GAP");
  assert(!!gap, "밸류에이션 근거 공백 breaker가 생성되어야 함");
  assert(
    gap!.evidenceState === "MISSING",
    "차원이 없는 리스크(근거 배열을 채울 대상 자체가 없음)는 UNVERIFIED가 아니라 MISSING이어야 게이트가 정당하게 예외 처리함"
  );
  assert(gap!.evidence.length === 0, "MISSING 상태는 근거 배열이 비어 있는 게 정상");
  console.log("✅ Test 22 — 차원 없는(밸류에이션) Thesis Breaker는 MISSING 상태(evidence-free 예외 대상)");
}

// ── 23. 게이트가 실제로 evidence-free VERIFIED breaker를 거부하는지(방어선) ──

function test23_gateRejectsVerifiedBreakerWithoutEvidence() {
  const a = assessment({ product: dim("product", 80, "HIGH", { keyEvidence: [{ raw: "근거", confidence: "HIGH" }] }) });
  const decision = buildInvestmentDecision(80, a, {}, [], null, { investAmount: 10, valuation: 100 });
  assert(checkVCDecisionGate(decision).ok, "정상 decision은 게이트를 통과해야 함");

  const tampered = {
    ...decision,
    thesisBreakers: [
      {
        id: "breaker:TEST:none",
        trigger: "LOW_SCORE" as const,
        title: "테스트",
        whyItMatters: "테스트용 위반 케이스",
        evidenceState: "VERIFIED" as const,
        evidence: [],
        probability: "NOT_ASSESSED" as const,
        decisionImpact: "MEDIUM" as const,
        verificationRequirement: "재확인 필요",
      },
    ],
  };
  const result = checkVCDecisionGate(tampered);
  assert(!result.ok, "VERIFIED인데 근거 배열이 비어 있으면 게이트가 반드시 실패해야 함");
  assert(
    result.reason === "THESIS_BREAKER_WITHOUT_EVIDENCE_OR_MISSING_STATE",
    `실패 사유가 정확해야 함: ${result.reason}`
  );
  console.log("✅ Test 23 — 게이트는 evidence-free VERIFIED Thesis Breaker를 거부함(방어선 확인)");
}

// ── 24. basis="no_report"는 반드시 P0 Missing Information을 노출해야 함 ───
// (§8 — "정보 공백이 하나도 없다"는 착시가 가장 위험하다: 보고서 자체가
// 없어 claimsTotal=0이면 기존 riskFlag 기반 로직이 하나도 발동하지 않아
// missingInformation이 빈 배열이 됐다 — 실제 no_report 프로덕션 경로로
// 재현됨.)

function test24_noReportBasisSurfacesP0MissingInfo() {
  const a = assessment(
    {
      marketSize: dim("marketSize", 65, "NO_EVIDENCE", { keyEvidence: [], unsupportedClaims: [], claimsTotal: 0, claimsSupported: 0, evidenceCoverage: null }),
    },
    [],
    { basis: "no_report", overallConfidence: "NO_EVIDENCE", overallCoverage: null }
  );
  const missing = buildMissingInformation(a, [], null);
  const noReportItem = missing.find((m) => m.id === "missing:no_report");
  assert(!!noReportItem, "basis=no_report이면 반드시 명시적 P0 항목이 있어야 함");
  assert(noReportItem!.priority === "P0", "보고서 미생성은 P0(결정-차단)이어야 함");
  console.log("✅ Test 24 — basis=no_report(보고서 없음)는 항상 P0 Missing Information을 명시함");
}

// ── 25. Driver whyItMatters는 rationale이 없어도 실제 근거를 인용해야 함 ──
// (§5/§6 — AI가 rationale을 비워 줘도(parseScoreResponse의 실제 실패
// 모드) "평가가 상대적으로 높습니다" 같은 순수 일반론 대신 실제 근거
// 발췌를 그대로 인용해야 한다.)

function test25_driverFallbackCitesRealEvidenceWhenRationaleMissing() {
  const a = assessment({
    product: dim("product", 78, "HIGH", {
      keyEvidence: [{ raw: "특허 12건", confidence: "HIGH", documentName: "IR_Deck.pdf" }],
      unsupportedClaims: [],
    }),
  });
  const drivers = buildInvestmentDrivers(a, {}); // rationale 없음
  const productDriver = drivers.find((d) => d.dimension === "product");
  assert(!!productDriver, "product driver가 생성되어야 함");
  assert(
    productDriver!.whyItMatters.includes("특허 12건"),
    `rationale이 없으면 실제 근거(keyEvidence)를 인용해야 함: "${productDriver!.whyItMatters}"`
  );
  assert(
    !productDriver!.whyItMatters.includes("평가가 상대적으로 높습니다"),
    "순수 일반론(근거 미인용) 문구로 폴백하면 안 됨"
  );
  console.log("✅ Test 25 — rationale 없어도 Driver whyItMatters는 실제 근거를 인용함(순수 일반론 금지)");
}

// ══════════════════════════════════════════════════════════════════════
// PR-M — Canonical Numeric Contradiction Detection(§Step 3~7 그대로)
//
// detectContradictions()의 기존 exact-label 그룹핑은 label 문자열이
// 정확히 같아야만 상충을 잡는다. 실제 헬스케어AI 리포트로 재현된 문제:
// "FY24 매출"과 "이사회 보고 기준 FY24 매출은"은 같은 사실(FY24 매출)을
// 가리키지만 문구가 달라 상충으로 잡히지 않았다. 이 테스트들은 새로
// 추가된 canonical(지표/기간/시나리오) 그룹핑이 그 실패를 해결하면서도
// 기존 exact-label 경로·오탐 방지 요건을 전부 지키는지 검증한다.
// ══════════════════════════════════════════════════════════════════════

// ── 26. Exact-label contradiction은 그대로 동작(canonical이 중복 보고하지 않음) ──

function test26_exactLabelContradictionUnchanged() {
  const claims: NumericClaim[] = [
    claim({ raw: "FY24 매출 8억원", sectionKey: "FINANCIAL_STATUS", label: "FY24 매출", value: "8", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "FY24 매출 15억원", sectionKey: "FINANCIAL_STATUS", label: "FY24 매출", value: "15", unit: "억원", confidence: "HIGH", status: "document" }),
  ];
  const contradictions = detectContradictions(claims);
  assert(contradictions.length === 1, `label이 완전히 같으면 exact-label 그룹 하나만 있어야 함(canonical이 중복 보고하면 안 됨), got ${contradictions.length}`);
  assert(contradictions[0].claims.length === 2, "두 claim이 모두 그룹에 있어야 함");
  console.log("✅ Test 26 — exact-label 상충은 기존 그대로(canonical이 중복 보고하지 않음)");
}

// ── 27. Same-section 표현이 다른 라벨(실제 재현 케이스) ──

function test27_sameSectionVariedLabelContradiction() {
  const claims: NumericClaim[] = [
    claim({ raw: "FY24 매출 8억원", sectionKey: "FINANCIAL_STATUS", label: "FY24 매출", value: "8", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "FY24 매출 15억원", sectionKey: "FINANCIAL_STATUS", label: "이후 재계산된 FY24 매출", value: "15", unit: "억원", confidence: "HIGH", status: "document" }),
  ];
  const contradictions = detectContradictions(claims);
  const group = contradictions.find((g) => g.claims.length === 2);
  assert(!!group, "같은 섹션, 다른 문구, 같은 지표(FY24 매출)는 canonical 상충으로 잡혀야 함");
  const values = new Set(group!.claims.map((c) => c.value));
  assert(values.has("8") && values.has("15"), "두 값(8, 15)이 모두 보존돼야 함");
  console.log("✅ Test 27 — 같은 섹션, 다른 문구로 적힌 같은 지표(FY24 매출)도 상충으로 탐지");
}

// ── 28. Cross-section 표현이 다른 라벨(실제 재현 케이스) ──

function test28_crossSectionVariedLabelContradiction() {
  const claims: NumericClaim[] = [
    claim({ raw: "FY24 매출 8억원", sectionKey: "FINANCIAL_STATUS", label: "FY24 매출", value: "8", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "FY24 매출 15억원", sectionKey: "INVESTMENT_OVERVIEW", label: "이사회 보고 기준 FY24 매출은", value: "15", unit: "억원", confidence: "HIGH", status: "document" }),
  ];
  const contradictions = detectContradictions(claims);
  const group = contradictions.find((g) => g.claims.length === 2);
  assert(!!group, "다른 섹션, 다른 문구, 같은 지표(FY24 매출)는 canonical 상충으로 잡혀야 함");
  const values = new Set(group!.claims.map((c) => c.value));
  assert(values.has("8") && values.has("15"), "두 값(8, 15)이 모두 보존돼야 함");
  console.log("✅ Test 28 — 다른 섹션, 다른 문구로 적힌 같은 지표(FY24 매출)도 상충으로 탐지");
}

// ── 29. 오탐 방지 — 매출 vs 매출총이익 ──

function test29_revenueVsGrossProfitNoFalsePositive() {
  const claims: NumericClaim[] = [
    claim({ raw: "매출 8억원", sectionKey: "FINANCIAL_STATUS", label: "매출", value: "8", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "매출총이익 15억원", sectionKey: "FINANCIAL_STATUS", label: "매출총이익", value: "15", unit: "억원", confidence: "HIGH", status: "document" }),
  ];
  const contradictions = detectContradictions(claims);
  assert(contradictions.length === 0, "매출과 매출총이익은 서로 다른 지표라 상충으로 잡히면 안 됨");
  console.log("✅ Test 29 — 매출 vs 매출총이익은 다른 지표(오탐 없음)");
}

// ── 30. 오탐 방지 — 영업이익 vs 영업이익률 ──

function test30_operatingProfitVsMarginNoFalsePositive() {
  const claims: NumericClaim[] = [
    claim({ raw: "영업이익 8억원", sectionKey: "FINANCIAL_STATUS", label: "영업이익", value: "8", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "영업이익률 15%", sectionKey: "FINANCIAL_STATUS", label: "영업이익률", value: "15", unit: "%", confidence: "HIGH", status: "document" }),
  ];
  const contradictions = detectContradictions(claims);
  assert(contradictions.length === 0, "영업이익(절대값)과 영업이익률(비율)은 서로 다른 지표라 상충으로 잡히면 안 됨");
  console.log("✅ Test 30 — 영업이익 vs 영업이익률은 다른 지표(오탐 없음, unit도 다름)");
}

// ── 31. 오탐 방지 — 순이익 vs 순이익률, FY2024 vs FY2023 ──

function test31_netProfitVsMarginAndDifferentFiscalYearNoFalsePositive() {
  const npVsMargin = detectContradictions([
    claim({ raw: "순이익 8억원", sectionKey: "FINANCIAL_STATUS", label: "순이익", value: "8", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "순이익률 15%", sectionKey: "FINANCIAL_STATUS", label: "순이익률", value: "15", unit: "%", confidence: "HIGH", status: "document" }),
  ]);
  assert(npVsMargin.length === 0, "순이익과 순이익률은 서로 다른 지표라 상충으로 잡히면 안 됨");

  const differentFY = detectContradictions([
    claim({ raw: "FY2024 매출 8억원", sectionKey: "FINANCIAL_STATUS", label: "FY2024 매출", value: "8", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "FY2023 매출 15억원", sectionKey: "FINANCIAL_STATUS", label: "FY2023 매출", value: "15", unit: "억원", confidence: "HIGH", status: "document" }),
  ]);
  assert(differentFY.length === 0, "FY2024와 FY2023은 다른 회계연도라 상충으로 잡히면 안 됨");

  const differentQuarter = detectContradictions([
    claim({ raw: "Q1 매출 8억원", sectionKey: "FINANCIAL_STATUS", label: "Q1 매출", value: "8", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "Q2 매출 15억원", sectionKey: "FINANCIAL_STATUS", label: "Q2 매출", value: "15", unit: "억원", confidence: "HIGH", status: "document" }),
  ]);
  assert(differentQuarter.length === 0, "Q1과 Q2는 다른 분기라 상충으로 잡히면 안 됨");
  console.log("✅ Test 31 — 순이익 vs 순이익률, FY2024 vs FY2023, Q1 vs Q2 모두 오탐 없음");
}

// ── 32. 오탐 방지 — 실적 vs 예상(시나리오 불일치) ──

function test32_actualVsForecastNoFalsePositive() {
  const claims: NumericClaim[] = [
    claim({ raw: "실적 매출 8억원", sectionKey: "FINANCIAL_STATUS", label: "실적 매출", value: "8", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "예상 매출 15억원", sectionKey: "FINANCIAL_STATUS", label: "예상 매출", value: "15", unit: "억원", confidence: "HIGH", status: "document" }),
  ];
  const contradictions = detectContradictions(claims);
  assert(contradictions.length === 0, "실적(ACTUAL)과 예상(FORECAST)은 같은 시나리오가 아니므로 상충으로 잡히면 안 됨");
  console.log("✅ Test 32 — 실적 매출 vs 예상 매출은 시나리오가 달라 오탐 없음");
}

// ── 33. 시나리오 표시 없는 매출끼리는(둘 다 UNSPECIFIED) 값이 다르면 상충 ──

function test33_unspecifiedScenarioBothSidesStillContradicts() {
  const claims: NumericClaim[] = [
    claim({ raw: "매출 8억원", sectionKey: "FINANCIAL_STATUS", label: "매출", value: "8", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "매출 15억원", sectionKey: "INVESTMENT_OVERVIEW", label: "총 매출", value: "15", unit: "억원", confidence: "HIGH", status: "document" }),
  ];
  const contradictions = detectContradictions(claims);
  const group = contradictions.find((g) => g.claims.length === 2);
  assert(!!group, "시나리오 표시가 둘 다 없으면(UNSPECIFIED==UNSPECIFIED) 값이 다를 때 상충으로 잡혀야 함");
  console.log("✅ Test 33 — 시나리오 표시 없는 매출끼리는(둘 다 UNSPECIFIED) 값이 다르면 상충");
}

// ── 34. 같은 값이면 문구가 달라도 상충 아님 ──

function test34_sameValueDifferentLabelNoContradiction() {
  const claims: NumericClaim[] = [
    claim({ raw: "매출 8억원", sectionKey: "FINANCIAL_STATUS", label: "매출", value: "8", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "매출액 8억원", sectionKey: "INVESTMENT_OVERVIEW", label: "매출액", value: "8", unit: "억원", confidence: "HIGH", status: "document" }),
  ];
  const contradictions = detectContradictions(claims);
  assert(contradictions.length === 0, "값이 같으면(둘 다 8) 문구가 달라도 상충이 아니어야 함");
  console.log("✅ Test 34 — 매출 8억원 vs 매출액 8억원(값 동일)은 상충 아님");
}

// ── 35. 같은 canonical 지표/기간/단위, 값만 다른 문구 3개 이상 — 전부 보존 ──

function test35_multipleVariedLabelsSameMetricAllValuesPreserved() {
  const claims: NumericClaim[] = [
    claim({ raw: "FY24 매출 8억원", sectionKey: "FINANCIAL_STATUS", label: "FY24 매출", value: "8", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "FY24 매출 15억원", sectionKey: "INVESTMENT_OVERVIEW", label: "이사회 보고 기준 FY24 매출은", value: "15", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "FY24 매출 12억원", sectionKey: "OPINION_SUMMARY", label: "재계산된 FY24 매출액", value: "12", unit: "억원", confidence: "HIGH", status: "document" }),
  ];
  const contradictions = detectContradictions(claims);
  const group = contradictions.find((g) => g.claims.length >= 3);
  assert(!!group, "서로 다른 문구로 적힌 3개 claim이 모두 한 canonical 그룹으로 묶여야 함");
  const values = new Set(group!.claims.map((c) => c.value));
  assert(values.size === 3 && values.has("8") && values.has("15") && values.has("12"), "세 값이 모두 보존돼야 함(하나를 조용히 고르지 않음)");
  console.log("✅ Test 35 — 서로 다른 문구의 같은 지표(3개 claim)도 전부 상충 그룹에 보존");
}

// ── 36. 통화 단위가 다르면 기존처럼 병합하지 않음 ──

function test36_currencyMismatchPreservesExistingBehavior() {
  const claims: NumericClaim[] = [
    claim({ raw: "매출 100억원", sectionKey: "FINANCIAL_STATUS", label: "매출", value: "100", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "매출 10 USD", sectionKey: "FINANCIAL_STATUS", label: "매출", value: "10", unit: "USD", confidence: "HIGH", status: "document" }),
  ];
  const contradictions = detectContradictions(claims);
  assert(contradictions.length === 0, "통화(unit)가 다르면 canonical 그룹도 병합하면 안 됨(통화 변환 없음)");
  console.log("✅ Test 36 — 통화 단위가 다르면 병합하지 않음(기존 동작 그대로, 통화 정규화 없음)");
}

// ══════════════════════════════════════════════════════════════════════
// PR-M.1 — "2024A"/"2024E"류 연도-접미사(실적/추정) 오탐 수정
//
// PR-M 최종 adversarial review에서 발견: "2024E 매출"과 "2024A 매출"이
// 실적(Actual)과 추정(Estimate)이라는 서로 다른 시나리오인데도 기간·
// 시나리오 감지가 이 접미사 표기를 인식하지 못해 같은 canonical 키로
// 묶여 거짓 상충(false positive)을 만들었다. 이 테스트들은 그 수정이
// 정확히 요구된 매트릭스대로 동작하는지, 그리고 임의의 A/E 문자(ARR,
// CAC, LTV, AI, MA, SA, Series A, CompanyA 등)를 실적/추정으로 오인하지
// 않는지 검증한다.
// ══════════════════════════════════════════════════════════════════════

// ── 37. MUST NOT CONTRADICT — 연도-접미사로 시나리오가 다르면 병합 금지 ──

function test37_yearSuffixScenarioMustNotContradict() {
  const cases: Array<[string, NumericClaim[]]> = [
    ["2024A vs 2024E", [
      claim({ raw: "2024A 매출 100억원", sectionKey: "X", label: "2024A 매출", value: "100", unit: "억원", confidence: "HIGH", status: "document" }),
      claim({ raw: "2024E 매출 120억원", sectionKey: "X", label: "2024E 매출", value: "120", unit: "억원", confidence: "HIGH", status: "document" }),
    ]],
    ["FY24A vs FY24E", [
      claim({ raw: "FY24A 매출 100억원", sectionKey: "X", label: "FY24A 매출", value: "100", unit: "억원", confidence: "HIGH", status: "document" }),
      claim({ raw: "FY24E 매출 120억원", sectionKey: "X", label: "FY24E 매출", value: "120", unit: "억원", confidence: "HIGH", status: "document" }),
    ]],
    ["2024년 실제 매출 vs 2024년 예상 매출", [
      claim({ raw: "2024년 실제 매출 100억원", sectionKey: "X", label: "2024년 실제 매출", value: "100", unit: "억원", confidence: "HIGH", status: "document" }),
      claim({ raw: "2024년 예상 매출 120억원", sectionKey: "X", label: "2024년 예상 매출", value: "120", unit: "억원", confidence: "HIGH", status: "document" }),
    ]],
    ["2024A vs 2023A(다른 연도)", [
      claim({ raw: "2024A 매출 100억원", sectionKey: "X", label: "2024A 매출", value: "100", unit: "억원", confidence: "HIGH", status: "document" }),
      claim({ raw: "2023A 매출 120억원", sectionKey: "X", label: "2023A 매출", value: "120", unit: "억원", confidence: "HIGH", status: "document" }),
    ]],
    ["2024E vs 2025E(다른 연도)", [
      claim({ raw: "2024E 매출 100억원", sectionKey: "X", label: "2024E 매출", value: "100", unit: "억원", confidence: "HIGH", status: "document" }),
      claim({ raw: "2025E 매출 120억원", sectionKey: "X", label: "2025E 매출", value: "120", unit: "억원", confidence: "HIGH", status: "document" }),
    ]],
  ];
  for (const [name, claims] of cases) {
    const result = detectContradictions(claims);
    const found = result.some((g) => g.claims.length >= 2);
    assert(!found, `${name}은 서로 다른 시나리오/연도라 상충으로 잡히면 안 됨(false positive 재현)`);
  }
  console.log("✅ Test 37 — 2024A/2024E, FY24A/FY24E, 실제/예상, 다른 연도 모두 오탐 없음(PR-M.1 수정 확인)");
}

// ── 38. MUST CONTRADICT — 같은 연도+같은 시나리오인데 값이 다르면 여전히 상충 ──

function test38_yearSuffixScenarioMustStillContradictWhenGenuineConflict() {
  const cases: Array<[string, NumericClaim[]]> = [
    ["2024A vs 2024A", [
      claim({ raw: "2024A 매출 100억원", sectionKey: "X", label: "2024A 매출", value: "100", unit: "억원", confidence: "HIGH", status: "document" }),
      claim({ raw: "2024A 매출 120억원", sectionKey: "Y", label: "2024A 매출", value: "120", unit: "억원", confidence: "HIGH", status: "document" }),
    ]],
    ["2024E vs 2024E", [
      claim({ raw: "2024E 매출 100억원", sectionKey: "X", label: "2024E 매출", value: "100", unit: "억원", confidence: "HIGH", status: "document" }),
      claim({ raw: "2024E 매출 120억원", sectionKey: "Y", label: "2024E 매출", value: "120", unit: "억원", confidence: "HIGH", status: "document" }),
    ]],
    ["FY24A vs FY24A", [
      claim({ raw: "FY24A 매출 100억원", sectionKey: "X", label: "FY24A 매출", value: "100", unit: "억원", confidence: "HIGH", status: "document" }),
      claim({ raw: "FY24A 매출 120억원", sectionKey: "Y", label: "FY24A 매출", value: "120", unit: "억원", confidence: "HIGH", status: "document" }),
    ]],
    ["FY24E vs FY24E", [
      claim({ raw: "FY24E 매출 100억원", sectionKey: "X", label: "FY24E 매출", value: "100", unit: "억원", confidence: "HIGH", status: "document" }),
      claim({ raw: "FY24E 매출 120억원", sectionKey: "Y", label: "FY24E 매출", value: "120", unit: "억원", confidence: "HIGH", status: "document" }),
    ]],
  ];
  for (const [name, claims] of cases) {
    const result = detectContradictions(claims);
    const found = result.some((g) => g.claims.length >= 2);
    assert(found, `${name}은 같은 연도+같은 시나리오인데 값이 다르므로 상충으로 잡혀야 함`);
  }
  console.log("✅ Test 38 — 같은 연도+같은 시나리오(2024A/2024A, 2024E/2024E, FY24A/FY24A, FY24E/FY24E)는 값이 다르면 여전히 상충");
}

// ── 39. False-positive attack — 숫자 없는 A/E 약어는 시나리오로 오인되면 안 됨 ──

function test39_bareLetterAbbreviationsNeverTreatedAsScenario() {
  // ARR 자체는 지표로서 정당하게 상충 가능해야 한다(연도 접미사와 무관).
  const arrConflict = detectContradictions([
    claim({ raw: "ARR 100억원", sectionKey: "X", label: "ARR", value: "100", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "ARR 120억원", sectionKey: "Y", label: "ARR", value: "120", unit: "억원", confidence: "HIGH", status: "document" }),
  ]);
  assert(arrConflict.some((g) => g.claims.length >= 2), "ARR끼리 값이 다르면(연도 접미사와 무관하게) 여전히 상충으로 잡혀야 함");

  // CAC/LTV/AI/MA/SA/Series A/Series E — 숫자 바로 앞에 없는 A/E는 지표
  // 자체가 인식되지 않거나(CAC/LTV 미매칭 대상과 짝지어) 어떤 경우에도
  // 시나리오로 오인되어 상충 여부가 뒤바뀌면 안 된다.
  const noMetricMatch = detectContradictions([
    claim({ raw: "CAC 100억원", sectionKey: "X", label: "CAC", value: "100", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "매출 120억원", sectionKey: "Y", label: "매출", value: "120", unit: "억원", confidence: "HIGH", status: "document" }),
  ]);
  assert(noMetricMatch.length === 0, "CAC와 매출은 서로 다른 지표라 상충으로 잡히면 안 됨");

  const seriesLetters = detectContradictions([
    claim({ raw: "Series A 100억원", sectionKey: "X", label: "Series A", value: "100", unit: "억원", confidence: "HIGH", status: "document" }),
    claim({ raw: "Series E 120억원", sectionKey: "Y", label: "Series E", value: "120", unit: "억원", confidence: "HIGH", status: "document" }),
  ]);
  assert(seriesLetters.length === 0, "'Series A'/'Series E'는 지표 자체가 인식되지 않아야 하며(연도 접미사 오인 없음) 상충으로 잡히면 안 됨");
  console.log("✅ Test 39 — ARR은 정상적으로 지표 상충 가능, CAC/Series A/Series E는 연도-접미사로 오인되지 않음(false-positive 없음)");
}

const tests = [
  test1_decisionObjectCreation,
  test2_driverGeneration,
  test3_thesisBreakerGeneration,
  test4_missingInformationPriority,
  test5_icQuestionLinkage,
  test6_evidenceStatePropagation,
  test7_contradictionPropagation,
  test7b_contradictionSurfacesInDimension,
  test8_unsupportedClaimRejection,
  test9_missingValuationInput,
  test10_deterministicOwnershipCalculation,
  test11_moicIrrAlwaysNotComputable,
  test12_noFabricatedEvidence,
  test13_gateRejectsAssessedProbability,
  test14_genericLanguageRejection,
  test15_scoreRemainsSecondary,
  test16_backwardCompatibility,
  test17_emptyInputHandling,
  test18_multipleSourceConflict,
  test19_regenerationIdempotent,
  test20_exportCompatibility,
  test21_thesisBreakerEvidenceFallsBackToKeyEvidence,
  test22_valuationGapBreakerIsMissingNotUnverified,
  test23_gateRejectsVerifiedBreakerWithoutEvidence,
  test24_noReportBasisSurfacesP0MissingInfo,
  test25_driverFallbackCitesRealEvidenceWhenRationaleMissing,
  test26_exactLabelContradictionUnchanged,
  test27_sameSectionVariedLabelContradiction,
  test28_crossSectionVariedLabelContradiction,
  test29_revenueVsGrossProfitNoFalsePositive,
  test30_operatingProfitVsMarginNoFalsePositive,
  test31_netProfitVsMarginAndDifferentFiscalYearNoFalsePositive,
  test32_actualVsForecastNoFalsePositive,
  test33_unspecifiedScenarioBothSidesStillContradicts,
  test34_sameValueDifferentLabelNoContradiction,
  test35_multipleVariedLabelsSameMetricAllValuesPreserved,
  test36_currencyMismatchPreservesExistingBehavior,
  test37_yearSuffixScenarioMustNotContradict,
  test38_yearSuffixScenarioMustStillContradictWhenGenuineConflict,
  test39_bareLetterAbbreviationsNeverTreatedAsScenario,
];

console.log("=== VC Investment Decision Intelligence(PR-J) 테스트 ===\n");
for (const t of tests) t();
console.log(`\n✅ VC Investment Decision Intelligence(PR-J) 테스트 통과(${tests.length}/${tests.length})`);
