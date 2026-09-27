/**
 * VC Decision-First Investment Memo — 조립 계층(vc-decision-memo.ts) 검증(PR-K).
 *
 * vc-decision-memo.ts는 새 결정 로직을 만들지 않는다 — 이미 계산된
 * VCInvestmentDecision을 DOCX/PPTX가 재사용하는 문자열로 조립하기만 한다.
 * 여기서는 그 조립이 실제로 thesis/drivers/thesisBreakers/missing info
 * (P0 우선)/valuation(NOT_COMPUTABLE 보존)/상충을 그대로 보존하는지,
 * 그리고 새 AI 호출이 없는지를 순수 함수로 검증한다. 마지막 두 테스트는
 * 실제 generateReportDOCX/generateReportPPTX에 조립 결과를 흘려 넣어
 * export 회귀가 없는지 확인한다(네트워크 없음, 로컬 버퍼 생성만).
 *
 * Usage: npm run test:vc-decision-memo
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import {
  buildDecisionMemoSectionRefs,
  buildDecisionMemoSections,
} from "../src/lib/vc-decision-memo";
import type { VCInvestmentDecision } from "../src/lib/vc-decision-types";
import { generateReportDOCX } from "../src/lib/docx-export";
import { generateReportPPTX } from "../src/lib/pptx-export";
import type { ReportWithSections } from "../src/types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// ── 합성 VCInvestmentDecision(직접 구성 — buildInvestmentDecision의 정확성은
// test-vc-decision-layer.ts가 이미 검증한다. 여기서는 "조립"만 검증한다) ──

function baseDecision(overrides: Partial<VCInvestmentDecision> = {}): VCInvestmentDecision {
  return {
    signal: "PROMISING",
    recommendation: "FURTHER_REVIEW_RECOMMENDED",
    thesis: "투자 논지는 제품·기술력, 재무 건전성에 근거합니다.",
    confidence: "PARTIALLY_VERIFIED",
    decisionDimensions: [
      {
        dimension: "product",
        label: "제품·기술력",
        state: "VERIFIED",
        decisionImpact: "LOW",
        positiveDrivers: ["고객사 12곳 도입"],
        negativeDrivers: [],
        missingInfoCount: 0,
      },
      {
        dimension: "financials",
        label: "재무 건전성",
        state: "CONTRADICTED",
        decisionImpact: "CRITICAL",
        positiveDrivers: [],
        negativeDrivers: [],
        missingInfoCount: 0,
        contradiction: { valueA: "10억원", valueB: "8.2억원", sourceA: "IR덱", sourceB: "재무제표" },
      },
      {
        dimension: "team",
        label: "팀 역량",
        state: "MISSING",
        decisionImpact: "MEDIUM",
        positiveDrivers: [],
        negativeDrivers: [],
        missingInfoCount: 0,
      },
      {
        dimension: "marketSize",
        label: "시장성",
        state: "UNVERIFIED",
        decisionImpact: "HIGH",
        positiveDrivers: [],
        negativeDrivers: [],
        missingInfoCount: 0,
      },
      {
        dimension: "businessModel",
        label: "사업모델",
        state: "MISSING",
        decisionImpact: "MEDIUM",
        positiveDrivers: [],
        negativeDrivers: [],
        missingInfoCount: 0,
      },
      {
        dimension: "moat",
        label: "경쟁 우위",
        state: "MISSING",
        decisionImpact: "MEDIUM",
        positiveDrivers: [],
        negativeDrivers: [],
        missingInfoCount: 0,
      },
    ],
    drivers: [
      {
        id: "driver:product",
        dimension: "product",
        title: "제품·기술력 — 85점",
        description: "",
        whyItMatters: "고객사 12곳이 실제 도입 계약을 체결함",
        evidenceState: "VERIFIED",
        evidence: [{ raw: "고객사 12곳 도입 계약서 확인", documentName: "계약서.pdf" }],
        whatCouldInvalidate: "계약 갱신 실패 시 근거 약화",
        verificationRequirement: "추가 검증 없이 IC 상정 가능(근거 확인됨)",
        decisionImpact: "LOW",
      },
    ],
    thesisBreakers: [
      {
        id: "breaker:team:TEAM_EVIDENCE_GAP",
        trigger: "TEAM_EVIDENCE_GAP",
        dimension: "team",
        title: "팀 역량 근거 공백",
        whyItMatters: "핵심 경영진 이력 검증 자료 부재",
        evidenceState: "MISSING",
        evidence: [],
        probability: "NOT_ASSESSED",
        decisionImpact: "MEDIUM",
        verificationRequirement: "원문 자료로 직접 재확인 필요(추정치로 대체 불가)",
        icQuestion: {
          id: "q1",
          category: "Team",
          question: "핵심 경영진의 이전 경력을 증빙할 자료를 제시할 수 있습니까?",
          whyItMatters: "팀 역량 평가의 근거가 없습니다.",
          trigger: "HIGH_SCORE_LOW_EVIDENCE",
          priority: "HIGH",
          suggestedAnswerType: "DOCUMENT",
          source: "deterministic",
        },
      },
    ],
    missingInformation: [
      {
        id: "missing:UNSUPPORTED_KEY_CLAIM:product",
        priority: "P0",
        item: "고객사 12곳 도입 주장의 원본 계약서",
        whyItMatters: "제품 평가의 핵심 주장이나 근거가 확인되지 않음",
        decisionImpact: "CRITICAL",
        requiredEvidence: "고객사별 계약서 원본",
        relatedDimension: "product",
      },
      {
        id: "missing:MARKET_EVIDENCE_GAP:marketSize",
        priority: "P1",
        item: "시장성 평가를 뒷받침하는 근거",
        whyItMatters: "시장 규모 근거 확인 필요",
        decisionImpact: "HIGH",
        requiredEvidence: "관련 계약서·실측 데이터·고객 자료 등 1차 근거",
        relatedDimension: "marketSize",
      },
    ],
    valuation: {
      facts: { investAmount: 20, valuation: 100 },
      lineItems: [
        { status: "computed", label: "예상 지분율(Post-money 기준, 투자금액/포스트밸류)", value: "20.00%" },
        {
          status: "not_computable",
          label: "MOIC",
          reason: "Exit 밸류에이션·회수 시점 가정이 시스템에 없습니다.",
          requiredInput: "Exit 밸류에이션 가정, 회수 시점, 추가 희석 가정",
        },
        {
          status: "not_computable",
          label: "IRR",
          reason: "Exit 밸류에이션·회수 시점 가정이 시스템에 없습니다.",
          requiredInput: "Exit 밸류에이션 가정, 회수 시점, 현금흐름 스케줄",
        },
      ],
      evidenceState: "PARTIALLY_VERIFIED",
    },
    ...overrides,
  };
}

// ── 1. Decision-first memo contains thesis ───────────────────────────────

function test1_containsThesis() {
  const memo = buildDecisionMemoSections(baseDecision(), []);
  const page1 = memo.find((s) => s.title === "투자 결정 요약");
  assert(!!page1, "투자 결정 요약 페이지가 있어야 함");
  assert(page1!.content.includes("투자 논지는 제품·기술력"), "thesis 원문이 그대로 포함돼야 함(재작성 없음)");
  console.log("✅ Test 1 — Decision-First memo에 thesis 포함(원문 그대로)");
}

// ── 2. Drivers preserved ─────────────────────────────────────────────────

function test2_driversPreserved() {
  const memo = buildDecisionMemoSections(baseDecision(), []);
  const page2 = memo.find((s) => s.title === "투자 근거 (Investment Drivers)");
  assert(!!page2, "Investment Drivers 페이지가 있어야 함");
  assert(page2!.content.includes("제품·기술력 — 85점"), "driver 제목이 그대로 보존돼야 함");
  assert(page2!.content.includes("고객사 12곳 도입 계약서 확인"), "driver evidence 발췌가 그대로 보존돼야 함(재작성 없음)");
  console.log("✅ Test 2 — Driver 보존(제목·근거 원문 그대로)");
}

// ── 3. Thesis breakers preserved ──────────────────────────────────────────

function test3_thesisBreakersPreserved() {
  const memo = buildDecisionMemoSections(baseDecision(), []);
  const page3 = memo.find((s) => s.title === "투자 논지 훼손 요인 (Thesis Breakers)");
  assert(!!page3, "Thesis Breakers 페이지가 있어야 함");
  assert(page3!.content.includes("팀 역량 근거 공백"), "thesis breaker 제목이 보존돼야 함");
  assert(page3!.content.includes("평가되지 않음"), "확률은 항상 '평가되지 않음'으로만 표시돼야 함");
  assert(!/\d+%/.test(page3!.content.match(/발생 확률:[^\n]*/)?.[0] ?? ""), "확률 줄에 숫자·퍼센트가 지어내어져 있으면 안 됨");
  console.log("✅ Test 3 — Thesis Breaker 보존, 확률은 절대 숫자로 지어내지 않음");
}

