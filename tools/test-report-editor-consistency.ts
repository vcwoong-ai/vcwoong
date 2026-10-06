/** Actual editor/API callbacks in VM ports; no DB/browser/AI calls. */
/* eslint-disable @typescript-eslint/no-explicit-any -- Dynamic source callback and React hook ports are scoped to this offline test. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { reportReviewVersion } from "../src/lib/report-review-version";
let stage = "editor consistency";
const sectionA = { id: "synthetic-section", sectionKey: "COMPANY_OVERVIEW", title: "합성", content: "합성 A", order: 1, status: "APPROVED" };
const sectionB = { ...sectionA, content: "합성 B" };
function callback(file: string, name: string, scope: Record<string, any>) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => { if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) declaration = node; ts.forEachChild(node, visit); }; visit(source);
  assert(declaration?.initializer, "missing actual callback");
  const compiled = ts.transpileModule(`const exposed = ${declaration.initializer.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(`${compiled}\nexposed`, { ...scope, console: { error() {} }, window: { location: { reload() {} } } });
}
async function parentCase() {
  stage = "regenerated approved B finalizes with B parent version"; let body: any;
  const currentSectionsRef = { current: [sectionA] };
  const file = "src/app/reports/[id]/report-page-client.tsx", source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let changed: ts.JsxAttribute | undefined;
  const visit = (node: ts.Node) => { if (ts.isJsxAttribute(node) && node.name.getText(source) === "onSectionsChanged") changed = node; ts.forEachChild(node, visit); }; visit(source);
  assert(changed?.initializer && ts.isJsxExpression(changed.initializer) && changed.initializer.expression);
  const compiled = ts.transpileModule(`const changed = ${changed.initializer.expression.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const onChanged = vm.runInNewContext(`${compiled}\nchanged`, { currentSectionsRef, setCurrentSections() {}, setPageStatus() {} });
  onChanged([sectionB]); assert.equal(currentSectionsRef.current[0].content, sectionB.content);
  const finalize = callback("src/app/reports/[id]/report-page-client.tsx", "handleFinalize", {
    report: { id: "synthetic-report", sections: [sectionA] }, currentSections: [sectionB], reportSections: [sectionB], sections: [sectionB],
    canEdit: true, finalizePendingRef: { current: false }, finalizeEpochRef: { current: 0 }, currentSectionsRef, currentReportIdRef: { current: "synthetic-report" },
    setIsFinalizing() {}, reportReviewVersion, toast: { error() {} }, fetch: async (_url: string, options: any) => { body = JSON.parse(options.body); return { ok: true }; },
  });
  await finalize(); assert.equal(body.expectedReviewVersion, await reportReviewVersion([sectionB]));
}
function editorHarness(fetcher: any, confirm: () => Promise<boolean> = async () => true) {
  const file = "src/components/reports/report-editor.tsx", source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ReportEditor") as ts.FunctionDeclaration;
  const returned = component.body!.statements.find(ts.isReturnStatement)!;
  const injected = fs.readFileSync(file, "utf8").slice(0, returned.getStart(source)) + "globalThis.__editor = { startEdit, saveSection, approveSection, regenerateSection, approveAll, setEditContent, editingSectionId, editContent, localSections };\n" + fs.readFileSync(file, "utf8").slice(returned.getStart(source));
  const slots: any[] = []; let index = 0; const changes: any[] = [], errors: any[] = [], effects: Array<() => void> = [];
  const react = { useState(initial: any) { const at = index++; if (!slots[at]) slots[at] = { value: initial }; return [slots[at].value, (value: any) => { slots[at].value = typeof value === "function" ? value(slots[at].value) : value; }]; }, useRef(initial: any) { const at = index++; return (slots[at] ??= { current: initial }); }, useEffect(fn: any, deps: any[]) { const at = index++, previous = slots[at]; if (!previous || deps.some((value, i) => value !== previous.deps[i])) effects.push(() => { previous?.cleanup?.(); slots[at] = { deps, cleanup: fn() }; }); } };
  const exports: any = {}, context: any = { exports, Date, AbortController, fetch: fetcher, console: { error() {} }, require(name: string) {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx: () => null, jsxs: () => null };
    if (name === "@/lib/report-review-version") return { reportReviewVersion };
    if (name === "@/lib/report-completion") return { isReportFinalized: () => false };
    if (name === "@/hooks/use-toast") return { useToast: () => ({ error: (...args: any[]) => errors.push(args), success() {} }) };
    if (name === "@/hooks/use-confirm") return { useConfirm: () => confirm };
    if (name === "@/lib/utils") return { cn: () => "" };
    if (name === "@/types") return { SECTION_META: [{ key: "COMPANY_OVERVIEW", label: "합성" }], getKoreanVisualWidth: (value: string) => value.length };
    if (name === "@prisma/client") return { SectionStatus: { DRAFT: "DRAFT", REVIEWED: "REVIEWED", APPROVED: "APPROVED" } };
    if (name.startsWith("@/components/") || name === "lucide-react") return new Proxy({}, { get: (_target, key) => String(key) });
    throw new Error("unexpected editor port");
  } };
  vm.runInNewContext(ts.transpileModule(injected, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const initialSections = [sectionA];
  return { changes, errors, render(reportId = "synthetic-report") { index = 0; effects.length = 0; exports.ReportEditor({ reportId, sections: initialSections, dealName: "합성", onSectionsChanged: (value: any) => changes.push(value) }); for (const effect of effects) effect(); return context.__editor; } };
}
async function editorCases() {
  let responseStatus = 409, body: any, responseSection = sectionB;
  const harness = editorHarness(async (url: string, options: any) => { body = JSON.parse(options.body); return { ok: responseStatus === 200, status: responseStatus, json: async () => url.endsWith("regenerate") ? { data: { section: responseSection, quality: { score: 90 } } } : body.approveAllSections ? { data: { sections: [responseSection] } } : { data: responseSection, error: "SYNTHETIC_PRIVATE_DETAIL" } }; });
  stage = "save captures start editing A instead of later callback B";
  let editor = harness.render(); editor.startEdit(sectionA); editor = harness.render(); editor.setEditContent("합성 사용자 초안"); editor = harness.render(); await editor.saveSection(sectionB);
  assert.equal(body.expectedReviewVersion, await reportReviewVersion([sectionA])); editor = harness.render(); assert.equal(editor.editContent, "합성 사용자 초안"); assert.equal(editor.editingSectionId, sectionA.id); assert.equal(harness.changes.length, 0);
  stage = "successful save synchronizes parent authoritative section"; responseStatus = 200; await editor.saveSection(sectionB); editor = harness.render(); assert.equal(editor.localSections[0].content, sectionB.content); assert.equal(harness.changes.at(-1)[0].content, sectionB.content);
  stage = "regeneration and approval synchronize parent B"; responseSection = { ...sectionB, status: "DRAFT" }; await editor.regenerateSection(sectionA, { skipConfirm: true }); editor = harness.render(); assert.equal(harness.changes.at(-1)[0].content, sectionB.content);
  responseSection = sectionB; await editor.approveSection(editor.localSections[0]); editor = harness.render(); assert.equal(body.expectedReviewVersion, await reportReviewVersion([sectionB])); assert.equal(harness.changes.at(-1)[0].status, "APPROVED");
  stage = "bulk approval synchronizes parent current contents"; await editor.approveAll(); assert.equal(body.expectedReviewVersion, await reportReviewVersion([sectionB])); assert.equal(harness.changes.at(-1)[0].content, sectionB.content);
}
async function boundaryCases() {
  stage = "confirmation from old report cannot start regeneration on new report";
  let confirmRelease!: (value: boolean) => void, requests = 0;
  const harness = editorHarness(async () => { requests++; return { ok: true }; }, () => new Promise(resolve => { confirmRelease = resolve; }));
  const editor = harness.render(); const pending = editor.regenerateSection(sectionA); harness.render("synthetic-other-report"); confirmRelease(true); await pending; assert.equal(requests, 0); assert.equal(harness.changes.length, 0);
  stage = "same report props refresh cannot release in flight finalize lock";
  let digestRelease!: (value: string) => void, posts = 0;
  const scope: any = { report: { id: "synthetic-report", sections: [sectionB] }, canEdit: true, finalizePendingRef: { current: false }, finalizeEpochRef: { current: 0 }, currentSectionsRef: { current: [sectionB] }, currentReportIdRef: { current: "synthetic-report" }, setIsFinalizing() {}, setCurrentSections() {}, reportReviewVersion: () => new Promise(resolve => { digestRelease = resolve; }), toast: { error() {} }, fetch: async () => { posts++; return { ok: true }; } };
  const file = "src/app/reports/[id]/report-page-client.tsx", source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let syncEffect: ts.Expression | undefined;
  const visit = (node: ts.Node) => { if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" && node.arguments[0].getText(source).includes("currentSectionsRef.current = report.sections")) syncEffect = node.arguments[0]; ts.forEachChild(node, visit); }; visit(source); assert(syncEffect);
  const refresh = vm.runInNewContext(ts.transpileModule(`const effect = ${syncEffect.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + "\neffect", scope);
  const finalize = callback(file, "handleFinalize", scope); const first = finalize(); refresh(); await finalize(); digestRelease(await reportReviewVersion([sectionB])); await first; assert.equal(posts, 1);
}
async function main() { await parentCase(); await editorCases(); await boundaryCases(); console.log("PASS actual report editor callbacks captured edit baseline, conflict draft preservation, parent version and late confirmation/finalize lock; synthetic hook/effect ports, no DB/provider/browser"); }
main().catch(() => { console.error(`REPORT_EDITOR_CONSISTENCY_FAILED at ${stage}; exception details withheld.`); process.exitCode = 1; });
