/**
 * 골든 IR 픽스처에 대해 공유팩트 추출 + 품질 휴리스틱을 돌린다.
 * Usage: npm run test:fixtures
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { extractSharedFacts } from "../src/lib/shared-facts";
import { evaluateSection } from "../src/lib/report-quality";
import { GOLDEN_FIXTURES } from "../src/lib/fixtures";

const EXTRA_EXPECT: Record<
  string,
  {
    expectPhase?: string;
    expectArr?: boolean;
    expectMetric?: string;
  }
> = {
  bio: { expectPhase: "Phase II" },
  it: { expectArr: true },
  consumer: { expectMetric: "GMV" },
  fintech: { expectMetric: "TPV" },
  climate: { expectMetric: "감축량" },
};

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function main() {
  console.log("\n=== Vcwoong 픽스처 검증 ===\n");

  for (const f of GOLDEN_FIXTURES) {
    const text = readFileSync(resolve(process.cwd(), f.relativePath), "utf8");
    const facts = extractSharedFacts({
      companyName: f.companyName,
      sector: f.sector,
      investRound: f.investRound,
      investAmount: f.investAmount,
      valuation: f.valuation,
      documents: [{ name: f.relativePath, parsedText: text }],
    });

    console.log(`📄 ${f.relativePath}`);
    console.log(`   facts: ${facts.summaryLines.join(" | ")}`);

    const expect = EXTRA_EXPECT[f.id] ?? {};
    if (expect.expectPhase) {
      assert(
        facts.clinicalPhase === expect.expectPhase,
        `${f.relativePath}: clinicalPhase expected ${expect.expectPhase}, got ${facts.clinicalPhase}`
      );
    }
    if (expect.expectArr) {
      assert(Boolean(facts.metrics.ARR), `${f.relativePath}: ARR expected`);
      assert(Boolean(facts.metrics.NRR), `${f.relativePath}: NRR expected`);
    }
    if (expect.expectMetric) {
      assert(
        Boolean(facts.metrics[expect.expectMetric]),
        `${f.relativePath}: metric ${expect.expectMetric} expected, got ${Object.keys(facts.metrics).join(",")}`
      );
    }

    assert(text.length > 200, `${f.relativePath}: fixture too short`);

    // IR 텍스트를 "제품/기술" 섹션처럼 평가 (길이·구조 휴리스틱)
    const q = evaluateSection(
      "PRODUCT_TECHNOLOGY",
      text + "\n### 요약\n출처: IR 자료\n" + "가".repeat(200)
    );
    console.log(`   quality heuristic: ${q.score}/100`);
    console.log("");
  }

  console.log(`✅ 픽스처 검증 통과 (${GOLDEN_FIXTURES.length}개)\n`);
}

main();
