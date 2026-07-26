/**
 * 골든 IR 픽스처에 대해 공유팩트 추출 + 품질 휴리스틱을 돌린다.
 * Usage: npm run test:fixtures
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { extractSharedFacts } from "../src/lib/shared-facts";
import { evaluateSection } from "../src/lib/report-quality";

const FIXTURES = [
  {
    path: "docs/fixtures/bio-healthcareai-ir.md",
    companyName: "헬스케어AI Inc.",
    sector: "BIO",
    investRound: "Series B",
    investAmount: 100,
    valuation: 800,
    expectPhase: "Phase II",
  },
  {
    path: "docs/fixtures/it-dataflow-ir.md",
    companyName: "DataFlow SaaS",
    sector: "IT",
    investRound: "Series A",
    investAmount: 50,
    valuation: 300,
    expectArr: true,
  },
];

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function main() {
  console.log("\n=== Vcwoong 픽스처 검증 ===\n");

  for (const f of FIXTURES) {
    const text = readFileSync(resolve(process.cwd(), f.path), "utf8");
    const facts = extractSharedFacts({
      companyName: f.companyName,
      sector: f.sector,
      investRound: f.investRound,
      investAmount: f.investAmount,
      valuation: f.valuation,
      documents: [{ name: f.path, parsedText: text }],
    });

    console.log(`📄 ${f.path}`);
    console.log(`   facts: ${facts.summaryLines.join(" | ")}`);

    if ("expectPhase" in f && f.expectPhase) {
      assert(
        facts.clinicalPhase === f.expectPhase,
        `${f.path}: clinicalPhase expected ${f.expectPhase}, got ${facts.clinicalPhase}`
      );
    }
    if ("expectArr" in f && f.expectArr) {
      assert(Boolean(facts.metrics.ARR), `${f.path}: ARR expected`);
      assert(Boolean(facts.metrics.NRR), `${f.path}: NRR expected`);
    }

    // IR 텍스트를 "제품/기술" 섹션처럼 평가 (길이·구조 휴리스틱)
    const q = evaluateSection("PRODUCT_TECHNOLOGY", text + "\n### 요약\n출처: IR 자료\n" + "가".repeat(200));
    console.log(`   quality heuristic: ${q.score}/100`);
    console.log("");
  }

  console.log("✅ 픽스처 검증 통과\n");
}

main();
