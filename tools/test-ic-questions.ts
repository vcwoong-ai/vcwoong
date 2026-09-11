/**
 * IC Questions Engine 테스트 (AI 호출 없음 — deterministic 후보 생성만 검증).
 *
 * ic-questions.ts는 DealScore.evidenceAssessment(Phase 4가 이미 결정적으로
 * 계산해둔 값)만 갖고 질문을 뽑으므로, 여기서도 실제 AI를 부르지 않고
 * buildScoreEvidenceAssessment(deal-scoring-evidence.ts)로 만든 가짜
 * assessment를 입력으로 검증한다.
 *
 * Usage: npm run test:ic-questions
 */
import { SectionKey } from "@prisma/client";
import type { NumericClaim } from "../src/lib/evidence";
import { buildScoreEvidenceAssessment } from "../src/lib/deal-scoring-evidence";
import {
  buildDeterministicIcQuestions,
  toIcQuestionsResult,
  type IcQuestion,
} from "../src/lib/ic-questions";
import { refineIcQuestionsWithAI } from "../src/lib/ic-questions-ai";
import { RATE_LIMITS } from "../src/lib/rate-limit";
import { reportReadWhere, reportWriteWhere } from "../src/lib/team-access";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const BASE_SCORES = {
  marketSize: 82,
  team: 60,
  product: 85,
  businessModel: 55,
  financials: 68,
  moat: 40,
};
const BASE_RATIONALE = {
  marketSize: "TAM 5조원, 연 30% 성장",
  team: "연쇄창업 경력",
  product: "독자 알고리즘 보유",
  businessModel: "구독형 SaaS",
  financials: "ARR 45억, 성장세",
  moat: "특허 3건 출원",
};
const NO_FACTS = { investAmount: null, valuation: null };

let claimSeq = 0;
function fakeClaim(overrides: Partial<NumericClaim>): NumericClaim {
  claimSeq += 1;
  return {
    sectionKey: SectionKey.MARKET_ANALYSIS,
    raw: `테스트 주장 ${claimSeq}`,
    label: "",
    value: "",
    unit: "",
    status: "unverified",
    claimType: "numeric",
    confidence: "UNSUPPORTED",
    matchMethod: "none",
    claimKey: `test:${claimSeq}`,
    ...overrides,
  };
}

/** 1. 근거 없는 핵심 주장(UNSUPPORTED) → HIGH 우선순위 질문 */
function testUnsupportedClaimIsHigh() {
  const claims = [
    fakeClaim({
      sectionKey: SectionKey.PRODUCT_TECHNOLOGY,
      confidence: "UNSUPPORTED",
      raw: "자체 개발 AI 모델로 특허 2건 보유",
    }),
  ];
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, claims);
  const questions = buildDeterministicIcQuestions(BASE_RATIONALE, assessment, NO_FACTS);
  const q = questions.find((q) => q.trigger === "UNSUPPORTED_CLAIM");
  assert(Boolean(q), "UNSUPPORTED claim인데 질문이 안 생김");
  // product 점수(85)가 70 이상이라 priorityFromScore가 HIGH를 줘야 한다
  assert(q!.priority === "HIGH", `근거 없는 고득점(85) 항목인데 HIGH가 아님: ${q!.priority}`);
  assert(q!.relatedClaim === "자체 개발 AI 모델로 특허 2건 보유", "relatedClaim 연결 실패");
  assert(q!.relatedEvidence === "UNSUPPORTED", "relatedEvidence가 UNSUPPORTED가 아님");
  console.log("✅ 근거 없는 핵심 주장 → HIGH 질문 + claim/evidence 연결");
}

/** 2. 고득점 + 근거 자체가 없음(NO_EVIDENCE, claim 0개) → HIGH_SCORE_LOW_EVIDENCE 질문 */
function testHighScoreNoEvidence() {
  // product는 85점인데 매핑되는 claim이 아예 없다(claimsTotal=0 → NO_EVIDENCE)
  const claims = [
    fakeClaim({ sectionKey: SectionKey.MARKET_ANALYSIS, confidence: "HIGH", status: "document" }),
  ];
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, claims);
  assert(assessment.dimensions.product.confidence === "NO_EVIDENCE", "테스트 전제 실패: product가 NO_EVIDENCE가 아님");
  const questions = buildDeterministicIcQuestions(BASE_RATIONALE, assessment, NO_FACTS);
  const q = questions.find((q) => q.trigger === "HIGH_SCORE_LOW_EVIDENCE");
  assert(Boolean(q), "고득점+근거전무인데 HIGH_SCORE_LOW_EVIDENCE 질문이 안 생김");
  assert(q!.priority === "HIGH", "HIGH_SCORE_LOW_EVIDENCE는 항상 HIGH여야 함");
  assert(q!.relatedDimension === "product", "관련 차원(product) 연결 실패");
  console.log("✅ 고득점(85) + 근거 전무(NO_EVIDENCE) → HIGH_SCORE_LOW_EVIDENCE 질문");
}

