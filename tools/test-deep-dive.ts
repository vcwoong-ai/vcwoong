/**
 * 보조 리서치(딥다이브 검증) 순수 로직 검증 (네트워크·AI 호출 없음).
 *
 * 핵심은 extractClaims의 문장 분리·매칭이 소수점(예: "18.5%")을 문장
 * 경계로 오인해 주장을 놓치지 않는지, 그리고 검색 API 키가 없을 때
 * runDeepDive/searchExternal이 예외 없이 항상 안전한 값을 내는지다.
 *
 * Usage: npm run test:deep-dive
 */
import {
  stripNaverMarkup,
  stripMarkdown,
  searchExternal,
  extractClaims,
  normalizeVerdict,
  runDeepDive,
} from "../src/lib/deep-dive";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testStripNaverMarkup() {
  const raw = "<b>테스트</b> &quot;회사&quot; A&amp;B &lt;tag&gt; it&#39;s";
  const out = stripNaverMarkup(raw);
  assert(out === '테스트 "회사" A&B <tag> it\'s', `HTML 마크업 제거 실패: ${out}`);
  console.log("✅ Naver 응답 마크업(태그·엔티티) 제거");
}

function testExtractClaimsWithDecimals() {
  const sections = [
    {
      sectionKey: "market",
      content:
        "국내 반도체 검사장비 시장 규모는 2025년 기준 3.2조 원으로 추정된다.\n" +
        "연평균 성장률(CAGR)은 18.5%로 예상되며, 이는 전방 산업 성장을 상회합니다.\n" +
        "당사는 업계 최초로 극자외선 노광 공정용 검사 솔루션을 상용화했다.\n" +
        "경쟁사 A는 매출이 하락세다.",
    },
  ];
  const claims = extractClaims(sections, 5);
  assert(claims.length === 3, `추출된 주장 개수가 3이 아님: ${claims.length}`);
  const growth = claims.find((c) => c.keyword === "성장률");
  assert(!!growth, "성장률(소수점 포함) 주장이 추출되지 않음");
  assert(
    growth!.text.includes("18.5%"),
    `소수점이 포함된 수치가 잘려나감: ${growth?.text}`
  );
  const marketSize = claims.find((c) => c.keyword === "시장 규모");
  assert(!!marketSize && marketSize.text.includes("3.2조"), "시장 규모(소수점) 주장이 추출되지 않음");
  assert(
    !marketSize!.text.includes("성장률"),
    `문장 경계를 넘어 다음 문장까지 포함됨: ${marketSize?.text}`
  );
  console.log("✅ 소수점 포함 주장(18.5%, 3.2조)도 문장 단위로 정확히 추출");
}

function testExtractClaimsDedupeAndCap() {
  const sections = [
    {
      sectionKey: "a",
      content: "시장 규모는 1조 원이다. 시장 규모는 1조 원이다.",
    },
    {
      sectionKey: "b",
      content:
        "성장률은 10%다. 성장률은 20%다. 성장률은 30%다. 업계 최초 기술이다. 국내 1위 기업이다.",
    },
  ];
  const claims = extractClaims(sections, 3);
  assert(claims.length === 3, `maxClaims 상한이 지켜지지 않음: ${claims.length}`);
  const marketClaims = claims.filter((c) => c.keyword === "시장 규모");
  assert(marketClaims.length === 1, "동일 문장 중복 제거 실패");
  console.log("✅ 중복 문장 제거 + maxClaims 상한 준수");
}

function testExtractClaimsIgnoresUnrelatedText() {
  const sections = [
    { sectionKey: "x", content: "이 회사는 좋은 팀을 보유하고 있습니다. 대표는 연쇄창업가입니다." },
  ];
  const claims = extractClaims(sections, 5);
  assert(claims.length === 0, `검증 대상이 아닌 문장에서 주장이 추출됨: ${JSON.stringify(claims)}`);
  console.log("✅ 검증 불가능한 일반 서술(팀·대표 소개 등)은 주장으로 뽑지 않음");
}

