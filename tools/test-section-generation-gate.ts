/**
 * 섹션 generation-time 품질 게이트(section-generation-gate.ts) 단위 테스트.
 *
 * 배경: report=cmtycq7ne...(실제 프로덕션, "temp" 딜)의 OPINION_SUMMARY
 * 섹션이 `"User Safety: safe"`(45자)로 저장된 채 보고서가 완료 처리된
 * 실제 사고를 regression fixture로 삼는다 — 이 테스트가 실패하면 그
 * 사고가 재발할 수 있다는 뜻이다.
 *
 * 순수 함수만 검증한다(DB/네트워크 없음).
 *
 * Usage: npm run test:section-generation-gate
 */
import { checkGenerationGate } from "../src/lib/section-generation-gate";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const GOOD_OPINION_SUMMARY = `
## 최종 투자 의견
조건부 투자 추천 — Pre-IPO 밸류(900억)와 성장성은 매력적이나, 기업명 불일치와
부채율 리스크를 실사(DD)로 반드시 해소한 뒤 집행을 권고한다.

## 투자 이유
1. 국내 유일 SW 개발·운용 역량과 다수 선급인증(KR/DNV/ABS)을 보유해 진입장벽이 높다.
2. 2023→2025년 매출이 35억에서 260억(목표)으로 급성장하며 시장점유율도 58%에서
   70%로 확대되고 있어 성장 모멘텀이 뚜렷하다.
3. 가격경쟁력이 국내 경쟁사 대비 20%, 글로벌 대비 50% 이상 우위에 있어 수주
   경쟁에서 구조적으로 유리하다.

## 핵심 리스크
1. 부채율이 2024년 261%에서 2026년 2분기 912%까지 급등할 수 있어 자본 구조가
   불안정하다.
2. 해외 MOU/LOI가 아직 체결되지 않아 해외 매출 확대 계획의 근거가 약하다.
3. 기업명(temp)과 실제 법인명(㈜드라이브포스)이 불일치해 투자 대상 법인 자체를
   재확인해야 한다.

## 투자 전 반드시 확인할 사항
1. 밸류에이션 산정에 사용된 비교기업(Comparable Company) 선정 기준.
2. 부채율 급등(912%) 구간의 정확한 원인과 상환 계획.
3. 해외 MOU/LOI의 실제 진행 상황과 체결 가능 시점.

## 투자조건의 적정성 및 기대수익
Pre-IPO 밸류 900억(매출 대비 3.46배)은 국내 유사 SI 업체 평균(2.4배) 대비
고성장 프리미엄을 반영한 수준이다. 일반 트랙 기준 IRR 약 30~40%, 테슬라 트랙
(고성장 지속 시) 기준 IRR 100%+ 를 기대할 수 있다.

## Downside 시나리오
부채율 관리 실패, 해외 진출 지연, IPO 지연이 겹치면 RCPS 만기(10년) 전
상환 부담이 현실화될 수 있다 — 이 경우 원금+이자 회수만 가능한 최악의
시나리오로 수렴한다.

## 최종 판단 근거
성장성·기술력은 확인되나, 밸류에이션 근거·부채 급등·기업명 불일치가
동시에 해소돼야 투자 리스크가 감내 가능한 수준이 된다.
`.trim();

function testUserSafetySafeIsRejected() {
  // A. 실제 프로덕션 사고 재현 — 반드시 FAIL이어야 한다.
  const result = checkGenerationGate("OPINION_SUMMARY", "User Safety: safe");
  assert(!result.ok, "'User Safety: safe'가 게이트를 통과함 — 실제 프로덕션 사고 재발");
  assert(
    result.reason === "BOILERPLATE_REFUSAL" || result.reason === "TOO_SHORT",
    `예상치 못한 reject 사유: ${result.reason}`
  );
  console.log(`✅ A. "User Safety: safe" → FAIL (reason=${result.reason})`);
}

function testEmptyStringIsRejected() {
  // B. 빈 문자열
  const result = checkGenerationGate("INVESTMENT_OVERVIEW", "   ");
  assert(!result.ok && result.reason === "EMPTY", "빈 문자열이 게이트를 통과함");
  console.log("✅ B. 빈 문자열 → FAIL (EMPTY)");
}

function testShortGenericResponseIsRejected() {
  // C. 100자 미만 일반 응답 (섹션 최소 글자수 미달)
  const short = "이 회사는 SaaS 기업이며 매출이 성장하고 있습니다. 투자를 검토할 만합니다.";
  assert(short.replace(/\s/g, "").length < 100, "테스트 픽스처 자체가 100자 이상임");
  const result = checkGenerationGate("INVESTMENT_OVERVIEW", short);
  assert(!result.ok && result.reason === "TOO_SHORT", `짧은 응답이 통과함: ${JSON.stringify(result)}`);
  console.log("✅ C. 100자 미만 일반 응답 → FAIL (TOO_SHORT)");
}

function testGoodOpinionSummaryPasses() {
  // D & F. 정상적인 600자+ 의견종합(권고 라벨 + 이유 + 리스크 + DD 전부 포함) → PASS
  assert(
    GOOD_OPINION_SUMMARY.replace(/\s/g, "").length >= 500,
    "테스트 픽스처가 500자 미만임"
  );
  const result = checkGenerationGate("OPINION_SUMMARY", GOOD_OPINION_SUMMARY);
  assert(result.ok, `정상 의견종합이 게이트를 통과하지 못함: ${JSON.stringify(result)}`);
  console.log("✅ D/F. 정상적인 600자+ 의견종합(권고+이유+리스크+DD) → PASS");
}

