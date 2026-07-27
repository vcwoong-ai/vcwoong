/**
 * 오프라인 품질 평가 단위 테스트 (API 키 불필요)
 * Usage: npm run test:quality
 */
import {
  evaluateSection,
  evaluateReport,
  checkFactConsistency,
} from "../src/lib/report-quality";
import { extractSharedFacts } from "../src/lib/shared-facts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function main() {
  console.log("\n=== Axiom 품질 모듈 테스트 ===\n");

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

  const termsFacts = extractSharedFacts({
    companyName: "텀시트Co",
    sector: "IT",
    documents: [
      {
        name: "ts.md",
        parsedText: "투자 수단 RCPS, 지분율 12.5%, 청산우선 1x Non-participating",
      },
    ],
  });
  assert(Boolean(termsFacts.terms.투자수단), "투자수단 추출");
  assert(Boolean(termsFacts.terms.지분율), "지분율 추출");

  // 회귀: 비밀유지계약(NDA)을 임상단계로 오인하면 안 된다
  const ndaFacts = extractSharedFacts({
    companyName: "SaaSCo",
    sector: "IT",
    documents: [
      { name: "ir.md", parsedText: "파트너사와 NDA 체결 후 PoC 진행 중." },
    ],
  });
  assert(
    ndaFacts.clinicalPhase === undefined,
    `비밀유지 NDA는 임상단계가 아니어야 함, got ${ndaFacts.clinicalPhase}`
  );

  // 회귀: FY24 같은 회계연도 토큰을 금액으로 잡으면 안 된다
  const fyFacts = extractSharedFacts({
    companyName: "FYCo",
    sector: "IT",
    documents: [
      {
        name: "ir.md",
        parsedText:
          "MRR 추이 FY24 38억원. EBITDA FY24 14% margin. CAPA 프로세스 개선 완료. 생산 CAPA 200만 개",
      },
    ],
  });
  for (const [k, v] of Object.entries(fyFacts.metrics)) {
    assert(
      !/^(19|20)\d{2}$/.test(v.replace(/[^\d]/g, "")),
      `${k}가 연도(${v})를 값으로 잡음`
    );
  }
  assert(
    !fyFacts.metrics.CAPA || /\d/.test(fyFacts.metrics.CAPA),
    `CAPA 값에 숫자가 있어야 함, got ${fyFacts.metrics.CAPA}`
  );

  // 회귀: 지표 값에 키 접두어가 중복되면 안 된다
  assert(
    !Object.entries(facts.metrics).some(([k, v]) => v.startsWith(`${k}:`)),
    "지표 값에 키 접두어 중복"
  );

  const consistent = checkFactConsistency(
    "Series B 100억원 Post 800. Phase II. ARR 50억 NRR 110%. " +
      "가".repeat(100),
    {
      investAmount: 100,
      valuation: 800,
      clinicalPhase: "Phase II",
      metrics: facts.metrics,
    }
  );
  assert(consistent.matched >= 3, `팩트 일치 기대 >=3, got ${consistent.matched}`);

  const inconsistent = checkFactConsistency("내용만 있고 수치 없음 " + "가".repeat(50), {
    investAmount: 100,
    valuation: 800,
  });
  assert(inconsistent.missing.length >= 2, "누락 팩트 감지 필요");

  console.log("✅ evaluateSection(short):", short.score);
  console.log("✅ evaluateSection(good):", good.score);
  console.log("✅ evaluateSection(hallu) issues:", hallu.issues.join(", "));
  console.log("✅ evaluateReport overall:", report.overallScore);
  console.log("✅ sharedFacts:", facts.summaryLines.join(" | "));
  console.log(
    `✅ factConsistency: ${consistent.matched}/${consistent.checked}`
  );
  console.log("\n✅ 모든 품질 모듈 테스트 통과\n");
}

main();