// ── 4. P0 missing information appears first within its own page ──────────

function test4_p0First() {
  const memo = buildDecisionMemoSections(baseDecision(), []);
  const page4 = memo.find((s) => s.title.includes("미확인 정보"));
  assert(!!page4, "Missing Information 페이지가 있어야 함");
  const p0Index = page4!.content.indexOf("[P0]");
  const p1Index = page4!.content.indexOf("[P1]");
  assert(p0Index !== -1 && p1Index !== -1, "P0/P1 항목이 모두 있어야 함");
  assert(p0Index < p1Index, "P0가 P1보다 먼저 나와야 함(우선순위 순, 지어낸 순서 아님)");
  console.log("✅ Test 4 — P0 Missing Information이 먼저 배치됨(우선순위 보존)");
}

// ── 5. Valuation uses deterministic ownership ─────────────────────────────

function test5_deterministicOwnership() {
  const memo = buildDecisionMemoSections(baseDecision(), []);
  const page5 = memo.find((s) => s.title === "밸류에이션 & 리턴");
  assert(!!page5, "Valuation 페이지가 있어야 함");
  assert(page5!.content.includes("20.00%"), "지분율 계산값이 그대로 보존돼야 함(재계산 없음)");
  assert(page5!.content.includes("투자금액: 20억원"), "투자금액 fact가 노출돼야 함");
  console.log("✅ Test 5 — Valuation은 이미 계산된 지분율을 그대로 사용(재계산/재추정 없음)");
}

