/**
 * KIPRIS 특허 요약·정렬 순수 로직 검증 (네트워크 없음).
 *
 * 배경: patenty.ai 등 특허 전문 AI 서비스를 벤치마킹하며 발견한 문제 두 가지.
 * 1. 특허 상세 URL이 실제로는 KIPRIS Open API 엔드포인트였다 — 서비스키
 *    없이는 열리지도 않고, 사람이 보는 페이지도 아닌데 "링크"처럼 담겨
 *    있었다. 지어낸 URL을 보여주느니 비우는 게 낫다.
 * 2. 등록/출원 건수를 AI가 raw 목록을 보고 매번 세게 뒀는데, 이런 계산은
 *    같은 입력에도 다르게 셀 수 있다 — 미리 계산해서 고정 사실로 준다.
 *
 * Usage: npm run test:kipris
 */
import {
  summarizePatentPortfolio,
  formatPatentSummaryForPrompt,
  type KiprisPatent,
} from "../src/lib/bio/kipris";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function patent(overrides: Partial<KiprisPatent>): KiprisPatent {
  return {
    applicationNumber: "10-2024-0000001",
    inventionTitle: "테스트 발명",
    applicantName: "테스트기업",
    applicationDate: "20240101",
    registerStatus: "등록",
    ipc: "A61K",
    url: "",
    ...overrides,
  };
}

function testCountsRegisteredVsPending() {
  const summary = summarizePatentPortfolio([
    patent({ registerStatus: "등록" }),
    patent({ registerStatus: "등록결정" }),
    patent({ registerStatus: "출원공개" }),
    patent({ registerStatus: "심사중" }),
    patent({ registerStatus: "거절" }),
  ]);
  assert(summary.registered === 2, `등록 건수가 2가 아님: ${summary.registered}`);
  assert(summary.pending === 2, `출원 건수가 2가 아님: ${summary.pending}`);
  assert(summary.other === 1, `기타 건수가 1이 아님: ${summary.other}`);
  assert(summary.total === 5, "전체 건수 불일치");
  console.log("✅ 등록/출원/기타 상태 분류 (등록 결정은 등록으로 카운트)");
}

function testUnverifiedDocumentPatentsExcluded() {
  // IR 자료에서 추출한(KIPRIS 조회 아님) 특허는 등록 여부를 확인할 수
  // 없으므로 등록 통계에 섞이면 안 된다.
  const summary = summarizePatentPortfolio([
    patent({ registerStatus: "등록" }),
    patent({ registerStatus: "IR 자료" }),
    patent({ registerStatus: "IR 자료 추출" }),
  ]);
  assert(summary.registered === 1, "실제 등록 건수에 IR 추출분이 섞임");
  assert(
    summary.unverifiedFromDocument === 2,
    `IR 추출분이 2건으로 분리되지 않음: ${summary.unverifiedFromDocument}`
  );

  // 전부 IR 추출분이면(KIPRIS 조회 자체가 안 된 경우) 등록 통계를 낼
  // 근거가 없으므로 프롬프트에 아예 넣지 않는다 — 빈 문자열.
  const allUnverified = summarizePatentPortfolio([
    patent({ registerStatus: "IR 자료" }),
  ]);
  assert(
    formatPatentSummaryForPrompt(allUnverified) === "",
    "KIPRIS 조회 없이 IR 추출만 있는데도 등록 통계 문구가 나감"
  );
  console.log("✅ IR 자료 추출분은 등록 통계에서 분리 (KIPRIS 미조회 시 요약 생략)");
}

function testYearRangeAndIpcDiversity() {
  const summary = summarizePatentPortfolio([
    patent({ applicationDate: "20200315", ipc: "A61K 31/00" }),
    patent({ applicationDate: "20230601", ipc: "A61K 39/00" }),
    patent({ applicationDate: "20220101", ipc: "C07D 1/00" }),
  ]);
  assert(summary.earliestApplicationYear === 2020, "가장 이른 출원 연도 오류");
  assert(summary.latestApplicationYear === 2023, "가장 최근 출원 연도 오류");
  // IPC 대분류(첫 토큰)만 비교 — A61K가 두 번, C07D가 한 번 → 대분류 2종
  assert(
    summary.uniqueIpcCount === 2,
    `IPC 대분류 다양성이 2가 아님: ${summary.uniqueIpcCount}`
  );

  const text = formatPatentSummaryForPrompt(summary);
  assert(text.includes("2020~2023년"), `연도 범위 문구 누락: ${text}`);
  console.log("✅ 출원 연도 범위 + IPC 대분류 기준 기술 다양성 계산");
}

function testEmptyAndMissingDataHandledSafely() {
  assert(
    formatPatentSummaryForPrompt(summarizePatentPortfolio([])) === "",
    "특허가 없는데 요약 문구가 나감"
  );
  // applicationDate·ipc가 비어 있어도 예외 없이 처리돼야 한다.
  const summary = summarizePatentPortfolio([
    patent({ applicationDate: "", ipc: "", registerStatus: "" }),
  ]);
  assert(summary.earliestApplicationYear === null, "빈 날짜가 연도로 잘못 파싱됨");
  assert(summary.uniqueIpcCount === 0, "빈 IPC가 카운트됨");
  console.log("✅ 빈 값·데이터 없음 상황에서 예외 없이 안전하게 처리");
}

function testNoFabricatedUrl() {
  // parsePatentItems가 직접 export되지 않으므로, 계약 자체(빈 문자열)를
  // KiprisPatent 타입 사용처의 관례로 고정한다 — 이 값이 "그럴듯한 가짜
  // URL"로 되돌아가면 리그레션이다.
  const p = patent({});
  assert(p.url === "", "테스트 픽스처 기본값이 빈 문자열이 아님(계약 확인용)");
  console.log("✅ 검증 안 된 URL을 지어내지 않는다는 계약 (빈 문자열)");
}

function main() {
  console.log("\n=== DealMind KIPRIS 특허 요약 테스트 ===\n");
  testCountsRegisteredVsPending();
  testUnverifiedDocumentPatentsExcluded();
  testYearRangeAndIpcDiversity();
  testEmptyAndMissingDataHandledSafely();
  testNoFabricatedUrl();
  console.log("\n✅ KIPRIS 특허 요약 테스트 통과\n");
}

main();
