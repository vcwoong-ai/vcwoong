/** Offline mocks only: no local environment, database, email or provider requests. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { resolveStorageMode, storageConfigurationSummary } from "../src/lib/storage-configuration";

async function main() {
  assert.equal(resolveStorageMode({}), "local");
  assert.equal(resolveStorageMode({ STORAGE_MODE: "s3", BLOB_READ_WRITE_TOKEN: "synthetic" }), "s3");
  assert.equal(resolveStorageMode({ BLOB_READ_WRITE_TOKEN: "synthetic" }), "vercel-blob");
  const config = { BLOB_READ_WRITE_TOKEN: "synthetic-private-credential", BLOB_STORE_ID: "store_fixture", BLOB_STORE_ACCESS: "private" };
  assert.equal(storageConfigurationSummary(config).label, "Vercel Blob · 비공개 구성");
  assert(storageConfigurationSummary({ ...config, BLOB_STORE_ACCESS: "public" }).label.includes("확인 필요"));
  assert(storageConfigurationSummary({ ...config, BLOB_STORE_ID: "invalid/id" }).label.includes("확인 필요"));
  assert(storageConfigurationSummary({ STORAGE_MODE: "unknown" }).label.includes("확인 필요"));
  assert(!JSON.stringify(storageConfigurationSummary(config)).includes(config.BLOB_READ_WRITE_TOKEN));

  const logs: string[] = [];
  const env: { RESEND_API_KEY?: string } = {};
  let calls = 0;
  let failure: "none" | "http" | "exception" = "none";
  const compiled = ts.transpileModule(fs.readFileSync("src/lib/email.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: { sendEmail?: (input: unknown) => Promise<{ sent: boolean; reason?: string }> } = {};
  vm.runInNewContext(compiled, {
    exports, process: { env }, AbortSignal,
    console: { info: (...args: unknown[]) => logs.push(args.join(" ")), error: (...args: unknown[]) => logs.push(args.join(" ")) },
    require: (name: string) => { assert.equal(name, "@/lib/brand"); return { BRAND: { name: "Offline fixture" } }; },
    fetch: async () => {
      calls++;
      if (failure === "exception") throw new Error("sensitive-provider-exception");
      return { ok: failure !== "http", status: 422, text: async () => "sensitive-provider-body" };
    },
  });
  const input = { to: "private-user@example.invalid", subject: "sensitive-subject", html: "reset-token-do-not-log" };
  assert(exports.sendEmail);
  assert.equal((await exports.sendEmail(input)).reason, "not_configured");
  assert.equal(calls, 0);
  env.RESEND_API_KEY = "synthetic-email-credential";
  assert.equal((await exports.sendEmail(input)).sent, true);
  failure = "http";
  assert.equal((await exports.sendEmail(input)).reason, "http_422");
  failure = "exception";
  assert.equal((await exports.sendEmail(input)).reason, "exception");
  for (const sensitive of [...Object.values(input), env.RESEND_API_KEY, "sensitive-provider-body", "sensitive-provider-exception"]) assert(!logs.join("\n").includes(sensitive));
  console.log("Offline storage configuration and email privacy regressions passed.");
}
main().catch(() => { console.error("Offline product configuration regression failed."); process.exitCode = 1; });
