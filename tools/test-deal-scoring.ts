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
} from "../src/lib/deal-scoring";

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

function main() {
  console.log("\n=== DealMind 딜 스코어링 테스트 ===\n");
  testWellFormedJson();
  testCodeFence();
  testOutOfRangeClamped();
  testMalformedJsonNeverThrows();
  testMissingFieldsDefaultToZero();
  testDemoScoreDeterministic();
  testScoreLabelBoundaries();
  console.log("\n✅ 딜 스코어링 테스트 통과\n");
}

main();
