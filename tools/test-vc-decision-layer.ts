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
    keyEvidence: [],
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
  const a = assessment({ team: dim("team", 40, "UNSUPPORTED") }, ["TEAM_EVIDENCE_GAP"]);
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
  const a = assessment({ moat: dim("moat", 40, "MEDIUM") });
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
];

console.log("=== VC Investment Decision Intelligence(PR-J) 테스트 ===\n");
for (const t of tests) t();
console.log(`\n✅ VC Investment Decision Intelligence(PR-J) 테스트 통과(${tests.length}/${tests.length})`);
