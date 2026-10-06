import { assertE2ETarget, assertNoExternalE2ECredentials, assertCleanE2EWorkspace } from "./helpers/e2e-environment";

try {
  assertE2ETarget(process.env.BASE_URL ?? "http://localhost:3100");
  assertNoExternalE2ECredentials();
  assertCleanE2EWorkspace();
  console.log("Isolated E2E preflight passed; no database or application was started.");
} catch {
  console.error("E2E preflight refused: require a clean checkout, loopback dedicated test database, and no external provider credentials.");
  process.exitCode = 1;
}
