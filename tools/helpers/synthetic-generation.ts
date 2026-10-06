/** Test-only model replacement and source-route harness; never imported by src/. */
import assert from "node:assert/strict";
import { SECTION_META } from "../../src/types";
import { checkGenerationGate } from "../../src/lib/section-generation-gate";
import type { ClaudeMessage, ClaudeOptions } from "../../src/lib/claude";
import { assertCleanE2EWorkspace, assertE2ETarget, assertNoExternalE2ECredentials } from "./e2e-environment";

export const SYNTHETIC_MODEL = "synthetic-test-only";
export const SYNTHETIC_NOTICE = "데모 모드 · 합성 테스트 전용 — 실제 AI 생성 품질이나 투자 판단을 검증한 결과가 아닙니다.";

type Barrier = { entered: boolean; released: boolean; oldReturned: boolean; calls: number; fail?: boolean; gate: Promise<void>; release: () => void };
const generationBarriers = new Map<string, Barrier>();
const observedWorkers = new Set<Promise<unknown>>();
/** Native test harness only: bounded fixture identifiers, never generation claim tokens. */
export function controlSyntheticGeneration(marker: string, action: "arm" | "arm-failure" | "status" | "release" | "remove") {
  assert(/^e2e-gen-[a-f0-9-]{36}$/.test(marker), "Generation controls require a fresh synthetic marker.");
  if (action === "arm" || action === "arm-failure") {
    assert(!generationBarriers.has(marker));
    assert(generationBarriers.size < 16, "Synthetic generation controls have a bounded fixture inventory.");
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    generationBarriers.set(marker, { entered: false, released: false, oldReturned: false, calls: 0, fail: action === "arm-failure", gate, release });
  }
  const state = generationBarriers.get(marker);
  assert(state, "Generation barrier must be explicitly armed.");
  if (action === "release") { state.released = true; state.release(); }
  const result = { entered: state.entered, released: state.released, oldReturned: state.oldReturned, calls: state.calls, pendingWorkers: observedWorkers.size };
  if (action === "remove") { assert(state.released && observedWorkers.size === 0); generationBarriers.delete(marker); }
  return result;
}

/** Observe the same promise supplied to the real waitUntil, without changing its outcome. */
function observeSyntheticWorker(promise: Promise<unknown>) {
  observedWorkers.add(promise);
  void promise.then(() => observedWorkers.delete(promise), () => observedWorkers.delete(promise));
}