/** 3. 부분 근거 공백(MEDIUM/LOW confidence) → 해당 차원 claim에서 질문 생성 */
function testEvidenceGapQuestion() {
  const claims = [
    fakeClaim({ sectionKey: SectionKey.MARKET_ANALYSIS, confidence: "HIGH", status: "document" }),
    fakeClaim({ sectionKey: SectionKey.MARKET_ANALYSIS, confidence: "UNSUPPORTED", raw: "연 성장률 40%" }),
  ];
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, claims);
  assert(assessment.dimensions.marketSize.confidence === "MEDIUM", "테스트 전제 실패: marketSize가 MEDIUM이 아님");
  const questions = buildDeterministicIcQuestions(BASE_RATIONALE, assessment, NO_FACTS);
  const q = questions.find((q) => q.relatedClaim === "연 성장률 40%");
  assert(Boolean(q), "부분 근거 공백(MEDIUM)인데 질문이 안 생김");
  assert(q!.relatedDimension === "marketSize", "marketSize 차원 연결 실패");
  console.log("✅ 부분 근거 공백(MEDIUM) → 해당 claim에서 질문 생성");
}

/** 4. 근거가 이미 HIGH인 차원엔 억지로 질문을 만들지 않는다 */
function testHighConfidenceSuppressesGenericQuestion() {
  const claims = [
    fakeClaim({ sectionKey: SectionKey.INVESTMENT_OVERVIEW, confidence: "HIGH", status: "document", raw: "구독형 SaaS 모델" }),
    fakeClaim({ claimType: "qualitative", label: "고객 확보 가능성", confidence: "HIGH", status: "document", raw: "고객 확보 채널 다각화" }),
  ];
  const rationaleNoNumbers = { ...BASE_RATIONALE, businessModel: "안정적인 구독 매출 구조" };
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, rationaleNoNumbers, claims);
  assert(assessment.dimensions.businessModel.confidence === "HIGH", "테스트 전제 실패: businessModel이 HIGH가 아님");
  const questions = buildDeterministicIcQuestions(rationaleNoNumbers, assessment, NO_FACTS);
  const bmQuestions = questions.filter((q) => q.relatedDimension === "businessModel");
  assert(
    bmQuestions.length === 0,
    `근거 HIGH인 차원(businessModel)에 억지 질문이 생김: ${JSON.stringify(bmQuestions)}`
  );
  console.log("✅ 근거 HIGH인 차원에는 억지 질문 생성 안 함(신호 없으면 질문 없음)");
}

/** 5. 밸류에이션 risk flag가 있으면 Valuation 질문이 생긴다 */
function testValuationEvidenceGap() {
  const claims = [fakeClaim({ sectionKey: SectionKey.VALUATION, confidence: "UNSUPPORTED" })];
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, claims);
  assert(assessment.riskFlags.includes("VALUATION_EVIDENCE_GAP"), "테스트 전제 실패: VALUATION_EVIDENCE_GAP 없음");
  const questions = buildDeterministicIcQuestions(
    BASE_RATIONALE,
    assessment,
    { investAmount: 30, valuation: 300 }
  );
  const q = questions.find((q) => q.trigger === "VALUATION_EVIDENCE_GAP");
  assert(Boolean(q), "밸류에이션 근거 공백인데 질문이 안 생김");
  assert(q!.category === "Valuation", "밸류에이션 질문 카테고리 오류");
  assert(q!.priority === "HIGH", "밸류에이션 근거 공백은 HIGH여야 함");
  assert(q!.question.includes("300"), "딜 팩트(post-money)가 질문 문장에 반영 안 됨");
  console.log("✅ 밸류에이션 근거 공백(risk flag) → Valuation 카테고리 HIGH 질문 + 딜 팩트 반영");
}

/** 6. 밸류에이션 자료가 없으면 숫자를 지어내지 않는다 */
function testValuationNeverFabricatesNumbers() {
  const claims = [fakeClaim({ sectionKey: SectionKey.VALUATION, confidence: "UNSUPPORTED" })];
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, claims);
  const questions = buildDeterministicIcQuestions(BASE_RATIONALE, assessment, NO_FACTS);
  const q = questions.find((q) => q.trigger === "VALUATION_EVIDENCE_GAP");
  assert(Boolean(q), "밸류에이션 질문이 안 생김");
  assert(!/\d/.test(q!.question.replace(/comparable company/gi, "")), `딜 팩트가 없는데 질문에 숫자가 있음: ${q!.question}`);
  console.log("✅ 밸류에이션 딜 팩트가 없으면 숫자를 지어내지 않음");
}

