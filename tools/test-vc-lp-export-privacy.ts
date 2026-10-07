/** Actual route VM with synthetic dependency ports only; no database, storage, AI or browser. */
/* eslint-disable @typescript-eslint/no-explicit-any -- VM module exports and synthetic route ports require dynamic interfaces. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

let stage = "VC guest response headers";
class TestResponse extends Response { static json(body: unknown, init?: ResponseInit) { return Response.json(body, init); } }
function load(file: string, ports: Record<string, any>, logs: unknown[][] = []) {
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Date, URL, Buffer, Uint8Array, Response, Headers, process: { env: {} }, console: { error: (...values: unknown[]) => logs.push(values), warn: (...values: unknown[]) => logs.push(values) }, require(name: string) { assert(name in ports, "unexpected export port"); return ports[name]; } });
  return exports;
}
function privateHeaders(response: Response) {
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert(response.headers.get("vary")?.split(",").map(value => value.trim().toLowerCase()).includes("cookie"));
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
}
const rawDetail = "SYNTHETIC_PRIVATE_DETAIL";
const bytes = Buffer.from([80, 75]);
const mime = { docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
function binaryHeaders(response: Response, format: keyof typeof mime, mode?: string) {
  privateHeaders(response); assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), mime[format]);
  const disposition = response.headers.get("content-disposition")!;
  assert(disposition.startsWith("attachment; filename*=UTF-8''")); assert(disposition.endsWith(`.${format}`)); assert(!/[\r\n]/.test(disposition)); assert.equal(response.headers.has("x-injected"), false);
  if (mode) assert.equal(response.headers.get("x-export-mode"), mode);
}
async function vcCases(format: keyof typeof mime) {
  let authenticated = true, fault = "", errorStatus = 0, generated = 0, marked = 0, loaded = 0, engine = false, reconstructFail = false;
  const logs: unknown[][] = [];
  const report: any = { sections: [{ sectionKey: "overview", title: "합성", content: "합성 자료" }], deal: { companyName: "합성\r\nX-Injected: private", documents: [], investRound: null }, template: null };
  const exportState = { eligible: true, updatedAt: new Date(1000), contentVersion: "synthetic-content-version", artifactVersion: "synthetic-artifact-version" };
  const generate = async () => { generated++; if (fault === "generate") throw new Error(rawDetail); return bytes; };
  const reconstruct = async () => { generated++; if (reconstructFail) throw new Error(rawDetail); return { buffer: bytes, filledSections: 1, detectedHeadings: 1, extractedFromDocuments: [] }; };
  const route = load(`src/app/api/reports/[id]/export/${format}/route.ts`, {
    "next/server": { NextResponse: TestResponse }, "next-auth": { getServerSession: async () => { if (fault === "auth") throw new Error(rawDetail); return authenticated ? { user: { id: "synthetic-user" } } : null; } }, "@/lib/auth": { authOptions: {} },
    "@/lib/private-response-headers": load("src/lib/private-response-headers.ts", {}),
    "@/lib/docx-export": { generateReportDOCX: generate }, "@/lib/pptx-export": { generateReportPPTX: generate },
    "@/lib/template/template-generator": { generateTemplateBasedDOCX: generate }, "@/lib/template/template-reconstructor": { reconstructDOCX: reconstruct }, "@/lib/template/pptx-reconstructor": { reconstructPPTX: reconstruct },
    "@/lib/storage": { readStoredFile: async () => bytes },
    "@/lib/report-export-common": {
      loadReportForExport: async () => { loaded++; if (fault === "load") throw new Error(rawDetail); if (errorStatus) return { error: Response.json({ error: "합성 기존 오류", code: "SYNTHETIC_EXISTING" }, { status: errorStatus, headers: { "X-Synthetic-Existing": "preserved", Vary: "Accept" } }) }; return { report, canUseEngine: engine, decisionMemoSections: [], presentation: { charts: [] }, exportState }; },
      markExported: async (_id: string, expected: unknown) => { assert.equal(expected, exportState); if (fault === "mark") throw new Error(rawDetail); marked++; }, exportFilename: (_name: string, extension: string) => `합성\r\nX-Injected: private.${extension}`, collectDocumentImages: () => [],
    },
  }, logs);
  const call = (layout?: string): Promise<Response> => route.POST({ url: `http://localhost/export${layout ? `?layout=${layout}` : ""}` }, { params: { id: "synthetic-report" } });
  stage = `${format} guest401 no generation`; authenticated = false;
  let response = await call(); assert.equal(response.status, 401); privateHeaders(response); assert.equal(generated, 0); assert.equal(loaded, 0); authenticated = true;
  for (const status of [400, 403, 404, 409]) {
    stage = `${format} loader error preserves body status existing headers`; errorStatus = status; response = await call();
    assert.equal(response.status, status); privateHeaders(response); assert.equal(response.headers.get("x-synthetic-existing"), "preserved"); assert(response.headers.get("vary")?.includes("Accept")); assert.deepEqual(await response.json(), { error: "합성 기존 오류", code: "SYNTHETIC_EXISTING" }); assert.equal(generated, 0);
  }
  errorStatus = 0; stage = `${format} default binary and mark once`;
  response = await call(); binaryHeaders(response, format, format === "docx" ? "default" : "pptx-generated"); assert.equal(marked, 1); assert.equal(response.headers.get("content-length"), bytes.length.toString());
  engine = true; report.template = { fileType: format.toUpperCase(), fileUrl: "synthetic-local-fixture", sectionMap: {} };
  stage = `${format} reconstructed success`; response = await call(format === "pptx" ? "template" : undefined); binaryHeaders(response, format, format === "docx" ? "reconstructed:1/1" : "pptx-reconstructed:1/1"); assert.equal(marked, 2);
  stage = `${format} failed reconstruction safe fallback`; reconstructFail = true;
  response = await call(format === "pptx" ? "template" : undefined); binaryHeaders(response, format, format === "docx" ? "template-ordered" : "pptx-generated"); assert.equal(marked, 3);
  assert.equal(JSON.stringify(logs).includes(rawDetail), false);
  engine = false; report.template = null;
  for (const failure of ["auth", "load", "generate", "mark"]) {
    stage = `${format} ${failure} failure fixed500`; fault = failure; response = await call(); assert.equal(response.status, 500); privateHeaders(response); assert.equal((await response.text()).includes(rawDetail), false); assert.equal(marked, 3);
  }
  assert.equal(JSON.stringify(logs).includes(rawDetail), false);
  if (format === "pptx") {
    fault = ""; engine = true; reconstructFail = false;
    report.template = { fileType: "PPTX", fileUrl: "synthetic-local-fixture", sectionMap: {} };
    stage = "PPTX attached template still defaults to complete standard report";
    response = await call(); binaryHeaders(response, format, "pptx-generated"); assert.equal(marked, 4);
  }
}
async function lpCases() {
  let authenticated = true, missing = false, fault = "", generated = 0;
  const logs: unknown[][] = [];
  const generate = async () => { generated++; if (fault === "generate") throw new Error(rawDetail); return bytes; };
  const route = load("src/app/api/lp-report/[id]/export/route.ts", {
    "next/server": { NextResponse: TestResponse }, "next-auth": { getServerSession: async () => { if (fault === "auth") throw new Error(rawDetail); return authenticated ? { user: { id: "synthetic-user" } } : null; } }, "@/lib/auth": { authOptions: {} },
    "@/lib/private-response-headers": load("src/lib/private-response-headers.ts", {}), "@/lib/team-access": { getUserTeamContext: async () => ({ teamId: null }), lpReportReadWhere: () => ({}) },
    "@/lib/prisma": { prisma: { lpReport: { findFirst: async () => { if (fault === "load") throw new Error(rawDetail); return missing ? null : { title: "합성", content: "합성 자료", period: "합성기간", fund: { name: "합성\r\nX-Injected: private" } }; } } } },
    "@/lib/docx-export": { generateMarkdownDOCX: generate }, "@/lib/pptx-export": { generateMarkdownPPTX: generate },
  }, logs);
  const call = (format: string): Promise<Response> => route.POST({ url: `http://localhost/export?format=${format}` }, { params: { id: "synthetic-lp" } });
  for (const format of ["docx", "pptx"] as const) {
    stage = `LP ${format} guest401`; authenticated = false; let response = await call(format); assert.equal(response.status, 401); privateHeaders(response); assert.equal(generated, format === "docx" ? 0 : 1); authenticated = true;
    stage = `LP ${format} missing404`; missing = true; response = await call(format); assert.equal(response.status, 404); privateHeaders(response); missing = false;
    stage = `LP ${format} binary filename privacy`; response = await call(format); binaryHeaders(response, format, format === "pptx" ? "pptx-generated" : undefined);
  }
  for (const failure of ["auth", "load", "generate"]) {
    stage = `LP ${failure} fixed500`; fault = failure;
    const response = await call("docx"); assert.equal(response.status, 500); privateHeaders(response); assert.equal((await response.text()).includes(rawDetail), false);
  }
  assert.equal(JSON.stringify(logs).includes(rawDetail), false);
}
async function extractionCases() {
  stage = "slide extraction failure preserves template without raw content logs";
  const logs: unknown[][] = []; let calls = 0;
  const extraction = load("src/lib/template/slide-extraction.ts", { "@/lib/claude": { envDurationMs: (_value: unknown, fallback: number) => fallback, CHEAP_MODEL_CHAIN: ["synthetic-only"], generateText: async () => { calls++; throw new Error(rawDetail); } } }, logs);
  assert.equal(await extraction.extractUnmappedContent(rawDetail, rawDetail, [{ name: rawDetail, parsedText: rawDetail }]), null);
  assert.equal(calls, 1); assert.equal(logs.length, 1); assert.equal(JSON.stringify(logs).includes(rawDetail), false);
  assert.equal(await extraction.extractUnmappedContent(rawDetail, "", []), null); assert.equal(calls, 1);
}
async function main() { await vcCases("docx"); await vcCases("pptx"); await lpCases(); await extractionCases(); console.log("PASS VC/LP export privacy actual route VM: authorization, binary modes/fallback, fixed failures, safe headers/filenames and slide extraction logs; no DB/storage/provider/browser"); }
main().catch(() => { console.error(`VC_LP_EXPORT_PRIVACY_FAILED at ${stage}; details withheld.`); process.exitCode = 1; });
