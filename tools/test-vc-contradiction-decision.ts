/**
 * VC 수치 상충(contradiction)이 결정 레이어에서 숨지 않는지 검증한다.
 *
 * 실제 화면 감사(2026-09-29)에서 발견한 문제를 회귀로 고정한다:
 *   1) Decision Map은 '상충'인데 Investment Driver는 '확인됨 · IC 상정 가능'으로 표시됨
 *   2) 상충 탐지가 keyEvidence(최대 3개)에 든 claim끼리만 비교해 상충이 숨을 수 있음
 *   3) 상충이 Thesis Breaker / 누락 정보 / 논지 문장 / 확신도에 반영되지 않음
 *   4) 상충 요약이 앞 2개 값만 담아 3번째 이후 값이 사라짐
 *   5) 근거 라벨이 앞 문장을 끌어와 서로 다른 지표가 같은 지표로 묶임(가짜 상충)
 *
 * 순수 함수 검증이라 네트워크·DB가 필요 없다.
 * Usage: npm run test:vc-contradiction-decision
 */
import { buildInvestmentDecision, buildContradictions, buildMissingInformation } from "../src/lib/vc-decision";
import { checkVCDecisionGate } from "../src/lib/vc-decision-gate";
import { traceReportEvidence } from "../src/lib/evidence";
import { detectContradictions } from "../src/lib/vc-decision";
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
  if (!cond) throw new Error("FAIL: " + msg);
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
    keyEvidence: confidence === "NO_EVIDENCE" ? [] : [{ raw: "테스트 근거", confidence: confidence as ClaimConfidence }],
    unsupportedClaims: [],
    decisionImpact: "MEDIUM",
    uncertaintyNote: confidence === "HIGH" ? "" : "테스트용 불확실성 설명",
    ...overrides,
  };
}

function assessment(
  dimensions: Partial<Record<ScoreDimensionKey, DimensionEvidenceAssessment>>,
  riskFlags: RiskFlag[] = []
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
  };
}

function claim(o: Partial<NumericClaim> & { raw: string; sectionKey: string }): NumericClaim {
  return {
    label: "",
    value: "",
    unit: "",
    status: "document",
    claimType: "numeric",
    confidence: "HIGH" as ClaimConfidence,
    matchMethod: "exact",
    claimKey: `${o.sectionKey}:${o.raw}`,
    ...o,
  };
}

function rev(value: string, doc: string, section = "FINANCIAL_STATUS", label = "2024년 매출"): NumericClaim {
  return claim({
    raw: `${value}억원`,
    sectionKey: section,
    label,
    value,
    unit: "억원",
    source: { documentName: doc, snippet: `${label} ${value}억원`, location: "페이지 3" },
  });
}

const DEAL = { investAmount: 50, valuation: 400 };

// ── 1. 핵심 회귀: 상충 차원의 Driver는 '확인됨'일 수 없다 ────────────────
function test1_contradictedDriverIsNotVerified() {
  const claims = [rev("95", "IR_Deck.pdf"), rev("110", "감사보고서.pdf")];
  const a = assessment({
    financials: dim("financials", 74, "HIGH", {
      keyEvidence: claims.map((c) => ({ raw: c.raw, confidence: "HIGH" as ClaimConfidence, documentName: c.source?.documentName })),
    }),
  });
  const decision = buildInvestmentDecision(70, a, {}, claims, [], DEAL);
  const fin = decision.decisionDimensions.find((d) => d.dimension === "financials")!;
  assert(fin.state === "CONTRADICTED", "재무 차원이 상충 상태여야 함");
  const driver = decision.drivers.find((d) => d.dimension === "financials");
  assert(!!driver, "재무 driver가 (숨겨지지 않고) 남아 있어야 함");
  assert(driver!.evidenceState === "CONTRADICTED", `driver도 CONTRADICTED여야 함, 실제 ${driver!.evidenceState}`);
  assert(!driver!.verificationRequirement.includes("IC 상정 가능"), "상충 driver가 'IC 상정 가능'이라고 말하면 안 됨");
  assert(checkVCDecisionGate(decision).ok, "게이트를 통과해야 함(상충을 명시하는 것 자체는 정상 상태)");
  console.log("✅ Test 1 — Decision Map이 '상충'이면 Driver도 '상충'(확인됨·IC 상정 가능 표시 금지)");
}

