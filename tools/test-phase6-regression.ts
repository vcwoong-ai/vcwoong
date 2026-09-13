/**
 * Phase 6 — Investment Quality Layer(Phase 1~4) 회귀 테스트.
 *
 * Phase 1~4에서 추가한 항목은 이미 각자의 테스트 파일이 있다
 * (test-investment-quality-layer.ts: 프롬프트 문구, test-deal-scoring.ts /
 * test-ic-review.ts: Score/Evidence/decisionImpact, test-pptx-template.ts:
 * PR #70 출력 회귀, test-evidence.ts: 근거 추적 기본 동작). 이 파일은
 * 그것들을 중복 구현하지 않고, 실제 생성 경로 기준으로 남아있던 두 가지
 * 진짜 공백만 채운다:
 *
 *   1. Fake Precision이 실제로 report에 등장했을 때 evidence.ts(실제 호출
 *      경로)가 이를 UNSUPPORTED로 잡아내는지 — 프롬프트가 "하지 말라"고
 *      지시하는 것과, 그래도 발생했을 때 잡아내는 것은 다른 계층이다.
 *   2. 6개 실제 섹터 에이전트(BIO/IT/DEEPTECH/MANUFACTURING/CONTENT/
 *      FINTECH) + CLIMATE/CONSUMER 전부에서 실제 생성 경로
 *      (inferAgentType → getSystemPrompt → buildSectionPrompt)가 golden
 *      fixture 문서와 함께 깨지지 않고, Phase 1~3이 추가한 지침(근거
 *      등급·KPI 체크리스트·Investment Thesis 등)이 실제로 포함되는지.
 *
 * 실제 호출 경로 기준(report-generation.ts → base-agent.ts →
 * getSystemPrompt → buildSectionPrompt → generateText → quality/scoring/
 * IC review → PPT/PDF)이며, src/agents/sectors/* 미사용 legacy analyzer는
 * 대상에서 제외한다(README 및 PR #71 조사에서 이미 확인).
 *
 * Usage: npm run test:phase6-regression
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { AgentType, DealSector, SectionKey } from "@prisma/client";
import { GOLDEN_FIXTURES } from "../src/lib/fixtures";
import { inferAgentType } from "../src/agents/agent-meta";
import { getSystemPrompt } from "../src/prompts/system-prompts";
import { buildSectionPrompt } from "../src/prompts/section-prompts";
import { traceReportEvidence } from "../src/lib/evidence";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// ── 1. Numeric Integrity: Explicit / Unsupported / Fake Precision ─────────

const DEAL_FACTS = { investAmount: 50, valuation: 300 };

/** A. Explicit — 자료에 그대로 있는 숫자는 document 근거로 확인된다 */
function testExplicitNumberIsDocumentEvidence() {
  const documents = [{ name: "ir.md", parsedText: "회사는 작년 매출 100억원을 기록했다." }];
  const sections = [{ sectionKey: "FINANCIAL_STATUS", content: "매출 100억원(출처: IR 자료)." }];
  const report = traceReportEvidence(sections, documents, DEAL_FACTS);
  const claim = report.claims.find((c) => c.raw.includes("100억원"));
  assert(Boolean(claim), "명시적 숫자 claim이 추출되지 않음");
  assert(claim!.status === "document", `자료에 그대로 있는 숫자인데 document 근거가 아님: ${claim!.status}`);
  assert(claim!.confidence === "HIGH", `명시적 숫자인데 confidence가 HIGH가 아님: ${claim!.confidence}`);
  console.log("✅ A. Explicit — 자료에 명시된 숫자 → document 근거 + HIGH confidence");
}

/** D/E. Unknown/Unsupported — 자료에 없는 구체적인 숫자를 생성하면 UNSUPPORTED로 잡힌다 */
function testHallucinatedNumberIsUnsupported() {
  const documents = [{ name: "ir.md", parsedText: "회사는 SaaS 제품을 판매한다." }];
  const sections = [{ sectionKey: "FINANCIAL_STATUS", content: "매출은 147억원으로 추정된다." }];
  const report = traceReportEvidence(sections, documents, DEAL_FACTS);
  const claim = report.claims.find((c) => c.raw.includes("147"));
  assert(Boolean(claim), "환각 숫자 claim이 추출되지 않음");
  assert(claim!.status === "unverified", `자료에 없는 숫자인데 unverified가 아님: ${claim!.status}`);
  assert(claim!.confidence === "UNSUPPORTED", `자료에 없는 숫자인데 UNSUPPORTED가 아님: ${claim!.confidence}`);
  console.log("✅ D/E. Unknown/Unsupported — 자료에 없는 숫자 생성 → UNSUPPORTED로 확인됨(regression 방지)");
}

