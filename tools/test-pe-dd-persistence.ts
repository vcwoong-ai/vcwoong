/**
 * PE DD & Evidence Persistence Foundation(PR #105) 검증.
 *
 * 이 레포의 다른 test:*와 동일한 관례로 라이브 DB를 쓰지 않는다(확인됨 —
 * test-qoe-persistence.ts 등). 여기서 검증하는 것:
 *
 * 1. Prisma enum(PEDDCategory/PEDDSeverity/PEDDFindingStatus) 값 집합이
 *    dd-types.ts의 PE_DD_CATEGORIES/PE_DD_SEVERITIES/PE_DD_FINDING_STATUSES와
 *    정확히 일치하는가.
 * 2. pe-dd-repository.ts의 순수 검증 함수(collectCreateFindingIssues 등)가
 *    §Step 3 lifecycle 불변조건(CONFIRMED 이상은 evidence 필요 등)을
 *    정확히 지키는가 — DB 호출 없이 requiresEvidenceForStatus()(dd-types.ts,
 *    수정 없음)를 그대로 재사용하는지 확인한다.
 * 3. pe-dd-persistence-adapter.ts의 순수 조립 함수(buildPEDDCaseFromRows)가
 *    hand-built DB row로부터 dd-lineage.ts의 validatePEDDCase()/
 *    pe-decision-readiness.ts의 buildPEDecisionReadiness()가 기대하는 정확한
 *    PEDDCase 구조를 만들어내는가(readiness 호환성).
 *
 * 실제 Prisma 쓰기 경로(권한 필터링 where절, 교차 딜 FK 검증, evidence 개수
 * 카운트 등)의 라이브 DB 라운드트립은 이 스크립트로 하지 않는다 — 이는
 * 별도의 로컬 sqlite 적대적 검증 스크립트로 수행했다(PR #105 설명 참고,
 * test-qoe-persistence.ts와 동일한 관례).
 *
 * Usage: npm run test:pe-dd-persistence
 */
import { $Enums } from "@prisma/client";
import type {
  MAFinancialPeriod,
  PEDDFinding as PEDDFindingRow,
  PEEvidence as PEEvidenceRow,
} from "@prisma/client";
import {
  collectCreateFindingIssues,
  collectUpdateFindingIssues,
  collectAddEvidenceIssues,
} from "../src/lib/pe/pe-dd-repository";
import { buildPEDDCaseFromRows } from "../src/lib/pe/pe-dd-persistence-adapter";
import { validatePEDDCase, findUnsupportedFindings } from "../src/lib/pe/dd-lineage";
import { buildPEDecisionReadiness } from "../src/lib/pe/pe-decision-readiness";
import {
  PE_DD_CATEGORIES,
  PE_DD_SEVERITIES,
  PE_DD_FINDING_STATUSES,
} from "../src/lib/pe/dd-types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// ── 1. enum 값 집합 일치 ─────────────────────────────────────────────

function testCategoryEnumMatchesDdTypes() {
  const prismaValues = Object.values($Enums.PEDDCategory).sort();
  const pureValues = [...PE_DD_CATEGORIES].sort();
  assert(JSON.stringify(prismaValues) === JSON.stringify(pureValues), `PEDDCategory(Prisma)와 PE_DD_CATEGORIES(dd-types.ts)가 정확히 일치해야 함. Prisma=${prismaValues}, pure=${pureValues}`);
  console.log("✅ Test 1 — Prisma PEDDCategory === dd-types.ts PE_DD_CATEGORIES");
}

function testSeverityEnumMatchesDdTypes() {
  const prismaValues = Object.values($Enums.PEDDSeverity).sort();
  const pureValues = [...PE_DD_SEVERITIES].sort();
  assert(JSON.stringify(prismaValues) === JSON.stringify(pureValues), "PEDDSeverity(Prisma)와 PE_DD_SEVERITIES(dd-types.ts)가 정확히 일치해야 함");
  console.log("✅ Test 2 — Prisma PEDDSeverity === dd-types.ts PE_DD_SEVERITIES");
}

function testFindingStatusEnumMatchesDdTypes() {
  const prismaValues = Object.values($Enums.PEDDFindingStatus).sort();
  const pureValues = [...PE_DD_FINDING_STATUSES].sort();
  assert(JSON.stringify(prismaValues) === JSON.stringify(pureValues), "PEDDFindingStatus(Prisma)와 PE_DD_FINDING_STATUSES(dd-types.ts)가 정확히 일치해야 함");
  console.log("✅ Test 3 — Prisma PEDDFindingStatus === dd-types.ts PE_DD_FINDING_STATUSES");
}