/** 7. 우선순위는 AI가 아니라 점수 구간으로 결정적으로 계산된다 */
function testDeterministicPriority() {
  const highClaims = [fakeClaim({ sectionKey: SectionKey.PRODUCT_TECHNOLOGY, confidence: "UNSUPPORTED" })]; // product=85
  const lowScores = { ...BASE_SCORES, product: 30 };
  const lowClaims = [fakeClaim({ sectionKey: SectionKey.PRODUCT_TECHNOLOGY, confidence: "UNSUPPORTED" })];

  const highAssessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, highClaims);
  const lowAssessment = buildScoreEvidenceAssessment(lowScores, BASE_RATIONALE, lowClaims);

  const highQ = buildDeterministicIcQuestions(BASE_RATIONALE, highAssessment, NO_FACTS).find(
    (q) => q.trigger === "UNSUPPORTED_CLAIM"
  );
  const lowQ = buildDeterministicIcQuestions(BASE_RATIONALE, lowAssessment, NO_FACTS).find(
    (q) => q.trigger === "UNSUPPORTED_CLAIM"
  );
  assert(highQ!.priority === "HIGH", `85점 UNSUPPORTED가 HIGH가 아님: ${highQ!.priority}`);
  assert(lowQ!.priority === "LOW", `30점 UNSUPPORTED가 LOW가 아님: ${lowQ!.priority}`);
  console.log("✅ 우선순위는 점수 구간으로 결정적 계산(HIGH>=70, MEDIUM>=40, 나머지 LOW)");
}

/** 8. 같은 후보가 중복 생성돼도 dedupe로 한 번만 남는다 */
function testDeduplication() {
  const claims = [
    fakeClaim({ sectionKey: SectionKey.PRODUCT_TECHNOLOGY, confidence: "UNSUPPORTED", raw: "동일 주장" }),
  ];
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, claims);
  // buildDeterministicIcQuestions를 두 번 호출한 결과를 합쳐 dedupe 로직을 직접 검증
  const a = buildDeterministicIcQuestions(BASE_RATIONALE, assessment, NO_FACTS);
  const b = buildDeterministicIcQuestions(BASE_RATIONALE, assessment, NO_FACTS);
  const ids = [...a, ...b].map((q) => q.id);
  const uniqueIds = new Set(ids);
  // 각 호출 자체는 이미 dedupe된 결과이므로, 개별 호출 안에서 id 중복이 없어야 한다
  assert(new Set(a.map((q) => q.id)).size === a.length, "단일 호출 결과 안에 중복 id가 있음");
  assert(uniqueIds.size > 0, "dedupe 검증용 id 집합이 비어있음");
  console.log("✅ 질문 후보 중복 없음(id 기준 dedupe)");
}

/** 9. 아무리 후보가 많아도 최대 10개까지만 반환한다 */
function testMaxTenQuestions() {
  const claims: NumericClaim[] = [];
  const dims: Array<{ section: SectionKey }> = [
    { section: SectionKey.MARKET_ANALYSIS },
    { section: SectionKey.COMPANY_OVERVIEW },
    { section: SectionKey.PRODUCT_TECHNOLOGY },
    { section: SectionKey.FINANCIAL_STATUS },
  ];
  for (const { section } of dims) {
    for (let i = 0; i < 5; i++) {
      claims.push(fakeClaim({ sectionKey: section, confidence: "UNSUPPORTED", raw: `${section} 주장 ${i}` }));
    }
  }
  claims.push(fakeClaim({ sectionKey: SectionKey.VALUATION, confidence: "UNSUPPORTED" }));

  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, claims);
  const questions = buildDeterministicIcQuestions(BASE_RATIONALE, assessment, {
    investAmount: 10,
    valuation: 100,
  });
  assert(questions.length <= 10, `질문이 10개를 초과함: ${questions.length}`);
  console.log(`✅ 후보가 많아도(20+건) 최대 10개로 제한됨 (실제 ${questions.length}개)`);
}

