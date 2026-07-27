/**
 * 에이전트 라우팅 / 섹션 컨텍스트 회귀 테스트 (API 키 불필요)
 * Usage: npm run test:routing
 */
import { AgentType, DealSector, SectionKey } from "@prisma/client";
import { getAgent } from "../src/agents";
import { buildPriorSectionSummary } from "../src/lib/section-context";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function main() {
  console.log("\n=== Vcwoong 라우팅 테스트 ===\n");

  const cases: Array<{
    agentType: AgentType;
    sector: DealSector;
    expected: string;
  }> = [
    { agentType: AgentType.GENERAL, sector: DealSector.BIO, expected: "BioAgent" },
    { agentType: AgentType.BIO, sector: DealSector.BIO, expected: "BioAgent" },
    // 섹터와 저장된 에이전트가 어긋나면 섹터 전문가를 쓴다
    { agentType: AgentType.BIO, sector: DealSector.IT, expected: "ITAgent" },
    {
      agentType: AgentType.CONTENT,
      sector: DealSector.CONSUMER,
      expected: "ConsumerAgent",
    },
    {
      agentType: AgentType.GENERAL,
      sector: DealSector.CLIMATE,
      expected: "ClimateAgent",
    },
    {
      agentType: AgentType.GENERAL,
      sector: DealSector.GENERAL,
      expected: "GeneralAgent",
    },
    {
      agentType: AgentType.FINTECH,
      sector: DealSector.FINTECH,
      expected: "FintechAgent",
    },
  ];

  for (const c of cases) {
    const agent = getAgent(c.agentType, c.sector);
    const name = agent.constructor.name;
    assert(
      name === c.expected,
      `${c.agentType}+${c.sector} → ${c.expected} 기대, got ${name}`
    );
    console.log(`✅ ${c.agentType} + ${c.sector} → ${name}`);
  }

  const sections = [
    { sectionKey: SectionKey.INVESTMENT_OVERVIEW, title: "투자개요", content: "요약 100억" },
    { sectionKey: SectionKey.COMPANY_OVERVIEW, title: "회사개요", content: "설립 2019" },
    { sectionKey: SectionKey.FINANCIAL_STATUS, title: "재무현황", content: "매출 38억" },
    { sectionKey: SectionKey.RISK_ANALYSIS, title: "리스크", content: "임상 실패" },
    { sectionKey: SectionKey.OPINION_SUMMARY, title: "의견종합", content: "투자 권고" },
  ];

  // 앞선 섹션만 참조해야 한다 (의견종합이 딸려오면 안 됨)
  const priorForFinancial = buildPriorSectionSummary(
    sections,
    SectionKey.FINANCIAL_STATUS
  );
  assert(
    priorForFinancial.includes("투자개요") &&
      priorForFinancial.includes("회사개요"),
    "재무현황 앞 섹션 요약 누락"
  );
  assert(
    !priorForFinancial.includes("의견종합"),
    "재무현황 재생성에 의견종합이 포함되면 안 됨"
  );
  console.log("✅ prior 섹션 요약이 앞 섹션만 참조");

  // 첫 섹션은 앞선 섹션이 없으므로 뒤 섹션이라도 제공
  const priorForOverview = buildPriorSectionSummary(
    sections,
    SectionKey.INVESTMENT_OVERVIEW
  );
  assert(priorForOverview.length > 0, "첫 섹션에도 참고 요약 필요");
  console.log("✅ 첫 섹션 fallback 요약 제공");

  console.log("\n✅ 라우팅/컨텍스트 테스트 통과\n");
}

main();
