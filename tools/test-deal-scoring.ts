/**
 * 딜 스코어링 파서·clamp·데모 모드 검증 (AI 호출 없음).
 *
 * report-quality.ts 테스트와 달리 이건 AI 응답이 스펙을 벗어났을 때도
 * 항상 유효한 점수 객체를 내는지가 핵심이다 — 여기서 예외가 나면
 * 딜 상세 화면 전체가 깨진다.
 *
 * Usage: npm run test:deal-scoring
 */
import {
  SCORE_DIMENSIONS,
  parseScoreResponse,
  demoScore,
  scoreLabel,
  computeSectorStageBenchmark,
} from "../src/lib/deal-scoring";
import { buildScoreEvidenceAssessment } from "../src/lib/deal-scoring-evidence";
import { RATE_LIMITS } from "../src/lib/rate-limit";
import { SectionKey } from "@prisma/client";
import type { NumericClaim } from "../src/lib/evidence";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testWellFormedJson() {
  const raw = JSON.stringify({
    scores: {
      marketSize: 80,
      team: 70,
      product: 65,
      businessModel: 60,
      financials: 55,
      moat: 50,
    },
    rationale: { marketSize: "TAM 5조원", team: "연쇄창업" },
  });
  const result = parseScoreResponse(raw, "test-model");
  assert(result.marketSize === 80, "정상 JSON 파싱 실패");
  assert(result.rationale.marketSize === "TAM 5조원", "rationale 파싱 실패");
  // overall은 AI가 준 값이 아니라 6개 차원 평균이어야 한다
  const expectedAvg = Math.round((80 + 70 + 65 + 60 + 55 + 50) / 6);
  assert(
    result.overall === expectedAvg,
    `overall이 차원 평균이 아님: ${result.overall} !== ${expectedAvg}`
  );
  console.log("✅ 정상 JSON 파싱 + overall=차원평균");
}

function testCodeFence() {
  const raw =
    '여기 점수입니다:\n```json\n{"scores":{"marketSize":90,"team":90,"product":90,"businessModel":90,"financials":90,"moat":90},"rationale":{}}\n```\n감사합니다.';
  const result = parseScoreResponse(raw, "test-model");
  assert(result.overall === 90, `코드펜스 안 JSON 추출 실패: ${result.overall}`);
  console.log("✅ 코드펜스로 감싼 JSON도 추출");
}

function testOutOfRangeClamped() {
  const raw = JSON.stringify({
    scores: { marketSize: 150, team: -20, product: NaN, businessModel: 50 },
    rationale: {},
  });
  const result = parseScoreResponse(raw, "test-model");
  assert(result.marketSize === 100, `150이 100으로 clamp 안됨: ${result.marketSize}`);
  assert(result.team === 0, `-20이 0으로 clamp 안됨: ${result.team}`);
  assert(result.product === 0, `NaN이 0으로 처리 안됨: ${result.product}`);
  console.log("✅ 범위 밖 값(150, -20, NaN) clamp");
}

function testMalformedJsonNeverThrows() {
  const cases = ["", "이건 그냥 텍스트입니다", "{ broken json", "null", "[]"];
  for (const raw of cases) {
    const result = parseScoreResponse(raw, "test-model");
    for (const { key } of SCORE_DIMENSIONS) {
      assert(
        typeof result[key] === "number" && result[key] >= 0 && result[key] <= 100,
        `깨진 입력(${JSON.stringify(raw)})에서 ${key}가 유효하지 않음: ${result[key]}`
      );
    }
  }
  console.log("✅ 깨진 응답에도 예외 없이 유효한 점수 반환");
}

function testMissingFieldsDefaultToZero() {
  const result = parseScoreResponse(
    JSON.stringify({ scores: { marketSize: 70 } }),
    "test-model"
  );
  assert(result.marketSize === 70, "있는 필드가 안 읽힘");
  assert(result.team === 0, "없는 필드가 0이 아님");
  console.log("✅ 누락된 차원은 0으로 기본값");
}