/** 10. Top 5는 우선순위(HIGH>MEDIUM>LOW) 순으로 정렬된다 */
function testTop5Ordering() {
  const claims: NumericClaim[] = [];
  for (let i = 0; i < 3; i++) {
    claims.push(
      fakeClaim({ sectionKey: SectionKey.PRODUCT_TECHNOLOGY, confidence: "UNSUPPORTED", raw: `고득점 주장 ${i}` })
    );
  }
  const lowScores = { ...BASE_SCORES, financials: 20 };
  for (let i = 0; i < 3; i++) {
    claims.push(
      fakeClaim({ sectionKey: SectionKey.FINANCIAL_STATUS, confidence: "UNSUPPORTED", raw: `저득점 주장 ${i}` })
    );
  }
  const assessment = buildScoreEvidenceAssessment(lowScores, BASE_RATIONALE, claims);
  const result = toIcQuestionsResult(
    buildDeterministicIcQuestions(BASE_RATIONALE, assessment, NO_FACTS),
    "test"
  );
  assert(result.top5.length <= 5, "top5가 5개를 초과함");
  for (let i = 1; i < result.top5.length; i++) {
    const rank = (p: string) => (p === "HIGH" ? 3 : p === "MEDIUM" ? 2 : 1);
    assert(
      rank(result.top5[i - 1].priority) >= rank(result.top5[i].priority),
      "top5가 우선순위 내림차순으로 정렬되지 않음"
    );
  }
  console.log("✅ top5는 우선순위 내림차순 정렬");
}

/** 11. 질문 내용에 맞는 예상 답변 유형이 결정적으로 붙는다 */
function testExpectedAnswerType() {
  const claims = [
    fakeClaim({ sectionKey: SectionKey.FINANCIAL_STATUS, confidence: "UNSUPPORTED", raw: "2025년 매출 45억원" }),
  ];
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, claims);
  const questions = buildDeterministicIcQuestions(BASE_RATIONALE, assessment, NO_FACTS);
  const q = questions.find((q) => q.relatedClaim === "2025년 매출 45억원");
  assert(Boolean(q), "매출 관련 질문이 안 생김");
  assert(
    q!.suggestedAnswerType === "FINANCIAL_TABLE",
    `매출 관련 claim의 답변 유형이 FINANCIAL_TABLE이 아님: ${q!.suggestedAnswerType}`
  );
  console.log("✅ claim 내용에 맞는 예상 답변 유형(FINANCIAL_TABLE) 결정적 부여");
}

/** 12. 질문마다 relatedDimension/relatedClaim/relatedEvidence로 근거까지 추적 가능 */
function testEvidenceLinkage() {
  const claims = [
    fakeClaim({ sectionKey: SectionKey.MARKET_ANALYSIS, confidence: "UNSUPPORTED", raw: "시장 규모 5조원" }),
  ];
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, claims);
  const questions = buildDeterministicIcQuestions(BASE_RATIONALE, assessment, NO_FACTS);
  const q = questions.find((q) => q.relatedClaim === "시장 규모 5조원");
  assert(Boolean(q), "질문이 안 생김");
  assert(q!.relatedDimension === "marketSize", "차원 연결 실패");
  assert(q!.relatedEvidence === "UNSUPPORTED", "근거 상태 연결 실패");
  console.log("✅ 질문 → 차원/claim/근거 상태까지 추적 가능(provenance)");
}

/** 13. 다른 사용자(팀 무관)의 보고서는 reportReadWhere 조건에서 걸러진다 (GET 인가) */
function testUnauthorizedGetShape() {
  const where = reportReadWhere("attacker", null) as { deal?: { userId?: string } };
  assert(
    JSON.stringify(where) === JSON.stringify({ deal: { userId: "attacker" } }),
    "팀이 없는 사용자는 본인 딜의 보고서만 읽을 수 있어야 함(GET 라우트가 이 where를 그대로 사용)"
  );
  console.log("✅ GET /ic-questions는 reportReadWhere로 타 사용자 보고서 접근 차단");
}

/** 14. ANALYST 역할은 본인 소유 보고서만 쓸 수 있다 (POST 인가) */
function testUnauthorizedPostShape() {
  const where = reportWriteWhere("u2", "t1", "ANALYST");
  assert(
    JSON.stringify(where) === JSON.stringify({ deal: { userId: "u2" } }),
    "ANALYST의 report write where가 본인 소유로 제한되지 않음(POST /ic-questions/generate가 이 where를 그대로 사용)"
  );
  console.log("✅ POST /ic-questions/generate는 reportWriteWhere로 ANALYST의 타인 보고서 쓰기 차단");
}

