/**
 * 골든 IR 픽스처로 실제 에이전트 1섹션 생성 → 품질 점수 비교
 * Usage: npm run test:golden  (requires OPENROUTER_API_KEY in .env.local)
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { DealSector, AgentType, SectionKey } from "@prisma/client";
import {
  extractSharedFacts,
  formatSharedFactsForPrompt,
} from "../src/lib/shared-facts";
import { evaluateSection } from "../src/lib/report-quality";
import { isAIConfigured, MODEL } from "../src/lib/claude";
import { getAgent } from "../src/agents";
import { GOLDEN_FIXTURES } from "../src/lib/fixtures";

const SECTION_BY_SECTOR: Partial<Record<DealSector, SectionKey>> = {
  BIO: SectionKey.INVESTMENT_OVERVIEW,
  IT: SectionKey.FINANCIAL_STATUS,
  CLIMATE: SectionKey.MARKET_ANALYSIS,
  CONSUMER: SectionKey.FINANCIAL_STATUS,
  FINTECH: SectionKey.INVESTMENT_OVERVIEW,
  DEEPTECH: SectionKey.INVESTMENT_OVERVIEW,
  MANUFACTURING: SectionKey.PRODUCT_TECHNOLOGY,
  CONTENT: SectionKey.INVESTMENT_OVERVIEW,
};

const AGENT_BY_SECTOR: Partial<Record<DealSector, AgentType>> = {
  BIO: AgentType.BIO,
  IT: AgentType.IT,
  DEEPTECH: AgentType.DEEPTECH,
  MANUFACTURING: AgentType.MANUFACTURING,
  CONTENT: AgentType.CONTENT,
  FINTECH: AgentType.FINTECH,
  CLIMATE: AgentType.GENERAL,
  CONSUMER: AgentType.GENERAL,
};

async function runCase(f: (typeof GOLDEN_FIXTURES)[number]) {
  const text = readFileSync(resolve(process.cwd(), f.relativePath), "utf8");
  const agentType = AGENT_BY_SECTOR[f.sector] ?? AgentType.GENERAL;
  const sectionKey =
    SECTION_BY_SECTOR[f.sector] ?? SectionKey.INVESTMENT_OVERVIEW;

  const facts = extractSharedFacts({
    companyName: f.companyName,
    sector: f.sector,
    investRound: f.investRound,
    investAmount: f.investAmount,
    valuation: f.valuation,
    documents: [{ name: f.relativePath, parsedText: text }],
  });

  const agent = getAgent(agentType, f.sector);
  console.log(`\n📡 ${f.label} → ${sectionKey} via ${agent.constructor.name} (${MODEL})`);
  const start = Date.now();
  const result = await agent.generateSection(
    {
      dealId: "golden",
      companyName: f.companyName,
      sector: f.sector,
      agentType,
      investRound: f.investRound,
      investAmount: f.investAmount,
      valuation: f.valuation,
      documents: [{ name: f.relativePath, parsedText: text }],
      additionalContext: formatSharedFactsForPrompt(facts),
    },
    sectionKey
  );
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const quality = evaluateSection(sectionKey, result.content);

  console.log(
    `   model: ${result.modelUsed} · ${elapsed}s · tokens ${result.tokensUsed}`
  );
  console.log(`   quality: ${quality.score}/100`);
  if (quality.issues.length)
    console.log(`   issues: ${quality.issues.join("; ")}`);
  if (quality.warnings.length)
    console.log(`   warnings: ${quality.warnings.slice(0, 3).join("; ")}`);
  console.log("--- 출력 미리보기 ---");
  console.log(
    result.content.slice(0, 400) + (result.content.length > 400 ? "…" : "")
  );
  console.log("--------------------");

  return quality.score;
}

async function main() {
  console.log("\n=== DealMind 골든 샘플 (실제 에이전트) ===\n");

  if (!isAIConfigured()) {
    console.log("❌ OPENROUTER_API_KEY가 없습니다.");
    console.log("   .env.local에 키를 넣고 다시 실행하세요.\n");
    process.exit(1);
  }

  const scores: number[] = [];
  for (const f of GOLDEN_FIXTURES) {
    scores.push(await runCase(f));
  }

  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  console.log(`\n✅ 평균 품질 점수: ${avg}/100 (${scores.length}개 픽스처)\n`);
  if (avg < 60) {
    console.log("⚠️ 평균 점수가 낮습니다. 프롬프트를 더 다듬어 보세요.");
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
