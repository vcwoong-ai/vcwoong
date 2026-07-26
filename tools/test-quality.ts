/**
 * 오프라인 품질 평가 단위 테스트 (API 키 불필요)
 * Usage: npm run test:quality
 */
import { evaluateSection, evaluateReport } from "../src/lib/report-quality";
import { extractSharedFacts } from "../src/lib/shared-facts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function main() {
  console.log("\n=== Vcwoong 품질 모듈 테스트 ===\n");

  const short = evaluateSection("INVESTMENT_OVERVIEW", "짧음");
  assert(short.score < 60, "짧은 본문은 낮은 점수여야 함");
  assert(short.issues.length > 0, "짧은 본문 이슈 필요");

  const goodBody =
    `### 핵심 SaaS 지표\nARR 120억원 (출처: IR 자료), NRR 115%.\n\n` +
    `| 구분 | FY23 | FY24 |\n|------|------|------|\n| 매출 | 80 | 120 |\n\n` +
    `### Unit Economics\nLTV/CAC 4.2배. 런웨이 18개월 (출처: IR 자료).\n` +
    "가".repeat(400);
  const good = evaluateSection("FINANCIAL_STATUS", goodBody);
  assert(good.score >= 70, `좋은 섹션 점수 기대 (>=70), got ${good.score}`);
  assert(good.stats.tables > 0, "테이블 감지");
  assert(good.stats.citations > 0, "인용 감지");

  const hallu = evaluateSection(
    "OPINION_SUMMARY",
    "이 투자는 무조건 성공하며 리스크 없음. 100% 확신합니다. " +
      "가".repeat(300)
  );
  assert(
    hallu.issues.some((i) => i.includes("환각")),
    "과도한 확신 이슈 필요"
  );

  const report = evaluateReport([
    {
      sectionKey: "INVESTMENT_OVERVIEW",
      content: "가".repeat(500) + "\n### 제목\n출처: IR 자료",
    },
    {
      sectionKey: "FINANCIAL_STATUS",
      content: goodBody,
    },
  ]);
  assert(report.overallScore > 0, "리포트 점수 필요");

  const facts = extractSharedFacts({
    companyName: "헬스케어AI",
    sector: "BIO",
    investRound: "Series B",
    investAmount: 100,
    valuation: 800,
    documents: [
      {
        name: "IR.pdf",
        parsedText:
          "Phase II 임상 진행 중. ARR: 50억. NRR: 110%. 적응증: 폐암",
      },
    ],
  });
  assert(
    facts.clinicalPhase === "Phase II",
    `임상단계 기대 Phase II, got ${facts.clinicalPhase}`
  );
  assert(Boolean(facts.metrics.ARR), "ARR 추출");
  assert(
    facts.summaryLines.some((l) => l.includes("Series B")),
    "라운드 포함"
  );

  console.log("✅ evaluateSection(short):", short.score);
  console.log("✅ evaluateSection(good):", good.score);
  console.log("✅ evaluateSection(hallu) issues:", hallu.issues.join(", "));
  console.log("✅ evaluateReport overall:", report.overallScore);
  console.log("✅ sharedFacts:", facts.summaryLines.join(" | "));
  console.log("\n✅ 모든 품질 모듈 테스트 통과\n");
}

main();
