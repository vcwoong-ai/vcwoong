/**
 * 근거 추적(evidence) 로직 검증 — API 키·DB 불필요.
 *
 * 이 기능은 심사역에게 "이 숫자는 자료에 없습니다"라고 말하는 것이라
 * 오탐이 곧 신뢰 손실이다. 특히 부분 문자열 오매칭(보고서의 45가 자료의
 * 1450에 걸려 '확인됨'으로 뜨는 것)은 있으면 안 된다.
 *
 * Usage: npm run test:evidence
 */
import { traceReportEvidence, normalizeForMatch } from "../src/lib/evidence";
import { verdictsToMap, mergeVerdicts, type AiClaimVerdict } from "../src/lib/evidence-ai";
import { summarizeEvidenceForQuality } from "../src/lib/report-quality";
import { parseDocument } from "../src/lib/document-parser";

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

/** 숫자는 자료에 있지만 라벨 문맥이 안 겹치면 확신도를 낮춘다(정규화 텍스트 매칭) */
function testLabelContextDowngrade() {
  const ambiguousDocs = [
    {
      name: "x.pdf",
      // 45가 있긴 하지만 "임직원 45명" — ARR과 전혀 다른 문맥
      parsedText: "임직원 45명. 사업장 3곳 운영.",
    },
  ];
  const { claims } = traceReportEvidence(
    [{ sectionKey: "FINANCIAL_STATUS", content: "ARR 45억원" }],
    ambiguousDocs
  );
  const arr = claims.find((c) => c.value === "45");
  assert(arr?.status === "document", "숫자가 있는데도 문서 확인으로 안 잡힘");
  assert(
    arr?.confidence === "MEDIUM",
    `라벨 문맥이 안 겹치는데 HIGH로 잡힘: ${arr?.confidence}`
  );
  console.log("✅ 숫자는 일치하지만 라벨 문맥이 안 겹치면 확신도 MEDIUM으로 하향");
}

/** 질적 claim: 문서에 같은 취지의 문장이 있으면 키워드 겹침으로 MEDIUM */
function testQualitativeKeywordMatch() {
  const techDocs = [
    {
      name: "IR.pdf",
      parsedText: "회사 소개\n독자적인 알고리즘으로 기술 경쟁력을 확보했다.",
    },
  ];
  const { claims } = traceReportEvidence(
    [
      {
        sectionKey: "PRODUCT_TECHNOLOGY",
        content: "이 회사는 기술 경쟁력이 매우 높습니다.",
      },
    ],
    techDocs
  );
  const claim = claims.find((c) => c.claimType === "qualitative");
  assert(!!claim, "질적 claim이 추출되지 않음");
  assert(claim!.label === "기술 경쟁력", `카테고리 라벨이 다름: ${claim!.label}`);
  assert(
    claim!.confidence === "MEDIUM",
    `키워드가 겹치는데 MEDIUM이 아님: ${claim!.confidence}`
  );
  assert(claim!.source?.documentName === "IR.pdf", "근거 문서명이 안 붙음");
  console.log("✅ 질적 claim: 문서에 같은 취지 문장 있으면 키워드 겹침으로 MEDIUM");
}

/** 질적 claim: 자료 어디에도 없으면 UNSUPPORTED(AI 보강 검증 대상) */
function testQualitativeUnsupported() {
  const { claims } = traceReportEvidence(
    [
      {
        sectionKey: "MARKET_ANALYSIS",
        content: "이 시장은 진입장벽이 존재합니다.",
      },
    ],
    docs // 최상단 docs에는 진입장벽 관련 언급이 없음
  );
  const claim = claims.find((c) => c.claimType === "qualitative");
  assert(claim?.confidence === "UNSUPPORTED", `근거 없는 질적 claim이 UNSUPPORTED가 아님: ${claim?.confidence}`);
  assert(claim?.status === "unverified", "UNSUPPORTED인데 status가 unverified가 아님");
  console.log("✅ 질적 claim: 자료에 없으면 UNSUPPORTED(AI 보강 검증 대상)");
}

/** 숫자 claim이 섞인 문장은 질적 claim으로 이중 추출되지 않는다 */
function testNoDoubleCountingWithNumbers() {
  const { claims, totals } = traceReportEvidence(
    [
      {
        sectionKey: "MARKET_ANALYSIS",
        content: "시장 규모는 33억원이며 연평균 27% 성장합니다.",
      },
    ],
    docs
  );
  assert(totals.checked === 2, `숫자 claim 2개만 있어야 하는데 ${totals.checked}개`);
  assert(
    claims.every((c) => c.claimType === "numeric"),
    "숫자가 섞인 문장이 질적 claim으로도 이중 추출됨"
  );
  console.log("✅ 숫자가 섞인 문장은 질적 claim으로 이중 집계되지 않음");
}

