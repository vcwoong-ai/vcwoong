import path from "node:path";
import { checkSchemaReadiness } from "./lib/schema-readiness";

async function main() {
  const result = await checkSchemaReadiness({
    projectRoot: path.resolve(__dirname, ".."),
    // Intentionally no DATABASE_URL fallback and no dotenv loading.
    databaseUrl: process.env.SCHEMA_CHECK_DATABASE_URL,
  });
  console.log(JSON.stringify({ ...result, scope: "Prisma-supported database schema objects; no changes applied" }));
  process.exitCode = result.status === "ready" ? 0 : result.status === "drift" ? 2 : 1;
}
void main().catch(() => {
  console.log(JSON.stringify({ status: "unverified", code: "CHECK_FAILED" }));
  process.exitCode = 1;
});