/**
 * F. Fake Precision — 자료 근거 없는 소수점 정밀도($6,814.08 등)가 report에
 * 등장해도 evidence.ts가 그대로 UNSUPPORTED로 잡아낸다(정밀도가 높다고
 * 봐주지 않는다). 단, 회사 자료가 실제로 그 정밀도를 제공하면 허용한다.
 */
function testFakePrecisionIsCaughtButRealPrecisionIsAllowed() {
  const documents = [{ name: "ir.md", parsedText: "GPU 인프라를 사용하며 월 비용은 공개하지 않는다." }];
  const sections = [
    {
      sectionKey: "PRODUCT_TECHNOLOGY",
      content: "GPU 인프라 비용은 월 $6,814.08이며, 인퍼런스 마진은 18.73%로 추정된다.",
    },
  ];
  const report = traceReportEvidence(sections, documents, DEAL_FACTS);
  const costClaim = report.claims.find((c) => c.raw.includes("6,814.08"));
  const marginClaim = report.claims.find((c) => c.raw.includes("18.73"));
  assert(Boolean(costClaim) && costClaim!.confidence === "UNSUPPORTED", "가짜 정밀도($6,814.08)가 UNSUPPORTED로 안 잡힘");
  assert(Boolean(marginClaim) && marginClaim!.confidence === "UNSUPPORTED", "가짜 정밀도(18.73%)가 UNSUPPORTED로 안 잡힘");

  // 대조군: 회사 자료에 실제로 그 정밀도가 있으면 document 근거로 인정돼야 한다
  const realDocuments = [{ name: "ir.md", parsedText: "2024년 실측 인퍼런스 마진은 18.73%였다." }];
  const realSections = [{ sectionKey: "PRODUCT_TECHNOLOGY", content: "인퍼런스 마진은 18.73%다(출처: IR 자료)." }];
  const realReport = traceReportEvidence(realSections, realDocuments, DEAL_FACTS);
  const realMarginClaim = realReport.claims.find((c) => c.raw.includes("18.73"));
  assert(
    Boolean(realMarginClaim) && realMarginClaim!.status === "document",
    "회사 자료에 실제로 있는 정밀 수치인데 document 근거로 인정 안 됨"
  );
  console.log("✅ F. Fake Precision — 근거 없는 소수점 정밀도는 UNSUPPORTED, 자료에 실재하면 정상 허용");
}

// ── 2. Sector Regression: 실제 생성 경로(inferAgentType → 프롬프트) ────────

/** 각 섹터의 시스템 프롬프트에 반드시 포함돼야 하는 표식(에이전트 이름 또는 섹터 특화 문구) */
const SECTOR_PROMPT_MARKER: Partial<Record<DealSector, string>> = {
  [DealSector.BIO]: "Dr. Cell",
  [DealSector.IT]: "SaaS 지표",
  [DealSector.DEEPTECH]: "Neuron",
  [DealSector.MANUFACTURING]: "Maker",
  [DealSector.CONTENT]: "Story",
  [DealSector.FINTECH]: "Vault",
  [DealSector.CLIMATE]: "탄소 시장",
  [DealSector.CONSUMER]: "D2C",
};