// ── 2. Finding lifecycle — 순수 검증 함수 ────────────────────────────

function testCreateDraftValid() {
  const issues = collectCreateFindingIssues({ title: "고객 집중도 이슈", description: "상위 3개 고객이 매출 70%", status: "DRAFT" });
  assert(issues.length === 0, "DRAFT 생성은 유효해야 함");
  console.log("✅ Test 4 — DRAFT 생성 valid");
}

function testCreateInReviewValid() {
  const issues = collectCreateFindingIssues({ title: "제목", description: "설명", status: "IN_REVIEW" });
  assert(issues.length === 0, "IN_REVIEW 생성은 유효해야 함(evidence 불필요)");
  console.log("✅ Test 5 — IN_REVIEW 생성 valid");
}

function testCreateConfirmedRejected() {
  const issues = collectCreateFindingIssues({ title: "제목", description: "설명", status: "CONFIRMED" });
  assert(issues.includes("cannot_create_with_status_requiring_evidence"), "CONFIRMED로 바로 생성은 거부돼야 함(evidence는 생성 후에만 붙일 수 있음)");
  console.log("✅ Test 6 — CONFIRMED 생성(evidence 없이) reject");
}

function testCreateMitigatedRejected() {
  const issues = collectCreateFindingIssues({ title: "제목", description: "설명", status: "MITIGATED" });
  assert(issues.includes("cannot_create_with_status_requiring_evidence"), "MITIGATED로 바로 생성은 거부돼야 함");
  console.log("✅ Test 7 — MITIGATED 생성(evidence 없이) reject");
}

function testCreateAcceptedRejected() {
  const issues = collectCreateFindingIssues({ title: "제목", description: "설명", status: "ACCEPTED" });
  assert(issues.includes("cannot_create_with_status_requiring_evidence"), "ACCEPTED로 바로 생성은 거부돼야 함");
  console.log("✅ Test 8 — ACCEPTED 생성(evidence 없이) reject");
}

function testCreateClosedRejected() {
  const issues = collectCreateFindingIssues({ title: "제목", description: "설명", status: "CLOSED" });
  assert(issues.includes("cannot_create_with_status_requiring_evidence"), "CLOSED로 바로 생성은 거부돼야 함");
  console.log("✅ Test 9 — CLOSED 생성(evidence 없이) reject");
}

function testCreateRejectedStatusValid() {
  const issues = collectCreateFindingIssues({ title: "제목", description: "근거 불충분으로 기각", status: "REJECTED" });
  assert(issues.length === 0, "REJECTED 생성은 evidence 없이도 유효해야 함(§14 — 근거 불충분해서 기각이 오히려 흔함)");
  console.log("✅ Test 10 — REJECTED 생성(evidence 없이) valid");
}

function testCreateEmptyTitleRejected() {
  const issues = collectCreateFindingIssues({ title: "   ", description: "설명", status: "DRAFT" });
  assert(issues.includes("title_required"), "빈 제목은 거부돼야 함");
  console.log("✅ Test 11 — 빈 제목 reject");
}

function testUpdateEmptyDescriptionRejected() {
  const issues = collectUpdateFindingIssues({ description: "   " });
  assert(issues.includes("description_required"), "빈 설명으로의 수정은 거부돼야 함");
  console.log("✅ Test 12 — 수정 시 빈 설명 reject");
}

function testUpdatePartialPatchIgnoresUnsetFields() {
  const issues = collectUpdateFindingIssues({ title: "새 제목" });
  assert(issues.length === 0, "일부 필드만 수정할 때 건드리지 않은 필드는 검증하지 않아야 함");
  console.log("✅ Test 13 — 부분 수정은 건드린 필드만 검증");
}

// ── 3. Evidence 구조 검증 ────────────────────────────────────────────

function testAddEvidenceValidConfidence() {
  const issues = collectAddEvidenceIssues({ sourceName: "2024 감사보고서", confidence: 0.9 });
  assert(issues.length === 0, "0~1 범위 confidence는 유효해야 함");
  console.log("✅ Test 14 — confidence 0.9 valid");
}

function testAddEvidenceConfidenceBoundaries() {
  assert(collectAddEvidenceIssues({ sourceName: "s", confidence: 0 }).length === 0, "confidence=0은 유효해야 함");
  assert(collectAddEvidenceIssues({ sourceName: "s", confidence: 1 }).length === 0, "confidence=1은 유효해야 함");
  console.log("✅ Test 15 — confidence 경계값(0, 1) valid");
}

