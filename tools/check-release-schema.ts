import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { checkSchemaReadiness } from "./lib/schema-readiness";

// Deployment gate: inspect the selected Vercel database without changing it.
// Disabled meeting tables are additive and are not required by the web release.
async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  if (process.env.DATABASE_URL) {
    const selected = new URL(process.env.DATABASE_URL);
    console.log(JSON.stringify({ databaseFingerprint: createHash("sha256").update(`${selected.hostname.toLowerCase()}${selected.pathname}`).digest("hex"), scope: "release_database_identity_no_credentials" }));
  }
  let schemaSource = await readFile(path.join(projectRoot, "prisma/schema.prisma"), "utf8");
  if (process.env.MEETING_INTELLIGENCE_ENABLED !== "1") {
    schemaSource = schemaSource
      .replace(/^model (?:Meeting|MeetingRevision|MeetingUsageAdmission) \{[\s\S]*?^\}/gm, "")
      .replace(/^\s*\w+\s+(?:Meeting|MeetingRevision|MeetingUsageAdmission)\[\].*$/gm, "");
  }
  const result = await checkSchemaReadiness({ projectRoot, databaseUrl: process.env.DATABASE_URL, schemaSource });
  console.log(JSON.stringify({ ...result, scope: "release_database_read_only", meetingsEnabled: process.env.MEETING_INTELLIGENCE_ENABLED === "1" }));
  process.exitCode = result.status === "ready" ? 0 : result.status === "drift" ? 42 : 43;
}
void main().catch(() => {
  console.log(JSON.stringify({ status: "unverified", code: "CHECK_FAILED", scope: "release_database_read_only" }));
  process.exitCode = 1;
});
