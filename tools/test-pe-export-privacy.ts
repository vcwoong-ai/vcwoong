/** Actual export routes, synthetic VM ports only; no DB/browser/provider/file export execution. */
/* eslint-disable @typescript-eslint/no-explicit-any -- Transpiled route dependency ports are intentionally dynamic in this offline test. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

let stage = "export response privacy";
class SyntheticResponse extends Response {
  static json(body: unknown, init?: ResponseInit) { return Response.json(body, init); }
}
function load(file: string, ports: Record<string, any>) {
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Date, Uint8Array, require(name: string) { assert(name in ports, "unexpected export dependency"); return ports[name]; } });
  return exports;
}
function privateHeaders(response: Response) {
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
}
async function cases(file: string) {
  let authenticated = true, missing = false, loaderFails = false, generatorFails = false, generated = 0, loaded = 0;
  const maDeal = { id: "synthetic-deal", companyName: '합성\r\nX-Injected: private', name: "합성 검토", dealType: "BUYOUT", status: "ACTIVE" };
  const loader = async () => { loaded++; if (loaderFails) throw new Error("SYNTHETIC_PRIVATE_DETAIL"); return missing ? { status: "not_found" } : { status: "ok", data: { maDeal, pack: {}, dashboardPeriods: [], ddCase: null } }; };
  const generate = async () => { generated++; if (generatorFails) throw new Error("SYNTHETIC_PRIVATE_DETAIL"); return new Uint8Array([80, 75]); };
  const headers = load("src/lib/private-response-headers.ts", {});
  const route = load(file, {
    "next/server": { NextResponse: SyntheticResponse }, "next-auth": { getServerSession: async () => authenticated ? { user: { id: "synthetic-owner" } } : null },
    "@/lib/auth": { authOptions: {} }, "@/lib/private-response-headers": headers,
    "@/lib/team-access": { getUserTeamContext: async () => ({ teamId: null, role: "PARTNER" }) },
    "@/lib/pe/pe-committee-pack-loader": { loadPECommitteePackForDeal: loader },
    "@/lib/pe/pe-committee-pack-memo": { buildPECommitteePackMarkdown: () => "합성 자료" },
    "@/lib/docx-export": { generateMarkdownDOCX: generate }, "@/lib/pptx-export": { generateMarkdownPPTX: generate },
    "@/lib/prisma": { prisma: { pEDDCase: { findUnique: async () => null } } },
    "@/lib/pe/pe-ma-deal-context": { loadMaDealIcContext: loader },
    "@/lib/pe/ma-deal-dashboard": { buildMaDealDashboard: () => ({}) },
    "@/lib/pe/pe-ic-decision": { buildPEICDecision: () => ({ questions: [] }) },
    "@/lib/pe/pe-ic-memo": { buildPEICMemoMarkdown: () => "합성 자료" },
    "@/lib/pe/pe-ic-review": { buildPEICReviewWorkspace: () => ({}) },
    "@/lib/pe/pe-evidence-request-repository": { listPEEvidenceRequests: async () => ({ status: "ok", data: [] }) },
    "@/lib/pe/pe-ic-review-types": { toPEEvidenceRequestView: (row: unknown) => row },
    "@/lib/pe/ma-deal-labels": { MA_DEAL_TYPE_LABEL: { BUYOUT: "인수" }, MA_DEAL_STATUS_LABEL: { ACTIVE: "진행" } },
  });
  const call = (format = "docx") => route.GET({ nextUrl: new URL(`http://localhost/export?format=${format}`) }, { params: { id: maDeal.id } });
  stage = "guest401 private headers with no loader or generation"; authenticated = false;
  let response = await call(); assert.equal(response.status, 401); privateHeaders(response); assert.equal(loaded, 0); assert.equal(generated, 0);
  stage = "missing404 private headers with no generation"; authenticated = true; missing = true;
  response = await call(); assert.equal(response.status, 404); privateHeaders(response); assert.equal(generated, 0); missing = false;
  for (const format of ["docx", "pptx"]) {
    stage = "binary export MIME disposition and private headers";
    response = await call(format); assert.equal(response.status, 200); privateHeaders(response);
    assert.equal(response.headers.get("content-type"), format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    const disposition = response.headers.get("content-disposition")!;
    assert(disposition.startsWith('attachment; filename="')); assert(disposition.endsWith(`.${format}"`)); assert(!/[\r\n]/.test(disposition)); assert.equal(response.headers.has("x-injected"), false);
  }
  for (const fault of ["load", "generate"]) {
    stage = "exception500 fixed privacy response"; loaderFails = fault === "load"; generatorFails = fault === "generate";
    response = await call(); assert.equal(response.status, 500); privateHeaders(response); assert.equal((await response.text()).includes("SYNTHETIC_PRIVATE_DETAIL"), false);
  }
}
async function main() {
  // Exact pre-change unauthorized branch observed before source changes: the missing header must fail.
  const baseline = SyntheticResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  assert.throws(() => privateHeaders(baseline), assert.AssertionError);
  await cases("src/app/api/ma-deals/[id]/committee-pack/export/route.ts");
  await cases("src/app/api/ma-deals/[id]/ic-memo/route.ts");
  console.log("PASS PE export privacy actual route VM: docx/pptx, guest/missing, failures, encoded filename; baseline missing headers rejected; no DB/provider/browser");
}
main().catch(() => { console.error(`PE_EXPORT_PRIVACY_FAILED at ${stage}; exception details withheld.`); process.exitCode = 1; });