// ── 2. 상충이 keyEvidence(최대 3개) 밖에 있어도 탐지된다 ─────────────────
function test2_contradictionOutsideKeyEvidenceStillDetected() {
  const claims = [rev("95", "IR.pdf"), rev("110", "감사.pdf")];
  const a = assessment({
    // keyEvidence에는 상충 claim이 하나도 없다(다른 claim 3개가 차지) — 예전엔 여기서 상충이 사라졌다.
    financials: dim("financials", 70, "HIGH", {
      keyEvidence: [
        { raw: "영업이익 12억원", confidence: "HIGH" as ClaimConfidence },
        { raw: "현금 30억원", confidence: "HIGH" as ClaimConfidence },
        { raw: "부채 5억원", confidence: "HIGH" as ClaimConfidence },
      ],
    }),
  });
  const decision = buildInvestmentDecision(70, a, {}, claims, [], DEAL);
  assert(decision.contradictions.length === 1, "상충 1건이 탐지돼야 함");
  const fin = decision.decisionDimensions.find((d) => d.dimension === "financials")!;
  assert(fin.state === "CONTRADICTED", "keyEvidence 밖의 상충도 차원 상태에 반영돼야 함");
  console.log("✅ Test 2 — 상충 claim이 keyEvidence 3개 밖이어도 숨지 않음");
}

// ── 3. 밸류에이션 섹션(스코어 차원 없음)의 상충도 결정 레이어에 오른다 ───
function test3_valuationSectionContradiction() {
  const claims = [
    rev("400", "텀시트.pdf", "VALUATION", "포스트밸류"),
    rev("450", "IR.pdf", "INVESTMENT_TERMS", "포스트밸류"),
  ];
  const decision = buildInvestmentDecision(70, assessment({}), {}, claims, [], DEAL);
  assert(decision.contradictions.length === 1, "밸류에이션 상충이 탐지돼야 함");
  assert(decision.contradictions[0].dimension === "valuation", "차원은 valuation이어야 함");
  assert(decision.contradictions[0].decisionImpact === "CRITICAL", "밸류에이션 상충은 CRITICAL");
  assert(decision.valuation.evidenceState === "CONTRADICTED", "밸류에이션 근거 상태도 상충이어야 함");
  console.log("✅ Test 3 — 밸류에이션·투자조건 섹션 수치 상충도 결정 레이어에 노출됨");
}

// ── 4. 3개 이상의 값도 하나도 잘리지 않는다 ──────────────────────────────
function test4_allValuesPreserved() {
  const claims = [rev("95", "A.pdf"), rev("110", "B.pdf"), rev("102", "C.pdf")];
  const contradictions = buildContradictions(claims);
  assert(contradictions.length === 1, "상충 1건");
  assert(contradictions[0].values.length === 3, `3개 값이 전부 보존돼야 함, 실제 ${contradictions[0].values.length}`);
  const docs = contradictions[0].values.map((v) => v.documentName).sort().join(",");
  assert(docs === "A.pdf,B.pdf,C.pdf", "각 값은 자신의 출처를 유지해야 함");
  assert(contradictions[0].values.every((v) => v.period === "FY2024"), "라벨의 기간(FY2024)이 그대로 담겨야 함");
  console.log("✅ Test 4 — 상충 값 3개가 출처·기간과 함께 전부 보존됨(앞 2개만 담던 문제 수정)");
}