function testAddEvidenceConfidenceOutOfRange() {
  assert(collectAddEvidenceIssues({ sourceName: "s", confidence: -0.1 }).includes("confidence_out_of_range"), "confidence<0은 거부돼야 함");
  assert(collectAddEvidenceIssues({ sourceName: "s", confidence: 1.1 }).includes("confidence_out_of_range"), "confidence>1은 거부돼야 함(evidence-lineage.ts createEvidenceItem()과 동일 규칙)");
  console.log("✅ Test 16 — confidence 범위 밖(-0.1, 1.1) reject");
}

function testAddEvidenceEmptySourceNameRejected() {
  const issues = collectAddEvidenceIssues({ sourceName: "  " });
  assert(issues.includes("source_name_required"), "빈 sourceName은 거부돼야 함");
  console.log("✅ Test 17 — 빈 sourceName reject");
}

// ── 4. Readiness 호환성(어댑터 → dd-lineage.ts → pe-decision-readiness.ts) ──

function period(overrides: Partial<MAFinancialPeriod> & { id: string; maDealId: string }): MAFinancialPeriod {
  const now = new Date();
  return {
    fiscalYear: 2024,
    periodType: "ANNUAL",
    startDate: now,
    endDate: now,
    currency: "KRW",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as MAFinancialPeriod;
}

function findingRow(overrides: Partial<PEDDFindingRow> & { id: string; ddCaseId: string }): PEDDFindingRow {
  const now = new Date();
  return {
    category: "FINANCIAL",
    subCategory: null,
    title: "테스트 finding",
    description: "테스트 설명",
    severity: "MEDIUM",
    status: "DRAFT",
    financialPeriodId: null,
    owner: null,
    resolution: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as PEDDFindingRow;
}

function evidenceRow(overrides: Partial<PEEvidenceRow> & { id: string; ddCaseId: string }): PEEvidenceRow {
  const now = new Date();
  return {
    findingId: null,
    documentId: null,
    sourceType: "MANUAL",
    sourceName: "테스트 출처",
    sourceLocation: null,
    externalReference: null,
    locator: null,
    excerpt: null,
    confidence: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as PEEvidenceRow;
}

function testEmptyPersistedStateIsNotStarted() {
  const ddCase = buildPEDDCaseFromRows([], [], []);
  const validation = validatePEDDCase(ddCase);
  assert(validation.status === "ok", "빈 case는 lineage/finding 참조 무결성 위반이 없어야 함");

  const readiness = buildPEDecisionReadiness({ periods: [], ddCase });
  const dd = readiness.domains.find((d) => d.domain === "DD")!;
  assert(dd.status === "NOT_STARTED", `finding이 0건이면 DD=NOT_STARTED여야 함, got ${dd.status}`);
  console.log("✅ Test 18 — 영속화된 상태가 비어있으면 DD=NOT_STARTED");
}

function testDraftOnlyFindingIsNotStarted() {
  const ddCase = buildPEDDCaseFromRows([], [findingRow({ id: "f1", ddCaseId: "case1", status: "DRAFT" })], []);
  const readiness = buildPEDecisionReadiness({ periods: [], ddCase });
  const dd = readiness.domains.find((d) => d.domain === "DD")!;
  // dd-decision-readiness.ts의 assessDD(): finding이 1건이라도 있으면 PARTIAL(완료
  // 여부는 판정하지 않음) — DRAFT 상태 자체가 NOT_STARTED로 남지 않는다는 점을 확인한다.
  assert(dd.status === "PARTIAL", `finding이 1건 있으면 DRAFT뿐이어도 DD=PARTIAL이어야 함(엔진이 finding 존재 자체로 판정), got ${dd.status}`);
  console.log("✅ Test 19 — DRAFT finding 1건만 있어도 DD=PARTIAL(NOT_STARTED와 구분)");
}

function testConfirmedFindingWithEvidenceValidatesOk() {
  const ddCase = buildPEDDCaseFromRows(
    [],
    [findingRow({ id: "f1", ddCaseId: "case1", status: "CONFIRMED" })],
    [evidenceRow({ id: "e1", ddCaseId: "case1", findingId: "f1" })]
  );
  const validation = validatePEDDCase(ddCase);
  assert(validation.status === "ok", `CONFIRMED + evidence 1건은 유효해야 함, got ${JSON.stringify(validation)}`);
  assert(findUnsupportedFindings(ddCase).length === 0, "evidence가 연결된 CONFIRMED finding은 unsupported가 아니어야 함");
  console.log("✅ Test 20 — evidence로 뒷받침된 CONFIRMED finding → validatePEDDCase() ok");
}

function testConfirmedFindingWithoutEvidenceIsInvalidLineage() {
  // 이 시나리오는 정상적으로는 pe-dd-repository.ts의 쓰기 검증이 막아야 하지만,
  // (예: DB를 우회해 직접 조작된 경우) 읽기 시점에도 dd-lineage.ts의 순수
  // 검증이 이를 놓치지 않는지 방어적으로 확인한다.
  const ddCase = buildPEDDCaseFromRows([], [findingRow({ id: "f1", ddCaseId: "case1", status: "CONFIRMED" })], []);
  const validation = validatePEDDCase(ddCase);
  assert(validation.status === "invalid", "evidence 없는 CONFIRMED는 lineage 검증에서도 invalid여야 함");
  if (validation.status === "invalid") {
    assert(
      validation.issues.some((i) => i.rule === "missing_evidence_for_status"),
      "missing_evidence_for_status 이슈가 있어야 함"
    );
  }
  console.log("✅ Test 21 — (방어적) evidence 없는 CONFIRMED는 읽기 시점 검증에서도 invalid로 잡힘");
}

function testEvidenceSourceAndItemAreSeparateDeterministicNodes() {
  const ddCase = buildPEDDCaseFromRows(
    [],
    [],
    [evidenceRow({ id: "e1", ddCaseId: "case1", sourceName: "DART 2024", excerpt: "매출 100억", confidence: 0.8 })]
  );
  assert(ddCase.lineage.sources.length === 1 && ddCase.lineage.sources[0].id === "e1:source", "source 노드 id는 결정론적으로 합성돼야 함");
  assert(ddCase.lineage.evidence.length === 1 && ddCase.lineage.evidence[0].id === "e1", "evidence 노드 id는 원본 PEEvidence.id와 같아야 함(finding.evidenceIds가 참조하는 값)");
  assert(ddCase.lineage.evidence[0].sourceId === "e1:source", "evidence → source 참조가 일치해야 함");
  console.log("✅ Test 22 — 1개 PEEvidence 행 → source/evidence 노드 2개로 결정론적으로 펼쳐짐");
}

function testDeterminism() {
  const rows: [MAFinancialPeriod[], PEDDFindingRow[], PEEvidenceRow[]] = [
    [period({ id: "p1", maDealId: "deal1" })],
    [findingRow({ id: "f1", ddCaseId: "case1", status: "CONFIRMED", financialPeriodId: "p1" })],
    [evidenceRow({ id: "e1", ddCaseId: "case1", findingId: "f1" })],
  ];
  const a = buildPEDDCaseFromRows(...rows);
  const b = buildPEDDCaseFromRows(...rows);
  assert(JSON.stringify(a) === JSON.stringify(b), "같은 row 입력 → 항상 같은 출력(결정론)");
  console.log("✅ Test 23 — 동일 입력 → 동일 출력(결정론)");
}

function main() {
  console.log("\n=== PE DD & Evidence Persistence Foundation 테스트 ===\n");
  testCategoryEnumMatchesDdTypes();
  testSeverityEnumMatchesDdTypes();
  testFindingStatusEnumMatchesDdTypes();
  testCreateDraftValid();
  testCreateInReviewValid();
  testCreateConfirmedRejected();
  testCreateMitigatedRejected();
  testCreateAcceptedRejected();
  testCreateClosedRejected();
  testCreateRejectedStatusValid();
  testCreateEmptyTitleRejected();
  testUpdateEmptyDescriptionRejected();
  testUpdatePartialPatchIgnoresUnsetFields();
  testAddEvidenceValidConfidence();
  testAddEvidenceConfidenceBoundaries();
  testAddEvidenceConfidenceOutOfRange();
  testAddEvidenceEmptySourceNameRejected();
  testEmptyPersistedStateIsNotStarted();
  testDraftOnlyFindingIsNotStarted();
  testConfirmedFindingWithEvidenceValidatesOk();
  testConfirmedFindingWithoutEvidenceIsInvalidLineage();
  testEvidenceSourceAndItemAreSeparateDeterministicNodes();
  testDeterminism();
  console.log("\n✅ PE DD & Evidence Persistence Foundation 테스트 통과\n");
}

main();