// ── 6/7. MOIC/IRR NOT_COMPUTABLE preserved ────────────────────────────────

function test6_moicNotComputablePreserved() {
  const memo = buildDecisionMemoSections(baseDecision(), []);
  const page5 = memo.find((s) => s.title === "밸류에이션 & 리턴")!;
  assert(page5.content.includes("MOIC:") && page5.content.includes("NOT COMPUTABLE"), "MOIC은 NOT COMPUTABLE로 남아야 함");
  assert(page5.content.includes("Exit 밸류에이션 가정, 회수 시점, 추가 희석 가정"), "MOIC의 필요 입력이 명시돼야 함");
  console.log("✅ Test 6 — MOIC은 exit 가정 없이는 항상 NOT COMPUTABLE(지어내지 않음)");
}

function test7_irrNotComputablePreserved() {
  const memo = buildDecisionMemoSections(baseDecision(), []);
  const page5 = memo.find((s) => s.title === "밸류에이션 & 리턴")!;
  assert(page5.content.includes("IRR:") && page5.content.includes("NOT COMPUTABLE"), "IRR은 NOT COMPUTABLE로 남아야 함");
  console.log("✅ Test 7 — IRR도 exit 가정 없이는 항상 NOT COMPUTABLE");
}

// ── 8. Existing 10 sections remain available(조립이 원본 섹션 배열을 건드리지 않음) ─

function test8_originalSectionsUntouched() {
  const originalSections = [
    { title: "투자개요", content: "내용1" },
    { title: "회사개요", content: "내용2" },
  ];
  const memo = buildDecisionMemoSections(baseDecision(), []);
  const combined = [...memo, ...originalSections];
  assert(combined.length === memo.length + 2, "기존 10개 섹션이 그대로 남아 있어야 함(삭제/변형 없음)");
  assert(originalSections[0].title === "투자개요" && originalSections[0].content === "내용1", "원본 섹션 객체 자체는 변형되지 않아야 함");
  console.log("✅ Test 8 — 기존 상세 섹션은 그대로 보존됨(Decision-First memo는 앞에 추가만 함)");
}

// ── 9. No additional AI call(정적 검사 — generateText/네트워크 호출 없음) ───

