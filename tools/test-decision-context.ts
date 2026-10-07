import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import JSZip from "jszip";
import { annualFinancialFact, buildDecisionContext, type MeetingReferenceInput } from "../src/lib/decision-context";
import * as policy from "../src/lib/meetings/policy";
import { computeReportDecision, REPORT_FOR_PRESENTATION_INCLUDE } from "../src/lib/vc-decision-loader";
import { buildReportPresentation } from "../src/lib/report-presentation";
import { generateReportDOCX } from "../src/lib/docx-export";
import { generateReportPPTX } from "../src/lib/pptx-export";
import type { ReportWithSections } from "../src/types";

const date = new Date("2026-10-07T00:00:00Z");
function meeting(text = "2025년 매출 실적 30억원", extra: Partial<MeetingReferenceInput> = {}): MeetingReferenceInput {
  return { id: "synthetic-meeting", title: "합성 회사 미팅", occurredAt: date, approvedAt: date, status: "APPROVED", deletedAt: null,
    version: 3, durationSeconds: 60, transcript: JSON.stringify([{ start: 10, end: 20, text }]),
    minutes: JSON.stringify({ summary: "경영진 진술 검토", claims: [{ text, start: 10, end: 20, verification: "VERIFIED", note: "사용자 확인 메모" }],
      questions: ["회계 기준 확인"], actions: ["감사보고서 요청"] }), ...extra };
}
const doc = (text: string) => ({ id: "synthetic-doc", name: "합성 IR", parsedText: `[슬라이드 2]\n${text}` });
function context(text: string, reference = meeting()) {
  return buildDecisionContext({ sections: [], documents: [doc(text)], meetings: [reference] });
}
async function main() {
  const result = context("2025년 매출 실적 20억원");
  assert.equal(result.meetings.length, 1); assert.equal(result.comparisonCount, 1);
  assert.equal(result.meetings[0].claims[0].comparisons[0].location, "슬라이드 2");
  assert.equal(result.meetings[0].claims[0].state, "사용자 확인 메모 있음");
  const require = createRequire(import.meta.url), component: Record<string, any> = {};
  vm.runInNewContext(ts.transpileModule(readFileSync("src/components/reports/report-context.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText, { exports: component, require: (name: string) => name === "next/link"
    ? { __esModule: true, default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, props.children) } : require(name) });
  const html = renderToStaticMarkup(React.createElement(component.ReportContext, { context: result, dealId: "synthetic-deal" }));
  assert(html.includes("30억원") && html.includes("20억원") && html.includes("<details>") && html.includes("version=3"));
  assert.equal(renderToStaticMarkup(React.createElement(component.ReportContext, { context: buildDecisionContext({ sections: [], documents: [] }) })), "");
  for (const text of ["2024년 매출 실적 20억원", "2025년 매출 전망 20억원", "2025년 영업이익 실적 20억원",
    "2025년 연결 매출 실적 20억원", "2025년 1분기 매출 실적 20억원", "매출 실적 20억원", "2025년 매출 실적 3,000백만원"]) {
    assert.equal(context(text).comparisonCount, 0, text);
  }
  assert.equal(context("2025년 영업이익 실적 0억원", meeting("2025년 영업이익 실적 -2억원")).comparisonCount, 1);
  for (const text of ["매출 실적 2025억원", "올해 매출 실적 10억원", "2025년 매출 실적 10억 달러", "2025년 매출 실적 10억",
    "2025년 매출 실적 10억원, 영업이익 실적 2억원", "2025년 매출 실적 10억원, 전망 12억원",
    "2025년 매출 실적 30~40억원", "2025년 매출 실적 약 30억원", "2025년 6월 매출 실적 30억원",
    "2025년 매출 실적 1e3억원"]) assert.equal(annualFinancialFact(text), null, text);
  const paraphrase = meeting("2025년 매출 실적 30억원", { transcript: JSON.stringify([{ start: 10, end: 20, text: "2025년 매출 실적 25억원" }]) });
  assert.equal(context("2025년 매출 실적 20억원", paraphrase).comparisonCount, 0, "a changed number cannot be treated as located in transcript");
  const boundary = meeting(undefined, { transcript: JSON.stringify([{ start: 20, end: 30, text: "전사" }]) });
  assert.equal(context("2025년 매출 실적 20억원", boundary).meetings[0].claims[0].sourceLocated, false);
  for (const extra of [{ status: "DRAFT" }, { deletedAt: date }, { approvedAt: null }]) assert.equal(context("", meeting(undefined, extra)).meetings.length, 0);
  const invalid = context("", meeting(undefined, { minutes: "invalid json" }));
  assert.equal(invalid.unavailableMeetings, 1); assert.equal(invalid.meetings.length, 0);
  const claim = { sectionKey: "FINANCIAL_ANALYSIS", claim: "고객 20곳", verdict: "지지", rationale: "합성 AI 대조",
    sources: [{ title: "합성 외부 원문", url: "https://example.com/evidence", source: "web" }] };
  const research = { claims: [claim], computedAt: new Date("2026-10-06T00:00:00Z"), updatedAt: date, modelUsed: "search+ai" };
  const researched = buildDecisionContext({ sections: [{ sectionKey: claim.sectionKey, content: "고객 20곳" }], documents: [], research });
  assert.equal(researched.research[0].verdict, "지지"); assert.equal(researched.research[0].computedAt, date.toISOString());
  const changed = buildDecisionContext({ sections: [{ sectionKey: claim.sectionKey, content: "고객 25곳" }], documents: [], research });
  assert.equal(changed.research[0].needsRefresh, true); assert.equal(changed.research[0].verdict, "불명확");
  const later = buildDecisionContext({ sections: [{ sectionKey: claim.sectionKey, content: claim.claim, updatedAt: new Date(date.getTime() + 1000) }], documents: [], research });
  assert.equal(later.research[0].needsRefresh, true);
  const noSources = buildDecisionContext({ sections: [{ sectionKey: claim.sectionKey, content: claim.claim }], documents: [], research: { ...research,
    claims: [{ ...claim, sources: [{ title: "unsafe", url: "javascript:alert(1)" }, { title: "credentials", url: "https://user:password@example.com" }] }] } });
  assert.equal(noSources.research[0].sources.length, 0); assert.equal(noSources.research[0].verdict, "불명확");
  const input = { sections: [{ sectionKey: "FINANCIAL_ANALYSIS", title: "재무", content: "2025년 매출 실적 20억원" }],
    deal: { investAmount: null, valuation: null, documents: [doc("2025년 매출 실적 20억원")], score: null }, evidenceCheck: null, icQuestions: null };
  const base = computeReportDecision(input), linked = computeReportDecision({ ...input, deal: { ...input.deal, meetings: [meeting()] }, deepDive: research });
  assert.deepEqual(linked.decision, base.decision, "references must not silently replace the investment decision");
  assert.deepEqual(linked.evidence, base.evidence, "company statements must not become document-verified claims");
  const presentation = buildReportPresentation(linked, "합성회사");
  assert(presentation.sections.some(section => section.content.includes("감사보고서 요청")));
  const word = await JSZip.loadAsync(await generateReportDOCX({ deal: { companyName: "합성회사" }, agentType: "IT_SAAS", sections: [] } as unknown as ReportWithSections, presentation.sections));
  assert((await word.file("word/document.xml")!.async("text")).includes("감사보고서 요청"));
  const pptx = await JSZip.loadAsync(await generateReportPPTX(presentation.sections, { companyName: "합성회사" }));
  const slides = (await Promise.all(Object.keys(pptx.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).map(name => pptx.file(name)!.async("text")))).join("\n");
  assert(slides.includes("감사보고서 요청") && slides.includes("슬라이드 2") && slides.includes("30억원"));
  const compiled = ts.transpileModule(readFileSync("src/lib/decision-context.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const enabled of ["0", "1"]) {
    const exports: Record<string, any> = {};
    vm.runInNewContext(compiled, { exports, process: { env: { MEETING_INTELLIGENCE_ENABLED: enabled } }, require: () => policy });
    const projection = exports.REPORT_MEETING_REFERENCE_INCLUDE;
    if (enabled === "0") assert.equal(Object.keys(projection).length, 0, "disabled feature must never query meeting tables");
    else { assert.equal(projection.meetings.where.status, "APPROVED"); assert.equal(projection.meetings.where.deletedAt, null);
      assert.equal(projection.meetings.select.storageRef, undefined); assert.equal(projection.meetings.select.participants, undefined); }
  }
  let userId: string | null = null, queries = 0;
  const api: Record<string, any> = {};
  const ports: Record<string, unknown> = {
    "next/server": { NextResponse: Response }, "next-auth": { getServerSession: async () => userId ? { user: { id: userId } } : null },
    "@/lib/auth": { authOptions: {} }, "@/lib/team-access": { getUserTeamContext: async () => ({ teamId: null }), reportReadWhere: (id: string) => ({ deal: { userId: id } }) },
    "@/lib/prisma": { prisma: { report: { findFirst: async (query: any) => {
      queries++; assert.equal(query.include, REPORT_FOR_PRESENTATION_INCLUDE);
      if (query.where.deal.userId !== "owner") return null;
      const reference = meeting(undefined, { transcript: JSON.stringify([{ start: 10, end: 20, text: "2025년 매출 실적 30억원" }, { start: 40, end: 50, text: "RAW_UNUSED_SEGMENT" }]) });
      return { ...input, deal: { ...input.deal, id: "deal", companyName: "합성회사", meetings: [reference] }, deepDive: research };
    } } } }, "@/lib/vc-decision-loader": { computeReportDecision, REPORT_FOR_PRESENTATION_INCLUDE },
    "@/lib/report-presentation": { buildReportPresentation }, "@/lib/private-response-headers": { PRIVATE_RESPONSE_HEADERS: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } }
  };
  vm.runInNewContext(ts.transpileModule(readFileSync("src/app/api/reports/[id]/decision/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports: api, require: (name: string) => { assert(name in ports); return ports[name]; } });
  let response = await api.GET({}, { params: { id: "report" } }); assert.equal(response.status, 401); assert.equal(queries, 0);
  userId = "outsider"; response = await api.GET({}, { params: { id: "report" } }); assert.equal(response.status, 404);
  userId = "owner"; response = await api.GET({}, { params: { id: "report" } }); assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  const body = await response.json(); assert.equal(body.data.presentation.context.meetings.length, 1);
  const encoded = JSON.stringify(body); assert(!encoded.includes("RAW_UNUSED_SEGMENT") && !encoded.includes('"transcript"') && !encoded.includes('"storageRef"'));
  console.log("PASS decision context: approval/traceability, signed unit-period comparisons, stale/unsafe research, unchanged decision, full exports and feature-off projection");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