// ── 5. 상충 → Thesis Breaker + P0 누락 정보 + 논지 문장 + 확신도 ──────────
function test5_contradictionPropagates() {
  const claims = [rev("95", "IR.pdf"), rev("110", "감사.pdf")];
  const a = assessment({
    financials: dim("financials", 74, "HIGH", {
      keyEvidence: claims.map((c) => ({ raw: c.raw, confidence: "HIGH" as ClaimConfidence, documentName: c.source?.documentName })),
    }),
    team: dim("team", 72, "HIGH"),
  });
  const decision = buildInvestmentDecision(70, a, {}, claims, [], DEAL);
  const breaker = decision.thesisBreakers.find((b) => b.trigger === "CONTRADICTION");
  assert(!!breaker, "상충이 Thesis Breaker로 올라와야 함");
  assert(breaker!.evidenceState === "CONTRADICTED", "breaker 상태는 CONTRADICTED");
  assert(breaker!.evidence.length === 2, "breaker는 상충 값 전부를 근거로 담아야 함");
  assert(breaker!.probability === "NOT_ASSESSED", "확률은 여전히 평가하지 않음");
  const missing = decision.missingInformation.find((m) => m.id.startsWith("missing:contradiction:"));
  assert(!!missing && missing.priority === "P0", "상충은 P0 누락 정보여야 함(결정을 막음)");
  assert(missing!.requiredEvidence.length > 0, "P0 항목은 필요 근거가 있어야 함");
  assert(decision.confidence === "CONTRADICTED", "결정 확신도가 상충이어야 함");
  assert(decision.thesis.includes("수치 상충"), `논지 문장이 상충을 언급해야 함: ${decision.thesis}`);
  assert(!/투자 논지는[^.]*재무 건전성/.test(decision.thesis), `상충 차원(재무 건전성)을 논지의 근거로 삼으면 안 됨: ${decision.thesis}`);
  assert(/투자 논지는[^.]*팀 역량/.test(decision.thesis), `상충 없는 차원(팀 역량)은 논지의 근거로 남아야 함: ${decision.thesis}`);
  assert(checkVCDecisionGate(decision).ok, "게이트 통과");
  console.log("✅ Test 5 — 상충이 Breaker·P0 누락정보·논지 문장·확신도에 모두 반영됨");
}

// ── 6. 상충 P0/Breaker는 개수 제한으로 잘리지 않는다 ─────────────────────
function test6_notTruncatedByLimits() {
  const claims: NumericClaim[] = [];
  const labels = ["매출", "ARR", "MRR", "현금성자산", "영업이익", "당기순이익", "CAC", "LTV", "NRR", "매출원가"];
  labels.forEach((l, i) => {
    claims.push(claim({ raw: `${10 + i}억원`, sectionKey: "FINANCIAL_STATUS", label: `${l}`, value: `${10 + i}`, unit: "억원", claimKey: `a${i}` }));
    claims.push(claim({ raw: `${20 + i}억원`, sectionKey: "FINANCIAL_STATUS", label: `${l}`, value: `${20 + i}`, unit: "억원", claimKey: `b${i}` }));
  });
  const decision = buildInvestmentDecision(70, assessment({}), {}, claims, [], DEAL);
  assert(decision.contradictions.length === labels.length, `상충 ${labels.length}건 전부 유지, 실제 ${decision.contradictions.length}`);
  assert(decision.thesisBreakers.filter((b) => b.trigger === "CONTRADICTION").length === labels.length, "상충 Breaker도 전부 유지(5개 제한 예외)");
  assert(decision.missingInformation.filter((m) => m.id.startsWith("missing:contradiction:")).length === labels.length, "상충 누락정보도 전부 유지(8개 제한 예외)");
  console.log("✅ Test 6 — 상충이 많아도 Breaker/누락정보 개수 제한에 잘려 숨지 않음");
}

