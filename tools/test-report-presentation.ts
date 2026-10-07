import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import JSZip from "jszip";
import { reportCharts, buildReportPresentation, validReportChart } from "../src/lib/report-presentation";
import { computeReportDecision } from "../src/lib/vc-decision-loader";
import type { NumericClaim } from "../src/lib/evidence";
import { generateReportDOCX } from "../src/lib/docx-export";
import { generateReportPPTX } from "../src/lib/pptx-export";
import type { ReportWithSections } from "../src/types";

function claim(label: string, value: string, unit = "억원", extra: Partial<NumericClaim> = {}): NumericClaim {
  return { claimKey: `${label}:${value}:${unit}`, sectionKey: "FINANCIAL_ANALYSIS", raw: value + unit, label, value, unit,
    claimType: "numeric", status: "document", confidence: "HIGH", matchMethod: "exact_numeric",
    source: { documentName: "합성 재무자료", location: "표 1", snippet: `${label} ${extra.negative ? "-" : ""}${value}${unit}` }, ...extra };
}

async function main() {
  const points = [claim("2024년 영업이익 실적", "0"), claim("2025년 영업이익 실적", "1200", "백만원", { negative: true }),
    claim("2026년 영업이익 전망", "2")];
  const charts = reportCharts(points);
  assert.equal(charts.length, 1);
  assert.deepEqual(charts[0].points.map(point => point.value), [0, -12, 2]);
  assert.equal(charts[0].points[2].scenario, "FORECAST");
  assert.equal(charts[0].unit, "억원");
  assert(validReportChart(charts[0]));
  assert.equal(reportCharts([points[0], claim("2025년 매출 실적", "10")]).length, 0, "different metrics cannot share a chart");
  assert.equal(reportCharts([points[0], claim("2025년 영업이익 실적", "3"), claim("2025년 영업이익 실적", "4")]).length, 0);
  for (const invalid of [claim("영업이익 실적", "4"), claim("2025년 Q1 영업이익 실적", "4"),
    claim("2025년 영업이익", "4"), claim("2025년 영업이익 실적", "4", "%"),
    claim("2025년 영업이익 실적", "4", "억원", { status: "unverified" }),
    claim("2025년 영업이익 실적", "4", "억원", { source: { documentName: "", snippet: "2025년 영업이익 실적 4억원" } }),
    claim("2025년 영업이익 실적", "4", "억원", { source: { documentName: "자료", snippet: "2025년 영업이익 실적 -4억원" } }),
    claim("2025년 영업이익 실적", "4", "억원", { source: { documentName: "자료", snippet: "2025년 매출 실적 4억원, 영업이익 실적 2억원" } }),
    claim("2025년 영업이익 실적", "4", "억원", { source: { documentName: "자료", snippet: "2023년 매출 전망 4억원" } })]) {
    assert.equal(reportCharts([points[0], invalid]).length, 0, invalid.label);
  }
  const result = computeReportDecision({ sections: [], deal: { investAmount: 20, valuation: 100, documents: [], score: null }, evidenceCheck: null, icQuestions: null });
  assert.equal(buildReportPresentation(result, "합성회사").recommendation, "판단 준비 중");
  const ready = { ...result, hasScore: true, assessmentBasis: "report_evidence" as const, gate: { ok: true } };
  ready.evidence = { ...result.evidence, claims: points };
  ready.decision = { ...result.decision, drivers: Array.from({ length: 5 }, (_, index) => ({ id: String(index), dimension: "product" as const,
    title: `투자 근거 ${index}`, description: `원문 상세 ${index}`, whyItMatters: "판단 이유", evidenceState: "VERIFIED" as const,
    evidence: [{ raw: "원문", documentName: "합성 자료" }], whatCouldInvalidate: "재검토", verificationRequirement: "확인", decisionImpact: "HIGH" as const })) };
  const presentation = buildReportPresentation(ready, "합성회사");
  const module = { exports: {} as { ReportBrief: React.ComponentType<{ presentation: typeof presentation; print?: boolean }> } };
  const require = createRequire(import.meta.url);
  const compiled = ts.transpileModule(readFileSync("src/components/reports/report-brief.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, require: (name: string) => name.endsWith(".css") ? { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) } : require(name) });
  const html = renderToStaticMarkup(React.createElement(module.exports.ReportBrief, { presentation: { ...presentation, companyName: "<합성회사>" }, print: true }));
  assert(html.includes("&lt;합성회사&gt;") && html.includes('role="img"') && html.includes("<table>") && html.includes("-12") && html.includes("합성 재무자료"));
  assert.equal(presentation.reasons.length, 3);
  assert.equal(presentation.totals.reasons, 5);
  assert(presentation.sections.some(section => section.content.includes("원문 상세 4")), "hidden brief items remain in appendix");
  const failed = buildReportPresentation({ ...ready, gate: { ok: false } }, "합성회사");
  assert.equal(failed.ready, false); assert.equal(failed.terms.length, 0); assert.equal(failed.reasons.length, 0);
  assert.equal(buildReportPresentation({ ...ready, assessmentBasis: "no_report" }, "합성회사").ready, false);
  assert.equal(buildReportPresentation({ ...ready, assessmentBasis: null }, "합성회사").ready, false);
  const grounded = computeReportDecision({ sections: [{ sectionKey: "FINANCIAL_ANALYSIS", title: "재무", content: "2024년 매출 실적 12억원\n2025년 매출 전망 20억원" }],
    deal: { investAmount: null, valuation: null, score: null, documents: [
      { name: "2024 합성자료", parsedText: "2024년 매출 실적 12억원" }, { name: "2025 합성자료", parsedText: "2025년 매출 전망 20억원" }] }, evidenceCheck: null, icQuestions: null });
  assert.equal(reportCharts(grounded.evidence.claims).length, 1, "real evidence tracing must retain annual labels and sources");
  const table = { title: "긴 표", content: "| 항목 | 값 |\n| --- | --- |\n" + Array.from({ length: 35 }, (_, index) => `| ROW_${index} | 상세 ${index} |`).join("\n") };
  const docx = await JSZip.loadAsync(await generateReportDOCX({ deal: { companyName: "합성회사" }, agentType: "IT_SAAS", sections: [] } as unknown as ReportWithSections, [...presentation.sections, table]));
  const word = await docx.file("word/document.xml")!.async("text");
  assert(word.includes("<w:tbl>"), "Word tables must remain actual tables");
  assert(word.includes("ROW_34") && word.includes("원문 상세 4") && word.includes("합성 재무자료"));
  const pptx = await JSZip.loadAsync(await generateReportPPTX([...presentation.sections, table], { companyName: "합성회사" }, [], charts));
  const slides = (await Promise.all(Object.keys(pptx.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).map(name => pptx.file(name)!.async("text")))).join("\n");
  assert(slides.includes("ROW_34") && slides.includes("원문 상세 4") && slides.includes("합성 재무자료"));
  assert(Object.keys(pptx.files).some(name => /^ppt\/charts\/chart\d+\.xml$/.test(name)));
  console.log("PASS: grounded charts, incomplete decisions, full appendix and Word/PPTX data preservation");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
