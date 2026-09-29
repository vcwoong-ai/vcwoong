/**
 * pe-ic-memo.ts(PR #108, PR #109에서 IC Review Status 섹션 추가) 검증 —
 * buildPEICMemoMarkdown()이 buildPEICDecision() + (선택) PEICReviewWorkspace를
 * 입력받아 16개 섹션을 만드는지, 정보가 없는 섹션은 "자료 없음"/"현재
 * 데이터로 확인 불가"를 명시하는지, Valuation/Returns 섹션이 절대 MOIC/IRR
 * 숫자를 계산해서 보여주지 않는지 확인한다. reviewWorkspace는 하위 호환을
 * 위해 선택 인자다 — 이 파일의 기존 테스트는 넘기지 않고도 계속 통과해야
 * 한다("자료 없음"으로 정직하게 표시).
 *
 * Usage: npm run test:pe-ic-memo
 */
import { buildPEICMemoMarkdown } from "../src/lib/pe/pe-ic-memo";
import { buildPEICDecision, type PEICDecisionInput } from "../src/lib/pe/pe-ic-decision";
import { buildPEICReviewWorkspace } from "../src/lib/pe/pe-ic-review";
import { buildPEDDCase } from "../src/lib/pe/dd-lineage";
import { createPEDDFinding } from "../src/lib/pe/dd-validation";
import { buildPEEvidenceLineage } from "../src/lib/pe/evidence-lineage";
import { buildPEDecisionReadiness } from "../src/lib/pe/pe-decision-readiness";
import type { FinancialCalcResult } from "../src/lib/pe/financial-types";
import type { PEEvidenceRequestView } from "../src/lib/pe/pe-ic-review-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const missingInput: FinancialCalcResult = { status: "missing_input", missing: ["EBITDA"] };
function ok(value: number): FinancialCalcResult {
  return { status: "ok", value };
}

function baseInput(overrides: Partial<PEICDecisionInput> & { readiness: PEICDecisionInput["readiness"] }): PEICDecisionInput {
  return {
    dealId: "deal-1",
    financialQuality: { latestPeriodLabel: null, revenue: missingInput, revenueGrowth: { status: "not_available" }, ebitda: missingInput, ebitdaMargin: { status: "not_available" }, netDebt: missingInput, netDebtToEbitda: { status: "not_available" } },
    qoeSummary: null,
    lboEntryEbitda: { status: "no_period" },
    dartStatus: { imported: false, periodsCount: 0, latestFiscalYear: null },
    ...overrides,
  };
}

const MADEAL = { companyName: "테스트회사", name: "테스트딜", dealTypeLabel: "바이아웃", statusLabel: "진행 중" };

const REQUIRED_HEADINGS = [
  "## 1. Executive Summary",
  "## 2. Deal Snapshot",
  "## 3. Investment Thesis",
  "## 4. Key Investment Drivers",
  "## 5. Thesis Breakers / Key Risks",
  "## 6. Financial Performance",
  "## 7. QoE",
  "## 8. Commercial / Operational DD",
  "## 9. Legal / Tax / HR / Technology / Regulatory DD",
  "## 10. LBO / Transaction Structure",
  "## 11. Valuation / Returns",
  "## 12. Missing Information",
  "## 13. IC Questions",
  "## 14. IC Review Status",
  "## 15. Decision Readiness",
  "## 16. Appendix / Evidence",
];

function test1_allFifteenSectionsPresentEvenWhenEmpty() {
  const readiness = buildPEDecisionReadiness({ periods: [] });
  const decision = buildPEICDecision(baseInput({ readiness }));
  const markdown = buildPEICMemoMarkdown(decision, MADEAL);
  for (const heading of REQUIRED_HEADINGS) {
    assert(markdown.includes(heading), `빈 딜이어도 섹션 헤더가 있어야 함: ${heading}`);
  }
  assert((markdown.match(/자료 없음/g) ?? []).length >= 5, "정보 없는 섹션은 억지로 채우지 않고 '자료 없음'을 명시해야 함");
  console.log("✅ Test 1 — 빈 딜이어도 15개 섹션 헤더 모두 존재, 빈 섹션은 '자료 없음' 명시");
}