/** Return only fixed diagnostic labels. Never print error messages, URLs, headers or stacks. */
export function safeHarnessFailure(error: unknown, phase: string) {
  const names = new Set(["Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError", "AssertionError"]);
  const candidate = error && typeof error === "object" ? error as { name?: unknown; code?: unknown; message?: unknown } : {};
  const name = typeof candidate.name === "string" && names.has(candidate.name) ? candidate.name : "OtherError";
  const nodeCodes = new Set(["ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND", "ERR_INVALID_URL", "ERR_HTTP_HEADERS_SENT", "ERR_INVALID_ARG_TYPE", "ERR_PACKAGE_PATH_NOT_EXPORTED", "ERR_REQUIRE_ESM"]);
  let code = typeof candidate.code === "string" && nodeCodes.has(candidate.code) ? candidate.code : "UNCLASSIFIED";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  if (/AsyncLocalStorage.*not available|requestAsyncStorage|outside a request scope/i.test(message)) code = "REQUEST_STORAGE_CONTEXT";
  else if (/No "exports" main defined|Package subpath .*not defined by "exports"/.test(message)) code = "PACKAGE_EXPORT_MODE";
  else if (/Cannot find module ['"]@\//.test(message)) code = "TS_PATH_ALIAS_RESOLUTION";
  else if (/@prisma\/client did not initialize|PrismaClient.*not.*initialized/.test(message)) code = "PRISMA_CLIENT_GENERATION";
  else if (/is not a function/.test(message)) code = "CALLABLE_MODULE_INTEROP";
  const phases = new Set(["read-request", "load-route", "request-context", "write-response"]);
  return { name, code, phase: phases.has(phase) ? phase : "unknown" };
}

export function syntheticSection(messages: ClaudeMessage[], options: ClaudeOptions) {
  const meta = SECTION_META.find(item => item.key === options.logContext?.section);
  assert(meta, "Synthetic adapter supports explicit report section tasks only.");
  const prompt = messages.filter(message => message.role === "user").map(message => message.content).join("\n");
  const marker = prompt.match(/e2e-(?:free|gen)-[a-f0-9-]+/)?.[0];
  assert(marker);
  const topics = ["자료의 출처", "검토 범위", "사실과 해석", "불확실성", "재무 대조", "외부 검증", "계약 확인", "의사결정 한계", "추가 자료 요청", "담당자 검토", "문서 보존", "수치 추적"];
  const minimum = meta.key === "OPINION_SUMMARY" ? 500 : meta.minChars;
  const content = `> ${SYNTHETIC_NOTICE}\n\n## ${meta.title} — ${marker}\n\n` + topics.slice(0, Math.max(3, Math.ceil(minimum / 120))).map((topic, index) =>
    `### ${index + 1}. ${meta.title}: ${topic}\n이 ${topic} 항목은 합성 TXT fixture와 사용자가 입력한 테스트 딜만을 출처로 삼습니다. 실제 기업의 ${meta.title} 정보는 제공되거나 외부에서 검증되지 않았습니다. 자료에 없는 사실은 확인 필요로 남기며, 이 문단은 저장·편집·검토·내보내기 연결을 확인하기 위한 테스트 문장입니다. ${topic}에 관한 투자 결론이나 정량적 추정은 확정하지 않습니다.`
  ).join("\n\n") + (meta.key === "OPINION_SUMMARY" ? "\n\n투자 보류 — 합성 테스트 자료만 존재하므로 실제 판단을 내릴 수 없습니다. 추가 검토와 원본 증빙 확인이 필요합니다." : "");
  assert(checkGenerationGate(meta.key, content).ok, "Synthetic content must pass the unchanged minimum storage gate.");
  const validated = options.validate?.(content);
  assert(!validated || validated.ok, "The real agent's injected content validator must accept the fixture.");
  return { content, inputTokens: 0, outputTokens: 0, usedModel: SYNTHETIC_MODEL };
}

export async function withSyntheticModel<T>(fn: () => Promise<T>): Promise<T> {
  const { withModelOverride } = await import("../../src/lib/claude");
  return withModelOverride(async (messages, options) => {
    const marker = messages.map(message => message.content).join("\n").match(/e2e-gen-[a-f0-9-]+/)?.[0];
    const barrier = marker ? generationBarriers.get(marker) : undefined;
    const isOld = Boolean(barrier && options.logContext?.section === "COMPANY_OVERVIEW" && !barrier.entered);
    if (barrier) { barrier.calls++; if (isOld) { barrier.entered = true; await barrier.gate; } }
    if (barrier?.fail) throw new Error("Synthetic section model failure");
    const result = syntheticSection(messages, options);
    if (barrier) {
      result.content += `\n\n합성 작업 세대: ${isOld ? "OLD" : "NEW"} — 실제 AI 결과가 아닙니다.`;
      const section = SECTION_META.find(item => item.key === options.logContext?.section);
      assert(section && checkGenerationGate(section.key, result.content).ok);
      assert(!options.validate || options.validate(result.content).ok);
      if (isOld) barrier.oldReturned = true;
    }
    return result;
  }, fn);
}

let adapterBridgeQueue = Promise.resolve();
/** Native tsx CJS routes need the actual ESM-only adapter namespace, not a fake auth adapter. */
export async function withActualPrismaAdapterBridge<T>(load: () => Promise<T>): Promise<T> {
  const previous = adapterBridgeQueue;
  let release!: () => void;
  adapterBridgeQueue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    const adapter = await import("@auth/prisma-adapter");
    assert.equal(typeof adapter.PrismaAdapter, "function");
    const functions = await import("@vercel/functions");
    const observedFunctions = { ...functions, waitUntil: (promise: Promise<unknown>) => { observeSyntheticWorker(promise); return functions.waitUntil(promise); } };
    const moduleApi = (await import("node:module")).default as unknown as { _load: (request: string, ...args: unknown[]) => unknown };
    const original = moduleApi._load;
    moduleApi._load = function(this: unknown, request: string, ...args: unknown[]) {
      return request === "@auth/prisma-adapter" ? adapter : request === "@vercel/functions" ? observedFunctions : original.call(this, request, ...args);
    };
    try { return await load(); } finally { moduleApi._load = original; assert.equal(moduleApi._load, original); }
  } finally { release(); }
}

/** Next14 source routes and the override share one module graph, unlike .next bundles. */
export async function startSyntheticSourceApi(base: string) {
  assert.equal(process.env.NODE_ENV, "test", "Source harness never runs outside an explicit test process.");
  assertE2ETarget(base); assertCleanE2EWorkspace(); assertNoExternalE2ECredentials();
  // Fault-injection tests must not emit Prisma query/error payloads. This quiet
  // client is confined to the guarded, dedicated synthetic server process.
  const { createBillingClient } = await import("../../src/lib/payments/billing-client");
  const testGlobals = globalThis as typeof globalThis & { prisma?: ReturnType<typeof createBillingClient> };
  assert(!testGlobals.prisma, "Synthetic server requires a fresh Prisma module graph.");
  testGlobals.prisma = createBillingClient(process.env.TEST_DATABASE_URL!);
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const globals = globalThis as typeof globalThis & { AsyncLocalStorage?: typeof AsyncLocalStorage };
  globals.AsyncLocalStorage ??= AsyncLocalStorage;
  const { createServer } = await import("node:http");
  const { NextRequest } = await import("next/server");
  const { requestAsyncStorage } = await import("next/dist/client/components/request-async-storage.external");
  const { RequestAsyncStorageWrapper } = await import("next/dist/server/async-storage/request-async-storage-wrapper");
  const definitions = [
    { pattern: /^\/api\/auth\/register$/, load: () => import("../../src/app/api/auth/register/route") },
    { pattern: /^\/api\/auth\/(.+)$/, load: () => import("../../src/app/api/auth/[...nextauth]/route"), auth: true },
    { pattern: /^\/api\/usage$/, load: () => import("../../src/app/api/usage/route") },
    { pattern: /^\/api\/team$/, load: () => import("../../src/app/api/team/route") },
    { pattern: /^\/api\/team\/members$/, load: () => import("../../src/app/api/team/members/route") },
    { pattern: /^\/api\/team\/invitations$/, load: () => import("../../src/app/api/team/invitations/route") },
    { pattern: /^\/api\/team\/invitations\/([^/]+)$/, load: () => import("../../src/app/api/team/invitations/[id]/route") },
    { pattern: /^\/api\/team\/ownership$/, load: () => import("../../src/app/api/team/ownership/route") },
    { pattern: /^\/api\/deals$/, load: () => import("../../src/app/api/deals/route") },
    { pattern: /^\/api\/deals\/([^/]+)$/, load: () => import("../../src/app/api/deals/[id]/route") },
    { pattern: /^\/api\/upload$/, load: () => import("../../src/app/api/upload/route") },
    { pattern: /^\/api\/documents\/([^/]+)\/download$/, load: () => import("../../src/app/api/documents/[id]/download/route") },
    { pattern: /^\/api\/deals\/([^/]+)\/reports$/, load: () => import("../../src/app/api/deals/[id]/reports/route") },
    { pattern: /^\/api\/reports\/([^/]+)\/status$/, load: () => import("../../src/app/api/reports/[id]/status/route") },
    { pattern: /^\/api\/reports\/([^/]+)\/run$/, load: () => import("../../src/app/api/reports/[id]/run/route") },
    { pattern: /^\/api\/reports\/([^/]+)\/sections$/, load: () => import("../../src/app/api/reports/[id]/sections/route") },
    { pattern: /^\/api\/reports\/([^/]+)\/sections\/regenerate$/, load: () => import("../../src/app/api/reports/[id]/sections/regenerate/route") },
    { pattern: /^\/api\/reports\/([^/]+)\/decision$/, load: () => import("../../src/app/api/reports/[id]/decision/route") },
    { pattern: /^\/api\/reports\/([^/]+)\/export\/docx$/, load: () => import("../../src/app/api/reports/[id]/export/docx/route") },
    { pattern: /^\/api\/reports\/([^/]+)\/export\/pptx$/, load: () => import("../../src/app/api/reports/[id]/export/pptx/route") },
    { pattern: /^\/api\/reports\/([^/]+)$/, load: () => import("../../src/app/api/reports/[id]/route") },
  ];
  const origin = new URL(base);
  assert(origin.port, "Synthetic source API requires an explicit loopback port.");
  // Preload the full allowlist once before accepting requests. No request can overlap
  // a loader bridge, and route handlers retain the real adapter after restoration.
  const loadedRoutes = await withActualPrismaAdapterBridge(() => Promise.all(definitions.map(definition => definition.load()))).catch(error => {
    console.error("Synthetic source API preload failure:", JSON.stringify(safeHarnessFailure(error, "load-route")));
    throw new Error("Synthetic source API preload failed; internal details are withheld.");
  });
  const server = createServer(async (incoming, outgoing) => {
    outgoing.setHeader("x-dealmind-test-harness", SYNTHETIC_MODEL);
    let phase = "read-request";
    try {
      const url = new URL(incoming.url ?? "/", base);
      assert.equal(url.origin, origin.origin);
      if (url.pathname === "/api/__test/generation-control") {
        assert.equal(incoming.method, "POST");
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of incoming) { size += chunk.length; assert(size <= 1024); chunks.push(Buffer.from(chunk)); }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        assert(["arm", "arm-failure", "status", "release", "remove"].includes(body.action));
        outgoing.setHeader("content-type", "application/json");
        outgoing.end(JSON.stringify({ data: controlSyntheticGeneration(body.marker, body.action) }));
        return;
      }
      const definition = definitions.find(item => item.pattern.test(url.pathname));
      if (!definition) { outgoing.writeHead(404); outgoing.end("Synthetic API harness: route not allowed"); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of incoming) { size += chunk.length; assert(size <= 1024 * 1024, "Synthetic harness only accepts small fixtures."); chunks.push(Buffer.from(chunk)); }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      const request = new NextRequest(url, { method: incoming.method, headers, ...(["GET", "HEAD"].includes(incoming.method ?? "GET") ? {} : { body: Buffer.concat(chunks) }) });
      phase = "load-route";
      const routes = loadedRoutes[definitions.indexOf(definition)] as Record<string, (req: InstanceType<typeof NextRequest>, context: { params: { id?: string; nextauth?: string[] } }) => Promise<Response>>;
      const handler = routes[incoming.method ?? "GET"];
      if (!handler) { outgoing.writeHead(405); outgoing.end(); return; }
      const match = definition.pattern.exec(url.pathname)!;
      const params = definition.auth ? { nextauth: match[1].split("/") } : { id: match[1] };
      phase = "request-context";
      const response = await RequestAsyncStorageWrapper.wrap(requestAsyncStorage, { req: request }, () => withSyntheticModel(() => handler(request, { params })));
      phase = "write-response";
      outgoing.statusCode = response.status;
      response.headers.forEach((value, name) => { if (name !== "set-cookie") outgoing.setHeader(name, value); });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) outgoing.setHeader("set-cookie", cookies);
      outgoing.setHeader("x-dealmind-test-harness", SYNTHETIC_MODEL);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      const failure = safeHarnessFailure(error, phase);
      console.error("Synthetic source API failure:", JSON.stringify(failure));
      if (!outgoing.headersSent) {
        outgoing.statusCode = 500;
        outgoing.setHeader("x-dealmind-test-harness", SYNTHETIC_MODEL);
        outgoing.setHeader("x-dealmind-test-failure", `${failure.phase}:${failure.name}:${failure.code}`);
      }
      outgoing.end("Synthetic API harness failed; internal errors are not disclosed.");
    }
  });
  const hostname = origin.hostname === "[::1]" ? "::1" : origin.hostname;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(Number(origin.port), hostname, resolve); });
  console.log("Synthetic source API harness ready; API-only module integration, no browser renderer and no actual AI quality claim.");
  return server;
}