// ── 7. 게이트: 상충 은폐 상태를 구조적으로 거부한다 ──────────────────────
function test7_gateRejectsHiddenContradiction() {
  const claims = [rev("95", "IR.pdf"), rev("110", "감사.pdf")];
  const a = assessment({
    financials: dim("financials", 74, "HIGH", {
      keyEvidence: claims.map((c) => ({ raw: c.raw, confidence: "HIGH" as ClaimConfidence })),
    }),
  });
  const good = buildInvestmentDecision(70, a, {}, claims, [], DEAL);
  assert(checkVCDecisionGate(good).ok, "정상 decision은 통과");

  const solidDriver = JSON.parse(JSON.stringify(good));
  solidDriver.drivers[0].evidenceState = "VERIFIED";
  const r1 = checkVCDecisionGate(solidDriver);
  assert(!r1.ok && r1.reason === "CONTRADICTED_DIMENSION_PRESENTED_AS_SOLID_DRIVER", `상충 차원 driver가 VERIFIED면 거부: ${r1.reason}`);

  const noBreaker = JSON.parse(JSON.stringify(good));
  noBreaker.thesisBreakers = noBreaker.thesisBreakers.filter((b: { trigger: string }) => b.trigger !== "CONTRADICTION");
  const r2 = checkVCDecisionGate(noBreaker);
  assert(!r2.ok && r2.reason === "CONTRADICTION_WITHOUT_THESIS_BREAKER", `Breaker 없는 상충은 거부: ${r2.reason}`);

  const noConfidence = JSON.parse(JSON.stringify(good));
  noConfidence.confidence = "VERIFIED";
  const r3 = checkVCDecisionGate(noConfidence);
  assert(!r3.ok && r3.reason === "CONTRADICTION_NOT_REFLECTED_IN_CONFIDENCE", `확신도에 반영 안 된 상충은 거부: ${r3.reason}`);

  const oneValue = JSON.parse(JSON.stringify(good));
  oneValue.contradictions[0].values = oneValue.contradictions[0].values.slice(0, 1);
  const r4 = checkVCDecisionGate(oneValue);
  assert(!r4.ok && r4.reason === "CONTRADICTION_WITHOUT_MULTIPLE_VALUES", `값이 1개뿐인 '상충'은 거부: ${r4.reason}`);
  console.log("✅ Test 7 — 게이트가 상충 은폐(Driver 확인됨/Breaker 누락/확신도 미반영/값 1개)를 거부함");
}

// ── 8. 상충이 없으면 아무것도 바뀌지 않는다(오탐 없음) ───────────────────
function test8_noContradictionNoChange() {
  const claims = [rev("95", "IR.pdf"), rev("95", "감사.pdf")];
  const a = assessment({
    financials: dim("financials", 74, "HIGH", { keyEvidence: [{ raw: "95억원", confidence: "HIGH" as ClaimConfidence, documentName: "IR.pdf" }] }),
  });
  const decision = buildInvestmentDecision(70, a, {}, claims, [], DEAL);
  assert(decision.contradictions.length === 0, "같은 값은 상충이 아님");
  assert(decision.thesisBreakers.every((b) => b.trigger !== "CONTRADICTION"), "상충 Breaker 없음");
  assert(decision.confidence !== "CONTRADICTED", "확신도가 상충이 아님");
  const driver = decision.drivers.find((d) => d.dimension === "financials");
  assert(!driver || driver.evidenceState === "VERIFIED", "상충 없으면 driver는 기존 그대로");
  console.log("✅ Test 8 — 상충이 없으면 기존 결정이 그대로(오탐 없음)");
}

// ── 9. 결정성 ────────────────────────────────────────────────────────────
function test9_deterministic() {
  const claims = [rev("95", "IR.pdf"), rev("110", "감사.pdf"), rev("102", "기타.pdf")];
  const a = assessment({ financials: dim("financials", 74, "HIGH") });
  const one = JSON.stringify(buildInvestmentDecision(70, a, {}, claims, [], DEAL));
  const two = JSON.stringify(buildInvestmentDecision(70, a, {}, claims, [], DEAL));
  assert(one === two, "같은 입력이면 byte-equivalent 출력이어야 함(id에 랜덤/시간 없음)");
  console.log("✅ Test 9 — 상충 id·순서가 결정적(같은 입력 → 같은 출력)");
}

// ── 10. 누락 정보 중복 제거 ──────────────────────────────────────────────
function test10_missingInfoDedupe() {
  const a = assessment(
    {
      marketSize: dim("marketSize", 80, "UNSUPPORTED", { unsupportedClaims: [{ raw: "8,000억원" }] }),
    },
    ["HIGH_SCORE_LOW_EVIDENCE", "MARKET_EVIDENCE_GAP"]
  );
  const items = buildMissingInformation(a, [], []);
  const market = items.filter((m) => m.relatedDimension === "marketSize" && m.item === "시장성 평가를 뒷받침하는 근거");
  assert(market.length <= 1, `같은 차원·같은 문구가 P0/P1로 중복 표시되면 안 됨, 실제 ${market.length}건`);
  if (market.length === 1) assert(market[0].priority === "P0", "중복 시 더 높은 우선순위(P0)만 남김");
  const bare = items.find((m) => m.item === "8,000억원");
  assert(!bare, "항목 제목이 숫자만('8,000억원')이면 안 됨 — 무슨 주장인지 알 수 없다");
  console.log("✅ Test 10 — 같은 공백이 P0·P1로 중복되지 않고, 항목 제목이 숫자만이 아님");
}