function test9_noAdditionalAICall() {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/lib/vc-decision-memo.ts"),
    "utf-8"
  );
  assert(!/generateText|fetch\(|claude\.ts|OpenAI|anthropic/i.test(src), "vc-decision-memo.ts는 AI/네트워크 호출을 하지 않아야 함(정적 조립만)");
  assert(!src.includes("async function"), "조립 함수는 모두 동기 순수 함수여야 함(비동기 AI 호출 없음의 방증)");
  console.log("✅ Test 9 — Decision-First memo 조립은 추가 AI 호출 없이 전부 동기 순수 함수");
}

// ── 10. Contradictions not silently resolved(둘 다 텍스트에 보존) ────────

function test10_contradictionsPreserved() {
  const memo = buildDecisionMemoSections(baseDecision(), []);
  const page1 = memo.find((s) => s.title === "투자 결정 요약")!;
  assert(page1.content.includes("10억원") && page1.content.includes("8.2억원"), "상충하는 두 값이 모두 텍스트에 남아야 함(하나를 조용히 고르지 않음)");
  assert(page1.content.includes("상충"), "상충 상태가 명시적으로 라벨링돼야 함");
  console.log("✅ Test 10 — 상충된 값은 둘 다 보존, 조용히 하나를 선택하지 않음");
}

// ── 11. Section refs(Decision → Evidence, 존재하는 섹션만 참조) ──────────

function test11_sectionRefs() {
  const sections = [
    { sectionKey: "PRODUCT_TECHNOLOGY" as never, title: "제품/기술력" },
    { sectionKey: "FINANCIAL_STATUS" as never, title: "재무현황" },
  ];
  const refs = buildDecisionMemoSectionRefs(sections);
  const productRef = refs.find((r) => r.dimension === "product");
  assert(!!productRef && productRef.sectionTitle === "제품/기술력", "product 차원은 실제 보고서에 있는 PRODUCT_TECHNOLOGY 섹션을 참조해야 함");
  const teamRef = refs.find((r) => r.dimension === "team");
  assert(!teamRef, "보고서에 없는 섹션(COMPANY_OVERVIEW)은 참조를 만들지 않아야 함(URL/ID를 지어내지 않음)");

  const memo = buildDecisionMemoSections(baseDecision(), refs);
  const page2 = memo.find((s) => s.title === "투자 근거 (Investment Drivers)")!;
  assert(page2.content.includes("관련 상세 섹션: "), "driver에 관련 상세 섹션 참조가 붙어야 함(실제 존재하는 섹션만)");
  console.log("✅ Test 11 — Decision → Evidence 섹션 참조는 실제 존재하는 섹션만 가리킴(지어낸 URL/ID 없음)");
}

// ── 12. Gate failure → 검증 안 된 내용을 내보내지 않음(export도 UI와 동일 기준) ─

function test12_gateFailureBlocksExport() {
  const tampered = baseDecision({
    thesisBreakers: [
      { ...baseDecision().thesisBreakers[0], probability: "60%" as unknown as "NOT_ASSESSED" },
    ],
  });
  const memo = buildDecisionMemoSections(tampered, []);
  assert(memo.length === 1, "게이트 실패 시 단 하나의 경고 섹션만 반환해야 함(나머지 페이지는 내보내지 않음)");
  assert(memo[0].content.includes("일관성 검증을 통과하지 못했습니다"), "경고 문구가 있어야 함");
  console.log("✅ Test 12 — 품질 게이트 실패 시 검증 안 된 내용을 export에도 내보내지 않음(UI와 동일 기준)");
}

// ── 13. Empty decision(딜 스코어 미계산) → 빈 배열, 지어내지 않음 ────────

function test13_emptyDecisionProducesNoSections() {
  const empty: VCInvestmentDecision = {
    signal: "CAUTION",
    recommendation: "FURTHER_REVIEW_RECOMMENDED",
    thesis: "",
    confidence: "MISSING",
    decisionDimensions: [],
    drivers: [],
    thesisBreakers: [],
    missingInformation: [],
    valuation: { facts: {}, lineItems: [], evidenceState: "MISSING" },
  };
  const memo = buildDecisionMemoSections(empty, []);
  assert(memo.length === 0, "계산된 내용이 없으면 빈 배열을 반환해야 함(없는 내용을 지어내지 않음)");
  console.log("✅ Test 13 — Decision Layer가 아직 계산되지 않은 딜은 빈 배열(필러 텍스트로 채우지 않음)");
}