function test2_valuationSectionNeverFabricatesMoicIrr() {
  const readiness = buildPEDecisionReadiness({ periods: [] });
  const decision = buildPEICDecision(baseInput({ readiness, lboEntryEbitda: { status: "ok", lbo: { entryEbitdaInEok: 50 }, provenance: { fiscalPeriod: "FY2024", baseEbitdaKrw: 5_000_000_000, approvedAdjustmentTotalKrw: 0 } } as PEICDecisionInput["lboEntryEbitda"] }));
  const markdown = buildPEICMemoMarkdown(decision, MADEAL);
  const section11 = markdown.split("## 11. Valuation / Returns")[1].split("## 12.")[0];
  assert(section11.includes("현재 데이터로 확인 불가"), "Valuation/Returns 섹션은 항상 '현재 데이터로 확인 불가'여야 함(계산 금지)");
  assert(!/\d+\.\d+x/.test(section11) && !/\d+(\.\d+)?%/.test(section11), "Valuation/Returns 섹션에 MOIC(x)/IRR(%) 형식의 숫자가 절대 나오면 안 됨");
  console.log("✅ Test 2 — Valuation/Returns 섹션은 Entry EBITDA가 있어도 MOIC/IRR을 계산하지 않음");
}

function test3_ddFindingsAppearInCorrectSection() {
  const lineage = buildPEEvidenceLineage({});
  const ddCase = buildPEDDCase(lineage, [
    createPEDDFinding({ id: "f-commercial", category: "COMMERCIAL", title: "고객 집중도", description: "상위 3개 고객 62%", severity: "HIGH", status: "CONFIRMED" }),
    createPEDDFinding({ id: "f-legal", category: "LEGAL", title: "라이선스 조항", description: "change of control 리스크", severity: "CRITICAL", status: "DRAFT" }),
  ]);
  const readiness = buildPEDecisionReadiness({ periods: [], ddCase, evidenceLineage: lineage });
  const decision = buildPEICDecision(baseInput({ readiness, ddCase }));
  const markdown = buildPEICMemoMarkdown(decision, MADEAL);

  const section8 = markdown.split("## 8. Commercial / Operational DD")[1].split("## 9.")[0];
  const section9 = markdown.split("## 9. Legal")[1].split("## 10.")[0];
  assert(section8.includes("고객 집중도"), "COMMERCIAL finding은 8번 섹션(Commercial/Operational)에 나와야 함");
  assert(!section8.includes("라이선스 조항"), "LEGAL finding이 8번 섹션에 잘못 섞이면 안 됨");
  assert(section9.includes("라이선스 조항"), "LEGAL finding은 9번 섹션에 나와야 함");
  assert(!section9.includes("고객 집중도"), "COMMERCIAL finding이 9번 섹션에 잘못 섞이면 안 됨");
  console.log("✅ Test 3 — DD finding이 카테고리에 맞는 섹션(8 vs 9)에만 정확히 나타남");
}

function test4_uiAndExportConsumeSameDecisionObject() {
  // UI(ma-deal-ic-decision.tsx)도 export route도 buildPEICDecision()의
  // 반환값만 소비한다 — 여기서는 그 계약 자체(같은 decision 객체를 넣으면
  // 항상 같은 마크다운이 나옴)를 재확인한다.
  const readiness = buildPEDecisionReadiness({ periods: [] });
  const decision = buildPEICDecision(baseInput({ readiness }));
  const a = buildPEICMemoMarkdown(decision, MADEAL);
  const b = buildPEICMemoMarkdown(decision, MADEAL);
  assert(a === b, "같은 PEICDecision 인스턴스를 넣으면 항상 같은 마크다운을 반환해야 함(결정론 — UI/export 불일치 방지)");
  console.log("✅ Test 4 — 같은 PEICDecision → 항상 같은 마크다운(UI/export 불일치 불가능)");
}

function test5_financialConflictSurfacedInMemo() {
  const p = { id: "p1", fiscalYear: 2024, periodType: "ANNUAL" as const, currency: "KRW", lineItems: [
    { id: "li-1", lineItem: "REVENUE", value: 1000, currency: "KRW", source: "DART" },
    { id: "li-2", lineItem: "REVENUE", value: 1200, currency: "KRW", source: "MANUAL" },
  ], adjustments: [], normalizedSummary: { revenue: ok(1000), ebitda: missingInput, netDebt: missingInput } };
  const readiness = buildPEDecisionReadiness({ periods: [p] });
  const decision = buildPEICDecision(baseInput({ readiness }));
  const markdown = buildPEICMemoMarkdown(decision, MADEAL);
  const section6 = markdown.split("## 6. Financial Performance")[1].split("## 7.")[0];
  assert(section6.includes("충돌") && section6.includes("1건"), "재무 충돌은 메모 6번 섹션에 명시적으로 노출돼야 함");
  console.log("✅ Test 5 — 재무 데이터 충돌이 메모 Financial Performance 섹션에 명시됨");
}

