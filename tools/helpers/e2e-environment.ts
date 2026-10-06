/** Validate explicit test targets before opening a database or creating fixtures. */
import { existsSync } from "node:fs";
import path from "node:path";

type Environment = Record<string, string | undefined>;
export function assertE2ETarget(base: string, env: Environment = process.env): void {
  const app = new URL(base);
  if (app.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(app.hostname) || app.username || app.password || app.pathname !== "/" || app.search || app.hash) {
    throw new Error("E2E requires a loopback HTTP application; remote targets are refused.");
  }
  const database = env.DATABASE_URL;
  if (!database) throw new Error("E2E requires an explicit DATABASE_URL.");
  if (env.DEALMIND_E2E_ISOLATED !== "1" || env.TEST_DATABASE_URL !== database) {
    throw new Error("PostgreSQL E2E requires DEALMIND_E2E_ISOLATED=1 and matching TEST_DATABASE_URL.");
  }
  let target: URL;
  try { target = new URL(database); } catch { throw new Error("E2E requires the dedicated PostgreSQL test database."); }
  if (!["postgres:", "postgresql:"].includes(target.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
      target.pathname !== "/dealmind_test" || target.search || target.hash) {
    throw new Error("PostgreSQL E2E requires the dedicated loopback dealmind_test database without URL options.");
  }
}

/** Next loads these files automatically; refuse them without reading any contents. */
export function assertCleanE2EWorkspace(projectRoot = process.cwd()): void {
  const files = [".env", ".env.local", ".env.development", ".env.development.local", ".env.production", ".env.production.local", ".env.test", ".env.test.local"];
  if (files.some(file => existsSync(path.join(projectRoot, file)))) {
    throw new Error("Integration requires a clean checkout without automatic environment files; file contents were not read.");
  }
}

export function chromiumLaunchOptions(env: Environment = process.env): { executablePath?: string } {
  return env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: env.PLAYWRIGHT_EXECUTABLE_PATH } : {};
}

/** Reject external integration configuration rather than using live credentials. */
export function assertNoExternalE2ECredentials(env: Environment = process.env): void {
  const forbidden = ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "BLOB_READ_WRITE_TOKEN", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "TOSS_SECRET_KEY", "RESEND_API_KEY", "SMTP_PASSWORD", "NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", "DART_API_KEY", "SOURCING_WEBHOOK_SECRET"];
  if (forbidden.some(name => Boolean(env[name]))) {
    throw new Error("E2E refuses external AI, storage, or payment credentials; use a clean test environment.");
  }
}