function testStripMarkdown() {
  assert(stripMarkdown("**굵게**") === "굵게", "굵게 표기가 안 벗겨짐");
  assert(stripMarkdown("### 제목") === "제목", "제목 표기가 안 벗겨짐");
  assert(stripMarkdown("`코드`") === "코드", "인라인 코드가 안 벗겨짐");
  assert(
    stripMarkdown("[링크](https://a.b)") === "링크",
    "링크 표기가 안 벗겨짐"
  );
  assert(
    stripMarkdown("- 불릿 항목") === "불릿 항목",
    "불릿 표기가 안 벗겨짐"
  );
  console.log("✅ 마크다운 표기 제거 (화면에 ** 가 새어나오지 않음)");
}

/**
 * 프로덕션 회귀: "…데이터가 모두 '확인 필요' 입니다"가 검증 대상으로 뽑혔다.
 * 자료가 없다는 메모지 사실 주장이 아니라 외부 검증 대상이 아니다.
 */
function testSkipsUnverifiableSentences() {
  const sections = [
    {
      sectionKey: "valuation",
      content:
        'Rule of 40(성장률 + EBITDA 마진 ≥ 40%) 및 NRR(Net Revenue Retention)을 판단하기 위한 **매출 성장률, EBITDA 마진, NRR/Churn 데이터가 모두 "확인 필요"** 입니다.',
    },
  ];
  const claims = extractClaims(sections, 5);
  assert(
    claims.length === 0,
    `'확인 필요' 문장이 주장으로 뽑힘: ${JSON.stringify(claims)}`
  );
  console.log("✅ '확인 필요/자료 없음' 류 문장은 검증 대상에서 제외");
}

/**
 * 과잉 필터 회귀: "확인 필요"를 통째로 버렸더니 "(출처 확인 필요)"가 달린
 * 진짜 주장까지 사라져 검증 0건이 됐다. 출처가 없는 수치야말로 외부 검증이
 * 가장 필요한 대상이라 반드시 살아남아야 한다.
 */
function testKeepsClaimWithSourceCaveat() {
  const sections = [
    {
      sectionKey: "market",
      content:
        "국내 시장 규모는 3.2조 원으로 추정된다(출처 확인 필요).\n" +
        "글로벌 항암제 시장은 연 10% 내외 성장이 지속되고 있다.",
    },
  ];
  const claims = extractClaims(sections, 5);
  assert(
    claims.length === 2,
    `괄호 주석·'성장' 표현 주장이 안 뽑힘 (${claims.length}건): ${JSON.stringify(claims)}`
  );
  console.log("✅ '(출처 확인 필요)' 꼬리표가 달려도 주장 자체는 유지");
  console.log("✅ '연 10% 내외 성장'처럼 '성장률' 단어가 없어도 추출");
}

function testDollarMarketSize() {
  const claims = extractClaims(
    [{ sectionKey: "market", content: "글로벌 시장 규모는 150억 달러 수준이다." }],
    5
  );
  assert(claims.length === 1, `달러 표기 시장 규모가 안 뽑힘: ${JSON.stringify(claims)}`);
  console.log("✅ 달러 표기 시장 규모도 추출 (원화만 보던 문제 해소)");
}

function testStillExtractsRealClaimsFromMarkdown() {
  // 마크다운이 섞여 있어도 진짜 주장은 여전히 뽑혀야 한다 (과하게 걸러내면 안 됨)
  const sections = [
    {
      sectionKey: "market",
      content:
        "### 1. 시장 규모\n- **국내 시장 규모는 3.2조 원**으로 추정된다.\n- 연평균 성장률(CAGR)은 18.5%다.",
    },
  ];
  const claims = extractClaims(sections, 5);
  assert(claims.length === 2, `주장 2건이 안 뽑힘: ${claims.length}`);
  for (const c of claims) {
    assert(!c.text.includes("*"), `마크다운이 남아 있음: ${c.text}`);
    assert(!c.text.includes("#"), `제목 표기가 남아 있음: ${c.text}`);
  }
  console.log("✅ 마크다운 섞인 본문에서도 실제 주장은 정상 추출 (과잉 필터 아님)");
}

