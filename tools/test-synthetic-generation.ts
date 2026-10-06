/** Offline only: actual GENERAL agent prompts through the existing async-local hook. */
import assert from "node:assert/strict";
import { AgentType } from "@prisma/client";
import { GeneralAgent } from "../src/agents/general-agent";
import { SECTION_META } from "../src/types";
import { checkGenerationGate } from "../src/lib/section-generation-gate";
import { withModelOverride, generateText } from "../src/lib/claude";
import { freeCustomerFixture, assessDemoMockGate } from "./helpers/free-customer-fixture";
import { syntheticSection, withSyntheticModel, SYNTHETIC_MODEL, SYNTHETIC_NOTICE, safeHarnessFailure, withActualPrismaAdapterBridge } from "./helpers/synthetic-generation";

async function main() {
  assert(assessDemoMockGate(true).every(gate => gate.ok));
  const fixture = freeCustomerFixture();
  const input = { dealId: fixture.prefix, agentType: AgentType.GENERAL, ...fixture.deal, documents: [{ name: fixture.fileName, parsedText: fixture.text }] };
  const agent = new GeneralAgent();
  const results = await withSyntheticModel(() => Promise.all(SECTION_META.map(meta => agent.generateSection(input, meta.key))));
  for (const result of results) {
    assert.equal(result.modelUsed, SYNTHETIC_MODEL);
    assert.equal(result.tokensUsed, 0);
    assert(result.content.includes(SYNTHETIC_NOTICE));
    assert(result.content.includes("출처") && result.content.includes("확인 필요"));
    assert(checkGenerationGate(result.sectionKey, result.content).ok);
  }
  assert.throws(() => syntheticSection([{ role: "user", content: fixture.text }], {}), "unknown model tasks are rejected");
  assert.throws(() => syntheticSection([{ role: "user", content: "not a test fixture" }], { logContext: { section: SECTION_META[0].key } }));
  assert.throws(() => syntheticSection([{ role: "user", content: fixture.text }], { logContext: { section: SECTION_META[0].key }, validate: () => ({ ok: false, reason: "synthetic validator rejection" }) }));
  const scopes = await Promise.all(["first", "second"].map(label => withModelOverride(async () => ({ content: label, inputTokens: 0, outputTokens: 0, usedModel: SYNTHETIC_MODEL }), async () => {
    await Promise.resolve();
    return (await generateText([{ role: "user", content: "offline async-local isolation" }])).content;
  })));
  assert.deepEqual(scopes, ["first", "second"]);
  const failure = safeHarnessFailure({ name: "InjectedName-secret", code: "InjectedCode-secret", message: "secret URL/user/password message" }, "injected-secret-phase");
  assert.deepEqual(failure, { name: "OtherError", code: "UNCLASSIFIED", phase: "unknown" });
  assert.deepEqual(safeHarnessFailure(new Error("Invariant: AsyncLocalStorage accessed in runtime where it is not available"), "request-context"), { name: "Error", code: "REQUEST_STORAGE_CONTEXT", phase: "request-context" });
  assert(!JSON.stringify(failure).includes("secret"));
  assert.equal(safeHarnessFailure({ name: "Error", code: "ERR_PACKAGE_PATH_NOT_EXPORTED", message: 'No "exports" main defined in private/path/package.json' }, "load-route").code, "PACKAGE_EXPORT_MODE");
  // Next14 request-context probe is in-memory only: no auth handler, HTTP or DB.
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const globals = globalThis as typeof globalThis & { AsyncLocalStorage?: typeof AsyncLocalStorage };
  globals.AsyncLocalStorage ??= AsyncLocalStorage;
  const { NextRequest } = await import("next/server");
  const { requestAsyncStorage } = await import("next/dist/client/components/request-async-storage.external");
  const { RequestAsyncStorageWrapper } = await import("next/dist/server/async-storage/request-async-storage-wrapper");
  const nextHeaders = await import("next/headers");
  const request = new NextRequest("http://localhost:3100/api/auth/csrf", { headers: { "x-synthetic-context": "fixture-only", cookie: "fixture-cookie=synthetic" } });
  await RequestAsyncStorageWrapper.wrap(requestAsyncStorage, { req: request }, async () => {
    assert.equal(nextHeaders.headers().get("x-synthetic-context"), "fixture-only");
    assert.equal(nextHeaders.cookies().get("fixture-cookie")?.value, "synthetic");
  });
  const moduleApi = (await import("node:module")).default as unknown as { _load: (request: string, ...args: unknown[]) => unknown };
  const originalLoader = moduleApi._load;
  const { createRequire } = await import("node:module");
  const path = await import("node:path");
  const requireModule = createRequire(path.resolve("package.json"));
  const actualAdapter = await import("@auth/prisma-adapter");
  await withActualPrismaAdapterBridge(async () => {
    assert.equal(requireModule("@auth/prisma-adapter").PrismaAdapter, actualAdapter.PrismaAdapter);
    assert.equal(requireModule("node:assert/strict"), assert, "all other package loads preserve their original behavior");
  });
  assert.equal(moduleApi._load, originalLoader, "loader restored after successful preload");
  await assert.rejects(withActualPrismaAdapterBridge(async () => { throw new Error("synthetic preload failure"); }));
  assert.equal(moduleApi._load, originalLoader, "loader restored after failed preload");
  let active = 0;
  await Promise.all([1, 2].map(() => withActualPrismaAdapterBridge(async () => { active++; assert.equal(active, 1); await Promise.resolve(); active--; })));
  assert.equal(moduleApi._load, originalLoader, "serialized bridges leave no loader patch behind");
  console.log("Synthetic-only offline actual GENERAL prompts/unchanged storage gates/injected validator/async-local scope isolation passed. Actual AI quality is not tested.");
}
main().catch(error => { console.error(error instanceof assert.AssertionError ? error.message : "Synthetic offline regression failed; no provider credentials logged."); process.exitCode = 1; });
