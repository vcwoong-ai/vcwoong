import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { checkSchemaReadiness, isolatedSchema, validSchemaCheckUrl } from "./lib/schema-readiness";

async function main() {
  assert.equal(validSchemaCheckUrl("file:./dev.db"), false);
  assert.equal(validSchemaCheckUrl("postgresql://localhost/schema_test"), true);
  assert.equal(validSchemaCheckUrl("postgresql://localhost/"), false);
  const source = 'datasource db { provider = "postgresql"\n url = env("LIVE_URL")\n directUrl = env("DIRECT_URL")\n shadowDatabaseUrl = env("SHADOW_URL") }\nmodel Example { id String @id }';
  const isolated = isolatedSchema(source);
  assert.ok(!isolated.includes("DIRECT_URL") && !isolated.includes("LIVE_URL") && !isolated.includes("SHADOW_URL"));
  assert.ok(isolated.includes('env("DATABASE_URL")'));
  assert.throws(() => isolatedSchema('datasource db { provider = "sqlite" }'));
  const root = await mkdtemp(path.join(os.tmpdir(), "dealmind-schema-test-"));
  try {
    await mkdir(path.join(root, "prisma"));
    await writeFile(path.join(root, "prisma/schema.prisma"), source);
    let calls = 0;
    const noSelection = await checkSchemaReadiness({ projectRoot: root, runner: async () => { calls++; return 0; } });
    assert.equal(noSelection.code, "DATABASE_NOT_SELECTED");
    const invalid = await checkSchemaReadiness({ projectRoot: root, databaseUrl: "invalid", runner: async () => { calls++; return 0; } });
    assert.equal(invalid.code, "INVALID_DATABASE_URL");
    assert.equal(calls, 0);
    for (const [exit, expected] of [[0, "ready"], [2, "drift"], [1, "unverified"], [null, "unverified"]] as const) {
      let temporary = "";
      const result = await checkSchemaReadiness({ projectRoot: root, databaseUrl: "postgresql://localhost/schema_test", runner: async (invocation) => {
        calls++;
        temporary = invocation.cwd;
        assert.equal(invocation.executable, process.execPath);
        assert.ok(invocation.args.includes("--from-schema-datasource"));
        assert.ok(invocation.args.includes("--to-schema-datamodel"));
        assert.ok(invocation.args.includes("--exit-code"));
        assert.ok(!invocation.args.includes("--script") && !invocation.args.includes("deploy") && !invocation.args.includes("push"));
        assert.ok(!invocation.args.some((arg) => arg.includes("postgresql://")));
        assert.equal(invocation.env.DATABASE_URL, "postgresql://localhost/schema_test");
        assert.equal(await readFile(path.join(invocation.cwd, "schema.prisma"), "utf8"), isolated);
        return exit;
      } });
      assert.equal(result.status, expected);
      await assert.rejects(access(temporary));
    }
    const result = await checkSchemaReadiness({ projectRoot: root, databaseUrl: "postgresql://localhost/schema_test", runner: async () => { throw new Error("must never expose connection details"); } });
    assert.equal(result.code, "CHECK_FAILED");
    assert.ok(!JSON.stringify(result).includes("connection details"));
    console.log("PASS schema readiness: explicit selection, read-only diff, status mapping, sanitized errors, temp cleanup (no DB connection)");
  } finally { await rm(root, { recursive: true, force: true }); }
}
void main();
