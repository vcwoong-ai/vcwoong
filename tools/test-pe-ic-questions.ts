/**
 * PE IC Questions(pe-ic-questions.ts, PR #107) 검증.
 *
 * buildPEDecisionReadiness()(PR #103)/dd-lineage.ts(PR-G) 자체의 판정
 * 로직은 재검증하지 않는다 — 여기서는 "그 출력이 결정론적 질문 템플릿으로
 * 올바르게, 그리고 오직 실제 소스가 있을 때만 옮겨지는지"만 확인한다.
 *
 * Usage: npm run test:pe-ic-questions
 */
import { buildICQuestions } from "../src/lib/pe/pe-ic-questions";
import { buildPEDDCase } from "../src/lib/pe/dd-lineage";
import { buildPEEvidenceLineage } from "../src/lib/pe/evidence-lineage";
import type { PEDecisionReadiness, PEDecisionDomainResult } from "../src/lib/pe/pe-decision-readiness";
import type { PEDDFinding } from "../src/lib/pe/dd-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function domain(overrides: Partial<PEDecisionDomainResult> & { domain: PEDecisionDomainResult["domain"] }): PEDecisionDomainResult {
  return { status: "NOT_STARTED", reason: "", missingItems: [], blockingItems: [], ...overrides };
}

function readiness(overrides: Partial<PEDecisionReadiness>): PEDecisionReadiness {
  return {
    overall: "PARTIAL",
    domains: [domain({ domain: "FINANCIAL" })],
    missingInformation: [],
    blockers: [],
    factConflicts: [],
    qoeReviewTrackingLimitation: "",
    summary: "",
    ...overrides,
  };
}

// ── Test 1: 빈 readiness → 빈 질문(fabrication 없음) ────────────────────

function test1_emptyReadinessNoQuestions() {
  const questions = buildICQuestions(readiness({}));
  assert(questions.length === 0, "blocker/missing/finding이 하나도 없으면 질문도 없어야 함");
  console.log("✅ Test 1 — 빈 readiness → 질문 없음(지어내지 않음)");
}

// ── Test 2: blocker → 질문 1건, code가 blocker.code와 정확히 일치 ────────

function test2_blockerTraceable() {
  const questions = buildICQuestions(
    readiness({
      blockers: [{ code: "FINANCIAL_FACT_CONFLICT_REVENUE", domain: "FINANCIAL", label: "REVENUE 값 불일치", detail: "테스트 상세" }],
    })
  );
  assert(questions.length === 1, "blocker 1건 → 질문 1건");
  assert(questions[0].code === "FINANCIAL_FACT_CONFLICT_REVENUE", "질문의 code가 blocker.code와 정확히 일치해야 함(추적 가능성)");
  assert(questions[0].sourceType === "BLOCKER", "sourceType이 BLOCKER여야 함");
  assert(questions[0].whyItMatters === "테스트 상세", "whyItMatters는 blocker.detail을 그대로 반영해야 함(재해석 없음)");
  console.log("✅ Test 2 — blocker → 추적 가능한 질문 1건");
}

// ── Test 3: factConflict → 질문 1건 ──────────────────────────────────────

function test3_factConflictTraceable() {
  const questions = buildICQuestions(
    readiness({
      factConflicts: [
        {
          financialPeriodId: "p1",
          metric: "REVENUE",
          currency: "KRW",
          conflictingValues: [
            { lineItemId: "li-1", value: 1000, source: "DART" },
            { lineItemId: "li-2", value: 1200, source: "MANUAL" },
          ],
        },
      ],
    })
  );
  assert(questions.length === 1, "factConflict 1건 → 질문 1건");
  assert(questions[0].sourceType === "FACT_CONFLICT", "sourceType이 FACT_CONFLICT여야 함");
  assert(questions[0].question.includes("1,000") && questions[0].question.includes("1,200"), "질문에 실제 충돌값이 그대로 노출돼야 함(임의 선택 없음)");
  console.log("✅ Test 3 — factConflict → 실제 충돌값이 그대로 노출된 질문");
}

// ── Test 4: missingInformation(material/informational) 순서와 traceability ──