function testDemoScoreDeterministic() {
  const input = { companyName: "테스트회사", sector: "IT" };
  const a = demoScore(input);
  const b = demoScore(input);
  assert(a.overall === b.overall, "데모 점수가 같은 입력에 대해 매번 달라짐");
  for (const { key } of SCORE_DIMENSIONS) {
    assert(a[key] === b[key], `데모 점수 ${key}가 결정론적이지 않음`);
    assert(a[key] >= 0 && a[key] <= 100, `데모 점수 ${key}가 범위를 벗어남: ${a[key]}`);
  }
  const c = demoScore({ companyName: "다른회사", sector: "BIO" });
  assert(
    a.overall !== c.overall || a.marketSize !== c.marketSize,
    "다른 회사인데 데모 점수가 완전히 동일함 (해시 변별력 없음)"
  );
  console.log("✅ 데모 모드 점수는 결정론적 + 회사별로 다름");
}

function testScoreLabelBoundaries() {
  assert(scoreLabel(100).label === "매력적", "100점 라벨 오류");
  assert(scoreLabel(75).label === "매력적", "75점 경계 라벨 오류");
  assert(scoreLabel(74).label === "검토 가능", "74점 라벨 오류");
  assert(scoreLabel(35).label === "보완 필요", "35점 경계 라벨 오류");
  assert(scoreLabel(0).label === "리스크 높음", "0점 라벨 오류");
  console.log("✅ 점수 구간별 라벨 경계값");
}

// ────────────────────────────────────────────────────────────
// Phase 4 — Evidence Engine 연결(deal-scoring-evidence.ts) 검증
// ────────────────────────────────────────────────────────────

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

/** 시장성: 4개 중 3개 근거 확인, 1개는 못 찾음 — "고득점 + 부분 근거" 흔한 케이스 */
function testDimensionPartialEvidence() {
  const claims = [
    fakeClaim({ sectionKey: SectionKey.MARKET_ANALYSIS, confidence: "HIGH", status: "document" }),
    fakeClaim({ sectionKey: SectionKey.MARKET_ANALYSIS, confidence: "HIGH", status: "document" }),
    fakeClaim({ sectionKey: SectionKey.MARKET_ANALYSIS, confidence: "MEDIUM", status: "document" }),
    fakeClaim({ sectionKey: SectionKey.MARKET_ANALYSIS, confidence: "UNSUPPORTED" }),
  ];
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, claims);
  const market = assessment.dimensions.marketSize;
  assert(market.claimsTotal === 4, `시장성 claim 수 불일치: ${market.claimsTotal}`);
  assert(market.evidenceCoverage === 75, `시장성 근거 커버리지 불일치: ${market.evidenceCoverage}`);
  assert(
    market.confidence === "MEDIUM",
    `82점(고득점)인데 unsupported claim이 섞였으니 MEDIUM이어야 함: ${market.confidence}`
  );
  assert(
    assessment.riskFlags.includes("MARKET_EVIDENCE_GAP"),
    "부분 근거인데 MARKET_EVIDENCE_GAP이 안 잡힘"
  );
  console.log("✅ 근거 커버리지: 4개 중 3개 확인 → 75%, 확신도 MEDIUM, gap flag");
}

/** 팀: 매핑되는 claim이 하나도 없으면 0%가 아니라 "평가 불가"로 구분한다 */
function testDimensionNoEvidence() {
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, []);
  const team = assessment.dimensions.team;
  assert(team.claimsTotal === 0, "claim이 없는데 0이 아님");
  assert(team.evidenceCoverage === null, "claim이 없는데 커버리지가 숫자로 계산됨(0%와 혼동 위험)");
  assert(team.confidence === "NO_EVIDENCE", `claim 없음은 NO_EVIDENCE여야 함: ${team.confidence}`);
  console.log("✅ 매핑되는 claim이 없으면 커버리지 0%가 아니라 NO_EVIDENCE로 구분");
}