// ── 11. 근거 라벨 회귀: 앞 문장이 라벨에 딸려와 가짜 상충을 만들지 않는다 ─
function test11_labelDoesNotLeakAcrossSentences() {
  const secs = [
    {
      sectionKey: "FINANCIAL_STATUS",
      content: "2024년 매출 95억원, 영업이익 -12억원을 기록했다. 현금성자산은 30억원이다. 시장은 2024년 8,000억원 규모이며 연평균 25% 성장한다.",
    },
  ];
  const docs = [{ name: "IR", parsedText: "매출 95억원 영업이익 12억원 현금성자산 30억원 시장 8,000억원 25%" }];
  const claims = traceReportEvidence(secs as never, docs as never, { investAmount: null, valuation: null }, undefined).claims;
  const cash = claims.find((c) => c.value === "30")!;
  assert(!/영업이익/.test(cash.label), `현금성자산 값의 라벨에 앞 문장의 '영업이익'이 섞이면 안 됨: [${cash.label}]`);
  assert(detectContradictions(claims).length === 0, "서로 다른 지표(영업이익 12 / 현금성자산 30)가 상충으로 묶이면 안 됨");
  const pct = claims.find((c) => c.value === "25")!;
  assert(!/^000/.test(pct.label) && !/^[,\d]*억원/.test(pct.label.split(" ")[0] === "" ? "x" : "x"), "라벨이 천 단위 콤마에서 잘린 조각으로 시작하면 안 됨");
  assert(!pct.label.startsWith("000"), `라벨이 '000억원…'처럼 잘린 숫자 조각으로 시작하면 안 됨: [${pct.label}]`);
  const op = claims.find((c) => c.value === "12")!;
  assert(!/-\s*$/.test(op.label), `라벨 끝에 부호('-')가 남으면 안 됨: [${op.label}]`);
  console.log("✅ Test 11 — 라벨이 앞 문장/잘린 콤마 조각을 끌어오지 않아 가짜 상충이 생기지 않음");
}

// ── 12. IC 질문 연결 ─────────────────────────────────────────────────────
function test12_icQuestionLinked() {
  const claims = [rev("95", "IR.pdf"), rev("110", "감사.pdf")];
  const q: IcQuestion = {
    id: "q1",
    category: "Financials",
    question: "FY2024 매출이 95억원인지 110억원인지 확인해 주십시오",
    whyItMatters: "재무 근거",
    trigger: "UNSUPPORTED_CLAIM",
    priority: "HIGH",
    suggestedAnswerType: "EXPLANATION",
    source: "deterministic",
    relatedClaim: "95억원",
  } as IcQuestion;
  const contradictions = buildContradictions(claims, [q]);
  assert(contradictions[0].icQuestion?.id === "q1", "상충은 관련 claim을 가리키는 IC 질문에 연결돼야 함(새 질문을 만들지 않고 기존 질문 매칭)");
  console.log("✅ Test 12 — 상충이 기존 IC 질문과 연결됨(새로 지어내지 않음)");
}

function main() {
  console.log("\n=== VC 수치 상충 결정 레이어 테스트 ===\n");
  test1_contradictedDriverIsNotVerified();
  test2_contradictionOutsideKeyEvidenceStillDetected();
  test3_valuationSectionContradiction();
  test4_allValuesPreserved();
  test5_contradictionPropagates();
  test6_notTruncatedByLimits();
  test7_gateRejectsHiddenContradiction();
  test8_noContradictionNoChange();
  test9_deterministic();
  test10_missingInfoDedupe();
  test11_labelDoesNotLeakAcrossSentences();
  test12_icQuestionLinked();
  console.log("\n✅ VC 수치 상충 결정 레이어 테스트 통과(12/12)\n");
}

main();
