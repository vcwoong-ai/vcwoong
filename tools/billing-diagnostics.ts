import { inspectBillingDiagnostics, type BillingDiagnosticsDatabase } from "../src/lib/payments/billing-diagnostics";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || (args.length === 1 && args[0] === "--help")) {
    console.log(JSON.stringify({ status: "HELP_ONLY", activation: "HELD", databaseAccess: false, providerVerified: false,
      usage: "billing-diagnostics --run-db (requires explicit BILLING_DIAGNOSTICS_DATABASE_URL)",
      notice: "Read-only aggregate diagnostics; no payment activation, repair, provider calls or environment-file loading." }));
    return;
  }
  if (args.length !== 1 || args[0] !== "--run-db") throw new Error("Invalid arguments");
  const explicitUrl = process.env.BILLING_DIAGNOSTICS_DATABASE_URL;
  if (!explicitUrl) throw new Error("Explicit diagnostics target required");
  // log:[] does not silence Prisma/Rust's inherited debug channels. Refuse them before import
  // without changing the caller's environment. NODE_OPTIONS preloads run before this program;
  // the operator must launch it in a trusted, preload-free diagnostic environment.
  if (process.env.DEBUG || process.env.RUST_LOG || process.env.PRISMA_LOG_QUERIES || process.env.PRISMA_QUERY_ENGINE_LOG_LEVEL) {
    throw new Error("Quiet diagnostics environment required");
  }
  const target = new URL(explicitUrl);
  if (!["postgres:", "postgresql:"].includes(target.protocol) || !target.hostname || target.pathname.length < 2) {
    throw new Error("Explicit PostgreSQL diagnostics target required");
  }
  target.searchParams.set("connect_timeout", "5");
  target.searchParams.set("pool_timeout", "5");
  // Prisma's generated entrypoint can load dotenv even during import. Refuse any generated
  // client configured to read environment files BEFORE importing it. Read code metadata only.
  // This guard is pinned to the installed Prisma generator format and fails closed on changes.
  const resolve = createRequire(__filename);
  const generatedSource = await readFile(resolve.resolve(".prisma/client/index.js"), "utf8");
  const envConfig = generatedSource.match(/"relativeEnvPaths"\s*:\s*(\{[^}]*\})/);
  const clientVersion = generatedSource.match(/"clientVersion"\s*:\s*"([^"]+)"/);
  const provider = generatedSource.match(/"activeProvider"\s*:\s*"([^"]+)"/);
  if (!envConfig || clientVersion?.[1] !== "6.19.3" || provider?.[1] !== "postgresql") {
    throw new Error("Environment-free PostgreSQL client required");
  }
  const envPaths = JSON.parse(envConfig[1]) as Record<string, unknown>;
  // Prisma 6.19.3 emits rootEnvPath:null and omits undefined schemaEnvPath for env-free clients.
  // An empty/unknown object is not proof that environment loading is disabled.
  if (!Object.hasOwn(envPaths, "rootEnvPath") || envPaths.rootEnvPath !== null ||
      Object.entries(envPaths).some(([key, value]) => !["rootEnvPath", "schemaEnvPath"].includes(key) || value !== null)) {
    throw new Error("Environment-free client required");
  }
  // Dynamic construction after opt-in only. The application singleton and DATABASE_URL fallback
  // are never imported; the explicit client suppresses all Prisma query/error logging.
  const { createBillingClient } = await import("../src/lib/payments/billing-client");
  const client = createBillingClient(target.href);
  // The development client may be generated for SQLite and expose only Serializable in its
  // static types. The metadata guard above requires the actual diagnostic runtime to be PG.
  try { console.log(JSON.stringify(await inspectBillingDiagnostics(client as unknown as BillingDiagnosticsDatabase), null, 2)); }
  finally { await client.$disconnect(); }
}
main().catch(() => {
  console.error(JSON.stringify({ status: "UNAVAILABLE", activation: "HELD", code: "BILLING_DIAGNOSTICS_UNAVAILABLE" }));
  process.exitCode = 1;
});