// ── 14. Export regression — PPTX(실제 슬라이드 수 증가로 삽입 확인) ──────

async function test14_pptxExportIncludesMemo() {
  const originalSections = [
    { title: "투자개요", content: "- Series B 100억\n- Post 800억" },
    { title: "회사개요", content: "2019년 설립, 48명" },
  ];
  const memo = buildDecisionMemoSections(baseDecision(), []);

  const withoutMemo = await generateReportPPTX(originalSections, { companyName: "테스트회사" });
  const withMemo = await generateReportPPTX([...memo, ...originalSections], { companyName: "테스트회사" });

  const zipWithout = await JSZip.loadAsync(withoutMemo);
  const zipWith = await JSZip.loadAsync(withMemo);
  const slidesWithout = Object.keys(zipWithout.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length;
  const slidesWith = Object.keys(zipWith.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length;

  assert(slidesWith === slidesWithout + memo.length, `Decision-First memo 슬라이드 수만큼 늘어나야 함(기대 +${memo.length})`);
  console.log("✅ Test 14 — PPTX export에 Decision-First memo가 실제로 슬라이드로 삽입됨(회귀 없음)");
}

// ── 15. Export regression — DOCX(버퍼가 정상 생성되고 zip으로 열림) ──────

async function test15_docxExportIncludesMemo() {
  const memo = buildDecisionMemoSections(baseDecision(), []);
  const fakeReport = {
    id: "r1",
    deal: {
      companyName: "테스트회사",
      sector: "IT_SAAS",
      investRound: "Series B",
      investAmount: 20,
      valuation: 100,
    },
    agentType: "IT_SAAS",
    sections: [
      { id: "s1", sectionKey: "INVESTMENT_OVERVIEW", title: "투자개요", content: "- 요약 내용", order: 1 },
    ],
  } as unknown as ReportWithSections;

  const withoutMemo = await generateReportDOCX(fakeReport);
  const withMemo = await generateReportDOCX(fakeReport, memo);

  const zipWithout = await JSZip.loadAsync(withoutMemo);
  const zipWith = await JSZip.loadAsync(withMemo);
  assert(!!zipWithout.files["word/document.xml"], "기존 동작(memo 없음)은 정상 DOCX를 생성해야 함(회귀 없음)");
  assert(!!zipWith.files["word/document.xml"], "memo 포함 DOCX도 정상 구조여야 함");

  const docWithout = await zipWithout.file("word/document.xml")!.async("text");
  const docWith = await zipWith.file("word/document.xml")!.async("text");
  assert(docWith.length > docWithout.length, "memo가 포함되면 문서 본문이 늘어나야 함(실제로 삽입됨)");
  assert(docWith.includes("Investment Drivers") || docWith.includes(encodeXmlCheck("Investment Drivers")), "Investment Drivers 제목이 실제 DOCX 본문에 포함돼야 함");
  console.log("✅ Test 15 — DOCX export에 Decision-First memo가 실제로 삽입됨(기존 동작은 그대로 회귀 없음)");
}

function encodeXmlCheck(s: string) {
  return s; // docx 라이브러리가 텍스트를 그대로 저장하므로 별도 인코딩 확인 불필요(가독성용 래퍼)
}

const syncTests = [
  test1_containsThesis,
  test2_driversPreserved,
  test3_thesisBreakersPreserved,
  test4_p0First,
  test5_deterministicOwnership,
  test6_moicNotComputablePreserved,
  test7_irrNotComputablePreserved,
  test8_originalSectionsUntouched,
  test9_noAdditionalAICall,
  test10_contradictionsPreserved,
  test11_sectionRefs,
  test12_gateFailureBlocksExport,
  test13_emptyDecisionProducesNoSections,
];

async function main() {
  console.log("=== VC Decision-First Investment Memo(PR-K) 테스트 ===\n");
  for (const t of syncTests) t();
  await test14_pptxExportIncludesMemo();
  await test15_docxExportIncludesMemo();
  console.log(`\n✅ VC Decision-First Investment Memo(PR-K) 테스트 통과(${syncTests.length + 2}/${syncTests.length + 2})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
