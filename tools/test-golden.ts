/**
 * 골든 IR 픽스처로 Gemini 한 섹션 생성 → 품질 점수 비교
 * Usage: npm run test:golden  (requires GEMINI_API_KEY in .env.local)
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { DealSector, AgentType, SectionKey } from "@prisma/client";
import { extractSharedFacts, formatSharedFactsForPrompt } from "../src/lib/shared-facts";
import { evaluateSection } from "../src/lib/report-quality";
import { generateText, isAIConfigured, MODEL } from "../src/lib/claude";
import { getSystemPrompt } from "../src/prompts/system-prompts";

const CASES = [
  {
    name: "BIO / 헬스케어AI",
    path: "docs/fixtures/bio-healthcareai-ir.md",
    companyName: "헬스케어AI Inc.",
    sector: DealSector.BIO,
    agentType: AgentType.BIO,
    sectionKey: SectionKey.INVESTMENT_OVERVIEW,
    investRound: "Series B",
    investAmount: 100,
    valuation: 800,
  },
  {
    name: "IT / DataFlow",
    path: "docs/fixtures/it-dataflow-ir.md",
    companyName: "DataFlow SaaS",
    sector: DealSector.IT,
    agentType: AgentType.IT,
    sectionKey: SectionKey.FINANCIAL_STATUS,
    investRound: "Series A",
    investAmount: 50,
    valuation: 300,
  },
  {
    name: "CLIMATE / GreenLoop",
    path: "docs/fixtures/climate-greenloop-ir.md",
    companyName: "GreenLoop",
    sector: DealSector.CLIMATE,
    agentType: AgentType.GENERAL,
    sectionKey: SectionKey.MARKET_ANALYSIS,
    investRound: "Series A",
    investAmount: 60,
    valuation: 280,
  },
  {
    name: "CONSUMER / BloomLab",
    path: "docs/fixtures/consumer-bloomlab-ir.md",
    companyName: "BloomLab",
    sector: DealSector.CONSUMER,
    agentType: AgentType.GENERAL,
    sectionKey: SectionKey.FINANCIAL_STATUS,
    investRound: "Series A",
    investAmount: 45,
    valuation: 200,
  },
];

async function runCase(c: (typeof CASES)[number]) {
  const text = readFileSync(resolve(process.cwd(), c.path), "utf8");
  const facts = extractSharedFacts({
    companyName: c.companyName,
    sector: c.sector,
    investRound: c.investRound,
    investAmount: c.investAmount,
    valuation: c.valuation,
    documents: [{ name: c.path, parsedText: text }],
  });

  const systemPrompt = getSystemPrompt(c.agentType, c.sector);
  const userPrompt = `${formatSharedFactsForPrompt(facts)}

## 제공 자료
${text.slice(0, 6000)}

## 작성 요청
위 자료를 바탕으로 **${c.sectionKey}** 섹션을 한국어 문어체로 작성하세요.
- 없는 숫자는 확인 필요
- 출처 표기
- 600~1200자
- 소제목(###) 사용`;

  console.log(`\n📡 ${c.name} → ${c.sectionKey} (${MODEL})`);
  const start = Date.now();
  const { content, inputTokens, outputTokens, usedModel } = await generateText(
    [{ role: "user", content: userPrompt }],
    { systemPrompt, maxTokens: 2048, temperature: 0.35 }
  );
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const quality = evaluateSection(c.sectionKey, content);

  console.log(`   model: ${usedModel} · ${elapsed}s · tokens ${inputTokens}/${outputTokens}`);
  console.log(`   quality: ${quality.score}/100`);
  if (quality.issues.length) console.log(`   issues: ${quality.issues.join("; ")}`);
  if (quality.warnings.length)
    console.log(`   warnings: ${quality.warnings.slice(0, 3).join("; ")}`);
  console.log("--- 출력 미리보기 ---");
  console.log(content.slice(0, 400) + (content.length > 400 ? "…" : ""));
  console.log("--------------------");

  return quality.score;
}

async function main() {
  console.log("\n=== Vcwoong 골든 샘플 Gemini 비교 ===\n");

  if (!isAIConfigured()) {
    console.log("❌ GEMINI_API_KEY (또는 OPENROUTER)가 없습니다.");
    console.log("   .env.local에 키를 넣고 다시 실행하세요.\n");
    process.exit(1);
  }

  const scores: number[] = [];
  for (const c of CASES) {
    scores.push(await runCase(c));
  }

  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  console.log(`\n✅ 평균 품질 점수: ${avg}/100\n`);
  if (avg < 60) {
    console.log("⚠️ 평균 점수가 낮습니다. 프롬프트를 더 다듬어 보세요.");
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
