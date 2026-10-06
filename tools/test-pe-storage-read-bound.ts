/** Actual storage VM with synthetic file handles/HTTP/S3 streams only; no files/env/network/provider. */
/* eslint-disable @typescript-eslint/no-explicit-any -- Explicit storage adapters and transpiled module ports are test-only dynamic interfaces. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
const limit = 4 * 1024 * 1024;
let stage = "storage read bound";
function storage(mode: string, file: any = {}, fetcher: any = async () => { throw new Error("Unexpected synthetic fetch"); }, send: any = async () => { throw new Error("Unexpected synthetic S3 read"); }) {
  const exports: any = {};
  class S3Client { send(input: unknown) { return send(input); } }
  class Command { constructor(public readonly input: unknown) {} }
  const env = { STORAGE_MODE: mode, UPLOAD_DIR: "./.e2e-uploads", BLOB_STORE_ID: "synthetic", BLOB_READ_WRITE_TOKEN: "synthetic-not-a-provider-key", AWS_S3_BUCKET: "synthetic", AWS_REGION: "ap-northeast-2" };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/storage.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
    { exports, Buffer, URL, Response, AbortSignal, fetch: fetcher, process: { env, cwd: () => path.resolve("synthetic-isolated-workspace") }, console: { warn() {} }, require(name: string) {
      if (name === "path") return path; if (name === "fs/promises") return { open: async (_file: string, access: string) => { assert.equal(access, "r"); return file; } };
      if (name === "./storage-configuration") return { resolveStorageMode: () => mode };
      if (name === "@aws-sdk/client-s3") return { S3Client, GetObjectCommand: Command, PutObjectCommand: Command, DeleteObjectCommand: Command };
      if (name === "@vercel/blob") return {}; throw new Error("Unexpected synthetic storage dependency");
    } });
  return exports;
}
function body(bytes: number) {
  let cancelled = 0, pulled = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { pulled++; if (pulled === 1) controller.enqueue(new Uint8Array(bytes)); else if (bytes <= limit) controller.close(); }, cancel() { cancelled++; } });
  return { stream, cancelled: () => cancelled, pulled: () => pulled };
}
async function localCases() {
  let closes = 0, reads = 0, size = 5, isFile = true, growing = false, readThrows = false;
  const file = { stat: async () => ({ size, isFile: () => isFile }), close: async () => { closes++; }, read: async (buffer: Buffer) => {
    reads++; if (readThrows) throw new Error("SYNTHETIC_PRIVATE_DETAIL");
    if (growing) { buffer.fill(1); return { bytesRead: buffer.length }; }
    if (reads === 1) { buffer.set(Buffer.from("hello")); return { bytesRead: 5 }; } return { bytesRead: 0 };
  } };
  const api = storage("local", file), ref = "private-local:ma-deals/synthetic/uploads/fixture.txt";
  stage = "local finite read EOF and close"; assert.equal((await api.readStoredFile(ref, limit)).toString(), "hello"); assert.equal(closes, 1); assert.equal(reads, 2);
  stage = "local stat bound rejects before read and closes"; size = limit + 1; reads = 0; assert.equal(await api.readStoredFile(ref, limit), null); assert.equal(reads, 0); assert.equal(closes, 2);
  stage = "default 50MiB limit preserves existing caller behavior"; reads = 0; assert.equal((await api.readStoredFile(ref)).toString(), "hello"); assert.equal(closes, 3);
  stage = "nonfile rejects before read"; isFile = false; reads = 0; assert.equal(await api.readStoredFile(ref, limit), null); assert.equal(reads, 0); isFile = true;
  stage = "file growing beyond stat remains bounded and closes"; size = 5; growing = true; reads = 0; const before = closes; assert.equal(await api.readStoredFile(ref, limit), null); assert.equal(closes, before + 1); assert(reads <= 65); growing = false;
  stage = "read error closes handle and never leaks exception"; readThrows = true; const closeBefore = closes; assert.equal(await api.readStoredFile(ref, limit), null); assert.equal(closes, closeBefore + 1);
  stage = "invalid limit never opens source"; const invalid = storage("local", { stat: async () => { throw new Error("unexpected stat"); } }); for (const max of [0, -1, NaN, 1.5, 50 * 1024 * 1024 + 1]) assert.equal(await invalid.readStoredFile(ref, max), null);
}
async function blobCases() {
  const ref = "https://synthetic.private.blob.vercel-storage.com/ma-deals/synthetic/uploads/fixture.txt";
  let response = new Response("hello"), calls = 0;
  const api = storage("vercel-blob", {}, async (target: string, options: any) => { calls++; assert.equal(target, ref); assert.equal(options.redirect, "error"); assert.equal(options.cache, "no-store"); assert(options.signal instanceof AbortSignal); return response; });
  stage = "Blob exact private host read redirect disabled"; assert.equal((await api.readStoredFile(ref, limit)).toString(), "hello");
  stage = "Blob content length cap rejects"; response = new Response("hello", { headers: { "content-length": String(limit + 1) } }); assert.equal(await api.readStoredFile(ref, limit), null);
  stage = "Blob actual stream cap cancels"; const oversized = body(limit + 1); response = new Response(oversized.stream); assert.equal(await api.readStoredFile(ref, limit), null); assert.equal(oversized.cancelled(), 1);
  stage = "other store and redirect status reject"; const before = calls; assert.equal(await api.readStoredFile(ref.replace("synthetic.private", "other.private"), limit), null); assert.equal(calls, before); response = new Response(null, { status: 302, headers: { location: "https://example.invalid" } }); assert.equal(await api.readStoredFile(ref, limit), null);
  stage = "Blob fetch error safely returns null"; assert.equal(await storage("vercel-blob", {}, async () => { throw new Error("SYNTHETIC_PRIVATE_DETAIL"); }).readStoredFile(ref, limit), null);
}
async function s3Cases() {
  let result: any = {}, requests = 0;
  const api = storage("s3", {}, undefined, async (command: any) => { requests++; assert.equal(command.input.Bucket, "synthetic"); assert.equal(command.input.Key, "ma-deals/synthetic/uploads/fixture.txt"); return result; });
  const ref = "https://synthetic.s3.ap-northeast-2.amazonaws.com/ma-deals/synthetic/uploads/fixture.txt";
  stage = "S3 declared cap cancels body before consumption"; const declared = body(5); result = { ContentLength: limit + 1, Body: { transformToWebStream: () => declared.stream } }; assert.equal(await api.readStoredFile(ref, limit), null); assert.equal(declared.cancelled(), 1);
  stage = "S3 actual stream cap cancels"; const oversized = body(limit + 1); result = { Body: { transformToWebStream: () => oversized.stream } }; assert.equal(await api.readStoredFile(ref, limit), null); assert.equal(oversized.cancelled(), 1);
  stage = "S3 bounded success and missingbody"; const small = body(5); result = { ContentLength: 5, Body: { transformToWebStream: () => small.stream } }; assert.equal((await api.readStoredFile(ref, limit)).length, 5); result = {}; assert.equal(await api.readStoredFile(ref, limit), null);
  stage = "S3 unowned URL no SDK request"; const before = requests; assert.equal(await api.readStoredFile(ref.replace("synthetic.s3", "other.s3"), limit), null); assert.equal(requests, before);
}
async function main() { await localCases(); await blobCases(); await s3Cases(); console.log("PASS actual storage read VM explicit4MiB/default50MiB, local stat/read/EOF/growth/close, Blob/S3 declared+stream bounds and cancellation; synthetic ports only, no files/network/providers"); }
main().catch(() => { console.error(`PE_STORAGE_READ_BOUND_FAILED at ${stage}; exception details withheld.`); process.exitCode = 1; });
