/** Synthetic in-memory PE storage/repository ports; no DB, files, providers or network. */
/* eslint-disable @typescript-eslint/no-explicit-any -- Route VM dependencies are explicit synthetic ports; no real Prisma client is created. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PEUploadService, PEUploadError, PE_DOCUMENT_MAX_BYTES, PE_MULTIPART_MAX_BYTES,
  peUploadOperationId, readPEUploadForm, PEParseRecoveryService, peDocumentParseSummary, type PEParseRecoveryRepository,
  type PEUploadInput, type PEUploadRepository, type PEUploadRow, type PEUploadPorts } from "../src/lib/pe/pe-document-upload";

let stage = "PE upload pure checks";
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const input = (uploadId = "00000000-0000-4000-8000-000000000001"): PEUploadInput => ({ userId: "synthetic-owner", dealId: "synthetic-deal", uploadId, fileName: "synthetic.txt", mimeType: "text/plain", type: "DD_MATERIAL", bytes: Buffer.from("synthetic document") });
function fixture(overrides: Partial<PEUploadPorts> = {}) {
  const rows = new Map<string, PEUploadRow>(); let writes = 0, parses = 0;
  const now = new Date("2026-10-05T00:00:00.000Z");
  const repository: PEUploadRepository = {
    find: async id => rows.has(id) ? structuredClone(rows.get(id)!) : null,
    reserve: async row => { if (rows.has(row.id)) return false; rows.set(row.id, structuredClone(row)); return true; },
    update: async (row, token, at, patch) => {
      const current = rows.get(row.id), metadata = row.metadata as { __peUpload: { token: string | null; expiresAt: number } };
      if (!current || metadata.__peUpload.token !== token || metadata.__peUpload.expiresAt <= at.getTime() || JSON.stringify(current.metadata) !== JSON.stringify(row.metadata)) return false;
      rows.set(row.id, structuredClone({ ...current, ...patch })); return true;
    },
  };
  const service = new PEUploadService({ repository, now: () => now, newToken: () => "SYNTHETIC_PRIVATE_TOKEN",
    upload: async (_bytes, key, mime) => { writes++; assert(key.startsWith("ma-deals/synthetic-deal/uploads/peu_")); assert.equal(mime, "text/plain"); return "SYNTHETIC_PRIVATE_STORAGE_REF"; },
    parse: async (_bytes, mime, fileName) => { parses++; assert.equal(mime, "text/plain"); assert.equal(fileName, "synthetic.txt"); return { text: "SYNTHETIC_PRIVATE_PARSED_TEXT" }; }, ...overrides });
  return { service, rows, repository, writes: () => writes, parses: () => parses, now };
}
async function rejected(task: Promise<unknown>, status: number) { await assert.rejects(task, error => error instanceof PEUploadError && error.status === status); }
async function parseRecoveryCases() {
  const make = async () => {
    const source = input(); const id = peUploadOperationId(source.userId, source.dealId, source.uploadId);
    const url = `private-local:ma-deals/${source.dealId}/uploads/${id}.txt`;
    const state = fixture({ upload: async () => url, parse: async () => { throw new Error("SYNTHETIC_PRIVATE_PARSE_FAILURE"); } });
    await state.service.submit(source);
    const repository: PEParseRecoveryRepository = { ...state.repository, claimParse: async (row, token, now) => {
      const summary = peDocumentParseSummary(row, now), current = state.rows.get(row.id);
      if (!current || !summary.parseRetryAllowed || current.url !== row.url || JSON.stringify(current.metadata) !== JSON.stringify(row.metadata)) return false;
      const prior = (row.metadata as any).__peUpload;
      state.rows.set(row.id, structuredClone({ ...row, metadata: { ...(row.metadata as object), __peUpload: { ...prior, phase: "PARSING", token, expiresAt: now.getTime() + 600000, parseAttempts: summary.parseAttempts + 1 } } })); return true;
    } };
    let reads = 0, parses = 0, tokens = 0;
    const ports = { repository, read: async (_ref: string, max: number) => { reads++; assert.equal(max, PE_DOCUMENT_MAX_BYTES); return source.bytes; }, parse: async (_bytes: Buffer, mime: string, name: string) => { parses++; assert.equal(mime, source.mimeType); assert.equal(name, source.fileName); return { text: "SYNTHETIC_PRIVATE_RECOVERED" }; }, now: () => state.now, newToken: () => `SYNTHETIC_PRIVATE_RECOVERY_${++tokens}` };
    return { ...state, id, url, ports, readCount: () => reads, parseCount: () => parses, retry: () => new PEParseRecoveryService(ports).retry({ dealId: source.dealId, documentId: id }) };
  };
  stage = "known stored parser warning manually recovered without new upload";
  const recovered = await make(); const result = await recovered.retry(); assert.equal(result.parseStatus, "complete"); assert.equal(result.parseAttempts, 1); publicOnly(result); assert.equal(recovered.rows.get(recovered.id)!.url, recovered.url); assert.equal(recovered.rows.get(recovered.id)!.parsedText, "SYNTHETIC_PRIVATE_RECOVERED");
  stage = "expired parsing lease manually recovered";
  const expired = await make(); (expired.rows.get(expired.id)!.metadata as any).__peUpload.phase = "PARSING"; (expired.rows.get(expired.id)!.metadata as any).__peUpload.expiresAt = expired.now.getTime() - 1;
  assert.equal((await expired.retry()).parseStatus, "complete");
  for (const phase of ["UNKNOWN", "STORING", "READY"]) { stage = "storage ambiguity or complete source not reclaimed"; const blocked = await make(); (blocked.rows.get(blocked.id)!.metadata as any).__peUpload.phase = phase; await rejected(blocked.retry(), 409); assert.equal(blocked.readCount(), 0); assert.equal(blocked.parseCount(), 0); }
  stage = "legacy max attempts and wrong private namespace rejected before read";
  for (const mutate of [(row: PEUploadRow) => { row.metadata = {}; }, (row: PEUploadRow) => { (row.metadata as any).__peUpload.parseAttempts = 3; }, (row: PEUploadRow) => { row.url = "private-local:ma-deals/other/uploads/invalid.txt"; }]) { const blocked = await make(); mutate(blocked.rows.get(blocked.id)!); await rejected(blocked.retry(), 409); assert.equal(blocked.readCount(), 0); }
  for (const bytes of [null, Buffer.from("wrong-sized"), Buffer.alloc(input().bytes.length, 7)]) { stage = "unavailable size or hash mismatch preserves old text and original"; const failed = await make(); failed.rows.get(failed.id)!.parsedText = "SYNTHETIC_PRIVATE_OLD_TEXT"; failed.ports.read = async () => bytes as Buffer; const view = await failed.retry(); assert.equal(view.parseStatus, "unavailable"); assert.equal(failed.parseCount(), 0); assert.equal(failed.rows.get(failed.id)!.parsedText, "SYNTHETIC_PRIVATE_OLD_TEXT"); assert.equal(failed.rows.get(failed.id)!.url, failed.url); publicOnly(view); }
  stage = "parser failure keeps old text with maximum three manual attempts";
  const parseFailure = await make(); parseFailure.rows.get(parseFailure.id)!.parsedText = "SYNTHETIC_PRIVATE_OLD_TEXT";
  parseFailure.ports.parse = async () => { throw new Error("SYNTHETIC_PRIVATE_PARSE_FAILURE"); };
  for (let attempt = 1; attempt <= 3; attempt++) { const view = await parseFailure.retry(); assert.equal(view.parseAttempts, attempt); assert.equal(view.parseStatus, "unavailable"); assert.equal(view.retryAllowed, attempt < 3); assert.equal(parseFailure.rows.get(parseFailure.id)!.parsedText, "SYNTHETIC_PRIVATE_OLD_TEXT"); assert.equal(parseFailure.rows.get(parseFailure.id)!.url, parseFailure.url); publicOnly(view); }
  await rejected(parseFailure.retry(), 409);
  stage = "read exception keeps original and old text without parser";
  const readFailure = await make(); readFailure.rows.get(readFailure.id)!.parsedText = "SYNTHETIC_PRIVATE_OLD_TEXT"; readFailure.ports.read = async () => { throw new Error("SYNTHETIC_PRIVATE_READ_FAILURE"); };
  assert.equal((await readFailure.retry()).parseStatus, "unavailable"); assert.equal(readFailure.parseCount(), 0); assert.equal(readFailure.rows.get(readFailure.id)!.parsedText, "SYNTHETIC_PRIVATE_OLD_TEXT");
  stage = "concurrent retry returns processing without second parse";
  const concurrent = await make(), readGate = deferred<Buffer>(); concurrent.ports.read = async () => readGate.promise;
  const first = concurrent.retry(); await Promise.resolve(); await Promise.resolve(); assert.equal((await concurrent.retry()).status, "processing"); readGate.resolve(input().bytes); assert.equal((await first).parseStatus, "complete"); assert.equal(concurrent.parseCount(), 1);
  stage = "expired old worker cannot overwrite newer extracted text";
  const stale = await make(), oldRead = deferred<Buffer>(); let readCalls = 0;
  stale.ports.read = async () => ++readCalls === 1 ? oldRead.promise : input().bytes;
  const old = stale.retry(); await Promise.resolve(); await Promise.resolve(); stale.now.setTime(stale.now.getTime() + 600001);
  await stale.retry(); const latest = stale.rows.get(stale.id)!.parsedText; oldRead.resolve(input().bytes); await rejected(old, 409); assert.equal(stale.rows.get(stale.id)!.parsedText, latest); assert.equal(stale.rows.get(stale.id)!.url, stale.url);
}
function publicOnly(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const marker of ["SYNTHETIC_PRIVATE", "fingerprint", "__peUpload", "parsedText", '"url"', '"token"']) assert(!serialized.includes(marker));
}
async function multipartCases() {
  stage = "multipart declared and actual byte limits";
  await rejected(readPEUploadForm(new Request("http://localhost/synthetic", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })), 400);
  await rejected(readPEUploadForm(new Request("http://localhost/synthetic", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=synthetic", "content-length": String(PE_MULTIPART_MAX_BYTES + 1) }, body: "synthetic" })), 413);
  let cancelled = false;
  const oversized = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(PE_MULTIPART_MAX_BYTES + 1)); }, cancel() { cancelled = true; } });
  const streamed = new Request("http://localhost/synthetic", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=synthetic" }, body: oversized, duplex: "half" } as RequestInit);
  await rejected(readPEUploadForm(streamed), 413); assert(cancelled);
  const makeForm = () => { const form = new FormData(); form.append("file", new Blob([new Uint8Array(input().bytes)], { type: "text/plain" }), input().fileName); form.append("type", input().type); form.append("uploadId", input().uploadId); return form; };
  const valid = await readPEUploadForm(new Request("http://localhost/synthetic", { method: "POST", body: makeForm() }));
  assert.equal(valid.uploadId, input().uploadId); assert.equal(valid.mimeType, "text/plain"); assert.deepEqual(valid.bytes, input().bytes);
  for (const shape of ["duplicate", "extra", "missing"] as const) {
    const form = makeForm(); if (shape === "duplicate") form.append("uploadId", input().uploadId); else if (shape === "extra") form.append("unexpected", "synthetic"); else form.delete("type");
    await rejected(readPEUploadForm(new Request("http://localhost/synthetic", { method: "POST", body: form })), 400);
  }
}
async function routeCases() {
  stage = "actual POST route auth and ownership before multipart reads";
  const source = fs.readFileSync("src/app/api/ma-deals/[id]/documents/route.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const scenario of ["unauthenticated", "wrong-origin", "outsider", "shared-analyst", "shared-partner", "owner", "body-limit"] as const) {
    const state = fixture(); let bodyReads = 0, storageWrites = 0, lookups = 0;
    const userId = scenario === "owner" || scenario === "body-limit" ? "synthetic-owner" : "synthetic-other";
    const role = scenario === "shared-partner" ? "PARTNER" : "ANALYST";
    const teamId = scenario.startsWith("shared-") ? "synthetic-team" : null;
    const exports: any = {};
    const writeWhere = (actorId: string, sharedTeam: string | null, actorRole: string) => sharedTeam && ["ADMIN", "PARTNER"].includes(actorRole) ? { OR: [{ userId: actorId }, { teamId: sharedTeam }] } : { userId: actorId };
    vm.runInNewContext(compiled, { exports, console: { error() {} }, require(name: string) {
      if (name === "next/server") return { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };
      if (name === "next-auth") return { getServerSession: async () => scenario === "unauthenticated" ? null : { user: { id: userId } } };
      if (name === "@/lib/auth") return { authOptions: {} };
      if (name === "@/lib/prisma") return { prisma: { mADeal: { findFirst: async ({ where }: any) => { lookups++; assert.deepEqual(JSON.parse(JSON.stringify(where)), { id: "synthetic-deal", ...writeWhere(userId, teamId, role) }); return scenario === "owner" || scenario === "body-limit" || scenario === "shared-partner" ? { id: "synthetic-deal" } : null; } } } };
      if (name === "@/lib/team-access") return { getUserTeamContext: async () => ({ teamId, role }) };
      if (name === "@/lib/pe/ma-team-access") return { maDealWriteWhere: writeWhere, maDealReadWhere: writeWhere };
      if (name === "@/lib/pe/pe-dd-repository") return {};
      if (name === "node:crypto") return { randomUUID: () => "synthetic-token" };
      if (name === "@/lib/storage") return { uploadFile: async () => { storageWrites++; return "SYNTHETIC_PRIVATE_STORAGE_REF"; } };
      if (name === "@/lib/document-parser") return { parseDocument: async (_bytes: Buffer, mime: string, fileName: string) => { assert.equal(mime, "text/plain"); assert.equal(fileName, input().fileName); return { text: "SYNTHETIC_PRIVATE_PARSED_TEXT" }; } };
      if (name === "@/lib/pe/pe-document-upload") return { PEUploadService, PEUploadError, createPrismaPEUploadRepository: () => state.repository, readPEUploadForm: async () => { bodyReads++; if (scenario === "body-limit") throw new PEUploadError(413); return { ...input(), userId: undefined, dealId: undefined }; } };
      throw new Error("Unexpected synthetic route dependency");
    } });
    const request = { headers: new Headers(scenario === "wrong-origin" ? { origin: "https://synthetic-invalid-origin.example" } : {}), nextUrl: new URL("http://localhost/api/ma-deals/synthetic-deal/documents") };
    const result: Response = await exports.POST(request, { params: { id: "synthetic-deal" } });
    const expected = scenario === "unauthenticated" ? 401 : scenario === "wrong-origin" ? 403 : scenario === "body-limit" ? 413 : scenario === "owner" || scenario === "shared-partner" ? 201 : 404;
    assert.equal(result.status, expected); assert.equal(result.headers.get("cache-control"), "private, no-store"); publicOnly(await result.json());
    const permitted = scenario === "owner" || scenario === "shared-partner" || scenario === "body-limit";
    assert.equal(bodyReads, permitted ? 1 : 0); assert.equal(storageWrites, expected === 201 ? 1 : 0);
    if (scenario === "unauthenticated" || scenario === "wrong-origin") assert.equal(lookups, 0);
  }
}
async function main() {
  assert.equal(PE_DOCUMENT_MAX_BYTES, 4 * 1024 * 1024); assert.equal(PE_MULTIPART_MAX_BYTES, PE_DOCUMENT_MAX_BYTES + 64 * 1024);
  stage = "invalid file and operation inputs cannot write storage";
  const bad = fixture();
  for (const change of [{ uploadId: "../invalid" }, { userId: "" }, { dealId: "../synthetic" }, { type: "UNSUPPORTED" }, { fileName: "../synthetic.txt" }, { fileName: "synthetic.exe" }, { mimeType: "application/pdf" }, { bytes: Buffer.alloc(0) }]) await rejected(bad.service.submit({ ...input(), ...change }), 400);
  for (const [fileName, mimeType] of [["synthetic.doc", "application/msword"], ["synthetic.xls", "application/vnd.ms-excel"], ["synthetic.ppt", "application/vnd.ms-powerpoint"]]) await rejected(bad.service.submit({ ...input(), fileName, mimeType }), 400);
  await rejected(bad.service.submit({ ...input(), bytes: Buffer.alloc(PE_DOCUMENT_MAX_BYTES + 1) }), 413); assert.equal(bad.writes(), 0); assert.equal(bad.rows.size, 0);
  const boundary = fixture(); assert.equal((await boundary.service.submit({ ...input(), bytes: Buffer.alloc(PE_DOCUMENT_MAX_BYTES) })).status, 201);
  assert.notEqual(peUploadOperationId("synthetic-owner", "synthetic-deal", input().uploadId), peUploadOperationId("synthetic-other", "synthetic-deal", input().uploadId));
  assert.notEqual(peUploadOperationId("synthetic-owner", "synthetic-deal", input().uploadId), peUploadOperationId("synthetic-owner", "synthetic-other-deal", input().uploadId));
  stage = "same immutable operation replay creates one stored document";
  const stable = fixture(); assert.deepEqual(await stable.service.lookup(input()), { status: "not_found", uploadId: input().uploadId, retryAllowed: true });
  const created = await stable.service.submit(input()), replay = await stable.service.submit(input());
  assert.equal(created.status, 201); assert.equal(replay.status, 200); assert.equal(created.data.id, replay.data.id); assert.equal(stable.writes(), 1); assert.equal(stable.parses(), 1); assert.equal(stable.rows.size, 1);
  assert.equal(created.data.parseStatus, "complete"); publicOnly(created.data); publicOnly(await stable.service.lookup(input()));
  for (const change of [{ bytes: Buffer.from("changed material") }, { fileName: "changed.txt" }, { type: "OTHER" }]) await rejected(stable.service.submit({ ...input(), ...change }), 409);
  assert.equal(stable.writes(), 1);
  stage = "concurrent reservation winner alone stores bytes";
  const barrier = deferred<string>(); let storageCalls = 0;
  const concurrent = fixture({ upload: async () => { storageCalls++; return barrier.promise; } });
  const first = concurrent.service.submit(input()), second = concurrent.service.submit(input());
  const pending = await second; assert.equal(pending.status, 202); assert.equal(pending.data.status, "processing"); assert.equal(storageCalls, 1);
  publicOnly(pending.data); barrier.resolve("SYNTHETIC_PRIVATE_STORAGE_REF"); assert.equal((await first).status, 201); assert.equal(storageCalls, 1);
  stage = "parser failure preserves original with explicit unavailable warning";
  const warning = fixture({ parse: async () => { throw new Error("SYNTHETIC_PRIVATE_PARSER_ERROR"); } });
  const result = await warning.service.submit(input()); assert.equal(result.status, 201); assert.equal(result.data.status, "ready"); assert.equal(result.data.parseStatus, "unavailable"); assert(result.data.warning); publicOnly(result.data);
  assert.equal([...warning.rows.values()][0].url, "SYNTHETIC_PRIVATE_STORAGE_REF"); assert.equal([...warning.rows.values()][0].parsedText, null);
  const warned = fixture({ parse: async () => ({ text: "SYNTHETIC_PRIVATE_PARSED_TEXT", warning: "SYNTHETIC_PRIVATE_PARSER_DETAIL" }) });
  const warningView = await warned.service.submit(input()); assert.equal(warningView.data.parseStatus, "unavailable"); publicOnly(warningView.data);
  stage = "uncertain storage failure cannot be retried or overwrite original operation";
  let calls = 0; const uncertain = fixture({ upload: async () => { calls++; throw new Error("SYNTHETIC_PRIVATE_PROVIDER_ERROR"); } });
  await rejected(uncertain.service.submit(input()), 503); const lookup = await uncertain.service.lookup(input()); assert.equal(lookup.status, "failed"); assert.equal(lookup.retryAllowed, false); publicOnly(lookup);
  await rejected(uncertain.service.submit(input()), 409); assert.equal(calls, 1);
  stage = "expired storage reservation is held rather than reclaimed";
  const expired = fixture({ upload: async () => { throw new Error("SYNTHETIC_PRIVATE_PROVIDER_ERROR"); } });
  await rejected(expired.service.submit(input()), 503); const row = [...expired.rows.values()][0];
  row.metadata = { ...(row.metadata as object), __peUpload: { ...(row.metadata as { __peUpload: object }).__peUpload, phase: "STORING", expiresAt: expired.now.getTime() - 1 } };
  expired.rows.set(row.id, row); assert.equal((await expired.service.lookup(input())).status, "failed"); await rejected(expired.service.submit(input()), 409);
  await multipartCases(); await routeCases(); await parseRecoveryCases();
  console.log("PASS offline PE upload: validation, multipart bounds, auth-before-body route, scoped operation, replay/concurrency, parser warning, uncertain storage hold and public redaction; no DB/files/provider/network");
}
main().catch(error => { const scalar = (value: unknown) => typeof value === "number" || typeof value === "boolean" ? value : "WITHHELD"; console.error(JSON.stringify({ result: "PE_UPLOAD_OFFLINE_FAILED", stage, diagnostic: error instanceof assert.AssertionError ? { actual: scalar(error.actual), expected: scalar(error.expected) } : "DETAILS_WITHHELD" })); process.exitCode = 1; });