function testNormalizeVerdict() {
  assert(normalizeVerdict("지지") === "지지", "유효한 verdict가 통과 안됨");
  assert(normalizeVerdict("불일치") === "불일치", "유효한 verdict가 통과 안됨");
  assert(normalizeVerdict("모름") === "불명확", "알 수 없는 값이 불명확으로 폴백 안됨");
  assert(normalizeVerdict(undefined) === "불명확", "undefined가 불명확으로 폴백 안됨");
  assert(normalizeVerdict(123) === "불명확", "숫자 값이 불명확으로 폴백 안됨");
  console.log("✅ verdict 정규화: 알 수 없는 값은 항상 불명확으로 폴백");
}

async function testSearchExternalNoApiKey() {
  assert(
    !process.env.NAVER_CLIENT_ID && !process.env.NAVER_CLIENT_SECRET,
    "테스트 환경에 NAVER 키가 설정돼 있음 — 순수 폴백 테스트 불가"
  );
  const results = await searchExternal("아무 회사 시장 규모");
  assert(Array.isArray(results) && results.length === 0, "API 키 없는데 검색 결과가 반환됨");
  console.log("✅ 검색 API 키 없을 때: 예외 없이 항상 빈 결과 (네트워크 호출 없음)");
}

async function testRunDeepDiveNoClaimsFound() {
  const outcome = await runDeepDive({
    companyName: "테스트회사",
    sections: [{ sectionKey: "x", content: "이 회사는 좋은 팀을 보유하고 있습니다." }],
  });
  assert(outcome.claims.length === 0, "검증 대상 주장이 없는데 claims가 채워짐");
  assert(outcome.modelUsed === "n/a", `주장 없을 때 modelUsed가 n/a가 아님: ${outcome.modelUsed}`);
  console.log("✅ 검증 대상 주장이 없으면 AI·검색 호출 없이 빈 결과");
}

async function testRunDeepDiveDemoModeWhenAiUnconfigured() {
  assert(!process.env.OPENROUTER_API_KEY, "테스트 환경에 OPENROUTER_API_KEY가 설정돼 있음 — 데모 모드 테스트 불가");
  const outcome = await runDeepDive({
    companyName: "테스트회사",
    sections: [
      { sectionKey: "market", content: "시장 규모는 5조 원이다. 성장률은 12.3%다." },
    ],
  });
  assert(outcome.modelUsed === "demo-mock", `AI 미설정인데 modelUsed가 demo-mock이 아님: ${outcome.modelUsed}`);
  assert(outcome.claims.length > 0, "데모 모드인데 claims가 비어있음");
  for (const c of outcome.claims) {
    assert(c.verdict === "불명확", `데모 모드 verdict가 불명확이 아님: ${c.verdict}`);
    assert(c.sources.length === 0, "데모 모드인데 출처가 채워짐");
  }
  console.log("✅ AI 미설정 시 데모 모드: 모든 주장이 '불명확' + 출처 없음");
}

async function main() {
  console.log("\n=== DealMind 보조 리서치(딥다이브 검증) 테스트 ===\n");
  testStripNaverMarkup();
  testStripMarkdown();
  testSkipsUnverifiableSentences();
  testKeepsClaimWithSourceCaveat();
  testDollarMarketSize();
  testStillExtractsRealClaimsFromMarkdown();
  testExtractClaimsWithDecimals();
  testExtractClaimsDedupeAndCap();
  testExtractClaimsIgnoresUnrelatedText();
  testNormalizeVerdict();
  await testSearchExternalNoApiKey();
  await testRunDeepDiveNoClaimsFound();
  await testRunDeepDiveDemoModeWhenAiUnconfigured();
  console.log("\n✅ 보조 리서치 테스트 통과\n");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