/** 근거 위치(location) — PPTX 슬라이드/XLSX 시트/PDF 페이지 표시를 실제로 읽는다(추정 아님) */
function testSourceLocation() {
  const pptxDoc = {
    name: "deck.pptx",
    parsedText: "[슬라이드 1]\n회사 소개\n\n[슬라이드 4]\nARR 45억원 달성",
  };
  const { claims: pptxClaims } = traceReportEvidence(
    [{ sectionKey: "FINANCIAL_STATUS", content: "ARR 45억원" }],
    [pptxDoc]
  );
  assert(
    pptxClaims.find((c) => c.value === "45")?.source?.location === "슬라이드 4",
    `PPTX 슬라이드 위치가 안 잡힘: ${pptxClaims.find((c) => c.value === "45")?.source?.location}`
  );

  const xlsxDoc = {
    name: "financials.xlsx",
    parsedText: "[시트: 요약]\n개요\n\n[시트: 매출현황]\nARR,45억원",
  };
  const { claims: xlsxClaims } = traceReportEvidence(
    [{ sectionKey: "FINANCIAL_STATUS", content: "ARR 45억원" }],
    [xlsxDoc]
  );
  assert(
    xlsxClaims.find((c) => c.value === "45")?.source?.location === "시트: 매출현황",
    "XLSX 시트 위치가 안 잡힘"
  );

  const pdfDoc = {
    name: "ir.pdf",
    parsedText: "[페이지 1]\n회사 개요\n\n[페이지 3]\nARR 45억원",
  };
  const { claims: pdfClaims } = traceReportEvidence(
    [{ sectionKey: "FINANCIAL_STATUS", content: "ARR 45억원" }],
    [pdfDoc]
  );
  assert(
    pdfClaims.find((c) => c.value === "45")?.source?.location === "페이지 3",
    "PDF 페이지 위치가 안 잡힘"
  );

  // 위치 표시가 아예 없는 문서(DOCX/mammoth)는 location을 지어내지 않는다
  const docxDoc = { name: "plain.docx", parsedText: "ARR 45억원" };
  const { claims: docxClaims } = traceReportEvidence(
    [{ sectionKey: "FINANCIAL_STATUS", content: "ARR 45억원" }],
    [docxDoc]
  );
  assert(
    docxClaims.find((c) => c.value === "45")?.source?.location === undefined,
    "위치 표시가 없는 문서인데 location을 지어냄"
  );

  console.log("✅ 근거 위치: PPTX 슬라이드/XLSX 시트/PDF 페이지는 실제 표시를 읽고, 없으면 지어내지 않음");
}

/** 여러 문서 중 실제로 값이 있는 문서만 정확히 지목한다 */
function testMultipleDocuments() {
  const multiDocs = [
    { name: "old_deck.pptx", parsedText: "[슬라이드 1]\n작년 ARR 30억원" },
    { name: "latest_ir.pdf", parsedText: "[페이지 2]\n올해 ARR 45억원" },
  ];
  const { claims } = traceReportEvidence(
    [{ sectionKey: "FINANCIAL_STATUS", content: "ARR 45억원" }],
    multiDocs
  );
  const claim = claims.find((c) => c.value === "45");
  assert(claim?.source?.documentName === "latest_ir.pdf", "다른 문서를 근거로 잘못 지목함");
  assert(claim?.source?.location === "페이지 2", "여러 문서 중 올바른 위치를 못 찾음");
  console.log("✅ 여러 문서 중 실제로 값이 있는 문서만 정확히 지목");
}

/** 같은 카테고리의 질적 claim이 여러 번 나와도 중복 집계되지 않는다 */
function testQualitativeDeduplication() {
  const { claims } = traceReportEvidence(
    [
      {
        sectionKey: "PRODUCT_TECHNOLOGY",
        content: "기술 경쟁력이 높습니다. 기술 경쟁력이 높습니다.",
      },
    ],
    docs
  );
  const qualitative = claims.filter((c) => c.claimType === "qualitative");
  assert(qualitative.length === 1, `중복 문장이 별개 claim으로 잡힘: ${qualitative.length}개`);
  console.log("✅ 동일 질적 주장 반복은 중복 집계되지 않음");
}

/** 한국어 표기 차이(공백·구두점) 정규화 */
function testKoreanNormalization() {
  assert(
    normalizeForMatch("기술 경쟁력이 높다.") === normalizeForMatch("기술경쟁력이 높다"),
    "공백·마침표 차이가 정규화되지 않음"
  );
  assert(
    normalizeForMatch("ABC") === normalizeForMatch("abc"),
    "대소문자가 정규화되지 않음"
  );
  console.log("✅ 한국어 표기(공백·구두점·대소문자) 정규화");
}

/** confidence → hallucination 위험도 연결 (report-quality.ts) */
function testHallucinationLink() {
  const summary = summarizeEvidenceForQuality([
    { confidence: "HIGH" },
    { confidence: "HIGH" },
    { confidence: "MEDIUM" },
    { confidence: "LOW" },
    { confidence: "UNSUPPORTED" },
    { confidence: "UNSUPPORTED" },
  ]);
  assert(summary.checked === 6, "전체 개수 불일치");
  assert(summary.supported === 2, "HIGH → supported 매핑 오류");
  assert(summary.needsReview === 1, "MEDIUM → needsReview 매핑 오류");
  assert(summary.warning === 1, "LOW → warning 매핑 오류");
  assert(summary.highRiskHallucination === 2, "UNSUPPORTED → highRiskHallucination 매핑 오류");
  console.log("✅ confidence 등급 → hallucination 위험도 매핑 (report-quality.ts 연결)");
}