/** 사업모델: 전부 근거 확인되면 확신도 HIGH + gap flag 없음 */
function testDimensionFullySupported() {
  const claims = [
    fakeClaim({ sectionKey: SectionKey.INVESTMENT_OVERVIEW, confidence: "HIGH", status: "document" }),
    fakeClaim({ claimType: "qualitative", label: "고객 확보 가능성", confidence: "MEDIUM", status: "document" }),
  ];
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, claims);
  const bm = assessment.dimensions.businessModel;
  assert(bm.evidenceCoverage === 100, `전부 확인됐는데 100%가 아님: ${bm.evidenceCoverage}`);
  assert(bm.confidence === "HIGH", `전부 확인됐는데 HIGH가 아님: ${bm.confidence}`);
  assert(
    !assessment.riskFlags.includes("BUSINESS_MODEL_EVIDENCE_GAP"),
    "근거가 전부 확인됐는데 gap flag가 잡힘"
  );
  console.log("✅ 전부 근거 확인되면 확신도 HIGH + gap flag 없음");
}

/** 제품·기술력: 고득점(85)인데 근거가 전부 unsupported → hallucination 위험 신호 */
function testHighScoreLowEvidenceFlag() {
  const claims = [
    fakeClaim({ sectionKey: SectionKey.PRODUCT_TECHNOLOGY, confidence: "UNSUPPORTED" }),
  ];
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, claims);
  const product = assessment.dimensions.product;
  assert(product.confidence === "UNSUPPORTED", `근거 전무인데 UNSUPPORTED가 아님: ${product.confidence}`);
  assert(
    assessment.riskFlags.includes("HIGH_SCORE_LOW_EVIDENCE"),
    "85점인데 근거가 없는데도 HIGH_SCORE_LOW_EVIDENCE가 안 잡힘"
  );
  assert(
    assessment.riskFlags.includes("PRODUCT_EVIDENCE_GAP"),
    "제품·기술력 근거 공백인데 PRODUCT_EVIDENCE_GAP이 안 잡힘"
  );
  assert(
    assessment.riskFlags.includes("UNSUPPORTED_KEY_CLAIM"),
    "unsupported claim이 있는데 UNSUPPORTED_KEY_CLAIM이 안 잡힘"
  );
  console.log("✅ 고득점(85) + 근거 전무 → HIGH_SCORE_LOW_EVIDENCE/UNSUPPORTED_KEY_CLAIM 플래그");
}

/** 밸류에이션은 스코어 차원이 아니지만, 근거 없는 밸류에이션 주장은 별도로 flag한다 */
function testValuationEvidenceGap() {
  const claims = [
    fakeClaim({ sectionKey: SectionKey.VALUATION, confidence: "UNSUPPORTED" }),
  ];
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, claims);
  assert(
    assessment.riskFlags.includes("VALUATION_EVIDENCE_GAP"),
    "근거 없는 밸류에이션 주장인데 VALUATION_EVIDENCE_GAP이 안 잡힘"
  );
  console.log("✅ 근거 없는 밸류에이션 주장 → VALUATION_EVIDENCE_GAP");
}

/** IC 요약: 강점(고득점+근거 확인)/리스크(저득점 또는 근거 부족)/미해결(unsupported 원문) */
function testIcSummary() {
  const claims = [
    fakeClaim({ sectionKey: SectionKey.MARKET_ANALYSIS, confidence: "HIGH", status: "document" }),
    fakeClaim({ sectionKey: SectionKey.PRODUCT_TECHNOLOGY, confidence: "UNSUPPORTED", raw: "독자 알고리즘으로 특허 출원" }),
  ];
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, claims);
  assert(
    assessment.icSummary.strengths.some((s) => s.includes("시장성")),
    "고득점+근거확인 시장성이 강점에 안 들어감"
  );
  assert(
    !assessment.icSummary.strengths.some((s) => s.includes("제품")),
    "근거 없는 고득점 항목(제품)이 강점으로 잘못 들어감"
  );
  assert(
    assessment.icSummary.risks.some((s) => s.includes("경쟁 우위") || s.includes("moat")),
    "40점(최저)인 경쟁우위가 리스크에 안 들어감"
  );
  assert(
    assessment.icSummary.unresolved.includes("독자 알고리즘으로 특허 출원"),
    "unsupported claim 원문이 미해결 목록에 안 들어감"
  );
  console.log("✅ IC 요약: 강점(근거O+고득점)/리스크(저득점·근거부족)/미해결(unsupported 원문) 분리");
}

