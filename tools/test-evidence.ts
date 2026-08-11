/**
 * 근거 추적(evidence) 로직 검증 — API 키·DB 불필요.
 *
 * 이 기능은 심사역에게 "이 숫자는 자료에 없습니다"라고 말하는 것이라
 * 오탐이 곧 신뢰 손실이다. 특히 부분 문자열 오매칭(보고서의 45가 자료의
 * 1450에 걸려 '확인됨'으로 뜨는 것)은 있으면 안 된다.
 *
 * Usage: npm run test:evidence
 */
import { traceReportEvidence } from "../src/lib/evidence";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const docs = [
  {
    name: "IR_2026.pdf",
    parsedText:
      "회사 개요\n2019년 설립, 임직원 48명.\n" +
      "재무: ARR 45억원, NRR 118%, 영업이익률 12.5%.\n" +
      "누적 거래액 1,450억원 달성.",
  },
];

function testDocumentMatch() {
  const sections = [
    { sectionKey: "FINANCIAL_STATUS", content: "ARR은 45억원, NRR은 118%입니다." },
  ];
  const { claims, totals, coverage } = traceReportEvidence(sections, docs);

  const arr = claims.find((c) => c.value === "45");
  assert(!!arr, "45억원 주장이 추출되지 않음");
  assert(arr!.status === "document", `45억원이 문서 확인으로 안 잡힘: ${arr!.status}`);
  assert(
    arr!.source?.documentName === "IR_2026.pdf",
    "근거 문서명이 안 붙음"
  );
  assert(
    arr!.source!.snippet.includes("ARR"),
    `발췌에 원문 맥락이 없음: ${arr!.source!.snippet}`
  );

  const nrr = claims.find((c) => c.value === "118");
  assert(nrr?.status === "document", "118%가 문서 확인으로 안 잡힘");

  assert(totals.checked === 2, `주장 수 불일치: ${totals.checked}`);
  assert(coverage === 100, `커버리지 불일치: ${coverage}`);
  console.log("✅ 자료에 있는 수치 → 문서 확인 + 출처 발췌");
}

function testUnverified() {
  const sections = [
    {
      sectionKey: "MARKET",
      // 33억원·27%는 자료 어디에도 없다 (AI가 지어낸 경우)
      content: "시장 규모는 33억원이며 연평균 27% 성장합니다.",
    },
  ];
  const { claims, totals } = traceReportEvidence(sections, docs);

  assert(totals.unverified === 2, `근거 없음 수 불일치: ${totals.unverified}`);
  assert(
    claims.every((c) => c.status === "unverified"),
    "없는 숫자가 확인됨으로 잡힘"
  );
  console.log("✅ 자료에 없는 수치 → 근거 없음");
}

/** 부분 문자열 오매칭 방지: 자료의 1,450억은 45의 근거가 아니다 */
function testNoSubstringFalsePositive() {
  const onlyBig = [{ name: "x.pdf", parsedText: "누적 거래액 1,450억원" }];
  const { claims } = traceReportEvidence(
    [{ sectionKey: "FINANCIAL_STATUS", content: "ARR 45억원" }],
    onlyBig
  );
  const arr = claims.find((c) => c.value === "45");
  assert(
    arr?.status === "unverified",
    `45가 1450에 부분 매칭돼 확인됨으로 잡힘: ${arr?.status}`
  );

  // 반대로 1450 자체는 콤마 표기가 달라도 맞아야 한다
  const { claims: c2 } = traceReportEvidence(
    [{ sectionKey: "FINANCIAL_STATUS", content: "누적 거래액 1450억원" }],
    onlyBig
  );
  assert(
    c2.find((c) => c.value === "1450")?.status === "document",
    "콤마 표기 차이로 매칭 실패"
  );
  console.log("✅ 부분 문자열 오매칭 없음 + 콤마 표기 차이 흡수");
}

function testDealFacts() {
  const sections = [
    { sectionKey: "INVESTMENT_OVERVIEW", content: "투자금액 100억원, Post 800억원." },
  ];
  const { claims } = traceReportEvidence(sections, docs, {
    investAmount: 100,
    valuation: 800,
  });
  assert(
    claims.filter((c) => c.status === "deal").length === 2,
    "딜 입력값이 근거로 안 잡힘"
  );
  console.log("✅ 딜에 직접 입력한 투자금액·밸류 → 딜 입력");
}

/** 노이즈 제외: 연도, 단위 없는 짧은 정수, 자동 품질 메모 */
function testNoiseFiltering() {
  const sections = [
    {
      sectionKey: "OPINION_SUMMARY",
      content:
        "2019년 설립. 3가지 리스크가 있습니다.\n" +
        "임직원 48명.\n\n---\n*DealMind 자동 품질 점수: 78/100*",
    },
  ];
  const { claims } = traceReportEvidence(sections, docs);
  const values = claims.map((c) => c.value);

  assert(!values.includes("2019"), "연도가 주장으로 잡힘");
  assert(!values.includes("3"), "단위 없는 짧은 정수가 주장으로 잡힘");
  assert(!values.includes("78"), "자동 품질 점수가 보고서 주장으로 잡힘");
  assert(values.includes("48"), "임직원 48명이 누락됨");
  console.log("✅ 연도·항목번호·자동 품질 메모는 주장에서 제외");
}

/** 외부 DB에서 온 식별자(NCT 번호 등)는 수치 주장이 아니다 */
function testIdentifiersExcluded() {
  const { claims } = traceReportEvidence(
    [{ sectionKey: "PRODUCT", content: "임상 2상 진행 중 (NCT04567890)." }],
    docs
  );
  assert(
    !claims.some((c) => c.value === "04567890"),
    "NCT 식별자가 수치 주장으로 잡힘"
  );
  console.log("✅ NCT 등 식별자는 주장에서 제외");
}

/** 표 안의 수치는 숫자 바로 앞이 구분자라 행의 첫 칸을 라벨로 써야 한다 */
function testTableLabel() {
  const { claims } = traceReportEvidence(
    [
      {
        sectionKey: "FINANCIAL_STATUS",
        content: "| 구분 | FY24 | FY25 |\n| --- | --- | --- |\n| ARR | 24.7억원 | 45억원 |",
      },
    ],
    docs
  );
  const fy24 = claims.find((c) => c.value === "24.7");
  assert(fy24?.label === "ARR", `표 행 라벨이 안 잡힘: "${fy24?.label}"`);
  console.log("✅ 표 안 수치는 행 첫 칸을 라벨로 사용");
}

/** 근거 없는 항목이 위로 와야 심사역이 먼저 본다 */
function testOrdering() {
  const { claims } = traceReportEvidence(
    [
      {
        sectionKey: "FINANCIAL_STATUS",
        content: "ARR 45억원이고 시장은 33억원입니다.",
      },
    ],
    docs
  );
  assert(claims[0].status === "unverified", "근거 없음이 맨 위가 아님");
  console.log("✅ 근거 없음 항목이 목록 최상단");
}

function main() {
  console.log("\n=== DealMind 근거 추적 테스트 ===\n");
  testDocumentMatch();
  testUnverified();
  testNoSubstringFalsePositive();
  testDealFacts();
  testNoiseFiltering();
  testIdentifiersExcluded();
  testTableLabel();
  testOrdering();
  console.log("\n✅ 근거 추적 테스트 통과\n");
}

main();
