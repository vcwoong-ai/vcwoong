/**
 * PE Data Room 뷰 모델(pe-data-room-view-model.ts, PR #106) 검증.
 *
 * buildPEDataRoomViewModel()은 새 evidence/finding을 만들지 않는다(순수
 * 조립) — 이 파일은 그 계약과 fabrication 방지를 확인한다.
 *
 * Usage: npm run test:pe-data-room-view-model
 */
import {
  buildPEDataRoomViewModel,
  type DataRoomDocumentRow,
  type DataRoomEvidenceRow,
  type DataRoomFindingRow,
} from "../src/lib/pe/pe-data-room-view-model";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function doc(overrides: Partial<DataRoomDocumentRow> & { id: string }): DataRoomDocumentRow {
  return { name: "문서.pdf", type: "DD_MATERIAL", size: 1000, mimeType: "application/pdf", createdAt: "2024-01-01T00:00:00.000Z", ...overrides };
}

function ev(overrides: Partial<DataRoomEvidenceRow> & { id: string }): DataRoomEvidenceRow {
  return { documentId: null, findingId: null, sourceName: "출처", sourceLocation: null, excerpt: null, confidence: null, ...overrides };
}

function finding(overrides: Partial<DataRoomFindingRow> & { id: string }): DataRoomFindingRow {
  return { title: "finding", category: "FINANCIAL", severity: "MEDIUM", status: "DRAFT", ...overrides };
}

// ── No fabrication ────────────────────────────────────────────────────

function test1_emptyStateNoFabrication() {
  const vm = buildPEDataRoomViewModel([], [], []);
  assert(vm.documents.length === 0 && vm.summary.documentCount === 0, "문서가 없으면 빈 목록이어야 함(가짜 문서 생성 금지)");
  console.log("✅ Test 1 — 빈 상태: 문서/요약 모두 0(fabrication 없음)");
}

function test2_documentWithNoEvidenceRendersEmpty() {
  const vm = buildPEDataRoomViewModel([doc({ id: "d1" })], [], []);
  assert(vm.documents[0].linkedEvidence.length === 0, "근거가 없는 문서는 빈 배열이어야 함(가짜 근거 생성 금지)");
  assert(vm.summary.evidenceLinkedDocumentCount === 0, "근거 연결 문서 수는 0이어야 함");
  console.log("✅ Test 2 — 근거 없는 문서는 linkedEvidence=[](가짜 근거 없음)");
}

// ── Linking ────────────────────────────────────────────────────────────

function test3_evidenceLinkedToCorrectDocument() {
  const vm = buildPEDataRoomViewModel(
    [doc({ id: "d1" }), doc({ id: "d2" })],
    [ev({ id: "e1", documentId: "d1" })],
    []
  );
  const d1 = vm.documents.find((d) => d.id === "d1")!;
  const d2 = vm.documents.find((d) => d.id === "d2")!;
  assert(d1.linkedEvidence.length === 1 && d1.linkedEvidence[0].id === "e1", "evidence는 실제 documentId가 일치하는 문서에만 연결돼야 함");
  assert(d2.linkedEvidence.length === 0, "다른 문서에는 연결되지 않아야 함(교차 연결 금지)");
  console.log("✅ Test 3 — evidence는 정확히 일치하는 문서에만 연결됨");
}

function test4_findingLookupResolved() {
  const vm = buildPEDataRoomViewModel(
    [doc({ id: "d1" })],
    [ev({ id: "e1", documentId: "d1", findingId: "f1" })],
    [finding({ id: "f1", title: "고객 집중도 이슈" })]
  );
  const linkedEv = vm.documents[0].linkedEvidence[0];
  assert(linkedEv.linkedFinding?.title === "고객 집중도 이슈", "findingId가 있으면 실제 finding 정보로 연결돼야 함");
  console.log("✅ Test 4 — evidence→finding 연결이 실제 finding 데이터로 해석됨");
}

function test5_evidenceWithoutFindingHasNoLinkedFinding() {
  const vm = buildPEDataRoomViewModel([doc({ id: "d1" })], [ev({ id: "e1", documentId: "d1", findingId: null })], []);
  assert(vm.documents[0].linkedEvidence[0].linkedFinding === undefined, "findingId가 없으면 linkedFinding을 지어내면 안 됨");
  console.log("✅ Test 5 — finding 미연결 evidence는 linkedFinding=undefined(추론 없음)");
}

function test6_evidenceWithoutDocumentIdNotCounted() {
  const vm = buildPEDataRoomViewModel([doc({ id: "d1" })], [ev({ id: "e1", documentId: null })], []);
  assert(vm.documents[0].linkedEvidence.length === 0, "documentId가 없는 evidence(DD case 레벨 근거)는 어떤 문서에도 붙지 않아야 함");
  assert(vm.summary.totalEvidenceCount === 0, "문서에 연결되지 않은 evidence는 총 evidence 수에 포함하지 않아야 함");
  console.log("✅ Test 6 — documentId 없는 evidence는 문서 목록/합계에 나타나지 않음");
}

// ── Summary ────────────────────────────────────────────────────────────

function test7_summaryCountsAccurate() {
  const vm = buildPEDataRoomViewModel(
    [doc({ id: "d1" }), doc({ id: "d2" }), doc({ id: "d3" })],
    [ev({ id: "e1", documentId: "d1" }), ev({ id: "e2", documentId: "d1" }), ev({ id: "e3", documentId: "d2" })],
    []
  );
  assert(vm.summary.documentCount === 3, "문서 수가 정확해야 함");
  assert(vm.summary.evidenceLinkedDocumentCount === 2, "근거가 연결된 문서 수(d1,d2)가 정확해야 함(d3 제외)");
  assert(vm.summary.totalEvidenceCount === 3, "총 근거 수가 정확해야 함");
  console.log("✅ Test 7 — summary 집계가 정확함(3문서/2건 연결/근거 3건)");
}

function test8_determinism() {
  const args: [DataRoomDocumentRow[], DataRoomEvidenceRow[], DataRoomFindingRow[]] = [
    [doc({ id: "d1" })],
    [ev({ id: "e1", documentId: "d1", findingId: "f1" })],
    [finding({ id: "f1" })],
  ];
  const a = buildPEDataRoomViewModel(...args);
  const b = buildPEDataRoomViewModel(...args);
  assert(JSON.stringify(a) === JSON.stringify(b), "같은 입력 → 같은 출력(결정론)");
  console.log("✅ Test 8 — 동일 입력 → 동일 출력(결정론)");
}

function main() {
  console.log("\n=== PE Data Room 뷰 모델 테스트 ===\n");
  test1_emptyStateNoFabrication();
  test2_documentWithNoEvidenceRendersEmpty();
  test3_evidenceLinkedToCorrectDocument();
  test4_findingLookupResolved();
  test5_evidenceWithoutFindingHasNoLinkedFinding();
  test6_evidenceWithoutDocumentIdNotCounted();
  test7_summaryCountsAccurate();
  test8_determinism();
  console.log("\n✅ PE Data Room 뷰 모델 테스트 통과\n");
}

main();
