import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type SchemaStatus = "ready" | "drift" | "unverified";
export interface SchemaResult {
  status: SchemaStatus;
  code: "SCHEMA_MATCH" | "SCHEMA_DRIFT" | "DATABASE_NOT_SELECTED" | "INVALID_DATABASE_URL" | "CHECK_FAILED";
}
export interface DiffInvocation {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}
export type DiffRunner = (invocation: DiffInvocation) => Promise<number | null>;

export function validSchemaCheckUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol) && !!url.hostname && url.pathname.length > 1;
  } catch {
    return false;
  }
}

/** Replace the datasource wholesale: inherited directUrl/shadow URLs must not select another DB. */
export function isolatedSchema(source: string): string {
  const datasources = source.match(/\bdatasource\s+\w+\s*\{[^}]*\}/g);
  if (datasources?.length !== 1 || !/provider\s*=\s*"postgresql"/.test(datasources[0])) {
    throw new Error("UNSUPPORTED_SCHEMA");
  }
  return source.replace(datasources[0], 'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}');
}

export const runDiff: DiffRunner = ({ executable, args, cwd, env }) =>
  new Promise((resolve) => {
    // Never inherit stdout/stderr: Prisma connection errors can contain credentials/hostnames.
    const child = spawn(executable, args, { cwd, env, stdio: "ignore", windowsHide: true });
    const timeout = setTimeout(() => { child.kill(); resolve(null); }, 60_000);
    child.once("error", () => { clearTimeout(timeout); resolve(null); });
    child.once("close", (code) => { clearTimeout(timeout); resolve(code); });
  });

export async function checkSchemaReadiness(options: {
  projectRoot: string;
  databaseUrl?: string;
  schemaSource?: string;
  runner?: DiffRunner;
}): Promise<SchemaResult> {
  if (!options.databaseUrl) return { status: "unverified", code: "DATABASE_NOT_SELECTED" };
  if (!validSchemaCheckUrl(options.databaseUrl)) return { status: "unverified", code: "INVALID_DATABASE_URL" };
  let temp: string | undefined;
  try {
    const source = options.schemaSource ?? await readFile(path.join(options.projectRoot, "prisma/schema.prisma"), "utf8");
    const schema = isolatedSchema(source);
    temp = await mkdtemp(path.join(os.tmpdir(), "dealmind-schema-check-"));
    const schemaFile = path.join(temp, "schema.prisma");
    await writeFile(schemaFile, schema, { mode: 0o600 });
    const code = await (options.runner ?? runDiff)({
      executable: process.execPath,
      args: [path.join(options.projectRoot, "node_modules/prisma/build/index.js"), "migrate", "diff",
        "--from-schema-datasource", schemaFile, "--to-schema-datamodel", schemaFile, "--exit-code"],
      cwd: temp,
      env: { ...process.env, DATABASE_URL: options.databaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: "1", CHECKPOINT_DISABLE: "1" },
    });
    if (code === 0) return { status: "ready", code: "SCHEMA_MATCH" };
    if (code === 2) return { status: "drift", code: "SCHEMA_DRIFT" };
    return { status: "unverified", code: "CHECK_FAILED" };
  } catch {
    return { status: "unverified", code: "CHECK_FAILED" };
  } finally {
    if (temp) {
      try { await rm(temp, { recursive: true, force: true }); }
      catch { return { status: "unverified", code: "CHECK_FAILED" }; }
    }
  }
}