function testSectorPromptLoadingForAllGoldenFixtures() {
  for (const fixture of GOLDEN_FIXTURES) {
    const agentType = inferAgentType(fixture.sector);
    const systemPrompt = getSystemPrompt(agentType, fixture.sector);

    const marker = SECTOR_PROMPT_MARKER[fixture.sector];
    if (marker) {
      assert(
        systemPrompt.includes(marker),
        `${fixture.id}(${fixture.sector}): 섹터 특화 프롬프트 표식("${marker}") 누락 — agentType=${agentType}`
      );
    }
    // Phase 1 공통 원칙이 모든 섹터에 반드시 실려 있어야 한다
    assert(
      systemPrompt.includes("명시(explicit)") && systemPrompt.includes("불명(unknown)"),
      `${fixture.id}: Phase 1 근거 등급 원칙이 빠짐`
    );
    assert(
      systemPrompt.includes("섹터 전문 분석 항목 적용 원칙"),
      `${fixture.id}: "억지로 채우지 말라" suffix가 빠짐`
    );
  }
  console.log(`✅ 섹터 프롬프트 로딩 — golden fixture ${GOLDEN_FIXTURES.length}개 전부 정상(실제 inferAgentType 경로)`);
}

/**
 * 실제 fixture 문서를 문맥으로 넣어 OPINION_SUMMARY/MARKET_ANALYSIS 섹션
 * 프롬프트를 만들어본다 — Phase 2/3가 추가한 Investment Thesis/Bull-Base-
 * Bear/Why Not Invest/TAM-SAM-SOM 지침이 실제 문서 컨텍스트와 함께
 * 조립돼도 깨지지 않는지 확인한다(문자열 조립 단계 회귀 방지).
 */
function testSectionPromptAssemblyWithRealFixtureDocuments() {
  for (const fixture of GOLDEN_FIXTURES) {
    const text = readFileSync(resolve(process.cwd(), fixture.relativePath), "utf8");
    const context = {
      companyName: fixture.companyName,
      sector: fixture.sector,
      investRound: fixture.investRound,
      investAmount: fixture.investAmount,
      valuation: fixture.valuation,
      documentContext: text,
    };

    const opinionPrompt = buildSectionPrompt(SectionKey.OPINION_SUMMARY, context);
    assert(opinionPrompt.includes(fixture.companyName), `${fixture.id}: 의견종합 프롬프트에 기업명 누락`);
    assert(opinionPrompt.includes("Thesis 1 — Market"), `${fixture.id}: 의견종합 프롬프트에 Investment Thesis 누락`);
    assert(opinionPrompt.includes("Why Not Invest"), `${fixture.id}: 의견종합 프롬프트에 Why Not Invest 누락`);
    assert(opinionPrompt.includes(text.slice(0, 50)), `${fixture.id}: 실제 fixture 문서 내용이 컨텍스트에 반영되지 않음`);

    const marketPrompt = buildSectionPrompt(SectionKey.MARKET_ANALYSIS, context);
    assert(marketPrompt.includes("TAM→SAM→SOM"), `${fixture.id}: 시장분석 프롬프트에 TAM/SAM/SOM 순서 지침 누락`);
  }
  console.log(`✅ 섹션 프롬프트 조립 — golden fixture ${GOLDEN_FIXTURES.length}개 문서 컨텍스트와 함께 정상 조립됨`);
}

function main() {
  console.log("\n=== DealMind Phase 6 — Investment Quality Layer 회귀 테스트 ===\n");
  testExplicitNumberIsDocumentEvidence();
  testHallucinatedNumberIsUnsupported();
  testFakePrecisionIsCaughtButRealPrecisionIsAllowed();
  testSectorPromptLoadingForAllGoldenFixtures();
  testSectionPromptAssemblyWithRealFixtureDocuments();
  console.log(
    "\n다음 항목은 이미 별도 테스트 파일에서 커버되어 여기서 중복 구현하지 않음:\n" +
      "  - Investment Thesis/Bull-Base-Bear/Why Not Invest/IC Questions 문구: test-investment-quality-layer.ts\n" +
      "  - Score/Evidence/confidence/decisionImpact/uncertaintyNote: test-deal-scoring.ts, test-ic-review.ts\n" +
      "  - PPTX shape 선택/오버플로/markdown 표 노출(PR #70): test-pptx-template.ts, test-pptx-export.ts\n" +
      "  - 생성 시점 품질 게이트(빈 응답/거절문구/OPINION_SUMMARY 라벨): test-section-generation-gate.ts\n" +
      "  - 근거 추적 기본 동작(문서 매칭/딜 입력/질적 claim 등): test-evidence.ts\n"
  );
  console.log("✅ Phase 6 회귀 테스트 통과\n");
}

main();
