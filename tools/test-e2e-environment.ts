import assert from "node:assert/strict";
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertE2ETarget, assertNoExternalE2ECredentials, chromiumLaunchOptions, assertCleanE2EWorkspace } from "./helpers/e2e-environment";

const database = "postgresql://fixture:fixture@127.0.0.1:5432/dealmind_test";
const isolated = { DATABASE_URL: database, TEST_DATABASE_URL: database, DEALMIND_E2E_ISOLATED: "1" };
assert.throws(() => assertE2ETarget("http://localhost:3000", { DATABASE_URL: "file:./dev.db" }));
assert.throws(() => assertE2ETarget("http://localhost:3000", { DATABASE_URL: "file:./dev.db", TEST_DATABASE_URL: "file:./dev.db", DEALMIND_E2E_ISOLATED: "1" }));
assert.doesNotThrow(() => assertE2ETarget("http://127.0.0.1:3100", isolated));
for (const base of ["https://localhost:3000", "http://example.com", "http://localhost.evil.test", "http://user:pass@localhost:3000", "http://localhost:3000?token=fixture", "http://localhost:3000/dashboard"]) {
  assert.throws(() => assertE2ETarget(base, isolated));
}
for (const env of [{}, { DATABASE_URL: database }, { ...isolated, TEST_DATABASE_URL: "different" },
  { ...isolated, DEALMIND_E2E_ISOLATED: "0" }, { DATABASE_URL: "file:./other.db" }]) {
  assert.throws(() => assertE2ETarget("http://localhost:3000", env));
}
for (const url of [database.replace("dealmind_test", "production"), database.replace("127.0.0.1", "db.example.com"), database + "?schema=public", "https://localhost/dealmind_test"]) {
  assert.throws(() => assertE2ETarget("http://localhost:3000", { ...isolated, DATABASE_URL: url, TEST_DATABASE_URL: url }));
}
assert.deepEqual(chromiumLaunchOptions({}), {});
assert.deepEqual(chromiumLaunchOptions({ PLAYWRIGHT_EXECUTABLE_PATH: "test-browser" }), { executablePath: "test-browser" });
assert.doesNotThrow(() => assertNoExternalE2ECredentials({}));
assert.throws(() => assertNoExternalE2ECredentials({ OPENROUTER_API_KEY: "synthetic-test-value" }));
const directory = mkdtempSync(path.join(tmpdir(), "dealmind-e2e-preflight-"));
try {
  assert.doesNotThrow(() => assertCleanE2EWorkspace(directory));
  writeFileSync(path.join(directory, ".env.local"), "synthetic test fixture, never parsed");
  assert.throws(() => assertCleanE2EWorkspace(directory));
  unlinkSync(path.join(directory, ".env.local"));
} finally { rmdirSync(directory); }
console.log("E2E environment guards passed (offline; no DB/browser/application started).");