function testOpinionSummaryWithoutRecommendationLabelIsRejected() {
  // E. 의견종합인데 recommendation 라벨이 없음 → FAIL
  const noLabel = GOOD_OPINION_SUMMARY.replace(
    /조건부\s*투자\s*추천/g,
    "이 딜은 여러 측면에서 흥미롭다"
  );
  assert(
    !/투자\s*권고|조건부\s*투자|추가\s*검토|투자\s*보류|투자\s*비추천/.test(noLabel),
    "테스트 픽스처에 라벨이 여전히 남아있음"
  );
  const result = checkGenerationGate("OPINION_SUMMARY", noLabel);
  assert(
    !result.ok && result.reason === "MISSING_RECOMMENDATION_LABEL",
    `라벨 없는 의견종합이 통과함: ${JSON.stringify(result)}`
  );
  console.log("✅ E. 의견종합인데 투자 의견 라벨 없음 → FAIL (MISSING_RECOMMENDATION_LABEL)");
}

function testOpinionSummaryRequiresStricter500CharsThanOtherSections() {
  // OPINION_SUMMARY는 SECTION_META 기본값(300자)이 아니라 500자를 요구한다.
  const midLength =
    "조건부 투자 추천. " + "핵심 투자 포인트와 리스크를 종합적으로 검토했다. ".repeat(15);
  const chars = midLength.replace(/\s/g, "").length;
  assert(chars >= 300 && chars < 500, `테스트 픽스처 글자수가 300~500 범위를 벗어남: ${chars}`);
  const result = checkGenerationGate("OPINION_SUMMARY", midLength);
  assert(
    !result.ok && result.reason === "TOO_SHORT",
    `300~500자 사이 의견종합이 통과함(500자 기준이 적용 안 됨): ${JSON.stringify(result)}`
  );
  console.log("✅ OPINION_SUMMARY는 300자를 넘어도 500자 미만이면 FAIL(다른 섹션보다 엄격)");
}

function testRepeatedLinesAreRejected() {
  // COMPANY_OVERVIEW의 minChars(500)를 먼저 통과해야 REPETITIVE 검사까지
  // 도달한다 — 패딩을 충분히 크게 둬서 TOO_SHORT와 겹치지 않게 한다.
  const repeated =
    Array(4)
      .fill("이 회사는 성장 가능성이 매우 높은 유망한 스타트업입니다.")
      .join("\n") + "가".repeat(600);
  const result = checkGenerationGate("COMPANY_OVERVIEW", repeated);
  assert(!result.ok && result.reason === "REPETITIVE", `반복된 문장이 통과함: ${JSON.stringify(result)}`);
  console.log("✅ 동일 문장 3회 이상 반복 → FAIL (REPETITIVE)");
}

function testRefusalPatternsAreRejected() {
  const refusals = [
    "I'm sorry, but I cannot help with this request.",
    "I cannot provide financial advice on this matter.",
    "As an AI language model, I don't have access to real-time data.",
  ];
  for (const text of refusals) {
    const result = checkGenerationGate("RISK_ANALYSIS", text);
    assert(
      !result.ok && (result.reason === "BOILERPLATE_REFUSAL" || result.reason === "TOO_SHORT"),
      `AI 거절 문구가 통과함: "${text}"`
    );
  }
  console.log("✅ 일반적인 AI 거절/보일러플레이트 문구 → FAIL");
}

function testAppendixHasNoHardMinimumButStillRejectsGarbage() {
  // APPENDIX는 SECTION_META상 minChars=0 — 정상적인 짧은 내용은 통과해야 한다.
  const shortButValid = "참고 자료: TERM SHEET, 공통 Q&A 자료, IR 자료 원문.";
  const result = checkGenerationGate("APPENDIX", shortButValid);
  assert(result.ok, `짧지만 정상적인 별첨 내용이 거부됨: ${JSON.stringify(result)}`);

  // 하지만 명백한 거절/안전 문구는 APPENDIX여도 거부돼야 한다.
  const garbage = checkGenerationGate("APPENDIX", "User Safety: safe");
  assert(!garbage.ok, "APPENDIX여도 'User Safety: safe'는 거부돼야 함");
  console.log("✅ APPENDIX: 짧은 정상 내용은 통과, 명백한 비정상 출력은 여전히 거부");
}

function main() {
  console.log("\n=== DealMind 섹션 generation-time 품질 게이트 테스트 ===\n");
  testUserSafetySafeIsRejected();
  testEmptyStringIsRejected();
  testShortGenericResponseIsRejected();
  testGoodOpinionSummaryPasses();
  testOpinionSummaryWithoutRecommendationLabelIsRejected();
  testOpinionSummaryRequiresStricter500CharsThanOtherSections();
  testRepeatedLinesAreRejected();
  testRefusalPatternsAreRejected();
  testAppendixHasNoHardMinimumButStillRejectsGarbage();
  console.log("\n✅ 섹션 generation-time 품질 게이트 테스트 통과\n");
}

main();