function test4_missingInfoTraceableAndOrdered() {
  const questions = buildICQuestions(
    readiness({
      missingInformation: [
        { code: "FINANCIAL_EBITDA_MISSING", domain: "FINANCIAL", label: "EBITDA", reason: "EBITDA 계정 없음", severity: "MATERIAL", blocks: ["QOE", "LBO"] },
        { code: "DART_NOT_IMPORTED", domain: "DART", label: "DART 공시", reason: "DART 미연동", severity: "INFORMATIONAL", blocks: [] },
      ],
    })
  );
  assert(questions.length === 2, "missingInformation 2건 → 질문 2건");
  const material = questions.find((q) => q.code === "FINANCIAL_EBITDA_MISSING")!;
  const informational = questions.find((q) => q.code === "DART_NOT_IMPORTED")!;
  assert(material.decisionImpact.includes("QOE") && material.decisionImpact.includes("LBO"), "material 질문의 decisionImpact가 실제 blocks 배열을 반영해야 함");
  assert(!informational.decisionImpact.includes("막고 있음"), "informational 질문은 실제로 막고 있지 않은데 차단 중이라고 말하면 안 됨");
  const materialIdx = questions.findIndex((q) => q.code === "FINANCIAL_EBITDA_MISSING");
  const infoIdx = questions.findIndex((q) => q.code === "DART_NOT_IMPORTED");
  assert(materialIdx < infoIdx, "material 정보가 informational보다 먼저 나와야 함(우선순위)");
  console.log("✅ Test 4 — missingInformation → traceable + material 우선 정렬");
}

// ── Test 5: DD finding → CLOSED/REJECTED는 질문화하지 않음 ───────────────

function findingRow(overrides: Partial<PEDDFinding> & { id: string; status: PEDDFinding["status"] }): PEDDFinding {
  return {
    category: "COMMERCIAL",
    title: "테스트 finding",
    description: "테스트 설명",
    severity: "MEDIUM",
    evidenceIds: [],
    claimIds: [],
    ...overrides,
  };
}

function test5_findingLifecycleFiltering() {
  const ddCase = buildPEDDCase(buildPEEvidenceLineage({}), [
    findingRow({ id: "f-open", status: "CONFIRMED" }),
    findingRow({ id: "f-closed", status: "CLOSED" }),
    findingRow({ id: "f-rejected", status: "REJECTED" }),
  ]);
  const questions = buildICQuestions(readiness({}), ddCase);
  assert(questions.length === 1, "CLOSED/REJECTED는 제외하고 열려 있는 finding만 질문화해야 함");
  assert(questions[0].code === "DD_FINDING:f-open", "질문 code가 실제 finding.id를 그대로 참조해야 함");
  assert(questions[0].sourceType === "DD_FINDING", "sourceType이 DD_FINDING이어야 함");
  console.log("✅ Test 5 — DD finding: CLOSED/REJECTED 제외, 열려 있는 finding만 traceable 질문화");
}

// ── Test 6: 근거 없는 finding은 requiredEvidence에 그 사실을 정직하게 명시 ──

function test6_findingWithoutEvidenceHonest() {
  const ddCase = buildPEDDCase(buildPEEvidenceLineage({}), [findingRow({ id: "f-draft", status: "DRAFT", evidenceIds: [] })]);
  const questions = buildICQuestions(readiness({}), ddCase);
  assert(questions[0].requiredEvidence.includes("근거 확보 필요"), "근거 없는 finding은 그 사실을 정직하게 명시해야 함(있는 척 하지 않음)");
  console.log("✅ Test 6 — 근거 없는 finding → requiredEvidence가 그 사실을 정직하게 명시");
}

// ── Test 7: ddCase 없이 호출해도 에러 없이 동작(모든 필드 optional) ──────

function test7_worksWithoutDdCase() {
  const questions = buildICQuestions(readiness({ blockers: [{ code: "X", domain: "FINANCIAL", label: "l", detail: "d" }] }));
  assert(questions.length === 1, "ddCase 없이도 blocker 기반 질문은 정상 생성돼야 함");
  console.log("✅ Test 7 — ddCase 없이 호출해도 정상 동작(finding 질문만 0건)");
}

// ── Test 8: 결정론(같은 입력 → 같은 출력) ───────────────────────────────

function test8_deterministic() {
  const input = readiness({
    blockers: [{ code: "X", domain: "FINANCIAL", label: "l", detail: "d" }],
    missingInformation: [{ code: "Y", domain: "QOE", label: "l2", reason: "r2", severity: "MATERIAL", blocks: [] }],
  });
  const a = JSON.stringify(buildICQuestions(input));
  const b = JSON.stringify(buildICQuestions(input));
  assert(a === b, "같은 입력이면 항상 같은 질문 목록을 반환해야 함(결정론)");
  console.log("✅ Test 8 — 결정론(같은 입력 → 같은 출력)");
}

function main() {
  console.log("\n=== PE IC Questions 테스트 ===\n");
  test1_emptyReadinessNoQuestions();
  test2_blockerTraceable();
  test3_factConflictTraceable();
  test4_missingInfoTraceableAndOrdered();
  test5_findingLifecycleFiltering();
  test6_findingWithoutEvidenceHonest();
  test7_worksWithoutDdCase();
  test8_deterministic();
  console.log("\n✅ PE IC Questions 테스트 통과\n");
}

main();