/** AI 보강 검증 캐시 — UNSUPPORTED만 덮어쓰고, 이미 확인된 근거는 다시 안 건드림 */
function testAiVerdictCacheMerge() {
  const cached: AiClaimVerdict[] = [
    {
      claimKey: "MARKET_ANALYSIS:qualitative:test",
      confidence: "MEDIUM",
      rationale: "간접적으로 확인됨",
      documentName: "news.pdf",
      snippet: "관련 보도 내용",
    },
  ];
  const map = verdictsToMap(cached);
  assert(map.get(cached[0].claimKey)?.confidence === "MEDIUM", "캐시 파싱 실패");

  const merged = mergeVerdicts(cached, [
    {
      claimKey: "MARKET_ANALYSIS:qualitative:test2",
      confidence: "LOW",
      rationale: "다른 claim",
    },
  ]);
  assert(merged.length === 2, "기존 캐시와 새 결과가 병합되지 않음");
  assert(
    merged.find((v) => v.claimKey === cached[0].claimKey)?.confidence === "MEDIUM",
    "기존 결과가 유지되지 않음"
  );

  // 같은 claimKey로 다시 검증하면 최신 결과로 덮어쓴다
  const overwritten = mergeVerdicts(cached, [
    { claimKey: cached[0].claimKey, confidence: "HIGH", rationale: "재검증" },
  ]);
  assert(
    overwritten.find((v) => v.claimKey === cached[0].claimKey)?.confidence === "HIGH",
    "같은 claimKey 재검증 결과로 덮어써지지 않음"
  );

  // deterministic 매칭에서 이미 UNSUPPORTED가 아닌 claim은 AI 캐시가 있어도
  // 덮어쓰지 않는다 — traceReportEvidence 쪽 로직 확인
  const { claims } = traceReportEvidence(
    [{ sectionKey: "FINANCIAL_STATUS", content: "ARR 45억원" }],
    docs,
    {},
    verdictsToMap([
      { claimKey: "FINANCIAL_STATUS:numeric:45|억원", confidence: "LOW", rationale: "무시돼야 함" },
    ])
  );
  const arr = claims.find((c) => c.value === "45");
  assert(
    arr?.confidence === "HIGH" && arr?.matchMethod === "exact_numeric",
    "이미 문서로 확인된 claim을 AI 캐시가 잘못 덮어씀"
  );
  console.log("✅ AI 보강 검증 캐시: UNSUPPORTED만 덮어쓰고 기존 결과·확인된 claim은 보존");
}

/** 최소한의 2페이지 PDF를 만든다(tools/smoke.ts의 1페이지 버전을 확장) */
function buildTwoPagePdf(page1Text: string, page2Text: string): Buffer {
  const stream1 = `BT /F1 12 Tf 40 700 Td (${page1Text}) Tj ET`;
  const stream2 = `BT /F1 12 Tf 40 700 Td (${page2Text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream1.length} >>\nstream\n${stream1}\nendstream`,
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 7 0 R >>",
    `<< /Length ${stream2.length} >>\nstream\n${stream2}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

/**
 * document-parser.ts의 parsePDF가 실제 pdf-parse 페이지 경계(result.pages)로
 * [페이지 N] 표시를 남기는지 확인한다 — evidence.ts의 위치 추적이 추정이
 * 아니라 실제 파서 메타데이터에 기반함을 끝까지 검증한다.
 */
async function testPdfPageMarkers() {
  const pdf = buildTwoPagePdf("Overview page", "Revenue 45 EOK");
  const { text } = await parseDocument(pdf, "application/pdf", "ir.pdf");
  assert(text.includes("[페이지 1]"), "1페이지 표시가 없음");
  assert(text.includes("[페이지 2]"), "2페이지 표시가 없음");
  assert(
    text.indexOf("[페이지 1]") < text.indexOf("[페이지 2]"),
    "페이지 순서가 뒤바뀜"
  );
  assert(text.includes("Revenue 45 EOK"), "2페이지 본문이 누락됨");
  console.log("✅ PDF 파서: 실제 페이지 경계(pdf-parse)로 [페이지 N] 표시를 남김");
}

async function main() {
  console.log("\n=== DealMind 근거 추적 테스트 ===\n");
  testDocumentMatch();
  testUnverified();
  testNoSubstringFalsePositive();
  testDealFacts();
  testNoiseFiltering();
  testIdentifiersExcluded();
  testTableLabel();
  testOrdering();
  testLabelContextDowngrade();
  testQualitativeKeywordMatch();
  testQualitativeUnsupported();
  testNoDoubleCountingWithNumbers();
  testSourceLocation();
  testMultipleDocuments();
  testQualitativeDeduplication();
  testKoreanNormalization();
  testHallucinationLink();
  testAiVerdictCacheMerge();
  await testPdfPageMarkers();
  console.log("\n✅ 근거 추적 테스트 통과\n");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