/** 보고서 없이(문서 원문만으로) 채점한 경우 — evidence 계산 불가를 명시, 억지로 만들지 않음 */
function testNoReportBasis() {
  const assessment = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, [], "no_report");
  assert(assessment.basis === "no_report", "basis가 no_report로 안 남음");
  assert(assessment.overallCoverage === null, "보고서 없는데 커버리지가 계산됨");
  assert(
    Object.values(assessment.dimensions).every((d) => d.confidence === "NO_EVIDENCE"),
    "보고서 없는데 일부 차원이 NO_EVIDENCE가 아님"
  );
  console.log("✅ 보고서 없이 채점 시 evidence 계산 불가를 명시(basis=no_report), 지어내지 않음");
}

/** 같은 입력이면 항상 같은 결과 — 재계산·중복 호출로 결과가 흔들리지 않는다(결정적) */
function testDeterministicResult() {
  const claims = [
    fakeClaim({ sectionKey: SectionKey.MARKET_ANALYSIS, confidence: "HIGH", status: "document" }),
    fakeClaim({ sectionKey: SectionKey.PRODUCT_TECHNOLOGY, confidence: "UNSUPPORTED" }),
  ];
  const a = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, claims);
  const b = buildScoreEvidenceAssessment(BASE_SCORES, BASE_RATIONALE, claims);
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    "동일 입력인데 결과가 달라짐 — 재계산 시 신뢰도 판단이 흔들릴 위험"
  );
  console.log("✅ 동일 입력 → 항상 동일한 평가 결과(결정적)");
}

/** 벤치마크: 비교 대상이 3건 미만이면 percentile을 지어내지 않는다 */
function testBenchmarkInsufficientData() {
  const result = computeSectorStageBenchmark(80, [70, 75]);
  assert(result.status === "insufficient_data", "2건뿐인데 insufficient_data가 아님");
  assert(result.comparableCount === 2, "비교 가능 건수가 안 맞음");
  assert(result.percentile === undefined, "데이터 부족한데 percentile을 지어냄");
  console.log("✅ 비교 대상 3건 미만 → insufficient_data (가짜 percentile 없음)");
}

/** 벤치마크: 3건 이상이면 실제 분포로 percentile·평균을 계산한다 */
function testBenchmarkPercentile() {
  const result = computeSectorStageBenchmark(80, [50, 60, 70, 90, 95]);
  assert(result.status === "ok", "5건인데 ok가 아님");
  assert(result.percentile === 60, `percentile 계산 오류: ${result.percentile} (5개 중 3개가 80 미만 → 60)`);
  assert(result.sectorStageAverage === 73, `평균 계산 오류: ${result.sectorStageAverage}`);
  console.log("✅ 비교 대상 충분 → 실제 분포 기반 percentile·평균 계산");
}

/** AI 비용 남용 방지 — deal-scoring rate limit이 실수로 지워지지 않았는지 확인 */
function testRateLimitStillConfigured() {
  assert(Boolean(RATE_LIMITS.dealScoring), "RATE_LIMITS.dealScoring이 없음");
  assert(RATE_LIMITS.dealScoring.limit > 0, "dealScoring rate limit이 비정상");
  console.log("✅ 딜 스코어링 rate limit 유지 확인 (AI 비용 남용 방지)");
}

function main() {
  console.log("\n=== DealMind 딜 스코어링 테스트 ===\n");
  testWellFormedJson();
  testCodeFence();
  testOutOfRangeClamped();
  testMalformedJsonNeverThrows();
  testMissingFieldsDefaultToZero();
  testDemoScoreDeterministic();
  testScoreLabelBoundaries();
  testDimensionPartialEvidence();
  testDimensionNoEvidence();
  testDimensionFullySupported();
  testHighScoreLowEvidenceFlag();
  testValuationEvidenceGap();
  testIcSummary();
  testNoReportBasis();
  testDeterministicResult();
  testBenchmarkInsufficientData();
  testBenchmarkPercentile();
  testRateLimitStillConfigured();
  console.log("\n✅ 딜 스코어링 테스트 통과\n");
}

main();