function test6_lboSectionWarnsWhenUpstreamBlocked() {
  const p = { id: "p1", fiscalYear: 2024, periodType: "ANNUAL" as const, currency: "KRW", lineItems: [
    { id: "li-rev-1", lineItem: "REVENUE", value: 1000, currency: "KRW", source: "DART" },
    { id: "li-rev-2", lineItem: "REVENUE", value: 1200, currency: "KRW", source: "MANUAL" },
  ], adjustments: [], normalizedSummary: { revenue: ok(1000), ebitda: missingInput, netDebt: missingInput } };
  const readiness = buildPEDecisionReadiness({ periods: [p] });
  const decision = buildPEICDecision(
    baseInput({
      readiness,
      lboEntryEbitda: { status: "ok", lbo: { entryEbitdaInEok: 20 }, provenance: { fiscalPeriod: "FY2024", baseEbitdaKrw: 200, approvedAdjustmentTotalKrw: 0 } } as PEICDecisionInput["lboEntryEbitda"],
    })
  );
  const markdown = buildPEICMemoMarkdown(decision, MADEAL);
  const section10 = markdown.split("## 10. LBO / Transaction Structure")[1].split("## 11.")[0];
  assert(section10.includes("20") && section10.includes("Entry EBITDA"), "값 자체는 여전히 보여줘야 함(숨기지 않음)");
  assert(section10.includes("신뢰할 수 없습니다"), "상위 재무가 BLOCKED면 LBO 섹션에도 신뢰 불가 경고가 있어야 함(Executive Summary만 보고 넘어가는 위험 방지)");
  console.log("✅ Test 6 — 상위 재무 BLOCKED 시 LBO 섹션에 신뢰 불가 경고가 값과 함께 노출됨");
}

function test7_reviewStatusSectionReflectsPassedWorkspace() {
  const readiness = buildPEDecisionReadiness({ periods: [] });
  const decision = buildPEICDecision(baseInput({ readiness }));

  const request: PEEvidenceRequestView = {
    id: "req-1",
    ddCaseId: "dd-1",
    reviewItemSourceType: "MISSING_INFO",
    reviewItemSourceId: "MISSING_REVENUE",
    title: "매출 원장 요청",
    requestedDocument: null,
    requestedFact: null,
    reason: "매출 확인 필요",
    priority: "P0",
    status: "REQUESTED",
    linkedDocumentId: null,
    createdByUserId: "user-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
  const workspace = buildPEICReviewWorkspace("deal-1", decision.processState, decision.questions, [request]);
  const markdown = buildPEICMemoMarkdown(decision, MADEAL, workspace);
  const section14 = markdown.split("## 14. IC Review Status")[1].split("## 15.")[0];

  assert(section14.includes("근거 요청 1건"), "IC Review Status 섹션은 전달받은 워크스페이스의 evidence request 개수를 그대로 반영해야 함");
  assert(section14.includes("요청함: 1건"), "상태별 근거 요청 개수가 워크스페이스 값 그대로 나와야 함(새 집계 없음)");
  assert(!markdown.includes("## 14. IC Review Status\n자료 없음"), "reviewWorkspace를 전달했으면 더 이상 '자료 없음'으로만 채우면 안 됨");
  console.log("✅ Test 7 — IC Review Status 섹션은 buildPEICReviewWorkspace() 결과를 그대로 옮길 뿐 새로 판정하지 않음");
}

function main() {
  console.log("\n=== PE IC Memo 테스트 ===\n");
  test1_allFifteenSectionsPresentEvenWhenEmpty();
  test2_valuationSectionNeverFabricatesMoicIrr();
  test3_ddFindingsAppearInCorrectSection();
  test4_uiAndExportConsumeSameDecisionObject();
  test5_financialConflictSurfacedInMemo();
  test6_lboSectionWarnsWhenUpstreamBlocked();
  test7_reviewStatusSectionReflectsPassedWorkspace();
  console.log("\n✅ PE IC Memo 테스트 통과\n");
}

main();