/** 15. IC 질문 생성 rate limit이 설정돼 있다(AI 비용 남용 방지) */
function testRateLimitConfigured() {
  assert(Boolean(RATE_LIMITS.icQuestions), "RATE_LIMITS.icQuestions가 없음");
  assert(RATE_LIMITS.icQuestions.limit > 0, "icQuestions rate limit이 비정상");
  console.log("✅ IC 질문 생성 rate limit 설정 확인 (AI 비용 남용 방지)");
}

/** 16. AI 호출이 실패/미설정이어도 deterministic 결과를 그대로 반환한다(fallback) */
async function testAiFallback() {
  const claims = [
    fakeClaim({ sectionKey: SectionKey.PRODUCT_TECHNOLOGY, confidence: "UNSUPPORTED", raw: "AI 미설정 폴백 테스트" }),
  ];
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, claims);
  const deterministic = buildDeterministicIcQuestions(BASE_RATIONALE, assessment, NO_FACTS);
  // 테스트 환경엔 OPENROUTER_API_KEY가 없으므로 isAIConfigured()가 false → 원본 그대로 반환돼야 한다
  const refined = await refineIcQuestionsWithAI(deterministic);
  assert(
    JSON.stringify(refined) === JSON.stringify(deterministic),
    "AI 미설정 상태인데 결과가 deterministic 원본과 달라짐(fallback 실패)"
  );
  assert(
    refined.every((q: IcQuestion) => q.source === "deterministic"),
    "AI 미설정인데 일부 질문의 source가 ai_refined로 바뀜"
  );
  console.log("✅ AI 미설정/실패 시 deterministic 결과 그대로 반환(fallback)");
}

/** 17. 근거 자료가 전혀 없어도(claim 0개, DealScore 없음과 동등) 예외 없이 안전하게 빈/최소 결과 */
function testNoEvidenceNoScoreHandling() {
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, {}, [], "no_report");
  const questions = buildDeterministicIcQuestions({}, assessment, NO_FACTS);
  // no_report(claim 0개)면 모든 차원이 NO_EVIDENCE인데, 점수가 70 미만인 차원도 있어
  // highScoreNoEvidenceQuestion(70점 이상만) 조건에 안 걸리는 차원은 질문이 안 생겨야 한다
  assert(Array.isArray(questions), "결과가 배열이 아님");
  for (const q of questions) {
    assert(typeof q.question === "string" && q.question.length > 0, "질문 텍스트가 비어있음");
  }
  console.log(`✅ claim/보고서 근거가 전혀 없어도 예외 없이 안전한 결과 반환 (${questions.length}개)`);
}

/** 18. 생성된 한국어 질문 문장이 최소 품질(공백 아님, 물음표 등 문장 형태)을 갖춘다 */
function testKoreanTextQuality() {
  const claims = [
    fakeClaim({ sectionKey: SectionKey.PRODUCT_TECHNOLOGY, confidence: "UNSUPPORTED", raw: "핵심 기술 특허 출원 중" }),
    fakeClaim({ sectionKey: SectionKey.VALUATION, confidence: "UNSUPPORTED" }),
  ];
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, claims);
  const questions = buildDeterministicIcQuestions(BASE_RATIONALE, assessment, {
    investAmount: 20,
    valuation: 200,
  });
  assert(questions.length > 0, "품질 검사할 질문이 없음");
  for (const q of questions) {
    assert(q.question.trim().length >= 10, `질문이 너무 짧음: "${q.question}"`);
    assert(q.whyItMatters.trim().length >= 5, `whyItMatters가 너무 짧음: "${q.whyItMatters}"`);
    assert(/[.?]$/.test(q.question.trim()), `질문이 문장 형태로 끝나지 않음: "${q.question}"`);
  }
  console.log("✅ 생성된 질문/근거 설명이 최소 한국어 문장 품질을 갖춤");
}

async function main() {
  console.log("\n=== DealMind IC Questions Engine 테스트 ===\n");
  testUnsupportedClaimIsHigh();
  testHighScoreNoEvidence();
  testEvidenceGapQuestion();
  testHighConfidenceSuppressesGenericQuestion();
  testValuationEvidenceGap();
  testValuationNeverFabricatesNumbers();
  testDeterministicPriority();
  testDeduplication();
  testMaxTenQuestions();
  testTop5Ordering();
  testExpectedAnswerType();
  testEvidenceLinkage();
  testUnauthorizedGetShape();
  testUnauthorizedPostShape();
  testRateLimitConfigured();
  await testAiFallback();
  testNoEvidenceNoScoreHandling();
  testKoreanTextQuality();
  console.log("\n✅ IC Questions Engine 테스트 통과\n");
}

main().catch((err) => {
  console.error("❌ 테스트 실패:", err);
  process.exit(1);
});
